import type { Corsia, Livello } from './tipi.ts';

/** Giorni indietro guardati a ogni controllo. */
export const FINESTRA_GIORNI = 7;

/** Giorni recuperati alla primissima esecuzione, per nascere con l'archivio pieno. */
export const FINESTRA_PRIMO_AVVIO = 30;

/**
 * Sotto questa pertinenza non parte nessuna notifica. Vedi spec 5.3.
 *
 * Tarata sulla prima raccolta reale, il 18 settembre 2026. Il valore iniziale
 * era 35, scelto quando le notizie finivano in classifica insieme ai bandi.
 * Filtrate le notizie a monte, a 35 non passava piu' nulla: nemmeno un bando
 * contro la violenza di genere, tema della serie, fermo a 17. Con circa
 * quaranta bandi al mese la stanchezza da notifiche non e' un rischio reale,
 * perdere un bando si'. A 10 passano circa due bandi a settimana.
 */
export const SOGLIA_NOTIFICA = 10;

/** Giorni di silenzio di una fonte oltre i quali scatta l'allarme. */
export const GIORNI_ALLARME_FONTE = 3;

/** Gli enti della produzione che possono firmare una domanda. */
export type Ente = {
  id: string;
  nome: string;
  /** Termini che, trovati fra i soggetti ammessi, rendono questo ente idoneo. */
  forme: string[];
};

/**
 * L'ordine e' una priorita': si scorre dall'alto e vince il primo ente che
 * combacia. In testa sta l'ente con le forme piu' specifiche, in coda quello
 * con le piu' generiche, perche' "associazione" e "terzo settore" compaiono
 * in moltissimi bandi e altrimenti vincerebbero sempre, anche dove il
 * soggetto giusto sarebbe la societa' di produzione.
 */
export const ENTI: Ente[] = [
  {
    id: 'videoastolfo',
    nome: 'VideoAstolfoSullaLuna Srl',
    forme: [
      'impresa di produzione', 'imprese di produzione', 'societa di produzione',
      'produttore indipendente', 'produttori indipendenti', 'impresa audiovisiva',
      'impresa cinematografica', 'pmi', 'piccole e medie imprese', 'srl',
    ],
  },
  {
    id: 'marcofalco',
    nome: 'Fondazione Marco Falco',
    forme: ['fondazione', 'fondazioni', 'onlus', 'ente filantropico'],
  },
  {
    id: 'storiedipiazza',
    nome: 'Storie di Piazza APS',
    forme: [
      'associazione di promozione sociale', 'aps', 'associazioni',
      'associazione', 'ente del terzo settore', 'enti del terzo settore',
      'ets', 'odv', 'organizzazione di volontariato', 'terzo settore',
      'no profit', 'non profit', 'senza scopo di lucro', 'ente non commerciale',
    ],
  },
];

/** Requisiti che nessuno degli enti disponibili puo' soddisfare. */
export const BLOCCHI: { termine: string; motivo: string }[] = [
  { termine: 'coproduzione internazionale', motivo: 'richiede una coproduzione internazionale' },
  { termine: 'coproduttore estero', motivo: 'richiede un coproduttore estero' },
  { termine: 'almeno tre opere', motivo: 'richiede almeno tre opere precedenti' },
  { termine: 'almeno due opere', motivo: 'richiede almeno due opere precedenti' },
  { termine: 'lungometraggio di finzione', motivo: 'riservato ai lungometraggi, non alle web serie' },
  { termine: 'lungometraggi di finzione', motivo: 'riservato ai lungometraggi, non alle web serie' },
  { termine: 'distribuzione in sala', motivo: 'richiede la distribuzione cinematografica in sala' },
];

/**
 * Parole che segnalano che una frase sta davvero stabilendo chi e' ammesso,
 * invece di elencare le categorie che il fondo sostiene.
 *
 * Senza questo filtro un decreto che scrive "sostiene cortometraggi,
 * documentari, lungometraggio di finzione e opere seriali" verrebbe marcato
 * rosso e silenziato, pur finanziando proprio le web serie. Un blocco vale
 * solo dentro una frase che parla di ammissibilita'.
 */
