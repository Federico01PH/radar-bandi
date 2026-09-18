import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scriviSegnalazioneBandi, scriviSegnalazioneAllarme } from '../../src/notify/issue.ts';
import { corpoMarkdown } from '../../src/notify/formatta.ts';
import type { Bando } from '../../src/tipi.ts';

function bando(over: Partial<Bando> = {}): Bando {
  return {
    id: 'a'.repeat(64), titolo: 'Bando CoPower contro la violenza di genere', ente: 'CSVnet',
    livello: 'terzosettore', tipo: 'bando', corsie: ['giovani'],
    dataPubblicazione: '2026-09-17T00:00:00.000Z', dataIncerta: false,
    scadenza: null, importo: null, descrizioneBreve: 'Sostegno a progetti di prevenzione.',
    requisiti: [], chiPuoPartecipare: null, ammissibilita: 'verde',
    entePropostoId: 'storiedipiazza', motivoAmmissibilita: 'Possono partecipare le associazioni.',
    pertinenza: 17, url: 'https://x.it/copower', fonteId: 'infobandi',
    vistoIl: '2026-09-18T05:00:00.000Z', salvato: false,
    ...over,
  };
}

let cartella: string;
beforeEach(async () => { cartella = await mkdtemp(join(tmpdir(), 'segnalazioni-')); });

describe('corpoMarkdown', () => {
  it('contiene titolo con link, ente proponente e frase del bando', () => {
    const md = corpoMarkdown([bando()]);
    expect(md).toContain('[Bando CoPower contro la violenza di genere](https://x.it/copower)');
    expect(md).toContain('Presenta: Storie di Piazza APS');
    expect(md).toContain('Possono partecipare le associazioni.');
  });

  it('non menziona utenti GitHub a caso se un titolo contiene una chiocciola', () => {
    const md = corpoMarkdown([bando({ titolo: 'Bando per @qualcuno e soci' })]);
    expect(md).not.toMatch(/(^|\s)@qualcuno/);
  });

  it('non rompe il link se il titolo contiene parentesi quadre', () => {
    const md = corpoMarkdown([bando({ titolo: 'Bando [2026] giovani' })]);
    expect(md).toContain('[Bando \\[2026\\] giovani](https://x.it/copower)');
  });

  it('non trasforma in link un indirizzo javascript', () => {
    const md = corpoMarkdown([bando({ url: 'javascript:alert(1)' })]);
    expect(md).not.toContain('javascript:');
  });

  it('con molti bandi ne elenca un numero limitato e rimanda al sito per gli altri', () => {
    const tanti = Array.from({ length: 45 }, (_, i) => bando({ id: String(i).padStart(64, '0') }));
    const md = corpoMarkdown(tanti);
    expect((md.match(/^### /gm) ?? []).length).toBe(30);
    expect(md).toContain('altri 15');
  });
});

describe('scriviSegnalazioneBandi', () => {
  it('non scrive nulla quando non ci sono bandi', async () => {
    const esito = await scriviSegnalazioneBandi([], cartella);
    expect(esito.inviata).toBe(false);
    expect(await readdir(cartella)).toEqual([]);
  });

  it('scrive titolo e corpo per la segnalazione', async () => {
    const esito = await scriviSegnalazioneBandi([bando()], cartella);
    expect(esito.inviata).toBe(true);
    expect(await readFile(join(cartella, 'bandi.titolo'), 'utf8')).toBe('Radar Bandi: 1 nuovo bando');
    expect(await readFile(join(cartella, 'bandi.md'), 'utf8')).toContain('Bando CoPower');
  });
});

describe('scriviSegnalazioneAllarme', () => {
  it('tace quando tutte le fonti sono sane', async () => {
    await scriviSegnalazioneAllarme([], cartella);
    expect(await readdir(cartella)).toEqual([]);
  });

  it('nomina le fonti mute', async () => {
    await scriviSegnalazioneAllarme(['InfoBandi CSVnet'], cartella);
    expect(await readFile(join(cartella, 'allarme.titolo'), 'utf8')).toContain('1 fonti');
    expect(await readFile(join(cartella, 'allarme.md'), 'utf8')).toContain('InfoBandi CSVnet');
  });
});
