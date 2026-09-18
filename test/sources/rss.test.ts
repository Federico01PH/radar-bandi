import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { creaAdattatoreRss, analizzaRss, senzaFirmaWordpress } from '../../src/sources/rss.ts';

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

// Forma reale della firma nel feed di Compagnia di San Paolo, 18 settembre 2026.
describe('senzaFirmaWordpress', () => {
  it('toglie la firma finale che cita il titolo della voce', () => {
    const titolo = 'Festival dell\u2019Accoglienza 2026';
    const d = 'La sesta edizione del Festival invita a riflettere. L\'articolo Festival dell\u2019Accoglienza 2026 proviene da Fondazione Compagnia di San Paolo.';
    expect(senzaFirmaWordpress(d, titolo)).toBe('La sesta edizione del Festival invita a riflettere.');
  });

  it('accetta anche l\'apostrofo tipografico e la firma inglese', () => {
    expect(senzaFirmaWordpress('Testo. L\u2019articolo Bando X proviene da Fondazione CRT.', 'Bando X')).toBe('Testo.');
    expect(senzaFirmaWordpress('Text. The post Call Y appeared first on Foundation.', 'Call Y')).toBe('Text.');
  });

  it('non tocca un testo che parla di un articolo diverso dal titolo', () => {
    const d = 'L\'articolo 5 del bando prevede contributi. Le domande proviene da tutta Italia.';
    expect(senzaFirmaWordpress(d, 'Bando cultura 2026')).toBe(d);
  });

  it('non viene ingannata dai caratteri speciali nel titolo', () => {
    const titolo = 'Bando (2026) per 3+ enti [ETS]?';
    expect(senzaFirmaWordpress(`Testo. L'articolo ${titolo} proviene da Sito.`, titolo)).toBe('Testo.');
  });

  it('libera la voce dalla falsa attribuzione alla fondazione', async () => {
    const xml = `<?xml version="1.0"?><rss version="2.0"><channel><item>
      <title>Il Borgo Medievale per una nuova stagione</title><link>https://x.it/borgo</link>
      <description>&lt;p&gt;Riapre il Borgo.&lt;/p&gt;&lt;p&gt;L'articolo &lt;a href="https://x.it/borgo"&gt;Il Borgo Medievale per una nuova stagione&lt;/a&gt; proviene da &lt;a href="https://x.it/"&gt;Fondazione Compagnia di San Paolo&lt;/a&gt;.&lt;/p&gt;</description>
    </item></channel></rss>`;
    const [voce] = await analizzaRss(xml, 'compagniasanpaolo');
    expect(voce!.descrizione).toBe('Riapre il Borgo.');
    expect(voce!.descrizione).not.toContain('Fondazione');
  });
});
