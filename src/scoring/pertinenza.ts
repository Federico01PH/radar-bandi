import { PAROLE, BONUS_INTERSEZIONE } from '../config.ts';
import type { Corsia } from '../tipi.ts';

/**
 * Riduce un testo a una forma confrontabile: minuscolo, senza accenti,
 * senza punteggiatura, con spazi singoli. Le fonti italiane scrivono
 * "povertà" e "poverta" indifferentemente.
 */
export function appiattisci(testo: string): string {
  return testo
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export type EsitoPertinenza = {
  punteggio: number;
  corsie: Corsia[];
};

/**
 * Somma i pesi delle parole chiave presenti, una volta sola ciascuna.
 * Chi tocca entrambe le corsie riceve un bonus: il progetto vive
 * nell'intersezione fra audiovisivo e disagio giovanile, e i bandi
 * che stanno li' sono quelli con meno concorrenti.
 */
export function calcolaPertinenza(titolo: string, descrizione: string): EsitoPertinenza {
  const testo = appiattisci(`${titolo} ${descrizione}`);
  const corsie: Corsia[] = [];
  let punteggio = 0;

  for (const corsia of ['audiovisiva', 'giovani'] as Corsia[]) {
    let puntiCorsia = 0;
    for (const { termine, peso } of PAROLE[corsia]) {
      if (testo.includes(appiattisci(termine))) puntiCorsia += peso;
    }
    if (puntiCorsia > 0) {
      corsie.push(corsia);
      punteggio += puntiCorsia;
    }
  }

  if (corsie.length === 2) punteggio += BONUS_INTERSEZIONE;

  return { punteggio: Math.min(100, punteggio), corsie };
}
