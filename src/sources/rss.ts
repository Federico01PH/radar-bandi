import Parser from 'rss-parser';
import type { RisultatoGrezzo } from '../tipi.ts';
import type { Adattatore, FonteRss } from './tipi.ts';
import { testoPulito } from './testo.ts';

// Il timeout vero e' quello di AbortSignal in cerca(): questo parser non chiama mai parseURL().
const parser = new Parser();

function leggiData(voce: { isoDate?: string; pubDate?: string }): Date | null {
  const grezza = voce.isoDate ?? voce.pubDate;
  if (!grezza) return null;
  const d = new Date(grezza);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Separata dalla rete, cosi' si testa su campioni salvati. */
export async function analizzaRss(xml: string, fonteId: string): Promise<RisultatoGrezzo[]> {
  const feed = await parser.parseString(xml);
  const voci = feed.items ?? [];
  const risultati: RisultatoGrezzo[] = [];
  for (const voce of voci) {
    if (!voce.link || !voce.title) continue;
    risultati.push({
      titolo: testoPulito(voce.title),
      url: voce.link,
      descrizione: testoPulito(voce.contentSnippet ?? voce.content ?? voce.summary),
      dataPubblicazione: leggiData(voce),
      fonteId,
    });
  }
  // Voci in ingresso e zero in uscita significa che la fonte ha cambiato formato.
  // Restituire una lista vuota sarebbe indistinguibile da 'nessun bando oggi', ed
  // e' esattamente il guasto silenzioso che questa piattaforma deve impedire.
  if (voci.length > 0 && risultati.length === 0) {
    throw new Error(
      `Fonte ${fonteId}: ${voci.length} voci nel feed, nessuna con link e titolo validi (formato cambiato?)`,
    );
  }
  return risultati;
}

export function creaAdattatoreRss(fonte: FonteRss): Adattatore {
  return {
    id: fonte.id,
    nome: fonte.nome,
    ente: fonte.ente,
    livello: fonte.livello,
    soloBandi: fonte.soloBandi,
    async cerca(): Promise<RisultatoGrezzo[]> {
      const risposta = await fetch(fonte.url, {
        headers: { 'user-agent': 'RadarBandi/1.0 (monitoraggio bandi, uso interno)' },
        signal: AbortSignal.timeout(25_000),
      });
      if (!risposta.ok) throw new Error(`HTTP ${risposta.status} da ${fonte.url}`);
      return analizzaRss(await risposta.text(), fonte.id);
    },
  };
}
