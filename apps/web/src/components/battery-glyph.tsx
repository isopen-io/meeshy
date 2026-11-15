import { BATTERY_TONE_COLOR as TONE_INK, type BatteryTone } from '@/lib/battery/battery-tone';

/**
 * **LE DESSIN D'UNE BATTERIE** (#14147) — pur, sans hook : `Avatar` est appelé comme une fonction par des témoins
 * qui rejouent l'arbre sans dispatcher. Le remplissage suit le NIVEAU servi (jamais moins d'un trait visible, pour
 * qu'une batterie à 1 % ne se lise pas vide), la couleur suit la TEINTE ; un éclair dit la charge ; un téléphone
 * présumé éteint n'a qu'un contour. Toujours `aria-hidden` : l'hôte dit l'état avec des mots.
 */

/** Sous cette taille d'avatar, l'icône ne se lirait plus : elle ne se pose pas, l'avatar la DIT quand même. */
export const AVATAR_BATTERY_MIN_SIZE = 24;

/**
 * **L'ICÔNE BATTERIE SUR L'AVATAR** (#14147) — en haut, côté fin de ligne, sur une pastille de la surface : la
 * présence et l'humeur occupent le bas. Cachée hors épisode (l'hôte ne la pose que si un état est servi).
 */
export function AvatarBatteryBadge({ badge, size }: { readonly badge: { readonly tone: BatteryTone; readonly level: number; readonly charging: boolean }; readonly size: number }) {
  if (size < AVATAR_BATTERY_MIN_SIZE) return null;
  const width = Math.max(14, Math.round(size * 0.36));
  return (
    <span
      data-avatar-battery={badge.tone}
      aria-hidden="true"
      className="pointer-events-none absolute grid place-items-center rounded-chip"
      style={{
        top: -Math.round(size * 0.04),
        insetInlineEnd: -Math.round(size * 0.1),
        padding: '2px 3px',
        background: 'var(--color-ios-surface)',
        boxShadow: '0 0 0 1px color-mix(in srgb, var(--color-ios-ink-3) 30%, transparent)',
        color: 'var(--color-ios-ink)',
      }}
    >
      <BatteryGlyph level={badge.level} tone={badge.tone} charging={badge.charging} width={width} />
    </span>
  );
}

const INNER_WIDTH = 16;
const MIN_FILL = 1.5;

export function BatteryGlyph({
  level,
  tone,
  charging,
  width = 18,
  outline = 'currentColor',
  ink,
}: {
  readonly level: number;
  readonly tone: BatteryTone;
  readonly charging: boolean;
  readonly width?: number;
  /** Le contour : l'encre de l'hôte par défaut. */
  readonly outline?: string;
  /** Monochrome : tout le dessin à cette encre (la pastille porte déjà la teinte en fond). */
  readonly ink?: string;
}) {
  const fill = tone === 'off' ? 0 : Math.max(MIN_FILL, (INNER_WIDTH * Math.min(100, Math.max(0, level))) / 100);
  return (
    <svg data-battery-glyph={tone} aria-hidden="true" width={width} height={(width * 12) / 24} viewBox="0 0 24 12" fill="none" className="shrink-0">
      <rect x="0.75" y="0.75" width="19.5" height="10.5" rx="2.5" stroke={ink ?? (tone === 'off' ? TONE_INK.off : outline)} strokeWidth="1.5" />
      <rect x="21" y="3.75" width="2" height="4.5" rx="1" fill={ink ?? (tone === 'off' ? TONE_INK.off : outline)} />
      {fill === 0 ? null : <rect data-battery-fill={Math.round(fill * 10) / 10} x="2.5" y="2.5" width={fill} height="7" rx="1.2" fill={ink ?? TONE_INK[tone]} />}
      {charging ? <path d="M11.4 1.6 7.6 6.6h2.6l-1 3.8 3.9-5h-2.6z" fill="var(--color-ios-ink)" stroke="var(--color-ios-surface)" strokeWidth="0.6" strokeLinejoin="round" /> : null}
    </svg>
  );
}
