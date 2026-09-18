import type { Livello, RisultatoGrezzo } from '../tipi.ts';

/**
 * Ogni fonte e' un adattatore. Non conosce punteggi, notifiche o interfaccia:
 * restituisce risultati grezzi e basta. Aggiungere una fonte significa
 * scrivere un file nuovo e registrarlo, senza toccare altro.
 */
export type Adattatore = {
  id: string;
  nome: string;
  ente: string;
  livello: Livello;
  /**
   * true se la fonte pubblica soltanto bandi (un portale bandi, un aggregatore,
   * una categoria 'Avvisi'). Per le fonti miste la distinzione fra bando e
   * notizia si ricava dal testo.
   */
  soloBandi: boolean;
  /**
   * daQuando e' un suggerimento per scaricare meno, non un filtro garantito:
   * il filtro vero sulla finestra temporale lo applica la pipeline, uguale
   * per tutte le fonti. Un adattatore puo' ignorarlo e restituire tutto.
   */
  cerca(daQuando: Date): Promise<RisultatoGrezzo[]>;
};

export type FonteRss = {
  id: string;
  nome: string;
  ente: string;
  livello: Livello;
  soloBandi: boolean;
  url: string;
};
