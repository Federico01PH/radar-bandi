const MS_PER_GIORNO = 24 * 60 * 60 * 1000;

/**
 * Un risultato entra nell'archivio se e' stato pubblicato entro `giorni`
 * dalla data di controllo.
 *
 * Due scelte deliberate, entrambe a favore del falso positivo:
 * - data assente: si tiene. Scartare in silenzio e' il modo esatto in cui
 *   questa produzione ha gia' perso dei bandi.
 * - data futura: si tiene. Diverse fonti pubblicano con data di decorrenza.
 */
export function dentroLaFinestra(
  dataPubblicazione: Date | null,
  adesso: Date,
  giorni: number,
): boolean {
  if (dataPubblicazione === null) return true;
  if (Number.isNaN(dataPubblicazione.getTime())) return true;
  if (dataPubblicazione.getTime() > adesso.getTime()) return true;
  return adesso.getTime() - dataPubblicazione.getTime() <= giorni * MS_PER_GIORNO;
}
