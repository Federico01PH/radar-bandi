import { describe, it, expect } from 'vitest';
import { calcolaPertinenza, appiattisci, esclusoDalTitolo } from '../../src/scoring/pertinenza.ts';

describe('appiattisci', () => {
  it('abbassa e toglie gli accenti, per far combaciare le parole chiave', () => {
    expect(appiattisci('Povertà Educativa')).toBe('poverta educativa');
  });

  it('comprime gli spazi multipli e la punteggiatura', () => {
    expect(appiattisci('cinema,  e   audiovisivo')).toBe('cinema e audiovisivo');
  });
});

describe('calcolaPertinenza', () => {
  it('assegna zero a un bando fuori tema', () => {
    const r = calcolaPertinenza('Manutenzione strade provinciali', 'Asfaltatura tratti urbani');
    expect(r.punteggio).toBe(0);
    expect(r.corsie).toEqual([]);
  });

  it('riconosce la corsia audiovisiva', () => {
    const r = calcolaPertinenza('Bando cortometraggio', 'Sostegno alla produzione di cortometraggi');
    expect(r.corsie).toEqual(['audiovisiva']);
    expect(r.punteggio).toBeGreaterThan(0);
  });

  it('riconosce la corsia giovani', () => {
    const r = calcolaPertinenza('Contrasto alla poverta educativa', 'Progetti per adolescenti');
    expect(r.corsie).toEqual(['giovani']);
    expect(r.punteggio).toBeGreaterThan(0);
  });

  it('premia chi sta in entrambe le corsie', () => {
    const solo = calcolaPertinenza('Bando web serie', 'Produzione di una web serie');
    const doppio = calcolaPertinenza(
      'Bando web serie sul bullismo',
      'Produzione di una web serie sul bullismo con gli adolescenti',
    );
    expect(doppio.corsie.sort()).toEqual(['audiovisiva', 'giovani']);
    expect(doppio.punteggio).toBeGreaterThan(solo.punteggio);
  });

  it('non supera mai cento', () => {
    const r = calcolaPertinenza(
      'web serie bullismo cyberbullismo adolescenti audiovisivo cinema',
      'disagio giovanile poverta educativa scuola studenti documentario cortometraggio sceneggiatura',
    );
    expect(r.punteggio).toBeLessThanOrEqual(100);
  });

  it('conta una parola chiave una volta sola, anche se ripetuta', () => {
    const una = calcolaPertinenza('bullismo', '');
    const tre = calcolaPertinenza('bullismo bullismo bullismo', '');
    expect(tre.punteggio).toBe(una.punteggio);
  });
});

// Casi reali della raccolta del 18 settembre 2026.
describe('temi forti', () => {
  it('un bando per le mense non e\' adatto: solo parole generiche', () => {
    const r = calcolaPertinenza('Iniziative 2026 per mense e dormitori per i poveri',
      'Distribuzione di pasti. Rivolto agli enti del terzo settore.');
    expect(r.forte).toBe(false);
  });

  it('il bonus non scatta con due parole generiche', () => {
    const generico = calcolaPertinenza('Sostegno a festival, cori e bande musicali', 'Per i giovani del territorio.');
    expect(generico.forte).toBe(false);
    expect(generico.punteggio).toBeLessThan(20);
  });

  it('il bonus scatta se entrambe le corsie hanno un tema forte', () => {
    const r = calcolaPertinenza('Web serie contro il bullismo', '');
    expect(r.forte).toBe(true);
    expect(r.punteggio).toBe(12 + 14 + 20);
  });

  it('un tema della serie basta da solo', () => {
    expect(calcolaPertinenza('Bando CoPower per contrastare la violenza di genere', '').forte).toBe(true);
  });

  it('l\'audiovisivo basta da solo', () => {
    expect(calcolaPertinenza('Avvisi del Piano Nazionale Cinema e Immagini per la Scuola', '').forte).toBe(true);
    expect(calcolaPertinenza('Short Film Fund: sostegno ai cortometraggi', '').forte).toBe(true);
  });
});

describe('esclusoDalTitolo', () => {
  it('esclude gli atti amministrativi del Ministero', () => {
    expect(esclusoDalTitolo('Tax credit – Decreti del 31 agosto 2026 di riconoscimento crediti d’imposta')).toBe(true);
    expect(esclusoDalTitolo('PROMOZIONE 2025 – Delibera relativa ai contributi')).toBe(true);
    expect(esclusoDalTitolo('Esito graduatoria Avviso pubblico POLIS')).toBe(true);
    expect(esclusoDalTitolo('Tax credit – Apertura sessione tax credit funzionamento sale cinematografiche')).toBe(true);
  });

  it('non esclude una proroga di scadenza, che e\' un\'opportunita\'', () => {
    expect(esclusoDalTitolo('Proroga termine per l’invio delle candidature – Piano Nazionale Cinema e Immagini per la Scuola')).toBe(false);
  });
});
