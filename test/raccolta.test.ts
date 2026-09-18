import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { raccogli } from '../src/raccolta.ts';
import type { Adattatore } from '../src/sources/tipi.ts';
import type { Bando } from '../src/tipi.ts';

const adesso = new Date('2026-09-18T05:00:00Z');
let cartella: string;
let fileBandi: string;
let fileSalute: string;
let fileMeta: string;

function adattatore(id: string, cerca: Adattatore['cerca']): Adattatore {
  return { id, nome: `Fonte ${id}`, ente: `Ente ${id}`, livello: 'terzosettore', soloBandi: true, cerca };
}

const buono = adattatore('buona', async () => [{
  titolo: 'Bando web serie sul bullismo',
  url: 'https://x.it/web-serie',
  descrizione: 'Possono partecipare le associazioni di promozione sociale.',
  dataPubblicazione: new Date('2026-09-17T10:00:00Z'),
  fonteId: 'buona',
}]);

const rotto = adattatore('rotta', async () => { throw new Error('HTTP 500'); });

const vecchio = adattatore('vecchia', async () => [{
  titolo: 'Bando scaduto da tempo',
  url: 'https://x.it/vecchio',
  descrizione: 'Associazioni.',
  dataPubblicazione: new Date('2025-01-01T00:00:00Z'),
  fonteId: 'vecchia',
}]);

beforeEach(async () => {
  cartella = await mkdtemp(join(tmpdir(), 'radar-'));
  fileBandi = join(cartella, 'bandi.json');
  fileSalute = join(cartella, 'salute.json');
  fileMeta = join(cartella, 'meta.json');
  await writeFile(fileBandi, '[]');
  await writeFile(fileSalute, '{}');
});

const nessunaNotifica = { inviaEmail: async () => ({ inviata: false, motivo: 'test' }),
  inviaAllarmeFonti: async () => ({ inviata: false, motivo: 'test' }) };

describe('raccogli', () => {
  it('una fonte rotta non ferma le altre', async () => {
    const esito = await raccogli({ adesso, adattatori: [rotto, buono], fileBandi, fileSalute, fileMeta, notifiche: nessunaNotifica });
    const bandi = JSON.parse(await readFile(fileBandi, 'utf8')) as Bando[];
    expect(bandi).toHaveLength(1);
    expect(bandi[0]!.fonteId).toBe('buona');
    expect(esito.nuovi).toBe(1);
  });

  it('registra l\'esito di ogni fonte, anche di quella rotta', async () => {
    await raccogli({ adesso, adattatori: [rotto, buono], fileBandi, fileSalute, fileMeta, notifiche: nessunaNotifica });
    const salute = JSON.parse(await readFile(fileSalute, 'utf8'));
    expect(salute.rotta[0].ok).toBe(false);
    expect(salute.rotta[0].errore).toContain('HTTP 500');
    expect(salute.buona[0].ok).toBe(true);
  });

  it('scarta cio\' che e\' fuori finestra', async () => {
    await raccogli({ adesso, adattatori: [vecchio], fileBandi, fileSalute, fileMeta, notifiche: nessunaNotifica });
    const bandi = JSON.parse(await readFile(fileBandi, 'utf8')) as Bando[];
    expect(bandi).toHaveLength(0);
  });

  it('un bando gia\' visto non e\' nuovo al secondo giro', async () => {
    await raccogli({ adesso, adattatori: [buono], fileBandi, fileSalute, fileMeta, notifiche: nessunaNotifica });
    const esito = await raccogli({ adesso, adattatori: [buono], fileBandi, fileSalute, fileMeta, notifiche: nessunaNotifica });
    expect(esito.nuovi).toBe(0);
  });

  it('notifica i bandi nuovi e pertinenti', async () => {
    let notificati: Bando[] = [];
    await raccogli({
      adesso, adattatori: [buono], fileBandi, fileSalute, fileMeta,
      notifiche: { ...nessunaNotifica, inviaEmail: async (b) => { notificati = b; return { inviata: true, motivo: null }; } },
    });
    expect(notificati).toHaveLength(1);
  });

  it('salva i dati anche se l\'invio email fallisce, e lo segnala', async () => {
    const esito = await raccogli({
      adesso, adattatori: [buono], fileBandi, fileSalute, fileMeta,
      notifiche: { ...nessunaNotifica, inviaEmail: async () => { throw new Error('SMTP giu'); } },
    });
    const bandi = JSON.parse(await readFile(fileBandi, 'utf8')) as Bando[];
    expect(bandi).toHaveLength(1);
    expect(esito.errori.some((e) => e.includes('SMTP giu'))).toBe(true);
  });

  it('dopo tre giri a vuoto segnala la fonte come muta', async () => {
    const muto = adattatore('muta', async () => []);
    let allarme: string[] = [];
    const notifiche = { ...nessunaNotifica, inviaAllarmeFonti: async (f: string[]) => { allarme = f; return { inviata: true, motivo: null }; } };
    for (let i = 0; i < 3; i++) {
      await raccogli({ adesso, adattatori: [muto], fileBandi, fileSalute, fileMeta, notifiche });
    }
    expect(allarme).toEqual(['Fonte muta']);
  });

  it('scrive l\'orario del controllo anche quando non esce nulla di nuovo', async () => {
    await raccogli({ adesso, adattatori: [vecchio], fileBandi, fileSalute, fileMeta, notifiche: nessunaNotifica });
    const meta = JSON.parse(await readFile(fileMeta, 'utf8'));
    expect(meta.ultimoControllo).toBe(adesso.toISOString());
    expect(meta.fonti).toEqual([{ id: 'vecchia', nome: 'Fonte vecchia' }]);
    expect(typeof meta.soglia).toBe('number');
  });

  it('si ferma senza toccare un archivio corrotto, invece di sovrascriverlo', async () => {
    const corrotto = '[{"id": "abc", "titolo": "troncato a met';
    await writeFile(fileBandi, corrotto);
    await expect(
      raccogli({ adesso, adattatori: [buono], fileBandi, fileSalute, fileMeta, notifiche: nessunaNotifica }),
    ).rejects.toThrow(/illeggibile/);
    expect(await readFile(fileBandi, 'utf8')).toBe(corrotto);
  });

  it('si ferma anche se e\' corrotto lo storico della salute', async () => {
    await writeFile(fileSalute, '{ non json');
    await expect(
      raccogli({ adesso, adattatori: [buono], fileBandi, fileSalute, fileMeta, notifiche: nessunaNotifica }),
    ).rejects.toThrow(/illeggibile/);
    expect(await readFile(fileSalute, 'utf8')).toBe('{ non json');
  });

  it('un archivio che non esiste ancora vale come vuoto', async () => {
    const esito = await raccogli({
      adesso, adattatori: [buono], fileBandi: join(cartella, 'nuovo.json'),
      fileSalute: join(cartella, 'nuova-salute.json'), fileMeta, notifiche: nessunaNotifica,
    });
    expect(esito.nuovi).toBe(1);
  });
});
