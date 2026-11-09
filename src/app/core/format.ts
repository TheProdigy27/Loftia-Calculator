/** Minutes → « 1h 35m », 60 → « 1h », 7.5 → « 7m 30s », 0 → « 0m » (arrondi à la seconde) */
export function fmtTime(m: number | null | undefined): string {
  const t = Math.round((m || 0) * 60);
  if (!t) return '0m';
  const h = Math.floor(t / 3600);
  const min = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const parts = [h && `${h}h`, (min || (h && s)) && `${min}m`, s && `${s}s`];
  return parts.filter(Boolean).join(' ');
}

/** Entier formaté en français (espace insécable pour les milliers) */
export function n0(x: number): string {
  return Math.round(x).toLocaleString('fr-FR');
}

/** Une décimale au plus, format français */
export function n1(x: number): string {
  return (Math.round(x * 10) / 10).toLocaleString('fr-FR');
}
