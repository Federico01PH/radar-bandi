import { describe, it, expect } from 'vitest';
import { approfondisci, fondi, costruisciBando, rivaluta } from '../../src/pipeline/archivio.ts';
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

describe('adatto alla serie', () => {
  it('una web serie sul bullismo e\' adatta', () => {
    expect(costruisciBando(grezzo(), 'CSVnet', 'terzosettore', adesso, true).adattoAllaSerie).toBe(true);
  });

  it('un bando con sole parole generiche non e\' adatto', () => {
    const b = costruisciBando(grezzo({ titolo: 'Mense e dormitori', descrizione: 'Per il terzo settore.' }), 'E', 'terzosettore', adesso, true);
    expect(b.adattoAllaSerie).toBe(false);
  });

  it('una notizia non e\' mai adatta, anche se parla di cinema', () => {
    const b = costruisciBando(grezzo({ titolo: 'Inaugurata la Casa del Cinema', descrizione: 'Premiato il film.' }), 'E', 'fondazione', adesso, false);
    expect(b.tipo).toBe('notizia');
    expect(b.adattoAllaSerie).toBe(false);
  });

  it('un atto amministrativo non e\' adatto, anche se parla di cinema', () => {
    const b = costruisciBando(grezzo({ titolo: 'Esito graduatoria contributi cinema', descrizione: '' }), 'MiC', 'mic', adesso, true);
    expect(b.adattoAllaSerie).toBe(false);
  });
});

describe('fonti miste', () => {
  // Caso reale: il feed di Compagnia di San Paolo, 18 settembre 2026.
  it('non mostra un festival che parla di cinema ma non e\' un bando', () => {
    const b = costruisciBando(grezzo({
      titolo: 'Festival dell\u2019Accoglienza 2026',
      descrizione: 'Oltre 100 eventi, con un programma che intreccia dibattiti, arte, cinema e percorsi dedicati alle scuole.',
    }), 'Compagnia di San Paolo', 'fondazione', adesso, false);
    expect(b.adattoAllaSerie).toBe(false);
  });

  it('mostra un bando di fondazione con un segno esplicito di bando', () => {
    const b = costruisciBando(grezzo({
      titolo: 'Nuovo bando per progetti audiovisivi contro il bullismo',
      descrizione: 'Le organizzazioni possono richiedere un contributo entro il 30 novembre.',
    }), 'Fondazione CRT', 'fondazione', adesso, false);
    expect(b.adattoAllaSerie).toBe(true);
  });

  it('esclude la qualifica di sala d\'essai', () => {
    const b = costruisciBando(grezzo({ titolo: 'Bando relativo al riconoscimento della qualifica di sala d\u2019essai', descrizione: 'Cinema.' }), 'MiC', 'mic', adesso, true);
    expect(b.adattoAllaSerie).toBe(false);
  });
});

describe('rivaluta', () => {
  it('applica le regole di oggi a un bando in archivio senza toccare salvato e primo avvistamento', () => {
    const vecchio = { ...costruisciBando(grezzo(), 'CSVnet', 'terzosettore', adesso, true), salvato: true };
    const senzaCampo = { ...vecchio } as Partial<typeof vecchio>;
    delete senzaCampo.adattoAllaSerie;
    const r = rivaluta(senzaCampo as typeof vecchio, true);
    expect(r.adattoAllaSerie).toBe(true);
    expect(r.salvato).toBe(true);
    expect(r.vistoIl).toBe(vecchio.vistoIl);
    expect(r.id).toBe(vecchio.id);
  });
});

describe('requisiti nella scheda', () => {
  const pagina = `Bando per progetti contro il bullismo.
Sono ammessi a presentare domanda gli enti del terzo settore con sede in Piemonte.
Il contributo massimo per progetto e' di 20.000 euro.
Le domande si chiudono il 30 novembre 2026.`;

  it('approfondisci ricava i punti dal testo della pagina', () => {
    const b = approfondisci(costruisciBando(grezzo(), 'CSVnet', 'terzosettore', adesso, true), pagina, adesso);
    expect(b.requisiti.join('\n')).toContain('enti del terzo settore');
    expect(b.requisiti.join('\n')).toContain('20.000 euro');
  });

  it('rivaluta non butta via i punti letti nella pagina', () => {
    const b = approfondisci(costruisciBando(grezzo(), 'CSVnet', 'terzosettore', adesso, true), pagina, adesso);
    expect(rivaluta(b, true).requisiti).toEqual(b.requisiti);
  });

  it('senza pagina letta non ripete la descrizione che la scheda mostra gia\'', () => {
    const corta = costruisciBando(
      grezzo({ descrizione: 'Possono partecipare le associazioni di promozione sociale con sede in Italia.' }),
      'CSVnet', 'terzosettore', adesso, true,
    );
    expect(corta.requisiti).toEqual([]);
  });

  it('dal feed prende solo cio\' che la descrizione, tagliata a 400 caratteri, non mostra', () => {
    const coda = 'Possono partecipare le associazioni di promozione sociale con sede in Italia.';
    const lungo = costruisciBando(
      grezzo({ descrizione: `${'Premessa lunghissima del bando. '.repeat(15)}${coda}` }),
      'CSVnet', 'terzosettore', adesso, true,
    );
    expect(lungo.requisiti[0]).toContain('associazioni di promozione sociale');
  });
});
