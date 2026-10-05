import { STUDIO_SNAP_TARGETS, type SnapEngaged } from '@/lib/stories/studio-snap';

/**
 * **LES LIMITES ET LES LIGNES MAGNÉTIQUES, PENDANT UN GESTE** (#8413, miroir
 * `StoryCanvasUIView+Limits.swift`). La scène se pose sur un sol peint de son
 * propre thumbhash : son bord ne se voit plus, et un objet poussé au-delà se
 * coupe sans que rien ne l'annonce. Pendant un déplacement ou un pincement,
 * le plateau trace donc le CONTOUR de la scène (là où le contenu se coupe) et
 * les lignes sur lesquelles l'objet s'accroche (`STUDIO_SNAP_TARGETS`, les
 * deux axes) ; la ligne ENGAGÉE se détache. Au repos, rien ne se peint.
 *
 * Inerte (`pointer-events: none`) : il MONTRE, il ne capture rien.
 */
export function StudioManipulationLimits({ engaged }: { readonly engaged: SnapEngaged }) {
  const line = (axis: 'x' | 'y', target: number) => {
    const on = engaged[axis] === target;
    const position = `${target * 100}%`;
    return (
      <span
        key={`${axis}:${target}`}
        data-story-snap-line={axis}
        data-story-snap-target={target}
        {...(on ? { 'data-story-snap-engaged': '' } : {})}
        className="absolute block"
        style={
          axis === 'x'
            ? { left: position, top: 0, bottom: 0, width: 0, borderInlineStart: on ? '1.5px solid #F472B6' : '1px dashed rgba(255,255,255,0.35)' }
            : { top: position, left: 0, right: 0, height: 0, borderTop: on ? '1.5px solid #F472B6' : '1px dashed rgba(255,255,255,0.35)' }
        }
      />
    );
  };
  return (
    <span aria-hidden="true" data-story-studio-limits className="pointer-events-none absolute inset-0 z-[4] block">
      {STUDIO_SNAP_TARGETS.map((target) => line('x', target))}
      {STUDIO_SNAP_TARGETS.map((target) => line('y', target))}
      <span
        data-story-studio-contour
        className="absolute inset-0 block"
        style={{ border: '2px solid rgba(255,255,255,0.9)', borderRadius: 'inherit' }}
      />
    </span>
  );
}
