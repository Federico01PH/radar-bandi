import { ENTI, NOMI_LIVELLO } from '../config.ts';
import type { Bando } from '../tipi.ts';

/**
 * Chi merita una notifica: un bando adatto alla serie e non escluso in partenza.
 * Gli 'ignota' passano di proposito — nel dubbio si avvisa. Una notifica
 * di troppo costa trenta secondi, un bando perso costa il bando.
 */
export function daNotificare(bandi: Bando[]): Bando[] {
  return bandi
    .filter((b) => b.adattoAllaSerie && b.ammissibilita !== 'rosso')
    .sort((a, b) => b.pertinenza - a.pertinenza);
}

export function oggetto(bandi: Bando[]): string {
  return bandi.length === 1
    ? 'Radar Bandi: 1 nuovo bando'
    : `Radar Bandi: ${bandi.length} nuovi bandi`;
}

function esc(testo: string): string {
  return testo
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * L'indirizzo di un bando arriva da un feed di terzi: se non e' http o https
 * (per esempio un "javascript:") non deve diventare un link cliccabile.
 */
export function hrefSicuro(url: string): string {
  return /^https?:\/\//i.test(url.trim()) ? url : '#';
}

function nomeEnte(id: string | null): string | null {
  return ENTI.find((e) => e.id === id)?.nome ?? null;
}

const COLORI: Record<string, string> = {
  verde: '#1a7f37', giallo: '#9a6700', rosso: '#cf222e', ignota: '#57606a',
};

function scheda(b: Bando): string {
  const ente = nomeEnte(b.entePropostoId);
  const data = new Date(b.dataPubblicazione).toLocaleDateString('it-IT');
  const righe: string[] = [
    `<h2 style="margin:0 0 4px;font-size:17px;">${esc(b.titolo)}</h2>`,
    `<p style="margin:0 0 10px;color:#57606a;font-size:13px;">`
      + `${esc(b.ente)} · ${esc(NOMI_LIVELLO[b.livello])} · pubblicato il ${data}`
      + `${b.dataIncerta ? ' (data non dichiarata dalla fonte)' : ''}</p>`,
  ];
  if (b.descrizioneBreve) {
    righe.push(`<p style="margin:0 0 10px;">${esc(b.descrizioneBreve)}</p>`);
  }
  if (ente !== null) {
    righe.push(`<p style="margin:0 0 6px;color:${COLORI[b.ammissibilita]};">`
      + `<strong>Presenta: ${esc(ente)}</strong></p>`);
  }
  if (b.motivoAmmissibilita !== null) {
    righe.push(`<p style="margin:0 0 10px;color:#57606a;font-size:13px;">`
      + `Dal bando: «${esc(b.motivoAmmissibilita)}»</p>`);
  }
  righe.push(`<p style="margin:0;"><a href="${esc(hrefSicuro(b.url))}">Apri il bando originale</a>`
    + ` · pertinenza ${b.pertinenza}/100</p>`);

  return `<div style="border-left:3px solid ${COLORI[b.ammissibilita]};`
    + `padding:0 0 0 14px;margin:0 0 26px;">${righe.join('')}</div>`;
}

export function corpoHtml(bandi: Bando[]): string {
  return `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;`
    + `max-width:640px;line-height:1.5;color:#1f2328;">`
    + `<p style="margin:0 0 22px;color:#57606a;">`
    + `Controllo del ${new Date().toLocaleDateString('it-IT')}.</p>`
    + bandi.map(scheda).join('')
    + `</div>`;
}

/** Quante schede al massimo in una segnalazione: le altre stanno sul sito. */
const MAX_SCHEDE_MARKDOWN = 30;

/**
 * Testo sicuro dentro una segnalazione GitHub. La chiocciola diventa quella a
 * larghezza piena, cosi' un titolo come "Bando per @qualcuno" non manda una
 * notifica a un utente GitHub a caso; le parentesi quadre non rompono i link
 * e i caratteri "<" non vengono presi per tag.
 */
function md(testo: string): string {
  return testo
    .replace(/\\/g, '\\\\')
    .replace(/\[/g, '\\[').replace(/\]/g, '\\]')
    .replace(/</g, '&lt;')
    .replace(/@/g, '\uff20');
}

function indirizzoMarkdown(url: string): string {
  return hrefSicuro(url).replace(/\(/g, '%28').replace(/\)/g, '%29').replace(/ /g, '%20');
}

function schedaMarkdown(b: Bando): string {
  const ente = nomeEnte(b.entePropostoId);
  const data = new Date(b.dataPubblicazione).toLocaleDateString('it-IT');
  const righe = [
    `### [${md(b.titolo)}](${indirizzoMarkdown(b.url)})`,
    `${md(b.ente)} · ${md(NOMI_LIVELLO[b.livello])} · pubblicato il ${data}`
      + `${b.dataIncerta ? ' (data non dichiarata dalla fonte)' : ''} · pertinenza ${b.pertinenza}/100`,
  ];
  if (b.descrizioneBreve) righe.push('', md(b.descrizioneBreve));
  if (ente !== null) righe.push('', `**Presenta: ${md(ente)}**`);
  if (b.motivoAmmissibilita !== null) righe.push('', `> Dal bando: «${md(b.motivoAmmissibilita)}»`);
  return righe.join('\n');
}

/** La stessa notifica dell'email, in forma di segnalazione GitHub. */
export function corpoMarkdown(bandi: Bando[]): string {
  const mostrati = bandi.slice(0, MAX_SCHEDE_MARKDOWN).map(schedaMarkdown);
  const resto = bandi.length - MAX_SCHEDE_MARKDOWN;
  if (resto > 0) mostrati.push(`_…e altri ${resto} sul sito._`);
  return `Controllo del ${new Date().toLocaleDateString('it-IT')}.\n\n${mostrati.join('\n\n---\n\n')}\n`;
}
