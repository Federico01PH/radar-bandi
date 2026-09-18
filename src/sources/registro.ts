import { creaAdattatoreRss } from './rss.ts';
import { creaAdattatoreWordpress } from './wordpress.ts';
import type { Adattatore } from './tipi.ts';

/**
 * Le sette fonti con aggancio verificato il 18 settembre 2026.
 * Gli adattatori HTML delle altre fonti arrivano in un piano successivo.
 */
export const ADATTATORI: Adattatore[] = [
  creaAdattatoreWordpress({
    id: 'mic',
    soloBandi: true,
    nome: 'MiC — Direzione generale Cinema e audiovisivo',
    ente: 'Ministero della Cultura',
    livello: 'mic',
    base: 'https://cinema.cultura.gov.it',
    // 4 = Avvisi, 258 = Bandi. Esclude Notizie, Comunicati, Eventi, Dicono di noi.
    categorie: [4, 258],
  }),
  creaAdattatoreRss({
    id: 'infobandi',
    soloBandi: true,
    nome: 'InfoBandi CSVnet',
    ente: 'CSVnet',
    livello: 'terzosettore',
    url: 'https://infobandi.csvnet.it/feed/',
  }),
  creaAdattatoreRss({
    id: 'ctvbiella',
    soloBandi: false,
    nome: 'CTV Biella–Vercelli',
    ente: 'Centro Territoriale per il Volontariato',
    livello: 'terzosettore',
    url: 'https://www.centroterritorialevolontariato.org/feed/',
  }),
  creaAdattatoreRss({
    id: 'piemonte',
    soloBandi: true,
    nome: 'Bandi Regione Piemonte',
    ente: 'Regione Piemonte',
    livello: 'regionale',
    // Solo la sezione contributi: il feed 'tutti' mescola gare d'appalto e nomine e,
    // con dieci voci, copriva appena due giorni. Questo ne copre circa sei.
    url: 'https://bandi.regione.piemonte.it/contributi-finanziamenti/rss.xml',
  }),
  creaAdattatoreRss({
    id: 'crt',
    soloBandi: false,
    nome: 'Fondazione CRT',
    ente: 'Fondazione CRT',
    livello: 'fondazione',
    url: 'https://www.fondazionecrt.it/feed/',
  }),
  creaAdattatoreRss({
    id: 'compagniasanpaolo',
    soloBandi: false,
    nome: 'Fondazione Compagnia di San Paolo',
    ente: 'Compagnia di San Paolo',
    livello: 'fondazione',
    url: 'https://www.compagniadisanpaolo.it/feed/',
  }),
  creaAdattatoreRss({
    id: 'ang',
    soloBandi: false,
    nome: 'Agenzia Nazionale Giovani',
    ente: 'Agenzia Nazionale Giovani',
    livello: 'statale',
    url: 'https://www.agenziagiovani.it/feed/',
  }),
];
