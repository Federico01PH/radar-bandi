import { createHash } from 'node:crypto';

const PARAMETRI_DA_SCARTARE = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'fbclid', 'gclid', 'mc_cid', 'mc_eid',
];

/** Porta un URL in forma canonica, cosi' lo stesso bando non genera due id. */
export function normalizzaUrl(url: string): string {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return url;
  }
  for (const p of PARAMETRI_DA_SCARTARE) u.searchParams.delete(p);
  u.searchParams.sort();
  u.hash = '';
  u.hostname = u.hostname.toLowerCase();
  if (u.pathname.length > 1 && u.pathname.endsWith('/')) {
    u.pathname = u.pathname.slice(0, -1);
  }
  return u.toString();
}

/**
 * Identita' di un bando: fonte piu' URL canonico.
 * Il titolo e' escluso di proposito perche' le fonti lo correggono a posteriori.
 */
export function impronta(fonteId: string, url: string): string {
  return createHash('sha256').update(`${fonteId}::${normalizzaUrl(url)}`).digest('hex');
}
