import { describe, it, expect } from 'vitest';
import { testoPulito, decodifica } from '../../src/sources/testo.ts';

describe('decodifica', () => {
  it('scioglie le entita\' con nome', () => {
    expect(decodifica('a &amp; b &nbsp;c')).toBe('a & b  c');
  });

  it('scioglie i puntini di sospensione della troncatura', () => {
    expect(decodifica('Testo [&hellip;]')).toBe('Testo […]');
  });

  it('scioglie le entita\' numeriche decimali', () => {
    expect(decodifica('l&#8217;apertura')).toBe('l’apertura');
  });

  it('scioglie le entita\' numeriche esadecimali', () => {
    expect(decodifica('l&#x2019;apertura')).toBe('l’apertura');
  });

  it('scioglie le entita\' annidate', () => {
    expect(decodifica('l&amp;#8217;apertura')).toBe('l’apertura');
  });

  it('scioglie le vocali accentate scritte come entita\'', () => {
    expect(decodifica('perch&egrave; &egrave; cos&igrave;')).toBe('perchè è così');
  });

  it('non esplode su un\'entita\' numerica fuori intervallo', () => {
    expect(() => decodifica('Tax credit &#1114112; sessione')).not.toThrow();
    expect(decodifica('Tax credit &#1114112; sessione')).toBe('Tax credit &#1114112; sessione');
  });

  it('non esplode su un\'entita\' esadecimale assurda', () => {
    expect(() => decodifica('x &#xFFFFFFFF; y')).not.toThrow();
  });
});

describe('testoPulito', () => {
  it('restituisce stringa vuota per un valore assente', () => {
    expect(testoPulito(undefined)).toBe('');
  });

  it('toglie i tag', () => {
    expect(testoPulito('<p>Testo <b>grassetto</b></p>')).toBe('Testo grassetto');
  });

  it('normalizza gli spazi', () => {
    expect(testoPulito('  molti   spazi \n e a capo ')).toBe('molti spazi e a capo');
  });

  it('non lascia residui di markup in cio\' che leggera\' una persona', () => {
    const out = testoPulito('<p>Si comunica l&#8217;apertura della sessione [&hellip;]</p>');
    expect(out).toBe('Si comunica l’apertura della sessione […]');
    expect(out).not.toMatch(/&[a-z#0-9]+;/i);
  });
});
