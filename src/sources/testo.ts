/**
 * Entita' con nome che le fonti italiane emettono davvero: WordPress e i
 * feed RSS della PA usano soprattutto virgolette tipografiche, trattini
 * lunghi e i puntini di sospensione della troncatura degli estratti.
 */
const ENTITA: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
  '&hellip;': '\u2026',
  '&ndash;': '\u2013',
  '&mdash;': '\u2014',
  '&lsquo;': '\u2018',
  '&rsquo;': '\u2019',
  '&ldquo;': '\u201c',
  '&rdquo;': '\u201d',
  '&laquo;': '\u00ab',
  '&raquo;': '\u00bb',
  '&egrave;': '\u00e8',
  '&eacute;': '\u00e9',
  '&agrave;': '\u00e0',
  '&ograve;': '\u00f2',
  '&ugrave;': '\u00f9',
  '&igrave;': '\u00ec',
};

/**
 * Scioglie le entita' HTML, con nome e numeriche, decimali ed esadecimali.
 *
 * Le numeriche vanno sciolte per ultime: alcune fonti annidano le entita'
 * e "&amp;#8217;" deve diventare prima "&#8217;" e poi l'apostrofo tipografico.
 */
export function decodifica(testo: string): string {
  let out = testo;
  for (const [entita, carattere] of Object.entries(ENTITA)) {
    out = out.split(entita).join(carattere);
  }
  // Un'entita' numerica fuori intervallo e' un difetto cosmetico in un titolo:
  // non deve mai far fallire l'intero lotto. Se il punto di codice non e' valido,
  // l'entita' resta cosi' com'e', letterale, invece di far esplodere il chiamante.
  out = out.replace(/&#x([0-9a-fA-F]+);/g, (intero, n: string) => {
    const punto = parseInt(n, 16);
    return Number.isSafeInteger(punto) && punto >= 0 && punto <= 0x10ffff
      ? String.fromCodePoint(punto)
      : intero;
  });
  return out.replace(/&#(\d+);/g, (intero, n: string) => {
    const punto = Number(n);
    return Number.isSafeInteger(punto) && punto >= 0 && punto <= 0x10ffff
      ? String.fromCodePoint(punto)
      : intero;
  });
}

/**
 * Da HTML grezzo a testo leggibile: via i tag, sciolte le entita',
 * spazi normalizzati. Quello che esce finisce nelle email e sul sito,
 * quindi non deve contenere nessun residuo di markup.
 */
export function testoPulito(grezzo: string | undefined): string {
  if (!grezzo) return '';
  return decodifica(grezzo.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
}
