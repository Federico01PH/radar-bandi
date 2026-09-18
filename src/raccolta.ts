import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import {
  FINESTRA_GIORNI, FINESTRA_PRIMO_AVVIO, SOGLIA_NOTIFICA, GIORNI_ALLARME_FONTE,
} from './config.ts';
import { ADATTATORI } from './sources/registro.ts';
import { dentroLaFinestra } from './pipeline/finestra.ts';
import { costruisciBando, fondi } from './pipeline/archivio.ts';
import { aggiornaStorico, fonteSospetta, type Storico } from './health/salute.ts';
import { daNotificare } from './notify/formatta.ts';
import {
  credenzialiDaAmbiente, inviaAllarmeFonti, inviaEmail, type EsitoInvio,
} from './notify/email.ts';
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
};

export type EsitoRaccolta = {
  totale: number;
  nuovi: number;
  notificati: number;
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

function notificheReali(): Notifiche {
  const cred = credenzialiDaAmbiente();
  return {
    inviaEmail: (bandi) => inviaEmail(bandi, cred),
    inviaAllarmeFonti: (fonti) => inviaAllarmeFonti(fonti, cred),
  };
}

export async function raccogli(opzioni: Opzioni = {}): Promise<EsitoRaccolta> {
  const adesso = opzioni.adesso ?? new Date();
  const adattatori = opzioni.adattatori ?? ADATTATORI;
  const fileBandi = opzioni.fileBandi ?? 'data/bandi.json';
  const fileSalute = opzioni.fileSalute ?? 'data/salute.json';
  const fileMeta = opzioni.fileMeta ?? 'data/meta.json';
  const notifiche = opzioni.notifiche ?? notificheReali();

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

  const { tutti, nuovi } = fondi(archivio, raccolti);
  const storicoNuovo = aggiornaStorico(storico, esiti, STORICO_MAX);

  // I dati si salvano prima di qualunque notifica: un server di posta giu'
  // non deve costare lo storico della raccolta ne' quello della salute.
  await writeFile(fileBandi, `${JSON.stringify(tutti, null, 2)}\n`, 'utf8');
  await writeFile(fileSalute, `${JSON.stringify(storicoNuovo, null, 2)}\n`, 'utf8');

  // Il sito mostra l'orario di questo controllo, non quello dell'ultimo bando nuovo:
  // in un giorno senza novita' una data vecchia farebbe credere il sistema fermo.
  const meta = {
    ultimoControllo: adesso.toISOString(),
    soglia: SOGLIA_NOTIFICA,
    fonti: adattatori.map((a) => ({ id: a.id, nome: a.nome })),
  };
  await writeFile(fileMeta, `${JSON.stringify(meta, null, 2)}\n`, 'utf8');

  const fontiMute = adattatori
    .filter((a) => fonteSospetta(storicoNuovo[a.id] ?? [], GIORNI_ALLARME_FONTE))
    .map((a) => a.nome);
  const daMandare = daNotificare(nuovi, SOGLIA_NOTIFICA);
  const errori: string[] = [];

  try {
    const e = await notifiche.inviaEmail(daMandare);
    console.log(`Notificati: ${daMandare.length} - email ${e.inviata ? 'inviata' : `non inviata (${e.motivo})`}`);
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

  return { totale: tutti.length, nuovi: nuovi.length, notificati: daMandare.length, fontiMute, errori };
}

// Si avvia solo quando il file e' eseguito direttamente, non quando e' importato dai test.
const eseguitoDirettamente = process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(process.argv[1]).href;

if (eseguitoDirettamente) {
  const esito = await raccogli();
  // Un errore di notifica fa fallire il job, cosi' GitHub avvisa; i dati sono gia' salvi.
  if (esito.errori.length > 0) process.exitCode = 1;
}
