import { describe, it, expect } from 'vitest';
import { calcolaPertinenza, appiattisci } from '../../src/scoring/pertinenza.ts';

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
