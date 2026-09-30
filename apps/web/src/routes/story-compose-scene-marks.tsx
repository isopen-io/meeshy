import type { StudioObjectActionId, StudioSceneEffect } from '@/lib/stories/studio-scene-columns';
import type { StudioBackgroundMenuAction } from '@/lib/stories/studio-scene-menu';

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

/** « Modifier » — le crayon. */
export function EditMark({ size = 20 }: MarkProps) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" {...STROKE}>
      <path d="M4 20h4L19 9l-4-4L4 16z" />
      <path d="M13.5 6.5l4 4" />
    </svg>
  );
}

/** « Monter » / « Descendre » — une flèche dans un plan. */
export function LayerStepMark({ size = 20, up }: MarkProps & { readonly up: boolean }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" {...STROKE}>
      <path d="M4 19h16" />
      <path d={up ? 'M12 15V4M7.5 8.5L12 4l4.5 4.5' : 'M12 4v11M7.5 10.5L12 15l4.5-4.5'} />
    </svg>
  );
}

/** « Dupliquer » — deux feuilles. */
export function DuplicateMark({ size = 20 }: MarkProps) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" {...STROKE}>
      <rect x="8" y="8" width="12" height="12" rx="2.5" />
      <path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2" />
    </svg>
  );
}

/** « Retirer » — la corbeille. */
export function TrashMark({ size = 20 }: MarkProps) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" {...STROKE}>
      <path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13" />
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

/** Le glyphe d'une action d'objet ou du fond — le MÊME au menu d'appui long
 * et à la colonne droite. */
export function ObjectActionMark({ action, size = 20 }: { readonly action: StudioObjectActionId | StudioBackgroundMenuAction; readonly size?: number }) {
  if (action === 'edit') return <EditMark size={size} />;
  if (action === 'raise' || action === 'lower') return <LayerStepMark size={size} up={action === 'raise'} />;
  if (action === 'duplicate') return <DuplicateMark size={size} />;
  if (action === 'set-background' || action === 'replace-background') return <BackgroundMark size={size} />;
  if (action === 'forward') return <ForegroundMark size={size} />;
  if (action === 'retake') return <ViewfinderMark size={size} />;
  return <TrashMark size={size} />;
}

/** La famille d'effets de la scène, par son glyphe. */
export function EffectMark({ effect, size = 20 }: { readonly effect: StudioSceneEffect; readonly size?: number }) {
  return effect === 'opening' ? <OpeningEffectMark size={size} /> : <VisualEffectMark size={size} />;
}
