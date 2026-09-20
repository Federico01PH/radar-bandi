import { ENTI } from '../config.ts';
import { hrefSicuro, oggetto } from './formatta.ts';
import type { Bando } from '../tipi.ts';

/**
 * Notifiche push sul telefono tramite ntfy.sh: ogni membro della produzione
 * installa l'app gratuita e si iscrive all'argomento del progetto. Nessun
 * account, nessuna password.
 *
 * Il nome dell'argomento sta nel segreto NTFY_TOPIC di GitHub e non nel
 * codice: chi lo conosce puo' leggere e anche scrivere, e il repository e'
 * pubblico.
 */
const SERVER = 'https://ntfy.sh/';

/** Oltre questo numero di bandi si manda un riepilogo invece di un avviso per ciascuno. */
const MAX_AVVISI = 5;

export type MessaggioNtfy = {
  topic: string;
  title: string;
  message: string;
  click: string;
  tags: string[];
  priority: number;
  actions?: { action: 'view'; label: string; url: string }[];
  /** Se c'e', ntfy spedisce lo stesso avviso anche a questo indirizzo email. */
  email?: string;
};

function dataItaliana(iso: string): string {
  return new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString('it-IT', { timeZone: 'Europe/Rome' });
}

function avviso(b: Bando, topic: string, sito: string): MessaggioNtfy {
  const ente = ENTI.find((e) => e.id === b.entePropostoId)?.nome ?? null;
  const righe = [
    b.ente,
    ente ? `Presenta: ${ente}` : 'Chi presenta: da verificare',
  ];
  if (b.scadenza) righe.push(`Scadenza: ${dataItaliana(b.scadenza)}`);
  const link = hrefSicuro(b.url);
  return {
    topic,
    title: b.titolo.slice(0, 180),
    message: righe.join('\n'),
    click: link === '#' ? sito : link,
    tags: ['clapper'],
    priority: b.ammissibilita === 'verde' ? 4 : 3,
    actions: [{ action: 'view', label: 'Tutti i bandi', url: sito }],
  };
}

/** Un avviso per bando; con molti bandi i primi piu' un riepilogo che rimanda al sito. */
export function messaggiBandi(bandi: Bando[], topic: string, sito: string): MessaggioNtfy[] {
  if (bandi.length <= MAX_AVVISI) return bandi.map((b) => avviso(b, topic, sito));
  const primi = bandi.slice(0, MAX_AVVISI - 1).map((b) => avviso(b, topic, sito));
  const resto = bandi.length - primi.length;
  return [...primi, {
    topic,
    title: `Radar Bandi: altri ${resto} bandi per la serie`,
    message: 'Apri il sito per vederli tutti, con chi presenta e la scadenza.',
    click: sito,
    tags: ['clapper'],
    priority: 3,
  }];
}

export function messaggioAllarme(fonti: string[], topic: string, sito: string): MessaggioNtfy {
  return {
    topic,
    title: `Radar Bandi: ${fonti.length} fonti non rispondono`,
    message: `${fonti.join(', ')}. Finche' non vengono riparate, i loro bandi non arrivano: vanno controllate a mano.`,
    click: sito,
    tags: ['warning'],
    priority: 4,
  };
}

export function messaggioProva(adatti: number, topic: string, sito: string): MessaggioNtfy {
  return {
    topic,
    title: 'Radar Bandi: avvisi attivi',
    message: `Da ora ricevi qui i nuovi bandi adatti a "Se finissero le parole". Aperti adesso sul sito: ${adatti}.`,
    click: sito,
    tags: ['white_check_mark'],
    priority: 3,
  };
}

/** Quanti bandi elencare in un'email: oltre, si rimanda al sito. */
const MAX_EMAIL = 10;

/**
 * L'email e' un riepilogo solo: un messaggio con dentro tutti i bandi nuovi,
 * non uno per bando, per non riempire la casella di chi la riceve.
 */
export function riepilogoEmail(bandi: Bando[], topic: string, sito: string): MessaggioNtfy {
  const mostrati = bandi.slice(0, MAX_EMAIL).map((b) => {
    const ente = ENTI.find((e) => e.id === b.entePropostoId)?.nome ?? null;
    const righe = [
      b.titolo,
      `${b.ente}${b.scadenza ? ` · scadenza ${dataItaliana(b.scadenza)}` : ''}`,
      ente ? `Presenta: ${ente}` : 'Chi presenta: da verificare',
    ];
    const link = hrefSicuro(b.url);
    if (link !== '#') righe.push(link);
    return righe.join('\n');
  });
  const resto = bandi.length - mostrati.length;
  if (resto > 0) mostrati.push(`…e altri ${resto} bandi.`);
  return {
    topic,
    title: oggetto(bandi),
    message: `${mostrati.join('\n\n')}\n\nTutti i bandi, con i filtri: ${sito}`,
    click: sito,
    tags: ['clapper'],
    priority: 3,
  };
}

/**
 * Lo stesso messaggio spedito per email a ciascun destinatario. Parte da un
 * argomento riservato all'email: se partisse da quello dei telefoni, ognuno
 * riceverebbe due volte lo stesso avviso.
 */
export function perEmail(messaggio: MessaggioNtfy, destinatari: string[]): MessaggioNtfy[] {
  return destinatari.map((email) => ({ ...messaggio, topic: `${messaggio.topic}-email`, email }));
}

export async function pubblicaNtfy(messaggi: MessaggioNtfy[], fetchImpl: typeof fetch = fetch): Promise<void> {
  for (const m of messaggi) {
    const risposta = await fetchImpl(SERVER, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(m),
      signal: AbortSignal.timeout(20_000),
    });
    if (!risposta.ok) throw new Error(`ntfy ha risposto HTTP ${risposta.status}`);
  }
}
