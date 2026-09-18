import { describe, it, expect } from 'vitest';
import { trovaScadenza } from '../../src/scoring/scadenza.ts';

const oggi = new Date('2026-09-18T08:00:00Z');

// Frasi reali dalle pagine dei bandi, 18 settembre 2026.
describe('trovaScadenza', () => {
  it('legge l\'etichetta SCADENZA di InfoBandi', () => {
    expect(trovaScadenza('Beneficiari: associazioni. SCADENZA. 23 novembre 2026. Link al bando.', oggi)).toBe('2026-11-23');
  });

  it('preferisce la proroga alla scadenza originale', () => {
    const t = 'Le candidature andavano inviate entro il 18 settembre 2026. Il termine e\' prorogato al 25 settembre 2026, ore 15:00.';
    expect(trovaScadenza(t, oggi)).toBe('2026-09-25');
  });

  it('salta l\'orario fra l\'indizio e la data', () => {
    expect(trovaScadenza('Le domande vanno presentate entro le ore 12.00 del 30 ottobre 2026.', oggi)).toBe('2026-10-30');
  });

  it('legge le date numeriche', () => {
    expect(trovaScadenza('Scadenza: 15/12/2026', oggi)).toBe('2026-12-15');
    expect(trovaScadenza('entro e non oltre il 01.02.2027', oggi)).toBe('2027-02-01');
  });

  it('fra piu\' scadenze future sceglie la piu\' vicina, cioe\' quella della domanda', () => {
    const t = 'Le domande entro il 30 ottobre 2026. La rendicontazione entro il 15 giugno 2027.';
    expect(trovaScadenza(t, oggi)).toBe('2026-10-30');
  });

  it('se sono tutte passate restituisce la piu\' recente, cosi\' il sito mostra che e\' scaduto', () => {
    expect(trovaScadenza('Domande entro il 10 gennaio 2026.', oggi)).toBe('2026-01-10');
  });

  it('non inventa una scadenza da una data qualunque', () => {
    expect(trovaScadenza('Pubblicato il 17 settembre 2026. Il festival si terra\' il 3 ottobre 2026.', oggi)).toBeNull();
  });

  it('ignora date impossibili', () => {
    expect(trovaScadenza('Scadenza: 31/02/2026', oggi)).toBeNull();
  });

  // Caso reale: "Progetti oltre gli stereotipi", InfoBandi, 18 settembre 2026.
  it('preferisce l\'etichetta Scadenza alla data per le domande di chiarimento', () => {
    const t = 'SCADENZA. 25 ottobre 2026. OBIETTIVI. Il bando e\' rivolto ad associazioni. '
      + 'Le domande di chiarimento vanno inviate entro il 27 settembre 2026. Le risposte saranno pubblicate in forma anonima.';
    expect(trovaScadenza(t, oggi)).toBe('2026-10-25');
  });
});
