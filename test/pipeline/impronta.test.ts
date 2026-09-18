import { describe, it, expect } from 'vitest';
import { impronta, normalizzaUrl } from '../../src/pipeline/impronta.ts';

describe('normalizzaUrl', () => {
  it('rimuove i parametri di tracciamento', () => {
    expect(normalizzaUrl('https://x.it/bando?utm_source=news&id=7'))
      .toBe('https://x.it/bando?id=7');
  });

  it('rimuove la barra finale e abbassa il dominio', () => {
    expect(normalizzaUrl('https://X.IT/Bando/')).toBe('https://x.it/Bando');
  });

  it('restituisce la stringa originale se non e\' un URL valido', () => {
    expect(normalizzaUrl('non-un-url')).toBe('non-un-url');
  });

  it('conserva ref, che sui portali della PA e\' spesso l\'id del documento', () => {
    expect(normalizzaUrl('https://x.it/dettaglio?ref=42')).toBe('https://x.it/dettaglio?ref=42');
  });

  it('ordina i parametri, cosi\' lo stesso bando non cambia impronta', () => {
    expect(normalizzaUrl('https://x.it/b?cat=x&id=7')).toBe(normalizzaUrl('https://x.it/b?id=7&cat=x'));
  });

  it('scarta tutti i parametri di tracciamento elencati', () => {
    expect(normalizzaUrl('https://x.it/a?fbclid=1&gclid=2&mc_cid=3&mc_eid=4&utm_term=5&id=7'))
      .toBe('https://x.it/a?id=7');
  });
});

describe('impronta', () => {
  it('e\' stabile fra chiamate identiche', () => {
    expect(impronta('mic', 'https://x.it/a')).toBe(impronta('mic', 'https://x.it/a'));
  });

  it('ignora i parametri di tracciamento', () => {
    expect(impronta('mic', 'https://x.it/a?utm_medium=mail'))
      .toBe(impronta('mic', 'https://x.it/a'));
  });

  it('distingue fonti diverse sullo stesso URL', () => {
    expect(impronta('mic', 'https://x.it/a')).not.toBe(impronta('crt', 'https://x.it/a'));
  });

  it('non dipende dal titolo, che le fonti ritoccano', () => {
    const a = impronta('mic', 'https://x.it/a');
    const b = impronta('mic', 'https://x.it/a');
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });
});
