/**
 * **LES GLYPHES DES RAILS DE LA SCÈNE** (#8715, #8794) — même trait que les
 * marques du chrome (`story-compose-chrome.tsx`) : 24 × 24, trait de 1,8.
 * Ils répondent aux symboles SF qu'iOS pose aux mêmes places
 * (`camera.viewfinder`, `sparkles.rectangle.stack`, `camera.filters`,
 * `square.3.layers.3d.top.filled`, `photo.on.rectangle.angled`).
 */

const STROKE = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

type MarkProps = { readonly size?: number };

/** Le viseur — le premier toucher arme l'objectif (#8711). */
export function ViewfinderMark({ size = 20 }: MarkProps) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" {...STROKE}>
      <path d="M3 8V5a2 2 0 012-2h3M16 3h3a2 2 0 012 2v3M21 16v3a2 2 0 01-2 2h-3M8 21H5a2 2 0 01-2-2v-3" />
      <circle cx="12" cy="12" r="3.5" />
    </svg>
  );
}

/** L'effet d'OUVERTURE — une scène qui en recouvre une autre, et son éclat. */
export function OpeningEffectMark({ size = 20 }: MarkProps) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" {...STROKE}>
      <rect x="3" y="8" width="13" height="13" rx="2.5" />
      <path d="M7 5h11a2 2 0 012 2v10" />
      <path d="M9.5 11.5l.8 1.7 1.7.8-1.7.8-.8 1.7-.8-1.7-1.7-.8 1.7-.8z" />
    </svg>
  );
}

/** L'effet VISUEL — trois filtres qui se recouvrent. */
export function VisualEffectMark({ size = 20 }: MarkProps) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" {...STROKE}>
      <circle cx="12" cy="8.5" r="5" />
      <circle cx="8.5" cy="14.5" r="5" />
      <circle cx="15.5" cy="14.5" r="5" />
    </svg>
  );
}

/** « Mettre en fond » / « Remplacer le fond » — une image qui passe derrière. */
export function BackgroundMark({ size = 20 }: MarkProps) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" {...STROKE}>
      <rect x="3" y="6" width="14" height="14" rx="2.5" />
      <path d="M7 3h12a2 2 0 012 2v12" />
      <path d="M3 16l4-4 4 4 2-2 4 4" />
    </svg>
  );
}

/** « Passer au premier plan » — trois plans, le haut plein. */
export function ForegroundMark({ size = 20 }: MarkProps) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" {...STROKE}>
      <path d="M12 3l9 5-9 5-9-5z" fill="currentColor" />
      <path d="M3 12.5l9 5 9-5M3 16.5l9 5 9-5" />
    </svg>
  );
}
