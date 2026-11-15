import { useEffect, useRef } from 'react';

import { newEngagementSessionId } from '@/lib/api/social-events';
import type { EventSurface, EventTargetRef, PlaybackExitReason } from '@/lib/api/social-events-v2-types';
import { currentDeviceTier } from '@/lib/device/capability-tier';
import { readingTelemetry } from '@/lib/view/reading-telemetry';

import { pageVitals, playbackPageProbe } from './page-vitals';
import { bindPlaybackQoe } from './playback-qoe';

/**
 * **UNE SÉANCE DE LECTURE D'UN MÉDIA À L'ÉCRAN** (#10504) — ouverte quand le
 * média devient le média ACTIF, close quand il cesse de l'être (glissement),
 * quand l'écran se démonte (fermeture) ou quand la page part en arrière-plan.
 * Un seul `playback/session` par séance, jamais pendant la lecture.
 */
export function usePlaybackTelemetry(params: {
  readonly element: HTMLMediaElement | null;
  readonly active: boolean;
  readonly target: EventTargetRef;
  readonly mediaId: string;
  readonly surface: EventSurface;
}): void {
  const { element, active, mediaId, surface } = params;
  const kind = params.target.kind;
  const id = params.target.id;
  const unmounting = useRef(false);

  /* DÉCLARÉ EN PREMIER : au démontage, son nettoyage passe avant celui de la
     séance — qui sait alors que l'écran se ferme ; sans démontage, la séance
     close parce que le média a cessé d'être actif (glissement). */
  useEffect(() => {
    unmounting.current = false;
    return () => {
      unmounting.current = true;
    };
  }, []);

  useEffect(() => {
    if (element === null || !active) return undefined;
    const session = bindPlaybackQoe(element, {
      playbackId: newEngagementSessionId(),
      mediaId,
      now: () => performance.now(),
      probe: playbackPageProbe({ vitals: pageVitals(), tier: currentDeviceTier }),
      onSummary: (summary) => {
        readingTelemetry.recordV2({ type: 'playback', action: 'session', target: { kind, id }, surface, ...summary });
      },
    });
    const background = (): void => {
      if (document.visibilityState === 'hidden') session.finish('backgrounded');
    };
    const pagehide = (): void => session.finish('backgrounded');
    document.addEventListener('visibilitychange', background);
    window.addEventListener('pagehide', pagehide);
    return () => {
      document.removeEventListener('visibilitychange', background);
      window.removeEventListener('pagehide', pagehide);
      const reason: PlaybackExitReason = unmounting.current ? 'closed' : 'swiped';
      session.finish(reason);
    };
  }, [element, active, kind, id, mediaId, surface]);
}
