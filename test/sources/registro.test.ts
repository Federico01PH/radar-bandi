import { describe, it, expect } from 'vitest';
import { ADATTATORI } from '../../src/sources/registro.ts';

describe('registro delle fonti', () => {
  it('contiene le sette fonti verificate', () => {
    expect(ADATTATORI).toHaveLength(7);
  });

  it('non ha id duplicati', () => {
    const ids = ADATTATORI.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('ogni adattatore espone i metadati richiesti', () => {
    for (const a of ADATTATORI) {
      expect(a.id, 'id').toBeTruthy();
      expect(a.nome, `nome di ${a.id}`).toBeTruthy();
      expect(a.ente, `ente di ${a.id}`).toBeTruthy();
      expect(typeof a.cerca, `cerca di ${a.id}`).toBe('function');
    }
  });

  it('copre le corsie che contano per questo progetto', () => {
    const livelli = new Set(ADATTATORI.map((a) => a.livello));
    expect(livelli.has('terzosettore')).toBe(true);
    expect(livelli.has('mic')).toBe(true);
    expect(livelli.has('regionale')).toBe(true);
    expect(livelli.has('fondazione')).toBe(true);
  });
});
