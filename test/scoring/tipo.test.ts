import { describe, it, expect } from 'vitest';
import { sembraUnBando } from '../../src/scoring/tipo.ts';

// Titoli reali raccolti il 18 settembre 2026 dai feed misti delle fondazioni e del MiC.
describe('sembraUnBando', () => {
  it('riconosce una call aperta anche senza la parola bando', () => {
    expect(sembraUnBando('Collective Projects: ancora aperta la call 2026/2027 rivolta agli ETS', '')).toBe(true);
  });

  it('riconosce un bando dichiarato', () => {
    expect(sembraUnBando('Bando crowdfunding Impatto+ 2026 "Costruire la Pace"', '')).toBe(true);
  });

  it('riconosce un avviso di contributi', () => {
    expect(sembraUnBando('Sostegno a festival, cori e bande musicali', 'Contributi per l\'anno 2026.')).toBe(true);
  });

  it('riconosce le candidature aperte', () => {
    expect(sembraUnBando('Giovani autori', 'Sono aperte le candidature fino al 30 ottobre.')).toBe(true);
  });

  it('scarta un premio assegnato', () => {
    expect(sembraUnBando('Leoncino d\'Oro 2026 a "Mr. Nelson, Did You Kill?"', '')).toBe(false);
  });

  it('scarta un comunicato stampa', () => {
    expect(sembraUnBando('DGCA - CNC Meeting in Venice - Press Release', '')).toBe(false);
  });

  it('scarta la cronaca istituzionale', () => {
    expect(sembraUnBando('Giuli firma l\'Accordo di coproduzione cinematografica con la Corea del Sud', '')).toBe(false);
  });

  it('non scambia "callback" o "recall" per una call', () => {
    expect(sembraUnBando('Aggiornamento recall del sistema', 'Nuovo callback per le notifiche.')).toBe(false);
  });
});
