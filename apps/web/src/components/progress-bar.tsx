import { progressPercent } from '@/lib/view/progression';

/**
 * UNE BARRE DE PALIER — la fraction parcourue entre deux paliers, peinte dans
 * la teinte de son échelle.
 *
 * `role="progressbar"` avec ses trois valeurs : la barre EST une information,
 * pas un ornement — un lecteur d'écran annonce « Niveau, barre de progression,
 * 80 % », ce qu'aucun `<div>` peint ne dirait. Le libellé est celui de
 * l'échelle (« Vers le niveau 4 »), jamais un pourcentage recopié : le
 * pourcentage est déjà `aria-valuenow`.
 */
export function ProgressBar({ progress, label, tint }: { progress: number; label: string; tint: string }) {
  const percent = progressPercent(progress);
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-label={label}
      className="h-1.5 w-full overflow-hidden rounded-chip"
      style={{ backgroundColor: 'color-mix(in srgb, var(--color-ios-ink-3) 28%, transparent)' }}
    >
      <div className="h-full rounded-chip" style={{ width: `${percent}%`, backgroundColor: tint }} />
    </div>
  );
}
