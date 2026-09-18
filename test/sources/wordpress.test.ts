import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { analizzaWordpress, creaAdattatoreWordpress } from '../../src/sources/wordpress.ts';

const json = JSON.parse(await readFile('test/fixtures/wp-mic.json', 'utf8'));

describe('analizzaWordpress', () => {
  it('estrae titolo, link, data e descrizione', () => {
    const voci = analizzaWordpress(json, 'mic');
    expect(voci.length).toBeGreaterThan(0);
    const prima = voci[0]!;
    expect(prima.titolo).toBeTruthy();
    expect(prima.url).toMatch(/^https:\/\//);
    expect(prima.dataPubblicazione).toBeInstanceOf(Date);
    expect(prima.fonteId).toBe('mic');
  });

  it('decodifica le entita\' HTML nei titoli', () => {
    const voci = analizzaWordpress(
      [{ date: '2026-09-17T15:20:53', link: 'https://x.it/a',
         title: { rendered: 'Tax credit &#8211; sessione' },
         excerpt: { rendered: '<p>Testo</p>' }, categories: [4] }],
      'mic',
    );
    expect(voci[0]!.titolo).toBe('Tax credit – sessione');
  });

  it('toglie i tag dall\'estratto', () => {
    const voci = analizzaWordpress(
      [{ date: '2026-09-17T15:20:53', link: 'https://x.it/a',
         title: { rendered: 'T' },
         excerpt: { rendered: '<p>Si comunica l&#8217;apertura.</p>' }, categories: [4] }],
      'mic',
    );
    expect(voci[0]!.descrizione).toBe('Si comunica l’apertura.');
  });

  it('protesta se ci sono post ma nessuno utilizzabile', () => {
    expect(() => analizzaWordpress(
      [{ date: '2026-09-17T15:20:53', link: '', title: { rendered: 'T' }, excerpt: { rendered: '' }, categories: [] }],
      'mic',
    )).toThrow(/formato cambiato/);
  });

  it('resta silenzioso su una lista davvero vuota', () => {
    expect(analizzaWordpress([], 'mic')).toEqual([]);
  });
});

describe('creaAdattatoreWordpress', () => {
  it('costruisce un adattatore con i metadati della fonte', () => {
    const a = creaAdattatoreWordpress({
      id: 'mic', nome: 'MiC Cinema', ente: 'Ministero della Cultura',
      livello: 'mic', soloBandi: true, base: 'https://cinema.cultura.gov.it',
    });
    expect(a.id).toBe('mic');
    expect(a.livello).toBe('mic');
  });

  it('lancia un errore quando la fonte risponde male', async () => {
    const vero = globalThis.fetch;
    globalThis.fetch = (async () => new Response('', { status: 503 })) as typeof fetch;
    try {
      const a = creaAdattatoreWordpress({
        id: 'mic', nome: 'MiC', ente: 'MiC', livello: 'mic', soloBandi: true, base: 'https://esempio.it',
      });
      await expect(a.cerca(new Date('2026-09-11T00:00:00Z'))).rejects.toThrow(/HTTP 503/);
    } finally {
      globalThis.fetch = vero;
    }
  });

  it('chiede alla API solo cio\' che e\' nuovo', async () => {
    const vero = globalThis.fetch;
    let chiamato = '';
    globalThis.fetch = (async (u: string | URL | Request) => {
      chiamato = String(u);
      return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;
    try {
      const a = creaAdattatoreWordpress({
        id: 'mic', nome: 'MiC', ente: 'MiC', livello: 'mic', soloBandi: true, base: 'https://esempio.it',
      });
      await a.cerca(new Date('2026-09-11T00:00:00Z'));
      // fetch/URL non percent-encodano i due punti nella query string: restano letterali.
      expect(chiamato).toContain('after=2026-09-11T00:00:00.000Z');
      expect(chiamato).toContain('per_page=50');
      expect(chiamato).not.toContain('categories=');
    } finally {
      globalThis.fetch = vero;
    }
  });
});

describe('categorie WordPress', () => {
  it('chiede solo le categorie indicate, cosi al MiC si leggono gli avvisi e non le notizie', async () => {
    const vero = globalThis.fetch;
    let chiamato = '';
    globalThis.fetch = (async (u: string | URL | Request) => {
      chiamato = String(u);
      return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;
    try {
      const a = creaAdattatoreWordpress({
        id: 'mic', nome: 'MiC', ente: 'MiC', livello: 'mic', soloBandi: true,
        base: 'https://esempio.it', categorie: [4, 258],
      });
      await a.cerca(new Date('2026-09-11T00:00:00Z'));
      expect(chiamato).toContain('categories=4,258');
    } finally {
      globalThis.fetch = vero;
    }
  });
});

