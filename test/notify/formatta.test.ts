import { describe, it, expect } from 'vitest';
import { daNotificare, oggetto, corpoHtml, hrefSicuro } from '../../src/notify/formatta.ts';
import type { Bando } from '../../src/tipi.ts';

function bando(over: Partial<Bando> = {}): Bando {
  return {
    id: 'a'.repeat(64), titolo: 'Bando web serie', ente: 'CSVnet',
    livello: 'terzosettore', tipo: 'bando', corsie: ['audiovisiva', 'giovani'],
    dataPubblicazione: '2026-09-17T00:00:00.000Z', dataIncerta: false,
    scadenza: null, importo: null, descrizioneBreve: 'Descrizione.',
    requisiti: [], chiPuoPartecipare: 'Possono partecipare le associazioni.',
    ammissibilita: 'verde', entePropostoId: 'storiedipiazza',
    motivoAmmissibilita: 'Possono partecipare le associazioni.',
    pertinenza: 60, adattoAllaSerie: true, url: 'https://x.it/a', fonteId: 'infobandi',
    vistoIl: '2026-09-18T08:00:00.000Z', salvato: false,
    ...over,
  };
}

describe('daNotificare', () => {
  it('tiene i bandi adatti alla serie', () => {
    expect(daNotificare([bando()])).toHaveLength(1);
  });

  it('scarta i bandi non adatti alla serie, anche con punteggio alto', () => {
    expect(daNotificare([bando({ pertinenza: 90, adattoAllaSerie: false })])).toHaveLength(0);
  });

  it('scarta i rossi anche se molto pertinenti', () => {
    expect(daNotificare([bando({ pertinenza: 95, ammissibilita: 'rosso' })])).toHaveLength(0);
  });

  it('non notifica una notizia, per quanto pertinente', () => {
    expect(daNotificare([bando({ pertinenza: 95, tipo: 'notizia', adattoAllaSerie: false })])).toHaveLength(0);
  });

  it('tiene gli ignota sopra soglia: nel dubbio si avvisa', () => {
    expect(daNotificare([bando({ pertinenza: 60, ammissibilita: 'ignota' })])).toHaveLength(1);
  });

  it('ordina per pertinenza decrescente', () => {
    const out = daNotificare(
      [bando({ id: 'b'.repeat(64), pertinenza: 40 }), bando({ pertinenza: 90 })]);
    expect(out[0]!.pertinenza).toBe(90);
  });
});

describe('oggetto', () => {
  it('usa il singolare per un bando solo', () => {
    expect(oggetto([bando()])).toBe('Radar Bandi: 1 nuovo bando');
  });

  it('usa il plurale per piu\' bandi', () => {
    expect(oggetto([bando(), bando({ id: 'b'.repeat(64) })])).toBe('Radar Bandi: 2 nuovi bandi');
  });
});

describe('corpoHtml', () => {
  it('include titolo, ente e link', () => {
    const html = corpoHtml([bando()]);
    expect(html).toContain('Bando web serie');
    expect(html).toContain('CSVnet');
    expect(html).toContain('https://x.it/a');
  });

  it('dice quale ente deve firmare la domanda', () => {
    expect(corpoHtml([bando()])).toContain('Storie di Piazza APS');
  });

  it('riporta la frase da cui e\' dedotta l\'ammissibilita\'', () => {
    expect(corpoHtml([bando()])).toContain('Possono partecipare le associazioni.');
  });

  it('protegge dai caratteri speciali nei titoli', () => {
    const html = corpoHtml([bando({ titolo: 'Bando <script>alert(1)</script>' })]);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('daNotificare, casi limite', () => {
  it('non si rompe su una lista vuota', () => {
    expect(daNotificare([])).toEqual([]);
  });


  it('non rende cliccabile un link javascript arrivato da un feed', () => {
    const html = corpoHtml([bando({ url: 'javascript:alert(document.cookie)' })]);
    expect(html).not.toContain('javascript:');
    expect(html).toContain('href="#"');
  });

  it('lascia passare i link http e https', () => {
    expect(hrefSicuro('https://x.it/a')).toBe('https://x.it/a');
    expect(hrefSicuro('http://x.it/a')).toBe('http://x.it/a');
    expect(hrefSicuro('  JavaScript:void(0)')).toBe('#');
    expect(hrefSicuro('data:text/html,ciao')).toBe('#');
  });
});
