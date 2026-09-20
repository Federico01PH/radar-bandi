import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { FINESTRA_GIORNI, FINESTRA_PRIMO_AVVIO, GIORNI_ALLARME_FONTE } from './config.ts';
import { ADATTATORI } from './sources/registro.ts';
import { dentroLaFinestra } from './pipeline/finestra.ts';
import { approfondisci, costruisciBando, fondi, rivaluta } from './pipeline/archivio.ts';
import { leggiPagina } from './sources/pagina.ts';
import { aggiornaStorico, fonteSospetta, type Storico } from './health/salute.ts';
import { daNotificare } from './notify/formatta.ts';
import {
  credenzialiDaAmbiente, destinatariViaNtfy, emailConfigurata, inviaAllarmeFonti, inviaEmail,
  type EsitoInvio,
} from './notify/email.ts';
import { scriviSegnalazioneAllarme, scriviSegnalazioneBandi } from './notify/issue.ts';
import {
  messaggiBandi, messaggioAllarme, messaggioProva, perEmail, pubblicaNtfy, riepilogoEmail,
} from './notify/ntfy.ts';
import type { Adattatore } from './sources/tipi.ts';
import type { Bando, EsitoFonte } from './tipi.ts';

const STORICO_MAX = 30;
const MS_PER_GIORNO = 24 * 60 * 60 * 1000;

export type Notifiche = {
  inviaEmail(bandi: Bando[]): Promise<EsitoInvio>;
  inviaAllarmeFonti(fonti: string[]): Promise<EsitoInvio>;
};

export type Opzioni = {
  adesso?: Date;
  adattatori?: Adattatore[];
  fileBandi?: string;
  fileSalute?: string;
  fileMeta?: string;
  notifiche?: Notifiche;
  /** Legge il testo completo della pagina di un bando; sostituibile nei test. */
  leggiPagina?: (url: string) => Promise<string>;
};

/** Pagine lette al massimo per ogni raccolta: sono richieste in piu' ai siti delle fonti. */
const MAX_PAGINE = 15;

export type EsitoRaccolta = {
  totale: number;
  nuovi: number;
  notificati: number;
  /** Bandi adatti alla serie presenti in archivio dopo questa raccolta. */
  adatti: number;
  fontiMute: string[];
  /** Errori che non hanno impedito di salvare i dati, ma vanno segnalati. */
  errori: string[];
};

/**
 * Solo un file che non esiste vale come archivio vuoto. Un file illeggibile
 * o corrotto deve fermare la raccolta prima di qualunque scrittura: trattarlo
 * come vuoto farebbe sovrascrivere l'intero storico con i soli risultati del
 * giorno, in silenzio.
 */
async function leggiJson<T>(percorso: string, riserva: T): Promise<T> {
  let testo: string;
  try {
    testo = await readFile(percorso, 'utf8');
  } catch (errore) {
    if ((errore as NodeJS.ErrnoException).code === 'ENOENT') return riserva;
    throw errore;
  }
  try {
    return JSON.parse(testo) as T;
  } catch (errore) {
    const dettaglio = errore instanceof Error ? errore.message : String(errore);
    throw new Error(`${percorso} e' illeggibile, raccolta fermata per non sovrascriverlo: ${dettaglio}`);
  }
}

/** Cartella in cui la raccolta lascia le segnalazioni che il workflow apre su GitHub. */
const CARTELLA_SEGNALAZIONI = 'notifiche';

/**
 * Manda la stessa notifica su piu' canali. Un canale che fallisce non ferma
 * gli altri: l'errore si riporta dopo aver provato tutti.
 */
export function insieme(...canali: Notifiche[]): Notifiche {
  async function tutti(chiama: (c: Notifiche) => Promise<EsitoInvio>): Promise<EsitoInvio> {
    const esiti = await Promise.allSettled(canali.map(chiama));
    const falliti = esiti.filter((e): e is PromiseRejectedResult => e.status === 'rejected');
    if (falliti.length > 0) {
      throw new Error(falliti.map((f) => (f.reason instanceof Error ? f.reason.message : String(f.reason))).join('; '));
    }
    const riusciti = esiti.map((e) => (e as PromiseFulfilledResult<EsitoInvio>).value);
    return riusciti.find((e) => e.inviata) ?? riusciti[0] ?? { inviata: false, motivo: 'nessun canale' };
  }
  return {
    inviaEmail: (bandi) => tutti((c) => c.inviaEmail(bandi)),
    inviaAllarmeFonti: (fonti) => tutti((c) => c.inviaAllarmeFonti(fonti)),
  };
}

/** Indirizzo pubblico del sito, per i link delle notifiche. */
function indirizzoSito(): string {
  return process.env['SITO_URL'] ?? '';
}

/**
 * Canale principale: l'email via SMTP se configurata; altrimenti, su GitHub
 * Actions, una segnalazione che il workflow apre come issue e che GitHub manda
 * per email al proprietario. In piu', se c'e' l'argomento ntfy, la notifica
 * push sui telefoni della produzione.
 */
