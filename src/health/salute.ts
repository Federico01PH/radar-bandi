import type { EsitoFonte } from '../tipi.ts';

export type Storico = Record<string, EsitoFonte[]>;

/**
 * Una fonte e' sospetta se le ultime `soglia` esecuzioni non hanno portato
 * nulla, per errore o per silenzio.
 *
 * Lo zero senza errore conta quanto l'errore: e' il sintomo tipico di un sito
 * rifatto, dove il parser gira senza lamentarsi ma non trova piu' niente.
 * E' esattamente il modo in cui un monitoraggio muore senza che nessuno
 * se ne accorga.
 */
export function fonteSospetta(esiti: EsitoFonte[], soglia: number): boolean {
  if (esiti.length < soglia) return false;
  const ultimi = esiti.slice(-soglia);
  return ultimi.every((e) => !e.ok || e.risultati === 0);
}

export function aggiornaStorico(
  storico: Storico,
  esiti: EsitoFonte[],
  massimo: number,
): Storico {
  const out: Storico = { ...storico };
  for (const esito of esiti) {
    const precedenti = out[esito.fonteId] ?? [];
    out[esito.fonteId] = [...precedenti, esito].slice(-massimo);
  }
  return out;
}
