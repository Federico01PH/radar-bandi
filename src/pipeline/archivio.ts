import { impronta } from './impronta.ts';
import { calcolaPertinenza, esclusoDalTitolo } from '../scoring/pertinenza.ts';
import { valutaAmmissibilita } from '../scoring/ammissibilita.ts';
import { classifica, sembraUnBando } from '../scoring/tipo.ts';
import { trovaScadenza } from '../scoring/scadenza.ts';
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
  // Se la fonte pubblica solo bandi lo sa lei; altrimenti lo si ricava dal
  // testo, e nel dubbio e' un bando.
  const tipo = soloBandi ? 'bando' : classifica(grezzo.titolo, grezzo.descrizione);

  return {
    id: impronta(grezzo.fonteId, grezzo.url),
    titolo: grezzo.titolo,
    ente,
    livello,
    tipo,
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
    // Si mostra e si notifica solo cio' che e' certamente un bando: da una
    // fonte di soli bandi, o con un segno esplicito di bando nel testo. Nei
    // feed misti delle fondazioni, senza quel segno, un festival o un evento
    // finirebbero tra i bandi.
    adattoAllaSerie: tipo === 'bando'
      && (soloBandi || sembraUnBando(grezzo.titolo, grezzo.descrizione))
      && pertinenza.forte
      && !esclusoDalTitolo(grezzo.titolo),
    url: grezzo.url,
    fonteId: grezzo.fonteId,
    vistoIl: adesso.toISOString(),
    salvato: false,
  };
}

/**
 * Ricalcola tipo, pertinenza e ammissibilita' di un bando gia' in archivio
 * con le regole di oggi, conservando la nostra relazione con il bando.
 *
 * Senza questo, ritoccare le regole in config.ts cambierebbe solo i bandi
 * raccolti da quel giorno in poi, e lo storico resterebbe valutato con le
 * regole vecchie. Si lavora sulla descrizione breve, l'unica conservata.
 */
export function rivaluta(bando: Bando, soloBandi: boolean): Bando {
  const nuovo = costruisciBando(
    {
      titolo: bando.titolo,
      url: bando.url,
      descrizione: bando.descrizioneBreve,
      dataPubblicazione: new Date(bando.dataPubblicazione),
      fonteId: bando.fonteId,
    },
    bando.ente,
    bando.livello,
    new Date(bando.vistoIl),
    soloBandi,
  );
  return conservaApprofondimento(
    { ...nuovo, dataIncerta: bando.dataIncerta, vistoIl: bando.vistoIl, salvato: bando.salvato },
    bando,
  );
}

/**
 * Completa un bando con cio' che si legge nella sua pagina: chi puo'
 * partecipare e la scadenza. Il testo del feed resta nell'analisi, perche'
 * a volte e' li' e non nella pagina che si dice a chi e' rivolto.
 */
export function approfondisci(bando: Bando, testoPagina: string, adesso: Date): Bando {
  const a = valutaAmmissibilita(bando.titolo, `${bando.descrizioneBreve} ${testoPagina}`);
  return {
    ...bando,
    ammissibilita: a.esito,
    entePropostoId: a.entePropostoId,
    motivoAmmissibilita: a.motivo,
    chiPuoPartecipare: a.motivo,
    scadenza: trovaScadenza(testoPagina, adesso),
    approfonditoIl: adesso.toISOString(),
  };
}

/**
 * Se un bando e' gia' stato approfondito, cio' che si e' letto nella pagina
 * vale piu' di cio' che si ricava dalle due righe del feed: si conserva.
 */
function conservaApprofondimento(nuovo: Bando, vecchio: Bando): Bando {
  if (!vecchio.approfonditoIl) return nuovo;
  return {
    ...nuovo,
    ammissibilita: vecchio.ammissibilita,
    entePropostoId: vecchio.entePropostoId,
    motivoAmmissibilita: vecchio.motivoAmmissibilita,
    chiPuoPartecipare: vecchio.chiPuoPartecipare,
    scadenza: vecchio.scadenza,
    approfonditoIl: vecchio.approfonditoIl,
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
    perId.set(bando.id, conservaApprofondimento({
      ...bando,
      vistoIl: esistente.vistoIl,
      salvato: esistente.salvato,
    }, esistente));
  }

  const tutti = [...perId.values()].sort(
    (a, b) => Date.parse(b.dataPubblicazione) - Date.parse(a.dataPubblicazione),
  );
  return { tutti, nuovi };
}
