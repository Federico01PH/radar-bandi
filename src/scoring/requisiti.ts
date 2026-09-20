import { CATEGORIE_REQUISITI } from '../config.ts';
import { appiattisci } from './pertinenza.ts';
import { frasi } from './ammissibilita.ts';

/** Sotto questa lunghezza una frase e' un titolo o un ritaglio, non un requisito. */
const MIN_FRASE = 30;
/** Sopra questa, si taglia: la scheda deve restare leggibile in dieci secondi. */
const MAX_FRASE = 220;

/** Taglia all'ultimo spazio prima del limite, per non spezzare una parola a meta'. */
function accorcia(frase: string): string {
  if (frase.length <= MAX_FRASE) return frase;
  const tagliata = frase.slice(0, MAX_FRASE);
  const spazio = tagliata.lastIndexOf(' ');
  return `${(spazio > MAX_FRASE / 2 ? tagliata.slice(0, spazio) : tagliata).trimEnd()}…`;
}

/** Oltre questa parte della descrizione mostrata, un punto non isola piu' nulla. */
const QUASI_TUTTA = 0.6;

function ricalcaLaDescrizione(frase: string, mostratoPiatto: string): boolean {
  if (mostratoPiatto.length < 20) return false;
  const piatta = appiattisci(frase);
  return piatta.length > mostratoPiatto.length * QUASI_TUTTA
    && mostratoPiatto.includes(piatta.slice(0, 60));
}

/**
 * L'elenco puntato "cosa serve per candidarsi" di una scheda, ricavato dal
 * testo del bando.
 *
 * Non riassume: riporta le frasi del bando, una per argomento, perche' chi
 * legge deve poter riconoscere la frase quando apre l'originale. Un riassunto
 * inventato sarebbe piu' bello e meno verificabile, e qui si decide se
 * spendere giornate di lavoro su una domanda.
 */
export function estraiRequisiti(
  testo: string,
  { titolo = '', giaMostrato = '' }: { titolo?: string; giaMostrato?: string } = {},
): string[] {
  // Le pagine ripetono il titolo del bando in testa, spesso incollato alla
  // riga del sito: come requisito non dice nulla.
  const titoloPiatto = appiattisci(titolo);
  // Sulla scheda i punti stanno sotto la descrizione. Isolare una riga di un
  // testo lungo aiuta — dice quale riga conta — ma ripetere per intero una
  // descrizione di una frase sola riempie la scheda senza aggiungere nulla.
  const mostratoPiatto = appiattisci(giaMostrato);
  const candidate = frasi(testo)
    .map((f) => f.trim())
    .filter((f) => f.length >= MIN_FRASE)
    .filter((f) => titoloPiatto.length < 20 || !appiattisci(f).includes(titoloPiatto))
    .filter((f) => !ricalcaLaDescrizione(f, mostratoPiatto));

  const punti: string[] = [];
  const usate = new Set<string>();

  for (const { etichetta, termini, conNumero } of CATEGORIE_REQUISITI) {
    // I termini sono in ordine di forza, non le frasi in ordine di pagina:
    // "sono ammessi gli ETS" dice chi presenta la domanda meglio di "rivolto a
    // donne e ragazze", che parla di chi ne beneficia, anche se viene dopo.
    let frase: string | undefined;
    for (const termine of termini) {
      frase = candidate.find((f) => !usate.has(f)
        && ` ${appiattisci(f)} `.includes(` ${appiattisci(termine)} `)
        && (!conNumero || /\d/.test(f)));
      if (frase !== undefined) break;
    }
    if (frase === undefined) continue;
    usate.add(frase);
    punti.push(`${etichetta}: ${accorcia(frase)}`);
  }

  return punti;
}
