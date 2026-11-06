/** 95 → « 1h 35m », 60 → « 1h », 0 → « 0m » */
export function fmtTime(m: number | null | undefined): string {
  if (!m) return '0m';
  const h = Math.floor(m / 60);
  const r = m % 60;
  return h ? `${h}h${r ? ` ${r}m` : ''}` : `${r}m`;
}

/** Entier formaté en français (espace insécable pour les milliers) */
export function n0(x: number): string {
  return Math.round(x).toLocaleString('fr-FR');
}

/** Une décimale au plus, format français */
export function n1(x: number): string {
  return (Math.round(x * 10) / 10).toLocaleString('fr-FR');
}
