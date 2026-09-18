import { describe, it, expect } from 'vitest';
import { fondi, costruisciBando } from '../../src/pipeline/archivio.ts';
import type { Bando, RisultatoGrezzo } from '../../src/tipi.ts';

const adesso = new Date('2026-09-18T08:00:00Z');

function grezzo(over: Partial<RisultatoGrezzo> = {}): RisultatoGrezzo {
  return {
    titolo: 'Bando web serie sul bullismo',
    url: 'https://x.it/a',
    descrizione: 'Possono partecipare le associazioni di promozione sociale.',
    dataPubblicazione: new Date('2026-09-17T00:00:00Z'),
    fonteId: 'infobandi',
    ...over,
  };
}

describe('costruisciBando', () => {
  it('compila i campi derivati', () => {
    const b = costruisciBando(grezzo(), 'CSVnet', 'terzosettore', adesso, true);
    expect(b.id).toHaveLength(64);
    expect(b.ente).toBe('CSVnet');
    expect(b.livello).toBe('terzosettore');
    expect(b.pertinenza).toBeGreaterThan(0);
    expect(b.ammissibilita).toBe('verde');
    expect(b.entePropostoId).toBe('storiedipiazza');
    expect(b.salvato).toBe(false);
  });

  it('marca dataIncerta e usa il momento del controllo quando manca la data', () => {
    const b = costruisciBando(grezzo({ dataPubblicazione: null }), 'CSVnet', 'terzosettore', adesso, true);
    expect(b.dataIncerta).toBe(true);
    expect(b.dataPubblicazione).toBe(adesso.toISOString());
  });

  it('tronca la descrizione a 400 caratteri', () => {
    const b = costruisciBando(grezzo({ descrizione: 'x'.repeat(900) }), 'E', 'statale', adesso, true);
    expect(b.descrizioneBreve.length).toBeLessThanOrEqual(400);
  });
});

describe('tipo del bando', () => {
  it('da una fonte di soli bandi e\' sempre un bando', () => {
    const b = costruisciBando(grezzo({ titolo: 'Iniziative per mense', descrizione: 'Testo qualsiasi.' }), 'E', 'terzosettore', adesso, true);
    expect(b.tipo).toBe('bando');
  });

  it('da una fonte mista una notizia resta notizia', () => {
    const b = costruisciBando(grezzo({ titolo: 'Leoncino d Oro 2026 a Mr. Nelson', descrizione: 'Premiato a Venezia.' }), 'E', 'fondazione', adesso, false);
    expect(b.tipo).toBe('notizia');
  });

  it('da una fonte mista una call aperta e\' un bando', () => {
    const b = costruisciBando(grezzo({ titolo: 'Ancora aperta la call 2026 rivolta agli ETS', descrizione: '' }), 'E', 'fondazione', adesso, false);
    expect(b.tipo).toBe('bando');
  });
});

describe('fondi', () => {
  it('aggiunge i bandi mai visti', () => {
    const nuovo = costruisciBando(grezzo(), 'CSVnet', 'terzosettore', adesso, true);
    const { tutti, nuovi } = fondi([], [nuovo]);
    expect(tutti).toHaveLength(1);
    expect(nuovi).toHaveLength(1);
  });

  it('non duplica un bando gia\' presente', () => {
    const b = costruisciBando(grezzo(), 'CSVnet', 'terzosettore', adesso, true);
    const { tutti, nuovi } = fondi([b], [{ ...b }]);
    expect(tutti).toHaveLength(1);
    expect(nuovi).toHaveLength(0);
  });

  it('conserva il flag salvato quando il bando torna dalla fonte', () => {
    const esistente: Bando = { ...costruisciBando(grezzo(), 'CSVnet', 'terzosettore', adesso, true), salvato: true };
    const rivisto = costruisciBando(grezzo(), 'CSVnet', 'terzosettore', new Date('2026-09-25T08:00:00Z'), true);
    const { tutti } = fondi([esistente], [rivisto]);
    expect(tutti[0]!.salvato).toBe(true);
  });

  it('conserva la data di primo avvistamento', () => {
    const esistente = costruisciBando(grezzo(), 'CSVnet', 'terzosettore', adesso, true);
    const rivisto = costruisciBando(grezzo(), 'CSVnet', 'terzosettore', new Date('2026-09-25T08:00:00Z'), true);
    const { tutti } = fondi([esistente], [rivisto]);
    expect(tutti[0]!.vistoIl).toBe(esistente.vistoIl);
  });

  it('aggiorna i campi che la fonte puo\' correggere', () => {
    const esistente = costruisciBando(grezzo({ titolo: 'Titolo vecchio' }), 'CSVnet', 'terzosettore', adesso, true);
    const rivisto = costruisciBando(grezzo({ titolo: 'Titolo corretto' }), 'CSVnet', 'terzosettore', adesso, true);
    const { tutti } = fondi([esistente], [rivisto]);
    expect(tutti[0]!.titolo).toBe('Titolo corretto');
  });

  it('ordina dal piu\' recente al piu\' vecchio', () => {
    const vecchio = costruisciBando(
      grezzo({ url: 'https://x.it/v', dataPubblicazione: new Date('2026-09-01T00:00:00Z') }),
      'E', 'statale', adesso, true);
    const recente = costruisciBando(
      grezzo({ url: 'https://x.it/r', dataPubblicazione: new Date('2026-09-17T00:00:00Z') }),
      'E', 'statale', adesso, true);
    const { tutti } = fondi([vecchio], [recente]);
    expect(tutti[0]!.url).toBe('https://x.it/r');
  });
});
