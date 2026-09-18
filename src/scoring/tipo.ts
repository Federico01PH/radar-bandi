import { SEGNALI_BANDO, SEGNALI_NOTIZIA } from '../config.ts';
import { appiattisci } from './pertinenza.ts';
import type { Tipo } from '../tipi.ts';

function contieneUno(titolo: string, descrizione: string, segnali: string[]): boolean {
  const testo = ` ${appiattisci(`${titolo} ${descrizione}`)} `;
  return segnali.some((segnale) => testo.includes(segnale));
}

/** Il testo contiene un segno esplicito di opportunita' di finanziamento. */
export function sembraUnBando(titolo: string, descrizione: string): boolean {
  return contieneUno(titolo, descrizione, SEGNALI_BANDO);
}

/**
 * Decide se un elemento di una fonte mista e' un bando o una notizia.
 *
 * Nel dubbio e' un bando. Le notizie non vengono notificate, quindi un bando
 * scambiato per notizia sparisce senza che nessuno lo sappia: e' il guasto
 * che questa piattaforma esiste per impedire. Un bando si riconosce da un
 * segno esplicito; una notizia solo da un segno esplicito di notizia e
 * dall'assenza di qualunque segno di bando.
 */
export function classifica(titolo: string, descrizione: string): Tipo {
  if (sembraUnBando(titolo, descrizione)) return 'bando';
  if (contieneUno(titolo, descrizione, SEGNALI_NOTIZIA)) return 'notizia';
  return 'bando';
}