export const SEGNALI_AMMISSIBILITA: string[] = [
  'ammess', 'possono partecipare', 'possono presentare', 'riservat',
  'esclusivamente', 'unicamente', 'soltanto', 'obbligo', 'obbligatori',
  'devono', 'sono esclusi', 'non sono ammessi', 'requisiti',
  // Anche un ente della produzione conta solo dentro una frase come queste:
  // "la Fondazione sostiene il festival" nomina chi finanzia, non chi partecipa.
  'rivolt', 'destinatari', 'beneficiari', 'soggetti proponenti', 'possono candidarsi',
  'possono richiedere', 'aperta a', 'aperto a', 'aperte a',
];

/**
 * Congiunzioni avversative: separano una premessa da cio' che il bando
 * stabilisce davvero. In "sostiene la distribuzione in sala, ma questo
 * avviso riguarda esclusivamente le web serie" l'esclusivita' riguarda le
 * web serie, non la sala, e il blocco non deve scattare.
 */
export const AVVERSATIVE: string[] = [
  ' ma ', ' tuttavia ', ' pero ', ' mentre ', ' invece ', ' salvo ', ' fatta eccezione ',
];

/**
 * Requisiti che si possono costruire con un partner: segnalati in giallo.
 *
 * I termini si confrontano con `includes` su testo appiattito, quindi vanno
 * scritti per intero nelle forme che le fonti usano davvero. Un troncone come
 * "istituzion scolastic" NON trova "istituzione scolastica", perche' fra
 * "istituzion" e "scolastic" c'e' una "e". Meglio elencare le varianti.
 */
export const CONDIZIONI: { termine: string; motivo: string }[] = [
  { termine: 'istituzione scolastica', motivo: 'serve un istituto scolastico come capofila o partner' },
  { termine: 'istituzioni scolastiche', motivo: 'serve un istituto scolastico come capofila o partner' },
  { termine: 'istituto scolastico', motivo: 'serve un istituto scolastico come capofila o partner' },
  { termine: 'capofila', motivo: 'serve un capofila con requisiti specifici' },
  { termine: 'partenariato', motivo: 'serve un partenariato formale' },
  { termine: 'associazione temporanea di scopo', motivo: 'serve la costituzione di un\'ATS' },
];

// Nota di dominio: l'iscrizione al RUNTS non e' una condizione da segnalare.
// Storie di Piazza e' un'APS, e un'APS e' iscritta al RUNTS per definizione:
// metterla fra le CONDIZIONI marcherebbe in giallo proprio i bandi del terzo
// settore, che sono quelli piu' alla portata della produzione.

/**
 * Vocabolario che distingue un bando da una notizia, per le fonti che
 * pubblicano entrambi nello stesso feed: le fondazioni, il CTV, l'ANG.
 * Le fonti di soli bandi non ne hanno bisogno, lo sa gia' la fonte.
 *
 * I termini sono gia' appiattiti e si confrontano sul testo appiattito e
 * circondato da spazi. Una voce scritta con gli spazi attorno, come ' call ',
 * vale solo come parola intera e non combacia dentro 'recall'; una voce
 * senza spazi e' una radice e copre tutte le desinenze ('contribut' trova
 * contributo e contributi).
 *
 * Mancano di proposito 'selezione' e 'premio': nelle notizie di cinema
 * compaiono di continuo ('in selezione ufficiale', 'premio alla carriera').
 */
export const SEGNALI_BANDO: string[] = [
  ' bando ', ' bandi ', 'avviso pubblico', ' call ', 'open call',
  'contribut', 'finanziament', 'candidatur', ' domande ', 'domanda di',
  'scadenza', 'sostegno a', 'a sostegno', 'erogazion', 'agevolazion',
  ' voucher ', 'tax credit', 'credito d imposta', 'manifestazione di interesse',
  'avviso di selezione', 'procedura di selezione', 'come partecipare', 'iscrizioni aperte',
  'proposte progettuali', 'termine di presentazione', 'possono richiedere',
  'possono presentare', 'presentare la propria proposta', 'modulo online', 'invio delle proposte',
];

