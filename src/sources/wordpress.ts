import type { Livello, RisultatoGrezzo } from '../tipi.ts';
import type { Adattatore } from './tipi.ts';
import { testoPulito } from './testo.ts';

export type FonteWordpress = {
  id: string;
  nome: string;
  ente: string;
  livello: Livello;
  soloBandi: boolean;
  /** Origine del sito, senza barra finale. */
  base: string;
  /**
   * Categorie WordPress da cui leggere. Il MiC pubblica avvisi e notizie nello
   * stesso flusso: senza questo filtro meta' dei risultati sarebbero notizie.
   */
  categorie?: number[];
};

type PostWordpress = {
  date?: string;
  link?: string;
  title?: { rendered?: string };
  excerpt?: { rendered?: string };
  categories?: number[];
};

/** Separata dalla rete, cosi' si testa su campioni salvati. */
export function analizzaWordpress(posts: PostWordpress[], fonteId: string): RisultatoGrezzo[] {
  const risultati: RisultatoGrezzo[] = [];
  for (const post of posts) {
    if (!post.link || !post.title?.rendered) continue;
    const data = post.date ? new Date(post.date) : null;
    risultati.push({
      titolo: testoPulito(post.title.rendered),
      url: post.link,
      descrizione: testoPulito(post.excerpt?.rendered),
      dataPubblicazione: data && !Number.isNaN(data.getTime()) ? data : null,
      fonteId,
    });
  }
  // Voci in ingresso e zero in uscita significa che la fonte ha cambiato formato.
  // Restituire una lista vuota sarebbe indistinguibile da 'nessun bando oggi', ed
  // e' esattamente il guasto silenzioso che questa piattaforma deve impedire.
  if (posts.length > 0 && risultati.length === 0) {
    throw new Error(
      `Fonte ${fonteId}: ${posts.length} post ricevuti, nessuno con link e titolo validi (formato cambiato?)`,
    );
  }
  return risultati;
}

export function creaAdattatoreWordpress(fonte: FonteWordpress): Adattatore {
  return {
    id: fonte.id,
    nome: fonte.nome,
    ente: fonte.ente,
    livello: fonte.livello,
    soloBandi: fonte.soloBandi,
    async cerca(daQuando: Date): Promise<RisultatoGrezzo[]> {
      // L'API accetta un filtro sulla data: si scarica solo il necessario.
      const url = `${fonte.base}/wp-json/wp/v2/posts`
        + `?per_page=50&orderby=date&order=desc&after=${daQuando.toISOString()}`
        + (fonte.categorie?.length ? `&categories=${fonte.categorie.join(',')}` : '');
      const risposta = await fetch(url, {
        headers: { 'user-agent': 'RadarBandi/1.0 (monitoraggio bandi, uso interno)' },
        signal: AbortSignal.timeout(25_000),
      });
      if (!risposta.ok) throw new Error(`HTTP ${risposta.status} da ${url}`);
      return analizzaWordpress(await risposta.json() as PostWordpress[], fonte.id);
    },
  };
}
