import { describe, it, expect } from 'vitest';
import { fonteSospetta, aggiornaStorico } from '../../src/health/salute.ts';
import type { EsitoFonte } from '../../src/tipi.ts';

function esito(over: Partial<EsitoFonte> = {}): EsitoFonte {
  return { fonteId: 'mic', ok: true, risultati: 3, durataMs: 100, errore: null,
           quando: '2026-09-18T08:00:00Z', ...over };
}

describe('fonteSospetta', () => {
  it('non segnala una fonte che porta risultati', () => {
    expect(fonteSospetta([esito(), esito(), esito()], 3)).toBe(false);
  });

  it('segnala tre errori consecutivi', () => {
    const ko = esito({ ok: false, risultati: 0, errore: 'HTTP 500' });
    expect(fonteSospetta([ko, ko, ko], 3)).toBe(true);
  });

  it('segnala tre esecuzioni a zero risultati anche senza errori', () => {
    // E' il sintomo di un sito rifatto: il parser gira ma non trova piu' nulla.
    const vuoto = esito({ ok: true, risultati: 0 });
    expect(fonteSospetta([vuoto, vuoto, vuoto], 3)).toBe(true);
  });

  it('non segnala se un successo interrompe la serie', () => {
    const vuoto = esito({ risultati: 0 });
    expect(fonteSospetta([vuoto, esito(), vuoto], 3)).toBe(false);
  });

  it('guarda solo le ultime N esecuzioni', () => {
    const vuoto = esito({ risultati: 0 });
    expect(fonteSospetta([vuoto, vuoto, vuoto, esito()], 3)).toBe(false);
  });

  it('non segnala prima di avere abbastanza storico', () => {
    const vuoto = esito({ risultati: 0 });
    expect(fonteSospetta([vuoto, vuoto], 3)).toBe(false);
  });
});

describe('aggiornaStorico', () => {
  it('accoda il nuovo esito in coda', () => {
    const s = aggiornaStorico({}, [esito({ fonteId: 'mic' })], 10);
    expect(s['mic']).toHaveLength(1);
  });

  it('tiene solo le ultime N esecuzioni per fonte', () => {
    let s: Record<string, EsitoFonte[]> = {};
    for (let i = 0; i < 15; i++) s = aggiornaStorico(s, [esito({ fonteId: 'mic' })], 10);
    expect(s['mic']).toHaveLength(10);
  });

  it('tiene le fonti separate', () => {
    const s = aggiornaStorico({}, [esito({ fonteId: 'mic' }), esito({ fonteId: 'crt' })], 10);
    expect(Object.keys(s).sort()).toEqual(['crt', 'mic']);
  });
});
