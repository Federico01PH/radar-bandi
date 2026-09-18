import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { corpoMarkdown, oggetto } from './formatta.ts';
import type { EsitoInvio } from './email.ts';
import type { Bando } from '../tipi.ts';

/**
 * Notifica senza credenziali: la raccolta scrive titolo e corpo di una
 * segnalazione, e il workflow la apre come issue nel repository. GitHub la
 * manda per email al proprietario, che osserva il proprio repository.
 *
 * Serve quando l'email via SMTP non e' configurata: nessuna password da
 * creare o da custodire, e ogni notifica resta archiviata su GitHub.
 */
async function scrivi(cartella: string, nome: string, titolo: string, corpo: string): Promise<void> {
  await mkdir(cartella, { recursive: true });
  await writeFile(join(cartella, `${nome}.titolo`), titolo, 'utf8');
  await writeFile(join(cartella, `${nome}.md`), corpo, 'utf8');
}

export async function scriviSegnalazioneBandi(bandi: Bando[], cartella: string): Promise<EsitoInvio> {
  if (bandi.length === 0) return { inviata: false, motivo: 'nessun bando da segnalare' };
  await scrivi(cartella, 'bandi', oggetto(bandi), corpoMarkdown(bandi));
  return { inviata: true, motivo: null };
}

export async function scriviSegnalazioneAllarme(fonti: string[], cartella: string): Promise<EsitoInvio> {
  if (fonti.length === 0) return { inviata: false, motivo: 'nessuna fonte sospetta' };
  await scrivi(
    cartella,
    'allarme',
    `Radar Bandi: ${fonti.length} fonti non rispondono`,
    'Queste fonti non portano risultati da tre controlli consecutivi:\n\n'
      + fonti.map((f) => `- ${f}`).join('\n')
      + '\n\nFinche\' non vengono riparate, i bandi pubblicati li\' non arrivano: vanno controllate a mano.\n',
  );
  return { inviata: true, motivo: null };
}
