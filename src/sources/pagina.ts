import { testoPulito } from './testo.ts';

/**
 * Legge la pagina completa di un bando. Serve solo per i bandi adatti alla
 * serie, pochi al giorno: dai feed arrivano titolo e due righe, mentre chi puo'
 * partecipare e la scadenza stanno nel testo intero.
 */

const MAX_CARATTERI_HTML = 2_000_000;

/** Da HTML a testo: via script, stili, menu, testate e pie' di pagina; i blocchi diventano frasi. */
export function testoDellaPagina(html: string): string {
  const corpo = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<(nav|header|footer|aside|form)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|li|h[1-6]|div|tr|td|section|article|dd|dt)>/gi, '. ')
    .replace(/<br\s*\/?>/gi, '. ');
  return testoPulito(corpo).replace(/(\s*\.\s*){2,}/g, '. ').trim();
}

export async function leggiPagina(url: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  if (!/^https?:\/\//i.test(url)) throw new Error(`indirizzo non http: ${url}`);
  const risposta = await fetchImpl(url, {
    headers: { 'user-agent': 'RadarBandi/1.0 (monitoraggio bandi, uso interno)' },
    signal: AbortSignal.timeout(25_000),
  });
  if (!risposta.ok) throw new Error(`HTTP ${risposta.status} da ${url}`);
  const tipo = risposta.headers.get('content-type') ?? '';
  if (!tipo.includes('html')) throw new Error(`non e' una pagina HTML (${tipo}): ${url}`);
  return testoDellaPagina((await risposta.text()).slice(0, MAX_CARATTERI_HTML));
}
