import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { creaAdattatoreRss, analizzaRss } from '../../src/sources/rss.ts';

const xml = await readFile('test/fixtures/rss-piemonte.xml', 'utf8');

describe('analizzaRss', () => {
  it('estrae titolo, link e descrizione di ogni voce', async () => {
    const voci = await analizzaRss(xml, 'piemonte');
    expect(voci.length).toBeGreaterThan(0);
    const prima = voci[0]!;
    expect(prima.titolo).toBeTruthy();
    expect(prima.url).toMatch(/^https?:\/\//);
    expect(prima.fonteId).toBe('piemonte');
  });

  it('converte pubDate in Date', async () => {
    const voci = await analizzaRss(xml, 'piemonte');
    const conData = voci.find((v) => v.dataPubblicazione !== null);
    expect(conData?.dataPubblicazione).toBeInstanceOf(Date);
  });

  it('mette null quando la voce non ha data, senza scartarla', async () => {
    const senzaData = `<?xml version="1.0"?><rss version="2.0"><channel>
      <item><title>T</title><link>https://x.it/a</link><description>D</description></item>
    </channel></rss>`;
    const voci = await analizzaRss(senzaData, 'x');
    expect(voci).toHaveLength(1);
    expect(voci[0]!.dataPubblicazione).toBeNull();
  });

  it('ripulisce l\'HTML dalla descrizione', async () => {
    const conHtml = `<?xml version="1.0"?><rss version="2.0"><channel>
      <item><title>T</title><link>https://x.it/a</link>
      <description>&lt;p&gt;Testo &lt;b&gt;grassetto&lt;/b&gt;&lt;/p&gt;</description></item>
    </channel></rss>`;
    const voci = await analizzaRss(conHtml, 'x');
    expect(voci[0]!.descrizione).toBe('Testo grassetto');
  });

  it('protesta se ci sono voci ma nessuna utilizzabile', async () => {
    const senzaLink = `<?xml version="1.0"?><rss version="2.0"><channel>
      <item><title>T</title><description>D</description></item>
      <item><title>U</title><description>E</description></item>
    </channel></rss>`;
    await expect(analizzaRss(senzaLink, 'x')).rejects.toThrow(/formato cambiato/);
  });

  it('resta silenzioso su un feed davvero vuoto', async () => {
    const vuoto = `<?xml version="1.0"?><rss version="2.0"><channel></channel></rss>`;
    await expect(analizzaRss(vuoto, 'x')).resolves.toEqual([]);
  });
});

describe('creaAdattatoreRss', () => {
  it('costruisce un adattatore con i metadati della fonte', () => {
    const a = creaAdattatoreRss({
      id: 'piemonte',
      nome: 'Bandi Regione Piemonte',
      ente: 'Regione Piemonte',
      livello: 'regionale',
      soloBandi: true,
      url: 'https://bandi.regione.piemonte.it/tutti/rss.xml',
    });
    expect(a.id).toBe('piemonte');
    expect(a.livello).toBe('regionale');
    expect(typeof a.cerca).toBe('function');
  });

  it('lancia un errore quando la fonte risponde male', async () => {
    const vero = globalThis.fetch;
    globalThis.fetch = (async () => new Response('', { status: 503 })) as typeof fetch;
    try {
      const a = creaAdattatoreRss({
        id: 'x', nome: 'X', ente: 'X', livello: 'regionale',
      soloBandi: true, url: 'https://esempio.it/feed/',
      });
      await expect(a.cerca(new Date('2026-09-11T00:00:00Z'))).rejects.toThrow(/HTTP 503/);
    } finally {
      globalThis.fetch = vero;
    }
  });
});
