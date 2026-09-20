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

/** Sotto questa lunghezza una voce d'elenco e' un frammento, non un requisito. */
const MIN_VOCE = 15;
/** Con una voce sola non c'e' nessun elenco: i due punti introducevano altro. */
const MIN_ELENCO = 2;
/** Piu' di cosi' non e' un elenco di requisiti: e' meta' bando. */
const MAX_VOCI = 4;

/**
 * Le caratteristiche richieste, quando il bando le elenca dopo i due punti:
 * "possono presentare domanda le associazioni che: realizzino serie tv con le
 * scuole; abbiano sede in Piemonte".
 *
 * E' li' che stanno i requisiti veri. La frase introduttiva da sola dice solo
 * la categoria di ente, e chi legge la scheda deve poter capire in un colpo
 * d'occhio se la produzione ha le caratteristiche giuste.
 */
function elenco(frase: string): { intro: string; voci: string[] } {
  const duePunti = frase.indexOf(':');
  if (duePunti < 0) return { intro: frase, voci: [] };
  const voci = frase.slice(duePunti + 1)
    .split(/[.;\n]+/)
    .map((v) => v.trim())
    .filter((v) => v.length >= MIN_VOCE && v.length <= MAX_FRASE)
    .slice(0, MAX_VOCI);
  if (voci.length < MIN_ELENCO) return { intro: frase, voci: [] };
  return { intro: frase.slice(0, duePunti + 1), voci };
}

/** Le voci che il bando mette a capo, quindi fuori dalla frase introduttiva. */
function vociSeguenti(tutte: string[], dopo: string): string[] {
  const i = tutte.indexOf(dopo);
  if (i < 0 || !/:[.\s]*$/.test(dopo)) return [];
  const voci: string[] = [];
  for (const f of tutte.slice(i + 1)) {
    if (f.length < MIN_VOCE || f.length > MAX_FRASE || voci.length >= MAX_VOCI) break;
    voci.push(f.replace(/[.\s]+$/, ''));
  }
  return voci.length < MIN_ELENCO ? [] : voci;
}

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
  const tutte = frasi(testo).map((f) => f.trim()).filter((f) => f.length > 0);
  const candidate = tutte
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
    const { intro, voci } = elenco(frase);
    const daCapo = voci.length > 0 ? voci : vociSeguenti(tutte, frase);
    for (const v of daCapo) usate.add(v);
    punti.push(`${etichetta}: ${accorcia(voci.length > 0 ? intro : frase)}`);
    for (const v of daCapo) punti.push(`– ${accorcia(v)}`);
  }

  return punti;
}
