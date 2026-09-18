import { describe, it, expect } from 'vitest';
import { classifica } from '../../src/scoring/tipo.ts';

// Per le fonti miste: nel dubbio e' un bando. Una notizia in piu' costa
// trenta secondi, un bando perso costa il bando.
describe('classifica', () => {
  it('nel dubbio sceglie bando: stanziamento con termine di presentazione', () => {
    expect(classifica(
      'Nuovo stanziamento della Fondazione per i giovani del territorio',
      'Con termine di presentazione delle proposte fissato al 30 novembre.',
    )).toBe('bando');
  });

  it('nel dubbio sceglie bando: organizzazioni che possono richiedere fondi', () => {
    expect(classifica(
      'Progetti Terzo Settore 2026',
      'Le organizzazioni no profit possono richiedere fino a 15.000 euro; le proposte progettuali vanno inviate tramite il portale online.',
    )).toBe('bando');
  });

  it('nel dubbio sceglie bando: nuovo strumento con modulo online', () => {
    expect(classifica(
      'Al via il nuovo strumento a favore delle realta del terzo settore',
      'Le realta interessate possono presentare la propria proposta compilando il modulo online.',
    )).toBe('bando');
  });

  it('riconosce una notizia dichiarata', () => {
    expect(classifica('Generare Futuro: la Casa del Teatro Ragazzi compie 20 anni', '')).toBe('notizia');
    expect(classifica('Presentazione del volume "A casa di Einstein"', '')).toBe('notizia');
    expect(classifica('Leoncino d Oro 2026 a Mr. Nelson', 'Premiato a Venezia.')).toBe('notizia');
  });

  it('un segno di bando vince su un segno di notizia', () => {
    expect(classifica(
      'Il Festival compie dieci anni e apre il bando per i giovani autori',
      'Candidature entro il 30 ottobre.',
    )).toBe('bando');
  });
});
