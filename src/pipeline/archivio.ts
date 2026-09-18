import { impronta } from './impronta.ts';
import { calcolaPertinenza } from '../scoring/pertinenza.ts';
import { valutaAmmissibilita } from '../scoring/ammissibilita.ts';
import { classifica } from '../scoring/tipo.ts';
import type { Bando, Livello, RisultatoGrezzo } from '../tipi.ts';

const MAX_DESCRIZIONE = 400;

export function costruisciBando(
  grezzo: RisultatoGrezzo,
  ente: string,
  livello: Livello,
  adesso: Date,
  soloBandi: boolean,
): Bando {
  const pertinenza = calcolaPertinenza(grezzo.titolo, grezzo.descrizione);
  const ammissibilita = valutaAmmissibilita(grezzo.titolo, grezzo.descrizione);
  const dataIncerta = grezzo.dataPubblicazione === null;

  return {
    id: impronta(grezzo.fonteId, grezzo.url),
    titolo: grezzo.titolo,
    ente,
    livello,
    // Se la fonte pubblica solo bandi lo sa lei; altrimenti lo si ricava dal
    // testo, e nel dubbio e' un bando.
    tipo: soloBandi ? 'bando' : classifica(grezzo.titolo, grezzo.descrizione),
    corsie: pertinenza.corsie,
    dataPubblicazione: (grezzo.dataPubblicazione ?? adesso).toISOString(),
    dataIncerta,
    scadenza: null,
    importo: null,
    descrizioneBreve: grezzo.descrizione.slice(0, MAX_DESCRIZIONE),
    requisiti: [],
    chiPuoPartecipare: ammissibilita.motivo,
    ammissibilita: ammissibilita.esito,
    entePropostoId: ammissibilita.entePropostoId,
    motivoAmmissibilita: ammissibilita.motivo,
    pertinenza: pertinenza.punteggio,
    url: grezzo.url,
    fonteId: grezzo.fonteId,
    vistoIl: adesso.toISOString(),
    salvato: false,
  };
}

export type EsitoFusione = {
  tutti: Bando[];
  nuovi: Bando[];
};

/**
 * Fonde i risultati di oggi con l'archivio.
 *
 * Regola: i campi che descrivono il bando si aggiornano (la fonte puo'
 * correggere un titolo), i campi che rappresentano la nostra relazione con
 * il bando no. Perdere un "salvato" perche' la fonte ha ripubblicato
 * l'avviso sarebbe un difetto grave e silenzioso.
 */
export function fondi(archivio: Bando[], raccolti: Bando[]): EsitoFusione {
  const perId = new Map(archivio.map((b) => [b.id, b]));
  const nuovi: Bando[] = [];

  for (const bando of raccolti) {
    const esistente = perId.get(bando.id);
    if (esistente === undefined) {
      perId.set(bando.id, bando);
      nuovi.push(bando);
      continue;
    }
    perId.set(bando.id, {
      ...bando,
      vistoIl: esistente.vistoIl,
      salvato: esistente.salvato,
    });
  }

  const tutti = [...perId.values()].sort(
    (a, b) => Date.parse(b.dataPubblicazione) - Date.parse(a.dataPubblicazione),
  );
  return { tutti, nuovi };
}
