import nodemailer from 'nodemailer';
import { corpoHtml, oggetto } from './formatta.ts';
import type { Bando } from '../tipi.ts';

/**
 * Tutto cio' che serve per spedire. I destinatari stanno qui e non in
 * config.ts: il repository e' pubblico per poter usare GitHub Pages, e un
 * indirizzo scritto nel codice finirebbe in mano a chiunque, bot compresi.
 */
export type Credenziali = {
  host: string;
  porta: number;
  utente: string;
  password: string;
  destinatari: string[];
};

export type EsitoInvio = {
  inviata: boolean;
  motivo: string | null;
};

export function credenzialiDaAmbiente(): Credenziali {
  return {
    host: process.env['SMTP_HOST'] ?? '',
    porta: Number(process.env['SMTP_PORT'] || 587),
    utente: process.env['SMTP_USER'] ?? '',
    password: process.env['SMTP_PASS'] ?? '',
    destinatari: (process.env['EMAIL_DESTINATARI'] ?? '')
      .split(',')
      .map((d) => d.trim())
      .filter((d) => d.length > 0),
  };
}

/** Motivo per cui non si puo' spedire, o null se si puo'. */
function mancante(cred: Credenziali): string | null {
  if (!cred.host || !cred.utente || !cred.password) return 'credenziali SMTP assenti';
  if (cred.destinatari.length === 0) return 'nessun destinatario configurato';
  return null;
}

/** true se l'email via SMTP ha tutto cio' che serve per partire. */
export function emailConfigurata(cred: Credenziali): boolean {
  return mancante(cred) === null;
}

async function spedisci(cred: Credenziali, soggetto: string, html: string): Promise<void> {
  const trasporto = nodemailer.createTransport({
    host: cred.host,
    port: cred.porta,
    secure: cred.porta === 465,
    auth: { user: cred.utente, pass: cred.password },
  });
  await trasporto.sendMail({
    from: `"Radar Bandi" <${cred.utente}>`,
    to: cred.destinatari.join(', '),
    subject: soggetto,
    html,
  });
}

/**
 * Niente email quando non c'e' niente da dire. Un messaggio quotidiano che
 * nove volte su dieci dice "nessuna novita'" smette di essere letto in due
 * settimane, e a quel punto avremmo ricostruito il problema di partenza.
 */
export async function inviaEmail(bandi: Bando[], cred: Credenziali): Promise<EsitoInvio> {
  if (bandi.length === 0) return { inviata: false, motivo: 'nessun bando da segnalare' };
  const motivo = mancante(cred);
  if (motivo !== null) return { inviata: false, motivo };
  await spedisci(cred, oggetto(bandi), corpoHtml(bandi));
  return { inviata: true, motivo: null };
}

/** Allarme separato: riguarda il sistema, non i bandi. */
export async function inviaAllarmeFonti(fonti: string[], cred: Credenziali): Promise<EsitoInvio> {
  if (fonti.length === 0) return { inviata: false, motivo: 'nessuna fonte sospetta' };
  const motivo = mancante(cred);
  if (motivo !== null) return { inviata: false, motivo };
  await spedisci(
    cred,
    `Radar Bandi: ${fonti.length} fonti non rispondono`,
    `<p>Queste fonti non portano risultati da tre controlli consecutivi:</p>`
      + `<ul>${fonti.map((f) => `<li>${f}</li>`).join('')}</ul>`
      + `<p>Finche' non vengono riparate, i bandi pubblicati li' non arrivano.</p>`,
  );
  return { inviata: true, motivo: null };
}
