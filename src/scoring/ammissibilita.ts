import { ENTI, BLOCCHI, CONDIZIONI, SEGNALI_AMMISSIBILITA, AVVERSATIVE, FACOLTATIVI } from '../config.ts';
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

/** Spezza una frase gia' appiattita nelle sue proposizioni. */
function proposizioni(frasePiatta: string): string[] {
  let pezzi = [` ${frasePiatta} `];
  for (const avversativa of AVVERSATIVE) {
    pezzi = pezzi.flatMap((p) => p.split(avversativa));
  }
  return pezzi.map((p) => p.trim()).filter((p) => p.length > 0);
}

/**
 * Restituisce la frase in cui il termine compare dentro una regola di
 * ammissibilita', o null. Vale per i blocchi e per le forme degli enti.
 *
 * Un termine conta solo se compare in una frase che sta stabilendo chi e'
 * ammesso. I decreti italiani elencano le categorie sostenute, e in
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
function fraseDiAmmissibilita(testo: string, termine: string): string | null {
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
 * Una condizione conta solo in una proposizione che parla di chi e' ammesso
 * e che non la dichiara facoltativa. "Possono candidarsi singolarmente o in
 * partenariato" non chiede nessun partner; "il contributo non puo' superare
 * il 40% delle entrate del partenariato" e' una regola di budget. In entrambi
 * i casi segnarlo in giallo manderebbe fuori strada (CoPower, 2026).
 */
function condizioneRichiesta(testo: string, termine: string): boolean {
  for (const f of frasi(testo)) {
    for (const p of proposizioni(appiattisci(f))) {
      if (!contiene(p, termine)) continue;
      if (FACOLTATIVI.some((s) => p.includes(s))) continue;
      if (!SEGNALI_AMMISSIBILITA.some((s) => p.includes(appiattisci(s)))) continue;
      return true;
    }
  }
  return false;
}

/**
 * Non risponde a "possiamo partecipare?" ma a "chi di noi firma la domanda?".
 * La produzione dispone di un'APS, di una Fondazione e di una societa' di
 * produzione audiovisiva, quindi la domanda utile e' quale ente usare.
 */
export function valutaAmmissibilita(titolo: string, descrizione: string): EsitoAmmissibilita {
  const testo = `${titolo}. ${descrizione}`;

  for (const { termine, motivo } of BLOCCHI) {
    const frase = fraseDiAmmissibilita(testo, termine);
    if (frase !== null) {
      return { esito: 'rosso', entePropostoId: null, motivo: `${motivo}: "${frase}"` };
    }
  }

  let entePropostoId: string | null = null;
  let motivo: string | null = null;

  // Come per i blocchi, un ente conta solo in una proposizione che dice chi
  // puo' partecipare: nei feed delle fondazioni "Fondazione" compare di
  // continuo perche' e' chi pubblica e finanzia, non chi puo' fare domanda.
  cerca: for (const ente of ENTI) {
    for (const forma of ente.forme) {
      const frase = fraseDiAmmissibilita(testo, forma);
      if (frase !== null) {
        entePropostoId = ente.id;
        motivo = frase;
        break cerca;
      }
    }
  }

  if (entePropostoId === null) {
    return { esito: 'ignota', entePropostoId: null, motivo: null };
  }

  for (const { termine, motivo: m } of CONDIZIONI) {
    if (condizioneRichiesta(testo, termine)) {
      return { esito: 'giallo', entePropostoId, motivo: m };
    }
  }

  return { esito: 'verde', entePropostoId, motivo };
}