/**
 * Segni di una notizia, usati solo quando manca qualunque segno di bando.
 *
 * L'elenco e' volutamente corto e fatto di formule inequivocabili: nel dubbio
 * un elemento resta un bando, perche' le notizie non vengono notificate e un
 * bando scambiato per notizia sparirebbe in silenzio.
 */
export const SEGNALI_NOTIZIA: string[] = [
  ' compie ', 'inaugurat', 'presentazione del volume', 'press release', 'comunicato stampa',
  'premiat', ' ha vinto ', 'intervista', 'nuova stagione', ' torna la ', ' torna il ',
  ' si e svolt', 'chiusura uffici', 'save the date', ' nasce ', ' nascono ',
];

/**
 * Parole chiave con peso, per corsia. Vedi spec 5.3.
 *
 * Diverse voci sono radici troncate perche' il confronto e' per sottostringa
 * e il plurale italiano cambia l'ultima vocale: 'cortometraggio' non trova
 * 'cortometraggi', e lo Short Film Fund della Film Commission parla proprio di
 * cortometraggi. 'cortometragg', 'documentari', 'sceneggiatur' e 'studen'
 * coprono singolare e plurale.
 */
export const PAROLE: Record<Corsia, { termine: string; peso: number }[]> = {
  audiovisiva: [
    { termine: 'web serie', peso: 12 }, { termine: 'webserie', peso: 12 },
    { termine: 'serie tv', peso: 10 }, { termine: 'audiovisiv', peso: 10 },
    { termine: 'cortometragg', peso: 9 }, { termine: 'documentari', peso: 8 },
    { termine: 'cinema', peso: 8 }, { termine: 'sceneggiatur', peso: 7 },
    { termine: 'film', peso: 6 }, { termine: 'produzione video', peso: 7 },
    { termine: 'riprese', peso: 5 },
    { termine: 'montaggio', peso: 5 }, { termine: 'festival', peso: 5 },
    { termine: 'opera prima', peso: 6 }, { termine: 'fiction', peso: 6 },
    { termine: 'distribuzione', peso: 4 }, { termine: 'cultura', peso: 3 },
  ],
  giovani: [
    { termine: 'bullismo', peso: 14 }, { termine: 'cyberbullismo', peso: 14 },
    { termine: 'disagio giovanile', peso: 13 }, { termine: 'adolescen', peso: 12 },
    { termine: 'poverta educativa', peso: 12 }, { termine: 'dispersione scolastica', peso: 11 },
    { termine: 'salute mentale', peso: 10 }, { termine: 'benessere psicologic', peso: 10 },
    { termine: 'giovani', peso: 8 }, { termine: 'under 35', peso: 8 },
    { termine: 'peer education', peso: 8 }, { termine: 'violenza di genere', peso: 7 },
    { termine: 'identita di genere', peso: 7 }, { termine: 'discriminazion', peso: 6 },
    { termine: 'stereotip', peso: 7 }, { termine: 'parita di genere', peso: 6 },
    { termine: 'disabilita', peso: 6 }, { termine: 'scuola', peso: 6 },
    { termine: 'scuole', peso: 6 }, { termine: 'studen', peso: 6 },
    { termine: 'educazion', peso: 5 }, { termine: 'terzo settore', peso: 5 },
    { termine: 'inclusione', peso: 5 }, { termine: 'prevenzione', peso: 4 },
  ],
};

/** Bonus a chi sta nell'intersezione fra le due corsie: e' il bersaglio ideale. */
export const BONUS_INTERSEZIONE = 20;

// I destinatari delle email non stanno qui: sono nel segreto EMAIL_DESTINATARI
// di GitHub, perche' questo repository e' pubblico. Vedi src/notify/email.ts.

export const NOMI_LIVELLO: Record<Livello, string> = {
  europeo: 'Europeo',
  statale: 'Statale',
  mic: 'Ministero della Cultura',
  regionale: 'Regionale',
  provinciale: 'Provinciale',
  comunale: 'Comunale',
  fondazione: 'Fondazioni',
  terzosettore: 'Terzo settore',
};
