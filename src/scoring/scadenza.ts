/**
 * Ricava la scadenza di un bando dal testo completo della sua pagina.
 *
 * Una data conta solo se segue un indizio di scadenza ("scadenza", "entro il",
 * "fino al", "prorogato al"): una pagina e' piena di date di pubblicazione,
 * di eventi e di decreti, e una scadenza inventata e' peggio di nessuna.
 */

const MESI: Record<string, number> = {
  gennaio: 1, febbraio: 2, marzo: 3, aprile: 4, maggio: 5, giugno: 6,
  luglio: 7, agosto: 8, settembre: 9, ottobre: 10, novembre: 11, dicembre: 12,
};

const INDIZIO = String.raw`(scadenza|scade|entro(?:\s+e\s+non\s+oltre)?|fino\s+al|prorogat[oa]\s+al|posticipat[oa]\s+al)`;
const DATA = String.raw`(\d{1,2})(?:\s+(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\s+(\d{4})|[\/.\-](\d{1,2})[\/.\-](\d{4}|\d{2})\b)`;

// Fra l'indizio e la data possono stare fino a 40 caratteri: "il", "le ore 12.00 del", "SCADENZA.".
const SCADENZA = new RegExp(`${INDIZIO}[\\s\\S]{0,40}?${DATA}`, 'gi');

function iso(anno: number, mese: number, giorno: number): string | null {
  if (anno < 2000 || anno > 2100 || mese < 1 || mese > 12 || giorno < 1) return null;
  const d = new Date(Date.UTC(anno, mese - 1, giorno));
  if (d.getUTCMonth() !== mese - 1) return null;
  return d.toISOString().slice(0, 10);
}

/**
 * Quanto ci si fida di un indizio. Una proroga sostituisce la scadenza
 * originale; un'etichetta "Scadenza" e' il campo dichiarato del bando; un
 * "entro il" generico puo' riguardare altro. Caso reale: "Progetti oltre gli
 * stereotipi" (2026) ha "SCADENZA. 25 ottobre 2026" e anche "domande di
 * chiarimento entro il 27 settembre": la scadenza vera e' la prima.
 */
function fiducia(indizio: string): number {
  if (/prorogat|posticipat/.test(indizio)) return 3;
  if (/scad/.test(indizio)) return 2;
  return 1;
}

export function trovaScadenza(testo: string, adesso: Date): string | null {
  const trovate: { data: string; fiducia: number }[] = [];
  for (const m of testo.matchAll(SCADENZA)) {
    const indizio = (m[1] ?? '').toLowerCase();
    const giorno = Number(m[2]);
    const data = m[3]
      ? iso(Number(m[4]), MESI[m[3].toLowerCase()] ?? 0, giorno)
      : iso(m[6]!.length === 2 ? 2000 + Number(m[6]) : Number(m[6]), Number(m[5]), giorno);
    if (data) trovate.push({ data, fiducia: fiducia(indizio) });
  }
  if (trovate.length === 0) return null;

  const massima = Math.max(...trovate.map((t) => t.fiducia));
  const candidate = trovate.filter((t) => t.fiducia === massima);
  const oggi = adesso.toISOString().slice(0, 10);
  const future = candidate.map((t) => t.data).filter((d) => d >= oggi).sort();
  if (future.length > 0) return future[0]!;
  return candidate.map((t) => t.data).sort().at(-1)!;
}
