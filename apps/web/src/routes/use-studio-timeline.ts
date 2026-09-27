import { useState } from 'react';

import type { SceneClockHandle } from '@/components/scene-clock';

/**
 * **LE MODE ANIMÉ, CÔTÉ ÉCRAN** (#8415) — la frise ouverte, sa lecture, et
 * l'horloge du moteur de l'aperçu qu'elle pilote. Frise ouverte, la scène se
 * règle dans le TEMPS : l'hôte retire rails, volets et poignées (aucun conflit
 * d'écriture), comme iOS ; la refermer rend tout, et les pistes restent.
 *
 * OUVRIR Animé ANIME la scène (`animate` : sa durée, une fenêtre par objet —
 * un pas d'historique) et la lance.
 */
export function useStudioTimeline({
  duration,
  animate,
  closePanels,
}: {
  readonly duration: number;
  readonly animate: () => void;
  readonly closePanels: () => void;
}) {
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [timelinePlaying, setTimelinePlaying] = useState(false);
  const [clock, setClock] = useState<SceneClockHandle | null>(null);

  const toggleAnimated = () => {
    if (timelineOpen) {
      setTimelineOpen(false);
      setTimelinePlaying(false);
      return;
    }
    animate();
    closePanels();
    setTimelineOpen(true);
    setTimelinePlaying(true);
  };

  /** Relancer une scène arrivée au bout la reprend au début. */
  const playPause = () => {
    if (!timelinePlaying && clock !== null && clock.now() >= duration - 0.05) clock.seek(0);
    setTimelinePlaying((current) => !current);
  };

  return { timelineOpen, timelinePlaying, clock, setClock, setTimelinePlaying, toggleAnimated, playPause };
}
