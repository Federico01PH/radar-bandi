import { PAROLE, BONUS_INTERSEZIONE, ESCLUSI_DAL_TITOLO } from '../config.ts';
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
  /** true se il testo contiene almeno un tema forte: e' cio' che rende un bando adatto alla serie. */
  forte: boolean;
};

/**
 * Somma i pesi delle parole chiave presenti, una volta sola ciascuna.
 * Chi tocca entrambe le corsie con un tema forte riceve un bonus: il
 * progetto vive nell'intersezione fra audiovisivo e disagio giovanile, e
 * i bandi che stanno li' sono quelli con meno concorrenti.
 */
export function calcolaPertinenza(titolo: string, descrizione: string): EsitoPertinenza {
  const testo = appiattisci(`${titolo} ${descrizione}`);
  const corsie: Corsia[] = [];
  const corsieForti: Corsia[] = [];
  let punteggio = 0;

  for (const corsia of ['audiovisiva', 'giovani'] as Corsia[]) {
    let puntiCorsia = 0;
    for (const { termine, peso, forte } of PAROLE[corsia]) {
      if (!testo.includes(appiattisci(termine))) continue;
      puntiCorsia += peso;
      if (forte && !corsieForti.includes(corsia)) corsieForti.push(corsia);
    }
    if (puntiCorsia > 0) {
      corsie.push(corsia);
      punteggio += puntiCorsia;
    }
  }

  if (corsieForti.length === 2) punteggio += BONUS_INTERSEZIONE;

  return { punteggio: Math.min(100, punteggio), corsie, forte: corsieForti.length > 0 };
}

/** Il titolo annuncia un atto amministrativo o un ambito che non riguarda una web serie. */
export function esclusoDalTitolo(titolo: string): boolean {
  const piatto = appiattisci(titolo);
  return ESCLUSI_DAL_TITOLO.some((termine) => piatto.includes(termine));
}
