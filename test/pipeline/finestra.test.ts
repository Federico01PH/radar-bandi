import { describe, it, expect } from 'vitest';
import { dentroLaFinestra } from '../../src/pipeline/finestra.ts';

const oggi = new Date('2026-09-18T08:00:00Z');

describe('dentroLaFinestra', () => {
  it('accetta un bando pubblicato oggi', () => {
    expect(dentroLaFinestra(new Date('2026-09-18T06:00:00Z'), oggi, 7)).toBe(true);
  });

  it('accetta un bando al limite esatto della finestra', () => {
    expect(dentroLaFinestra(new Date('2026-09-11T08:00:00Z'), oggi, 7)).toBe(true);
  });

  it('rifiuta un bando appena fuori finestra', () => {
    expect(dentroLaFinestra(new Date('2026-09-10T23:00:00Z'), oggi, 7)).toBe(false);
  });

  it('accetta un bando datato nel futuro, perche\' alcune fonti pubblicano con data di decorrenza', () => {
    expect(dentroLaFinestra(new Date('2026-09-20T00:00:00Z'), oggi, 7)).toBe(true);
  });

  it('accetta un bando senza data: meglio un falso positivo di un bando perso', () => {
    expect(dentroLaFinestra(null, oggi, 7)).toBe(true);
  });

  it('accetta una data non interpretabile, come una data assente', () => {
    expect(dentroLaFinestra(new Date('non-una-data'), oggi, 7)).toBe(true);
  });
});
