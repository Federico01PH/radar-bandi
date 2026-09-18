import { describe, it, expect } from 'vitest';
import { testoDellaPagina, leggiPagina } from '../../src/sources/pagina.ts';

describe('testoDellaPagina', () => {
  it('toglie script, stili, menu e pie\' di pagina e tiene il contenuto', () => {
    const html = `<html><head><style>p{color:red}</style><script>var x = 'Fondazione';</script></head>
      <body><nav><a>Home</a><a>Fondazioni</a></nav>
      <main><h1>Bando CoPower</h1><p>Sono ammessi ETS e fondazioni.</p><p>SCADENZA</p><p>23 novembre 2026</p></main>
      <footer>Fondazione Tal dei Tali</footer></body></html>`;
    const t = testoDellaPagina(html);
    expect(t).toContain('Sono ammessi ETS e fondazioni.');
    expect(t).toContain('SCADENZA. 23 novembre 2026');
    expect(t).not.toContain('var x');
    expect(t).not.toContain('Home');
    expect(t).not.toContain('Tal dei Tali');
  });

  it('trasforma i blocchi in frasi, senza punti doppi', () => {
    expect(testoDellaPagina('<p>Prima.</p><p>Seconda</p>')).toBe('Prima. Seconda.');
  });
});

describe('leggiPagina', () => {
  it('rifiuta un indirizzo non http', async () => {
    await expect(leggiPagina('javascript:alert(1)')).rejects.toThrow(/non http/);
  });

  it('rifiuta un file che non e\' una pagina, per esempio un PDF', async () => {
    const finto = (async () => new Response('%PDF', { status: 200, headers: { 'content-type': 'application/pdf' } })) as unknown as typeof fetch;
    await expect(leggiPagina('https://x.it/bando.pdf', finto)).rejects.toThrow(/non e' una pagina HTML/);
  });

  it('segnala una pagina che non risponde', async () => {
    const finto = (async () => new Response('', { status: 404 })) as unknown as typeof fetch;
    await expect(leggiPagina('https://x.it/a', finto)).rejects.toThrow(/404/);
  });

  it('restituisce il testo di una pagina HTML', async () => {
    const finto = (async () => new Response('<p>Rivolto alle associazioni.</p>', { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } })) as unknown as typeof fetch;
    expect(await leggiPagina('https://x.it/a', finto)).toBe('Rivolto alle associazioni.');
  });
});
