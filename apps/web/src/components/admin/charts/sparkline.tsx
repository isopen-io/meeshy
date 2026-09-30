import { sparkPath } from './chart-scale';

/**
 * UNE COURBE MINUSCULE (#8876) — la tendance d'une carte de chiffre. Décorative
 * pour l'œil, mais NOMMÉE pour le lecteur d'écran : `label` dit la tendance en
 * mots (« de 12 à 48 »), jamais une suite de nombres.
 *
 * Ligne de 2 px, arrondie, sans aire ni point : à cette taille, tout ornement est
 * du bruit. `vectorEffect` garde le trait à 2 px quelle que soit l'échelle.
 */
export function AdminSparkline({
  values,
  label,
  width = 96,
  height = 28,
}: {
  readonly values: readonly number[];
  readonly label: string;
  readonly width?: number;
  readonly height?: number;
}) {
  return (
    <svg
      role="img"
      aria-label={label}
      data-admin-sparkline
      style={{ direction: 'ltr' }}
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className="shrink-0"
      fill="none"
    >
      <path
        d={sparkPath(values, width, height)}
        stroke="var(--ios-indigo-500)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