function notificheReali(): Notifiche {
  const cred = credenzialiDaAmbiente();
  const principale: Notifiche = !emailConfigurata(cred) && process.env['GITHUB_ACTIONS'] === 'true'
    ? {
      inviaEmail: (bandi) => scriviSegnalazioneBandi(bandi, CARTELLA_SEGNALAZIONI),
      inviaAllarmeFonti: (fonti) => scriviSegnalazioneAllarme(fonti, CARTELLA_SEGNALAZIONI),
    }
    : {
      inviaEmail: (bandi) => inviaEmail(bandi, cred),
      inviaAllarmeFonti: (fonti) => inviaAllarmeFonti(fonti, cred),
    };

  const topic = process.env['NTFY_TOPIC'] ?? '';
  const gettone = process.env['NTFY_TOKEN'] ?? '';
  // Senza SMTP l'email parte lo stesso: la spedisce ntfy agli stessi indirizzi.
  const destinatari = destinatariViaNtfy(cred, gettone);
  if (!topic) return principale;
  const push: Notifiche = {
    async inviaEmail(bandi) {
      if (bandi.length === 0) return { inviata: false, motivo: 'nessun bando da segnalare' };
      const sito = indirizzoSito();
      await pubblicaNtfy([
        ...messaggiBandi(bandi, topic, sito),
        ...perEmail(riepilogoEmail(bandi, topic, sito), destinatari),
      ], { gettone });
      return { inviata: true, motivo: null };
    },
    async inviaAllarmeFonti(fonti) {
      if (fonti.length === 0) return { inviata: false, motivo: 'nessuna fonte sospetta' };
      // L'allarme resta sul telefono e nella segnalazione GitHub: il piano
      // gratuito di ntfy da' cinque email al giorno, e vanno tenute per i bandi.
      await pubblicaNtfy([messaggioAllarme(fonti, topic, indirizzoSito())], { gettone });
      return { inviata: true, motivo: null };
    },
  };
  return insieme(principale, push);
}

