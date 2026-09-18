import { ENTI, BLOCCHI, CONDIZIONI, SEGNALI_AMMISSIBILITA, AVVERSATIVE } from '../config.ts';
import { appiattisci } from './pertinenza.ts';
import type { Ammissibilita } from '../tipi.ts';

export type EsitoAmmissibilita = {
  esito: Ammissibilita;
  entePropostoId: string | null;
  /** La frase del bando da cui l'esito e' dedotto, cosi' si puo' verificare. */
  motivo: string | null;
};

/**
 * Cerca un termine nel testo gia' appiattito, sempre come parola intera.
 *
 * Tutti i termini che arrivano qui — le forme degli ENTI, i BLOCCHI, le
 * CONDIZIONI — sono parole o locuzioni complete. Le radici troncate stanno
 * solo in PAROLE, che passa da calcolaPertinenza e non da qui.
 *
 * Senza i confini di parola "aps" combacia dentro "rapsodica" e "fondazione"
 * dentro "rifondazione": in entrambi i casi il bando verrebbe attribuito
 * all'ente sbagliato, citando una frase che non c'entra nulla.
 */
function contiene(piatto: string, termine: string): boolean {
  return ` ${piatto} `.includes(` ${appiattisci(termine)} `);
}

/**
 * Spezza il testo in frasi, conservando la punteggiatura finale.
 *
 * Non spezza dopo un'iniziale puntata o un'abbreviazione giuridica: i titoli
 * del MiC sono pieni di "D.D. 17 settembre 2026, rep. 2738" e le clausole di
 * "ai sensi dell'art. 5 del D.Lgs. n. 28", e spezzare li' produrrebbe una
 * citazione tronca e incomprensibile per chi la controlla sul bando.
 */
function frasi(testo: string): string[] {
  return testo
    .split(/(?<![A-Za-z])(?<!\bart)(?<!\bn)(?<!\brep)(?<!\bcfr)(?<!\bpag)(?<!\blett)(?<!\bcomma)(?<!\bLgs)(?<!\bDott)(?<=[.;:!?])\s+(?=[A-Z\u00c0-\u00dd«"])/)
    .map((f) => f.trim())
    .filter((f) => f.length > 0);
}

/** Prima frase che contiene il termine, per poterla mostrare all'utente. */
function fraseCon(testo: string, termine: string): string | null {
  for (const f of frasi(testo)) {
    if (contiene(appiattisci(f), termine)) return f;
  }
  return null;
}

/** Spezza una frase gia' appiattita nelle sue proposizioni. */
function proposizioni(frasePiatta: string): string[] {
  let pezzi = [` ${frasePiatta} `];
  for (const avversativa of AVVERSATIVE) {
    pezzi = pezzi.flatMap((p) => p.split(avversativa));
  }
  return pezzi.map((p) => p.trim()).filter((p) => p.length > 0);
}

/**
 * Restituisce la frase che preclude davvero la partecipazione, o null.
 *
 * Un termine di blocco conta solo se compare in una frase che sta stabilendo
 * chi e' ammesso. I decreti italiani elencano le categorie sostenute, e in
 * un elenco "lungometraggio di finzione" non esclude nessuno: compare accanto
 * a "opere seriali", che e' esattamente cio' che ci interessa.
 *
 * Non basta la stessa frase: "sostiene la distribuzione in sala, ma questo
 * avviso riguarda esclusivamente le web serie" ha il blocco e il segnale
 * nella stessa frase, ma l'esclusivita' si riferisce alle web serie, non
 * alla sala. Le congiunzioni avversative separano la premessa da cio' che
 * il bando stabilisce davvero, quindi termine e segnale devono condividere
 * la stessa proposizione.
 *
 * Il filtro rende i blocchi deliberatamente deboli. E' la direzione giusta:
 * un blocco mancato costa una notifica in piu', un blocco di troppo fa
 * sparire il bando senza che nessuno se ne accorga.
 */
function frasePreclusiva(testo: string, termine: string): string | null {
  for (const f of frasi(testo)) {
    const piatta = appiattisci(f);
    for (const p of proposizioni(piatta)) {
      if (!contiene(p, termine)) continue;
      if (SEGNALI_AMMISSIBILITA.some((s) => p.includes(appiattisci(s)))) return f;
    }
  }
  return null;
}

/**
 * Non risponde a "possiamo partecipare?" ma a "chi di noi firma la domanda?".
 * La produzione dispone di un'APS, di una Fondazione e di una societa' di
 * produzione audiovisiva, quindi la domanda utile e' quale ente usare.
 */
export function valutaAmmissibilita(titolo: string, descrizione: string): EsitoAmmissibilita {
  const testo = `${titolo}. ${descrizione}`;
  const piatto = appiattisci(testo);

  for (const { termine, motivo } of BLOCCHI) {
    const frase = frasePreclusiva(testo, termine);
    if (frase !== null) {
      return { esito: 'rosso', entePropostoId: null, motivo: `${motivo}: "${frase}"` };
    }
  }

  let entePropostoId: string | null = null;
  let motivo: string | null = null;

  cerca: for (const ente of ENTI) {
    for (const forma of ente.forme) {
      if (contiene(piatto, forma)) {
        entePropostoId = ente.id;
        motivo = fraseCon(testo, forma) ?? forma;
        break cerca;
      }
    }
  }

  if (entePropostoId === null) {
    return { esito: 'ignota', entePropostoId: null, motivo: null };
  }

  for (const { termine, motivo: m } of CONDIZIONI) {
    if (contiene(piatto, termine)) {
      return { esito: 'giallo', entePropostoId, motivo: m };
    }
  }

  return { esito: 'verde', entePropostoId, motivo };
}
