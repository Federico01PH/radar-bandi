export type Livello =
  | 'europeo'
  | 'statale'
  | 'mic'
  | 'regionale'
  | 'provinciale'
  | 'comunale'
  | 'fondazione'
  | 'terzosettore';

export type Corsia = 'audiovisiva' | 'giovani';

export type Ammissibilita = 'verde' | 'giallo' | 'rosso' | 'ignota';

/** Un bando e' un'opportunita' di finanziamento; una notizia no, anche se parla di cinema. */
export type Tipo = 'bando' | 'notizia';

/** Quello che un adattatore restituisce, prima di qualunque elaborazione. */
export type RisultatoGrezzo = {
  titolo: string;
  url: string;
  descrizione: string;
  /** null quando la fonte non espone una data affidabile. */
  dataPubblicazione: Date | null;
  fonteId: string;
};

export type Bando = {
  id: string;
  titolo: string;
  ente: string;
  livello: Livello;
  tipo: Tipo;
  corsie: Corsia[];
  /** ISO 8601. */
  dataPubblicazione: string;
  /** true quando la data e' stata inferita e non letta dalla fonte. */
  dataIncerta: boolean;
  scadenza: string | null;
  importo: string | null;
  descrizioneBreve: string;
  requisiti: string[];
  chiPuoPartecipare: string | null;
  ammissibilita: Ammissibilita;
  /** id dell'ente della produzione che puo' firmare la domanda. */
  entePropostoId: string | null;
  motivoAmmissibilita: string | null;
  pertinenza: number;
  /** Tipo bando, almeno un tema forte, non un atto amministrativo: e' cio' che si mostra e si notifica. */
  adattoAllaSerie: boolean;
  url: string;
  fonteId: string;
  /** ISO 8601 del primo avvistamento. */
  vistoIl: string;
  salvato: boolean;
};

export type EsitoFonte = {
  fonteId: string;
  ok: boolean;
  risultati: number;
  durataMs: number;
  errore: string | null;
  quando: string;
};
