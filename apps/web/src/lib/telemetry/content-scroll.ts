import { useEffect, useRef } from 'react';

import type { EventSurface, EventTargetRef, ScrollContentKind } from '@/lib/api/social-events-v2-types';
import { readingTelemetry } from '@/lib/view/reading-telemetry';

import { createContentScrollAccumulator } from './content-accumulator';

/**
 * **LE DÉFILEMENT DANS UN CONTENU** (#10509) — un `scroll/content` par
 * contenu et par ouverture (carrousel, texte long, commentaires) : émis au
 * démontage s'il s'est passé quelque chose. Les notes vont dans un
 * accumulateur tenu par référence : aucun re-rendu.
 */
export type ContentScrollProbe = {
  readonly noteIndex: (index: number) => void;
  readonly noteFraction: (scrollFraction: number, readThroughFraction: number) => void;
};

export function useContentScrollTelemetry(params: {
  readonly target: EventTargetRef | null;
  readonly contentKind: ScrollContentKind;
  readonly itemsTotal: number;
  readonly surface?: EventSurface;
  readonly now?: () => number;
}): ContentScrollProbe {
  const { target, contentKind, itemsTotal, surface } = params;
  const now = useRef(params.now ?? (() => performance.now()));
  const accumulator = useRef<ReturnType<typeof createContentScrollAccumulator> | null>(null);
  const kind = target?.kind;
  const id = target?.id;
  const parentKind = target?.parent?.kind;
  const parentId = target?.parent?.id;

  useEffect(() => {
    if (kind === undefined || id === undefined) return undefined;
    const current = createContentScrollAccumulator({ contentKind, itemsTotal, startedAt: now.current() });
    accumulator.current = current;
    return () => {
      accumulator.current = null;
      if (!current.hasActivity()) return;
      readingTelemetry.recordV2({
        type: 'scroll',
        action: 'content',
        target: { kind, id, ...(parentKind === undefined || parentId === undefined ? {} : { parent: { kind: parentKind, id: parentId } }) },
        ...(surface === undefined ? {} : { surface }),
        ...current.summary(now.current()),
      });
    };
  }, [kind, id, parentKind, parentId, contentKind, itemsTotal, surface]);

  const probe = useRef<ContentScrollProbe>({
    noteIndex: (index) => accumulator.current?.noteIndex(index),
    noteFraction: (scrollFraction, readThrough) => accumulator.current?.noteFraction(scrollFraction, readThrough),
  });
  return probe.current;
}
