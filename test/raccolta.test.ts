import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { raccogli, insieme } from '../src/raccolta.ts';
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

const nessunaPagina = async () => '';

const nessunaNotifica = { inviaEmail: async () => ({ inviata: false, motivo: 'test' }),
  inviaAllarmeFonti: async () => ({ inviata: false, motivo: 'test' }) };

describe('raccogli', () => {
  it('una fonte rotta non ferma le altre', async () => {
    const esito = await raccogli({ adesso, adattatori: [rotto, buono], fileBandi, fileSalute, fileMeta, leggiPagina: nessunaPagina, notifiche: nessunaNotifica });
    const bandi = JSON.parse(await readFile(fileBandi, 'utf8')) as Bando[];
    expect(bandi).toHaveLength(1);
    expect(bandi[0]!.fonteId).toBe('buona');
    expect(esito.nuovi).toBe(1);
  });

  it('registra l\'esito di ogni fonte, anche di quella rotta', async () => {
    await raccogli({ adesso, adattatori: [rotto, buono], fileBandi, fileSalute, fileMeta, leggiPagina: nessunaPagina, notifiche: nessunaNotifica });
    const salute = JSON.parse(await readFile(fileSalute, 'utf8'));
    expect(salute.rotta[0].ok).toBe(false);
    expect(salute.rotta[0].errore).toContain('HTTP 500');
    expect(salute.buona[0].ok).toBe(true);
  });

  it('scarta cio\' che e\' fuori finestra', async () => {
    await raccogli({ adesso, adattatori: [vecchio], fileBandi, fileSalute, fileMeta, leggiPagina: nessunaPagina, notifiche: nessunaNotifica });
    const bandi = JSON.parse(await readFile(fileBandi, 'utf8')) as Bando[];
    expect(bandi).toHaveLength(0);
  });

  it('un bando gia\' visto non e\' nuovo al secondo giro', async () => {
    await raccogli({ adesso, adattatori: [buono], fileBandi, fileSalute, fileMeta, leggiPagina: nessunaPagina, notifiche: nessunaNotifica });
    const esito = await raccogli({ adesso, adattatori: [buono], fileBandi, fileSalute, fileMeta, leggiPagina: nessunaPagina, notifiche: nessunaNotifica });
    expect(esito.nuovi).toBe(0);
  });

  it('notifica i bandi nuovi e pertinenti', async () => {
    let notificati: Bando[] = [];
    await raccogli({
      adesso, adattatori: [buono], fileBandi, fileSalute, fileMeta, leggiPagina: nessunaPagina,
      notifiche: { ...nessunaNotifica, inviaEmail: async (b) => { notificati = b; return { inviata: true, motivo: null }; } },
    });
    expect(notificati).toHaveLength(1);
  });

  it('salva i dati anche se l\'invio email fallisce, e lo segnala', async () => {
    const esito = await raccogli({
      adesso, adattatori: [buono], fileBandi, fileSalute, fileMeta, leggiPagina: nessunaPagina,
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
      await raccogli({ adesso, adattatori: [muto], fileBandi, fileSalute, fileMeta, leggiPagina: nessunaPagina, notifiche });
    }
    expect(allarme).toEqual(['Fonte muta']);
  });

  it('scrive l\'orario del controllo anche quando non esce nulla di nuovo', async () => {
    await raccogli({ adesso, adattatori: [vecchio], fileBandi, fileSalute, fileMeta, leggiPagina: nessunaPagina, notifiche: nessunaNotifica });
    const meta = JSON.parse(await readFile(fileMeta, 'utf8'));
    expect(meta.ultimoControllo).toBe(adesso.toISOString());
    expect(meta.fonti).toEqual([{ id: 'vecchia', nome: 'Fonte vecchia' }]);
  });

  it('si ferma senza toccare un archivio corrotto, invece di sovrascriverlo', async () => {
    const corrotto = '[{"id": "abc", "titolo": "troncato a met';
    await writeFile(fileBandi, corrotto);
    await expect(
      raccogli({ adesso, adattatori: [buono], fileBandi, fileSalute, fileMeta, leggiPagina: nessunaPagina, notifiche: nessunaNotifica }),
    ).rejects.toThrow(/illeggibile/);
    expect(await readFile(fileBandi, 'utf8')).toBe(corrotto);
  });

  it('si ferma anche se e\' corrotto lo storico della salute', async () => {
    await writeFile(fileSalute, '{ non json');
    await expect(
      raccogli({ adesso, adattatori: [buono], fileBandi, fileSalute, fileMeta, leggiPagina: nessunaPagina, notifiche: nessunaNotifica }),
    ).rejects.toThrow(/illeggibile/);
    expect(await readFile(fileSalute, 'utf8')).toBe('{ non json');
  });

  it('un archivio che non esiste ancora vale come vuoto', async () => {
    const esito = await raccogli({
      adesso, adattatori: [buono], fileBandi: join(cartella, 'nuovo.json'),
      fileSalute: join(cartella, 'nuova-salute.json'), fileMeta, leggiPagina: nessunaPagina, notifiche: nessunaNotifica,
    });
    expect(esito.nuovi).toBe(1);
  });

  it('legge la pagina dei bandi adatti e ne ricava chi presenta e la scadenza', async () => {
    const letti: string[] = [];
    const pagina = async (url: string) => {
      letti.push(url);
      return 'Il bando e\' rivolto alle associazioni di promozione sociale. SCADENZA. 23 novembre 2026.';
    };
    let notificati: Bando[] = [];
    await raccogli({
      adesso, adattatori: [buono], fileBandi, fileSalute, fileMeta, leggiPagina: pagina,
      notifiche: { ...nessunaNotifica, inviaEmail: async (b) => { notificati = b; return { inviata: true, motivo: null }; } },
    });
    const [b] = JSON.parse(await readFile(fileBandi, 'utf8')) as Bando[];
    expect(letti).toEqual(['https://x.it/web-serie']);
    expect(b!.scadenza).toBe('2026-11-23');
    expect(b!.entePropostoId).toBe('storiedipiazza');
    expect(b!.approfonditoIl).toBe(adesso.toISOString());
    // La notifica porta gia' cio' che si e' letto nella pagina.
    expect(notificati[0]!.scadenza).toBe('2026-11-23');
  });

  it('non rilegge la pagina di un bando gia\' approfondito', async () => {
    let letture = 0;
    const pagina = async () => { letture++; return 'SCADENZA. 23 novembre 2026.'; };
    await raccogli({ adesso, adattatori: [buono], fileBandi, fileSalute, fileMeta, leggiPagina: pagina, notifiche: nessunaNotifica });
    await raccogli({ adesso, adattatori: [buono], fileBandi, fileSalute, fileMeta, leggiPagina: pagina, notifiche: nessunaNotifica });
    expect(letture).toBe(1);
    const [b] = JSON.parse(await readFile(fileBandi, 'utf8')) as Bando[];
    expect(b!.scadenza).toBe('2026-11-23');
  });

  it('una pagina che non si legge non ferma la raccolta e si riprova la volta dopo', async () => {
    const rotta = async () => { throw new Error('HTTP 503'); };
    const esito = await raccogli({ adesso, adattatori: [buono], fileBandi, fileSalute, fileMeta, leggiPagina: rotta, notifiche: nessunaNotifica });
    expect(esito.errori).toEqual([]);
    const [b] = JSON.parse(await readFile(fileBandi, 'utf8')) as Bando[];
    expect(b!.approfonditoIl).toBeUndefined();
  });
});

describe('insieme', () => {
  it('un canale che fallisce non impedisce agli altri di partire', async () => {
    let secondo = false;
    const rotto = { inviaEmail: async () => { throw new Error('ntfy giu'); }, inviaAllarmeFonti: async () => ({ inviata: false, motivo: null }) };
    const buonoCanale = { inviaEmail: async () => { secondo = true; return { inviata: true, motivo: null }; }, inviaAllarmeFonti: async () => ({ inviata: false, motivo: null }) };
    await expect(insieme(rotto, buonoCanale).inviaEmail([])).rejects.toThrow('ntfy giu');
    expect(secondo).toBe(true);
  });
});