export async function raccogli(opzioni: Opzioni = {}): Promise<EsitoRaccolta> {
  const adesso = opzioni.adesso ?? new Date();
  const adattatori = opzioni.adattatori ?? ADATTATORI;
  const fileBandi = opzioni.fileBandi ?? 'data/bandi.json';
  const fileSalute = opzioni.fileSalute ?? 'data/salute.json';
  const fileMeta = opzioni.fileMeta ?? 'data/meta.json';
  const notifiche = opzioni.notifiche ?? notificheReali();
  const leggi = opzioni.leggiPagina ?? ((url: string) => leggiPagina(url));

  const archivio = await leggiJson<Bando[]>(fileBandi, []);
  const storico = await leggiJson<Storico>(fileSalute, {});

  // Al primo avvio si recupera un mese, cosi' la piattaforma nasce gia' piena.
  const giorni = archivio.length === 0 ? FINESTRA_PRIMO_AVVIO : FINESTRA_GIORNI;
  const daQuando = new Date(adesso.getTime() - giorni * MS_PER_GIORNO);
  console.log(`Controllo del ${adesso.toISOString()} - finestra di ${giorni} giorni`);

  const esiti: EsitoFonte[] = [];
  const raccolti: Bando[] = [];

  // Ogni adattatore gira isolato: un errore su una fonte non ferma le altre.
  for (const adattatore of adattatori) {
    const inizio = Date.now();
    try {
      const grezzi = await adattatore.cerca(daQuando);
      const dentro = grezzi.filter((g) => dentroLaFinestra(g.dataPubblicazione, adesso, giorni));
      for (const g of dentro) {
        raccolti.push(costruisciBando(g, adattatore.ente, adattatore.livello, adesso, adattatore.soloBandi));
      }
      esiti.push({
        fonteId: adattatore.id, ok: true, risultati: dentro.length,
        durataMs: Date.now() - inizio, errore: null, quando: adesso.toISOString(),
      });
      console.log(`  OK   ${adattatore.id.padEnd(20)} ${dentro.length} nella finestra`);
    } catch (errore) {
      const messaggio = errore instanceof Error ? errore.message : String(errore);
      esiti.push({
        fonteId: adattatore.id, ok: false, risultati: 0,
        durataMs: Date.now() - inizio, errore: messaggio, quando: adesso.toISOString(),
      });
      console.error(`  FAIL ${adattatore.id.padEnd(20)} ${messaggio}`);
    }
  }

  const fusione = fondi(archivio, raccolti);

  // Lo storico si rivaluta con le regole di oggi; i bandi raccolti in questo
  // giro sono gia' valutati sulla descrizione completa e restano come sono.
  const idRaccolti = new Set(raccolti.map((b) => b.id));
  const soloBandiPerFonte = new Map(adattatori.map((a) => [a.id, a.soloBandi]));
  const tutti = fusione.tutti.map((b) =>
    idRaccolti.has(b.id) ? b : rivaluta(b, soloBandiPerFonte.get(b.fonteId) ?? false));

  // Per i bandi adatti alla serie si legge la pagina completa: dal feed arrivano
  // due righe, mentre chi puo' partecipare e la scadenza stanno nel testo intero.
  // Una pagina che non si legge non ferma niente: si riprova alla prossima raccolta.
  const daApprofondire = tutti
    .map((b, i) => ({ b, i }))
    .filter(({ b }) => b.adattoAllaSerie && !b.approfonditoIl)
    .slice(0, MAX_PAGINE);
  for (const { b, i } of daApprofondire) {
    try {
      tutti[i] = approfondisci(b, await leggi(b.url), adesso);
      console.log(`  PAGINA ${b.titolo.slice(0, 60)} -> ${tutti[i]!.ammissibilita}, scadenza ${tutti[i]!.scadenza ?? 'non trovata'}`);
    } catch (errore) {
      console.warn(`  PAGINA NON LETTA ${b.url}: ${errore instanceof Error ? errore.message : String(errore)}`);
    }
  }
  const perId = new Map(tutti.map((b) => [b.id, b]));
  const nuovi = fusione.nuovi.map((b) => perId.get(b.id) ?? b);
  const storicoNuovo = aggiornaStorico(storico, esiti, STORICO_MAX);

  // I dati si salvano prima di qualunque notifica: un server di posta giu'
  // non deve costare lo storico della raccolta ne' quello della salute.
  await writeFile(fileBandi, `${JSON.stringify(tutti, null, 2)}\n`, 'utf8');
  await writeFile(fileSalute, `${JSON.stringify(storicoNuovo, null, 2)}\n`, 'utf8');

  // Il sito mostra l'orario di questo controllo, non quello dell'ultimo bando nuovo:
  // in un giorno senza novita' una data vecchia farebbe credere il sistema fermo.
  const meta = {
    ultimoControllo: adesso.toISOString(),
    fonti: adattatori.map((a) => ({ id: a.id, nome: a.nome })),
  };
  await writeFile(fileMeta, `${JSON.stringify(meta, null, 2)}\n`, 'utf8');

  const fontiMute = adattatori
    .filter((a) => fonteSospetta(storicoNuovo[a.id] ?? [], GIORNI_ALLARME_FONTE))
    .map((a) => a.nome);
  const daMandare = daNotificare(nuovi);
  const errori: string[] = [];

  try {
    const e = await notifiche.inviaEmail(daMandare);
    console.log(`Notificati: ${daMandare.length} - notifica ${e.inviata ? 'preparata' : `non inviata (${e.motivo})`}`);
  } catch (errore) {
    errori.push(`invio email fallito: ${errore instanceof Error ? errore.message : String(errore)}`);
  }
  try {
    if (fontiMute.length > 0) console.log(`ATTENZIONE, fonti mute: ${fontiMute.join(', ')}`);
    await notifiche.inviaAllarmeFonti(fontiMute);
  } catch (errore) {
    errori.push(`invio allarme fallito: ${errore instanceof Error ? errore.message : String(errore)}`);
  }

  console.log(`Totale in archivio: ${tutti.length} - nuovi in questo controllo: ${nuovi.length}`);
  for (const e of errori) console.error(`ERRORE: ${e}`);

  return {
    totale: tutti.length,
    nuovi: nuovi.length,
    notificati: daMandare.length,
    adatti: tutti.filter((b) => b.adattoAllaSerie).length,
    fontiMute,
    errori,
  };
}

// Si avvia solo quando il file e' eseguito direttamente, non quando e' importato dai test.
const eseguitoDirettamente = process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(process.argv[1]).href;

if (eseguitoDirettamente) {
  const esito = await raccogli();

  // Avvio manuale con "prova notifiche": un avviso sul telefono per verificare
  // che l'iscrizione della produzione funzioni, anche nei giorni senza bandi nuovi.
  const topic = process.env['NTFY_TOPIC'] ?? '';
  if (process.env['PROVA_NOTIFICHE'] === 'true' && topic) {
    try {
      const gettone = process.env['NTFY_TOKEN'] ?? '';
      const prova = messaggioProva(esito.adatti, topic, indirizzoSito());
      const destinatari = destinatariViaNtfy(credenzialiDaAmbiente(), gettone);
      await pubblicaNtfy([prova, ...perEmail(prova, destinatari)], { gettone });
      console.log('Avviso di prova inviato.');
    } catch (errore) {
      const motivo = `avviso di prova fallito: ${errore instanceof Error ? errore.message : String(errore)}`;
      esito.errori.push(motivo);
      console.error(`ERRORE: ${motivo}`);
    }
  }

  // Un errore di notifica fa fallire il job, cosi' GitHub avvisa; i dati sono gia' salvi.
  if (esito.errori.length > 0) process.exitCode = 1;
}
