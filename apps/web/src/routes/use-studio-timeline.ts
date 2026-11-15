import { useState } from 'react';

import type { SceneClockHandle } from '@/components/scene-clock';

/**
 * **LE MODE ANIMÉ, CÔTÉ ÉCRAN** (#8415, #8516) — miroir
 * `MeeshyComposerHost+Animated.swift`. DEUX gestes, deux questions :
 *  - la pastille **Animé** (`toggleAnimated`) change la NATURE du document :
 *    l'allumer ANIME la scène (`animate` : sa durée, une fenêtre par objet — un
 *    pas d'historique), ouvre la frise et la lance, tête à zéro ; l'éteindre la
 *    rend STATIQUE (`makeStatic` : durée et fenêtres effacées) et range la frise ;
 *  - la tuile **Temps** (`toggleTime`) montre ou range la frise d'une scène qui
 *    RESTE animée.
 *
 * « Animée » se LIT dans le document (`animated`), jamais dans la frise : une
 * page statique n'a pas de frise ouverte, même si l'auteur l'avait laissée
 * ouverte sur une autre page.
 */
export function useStudioTimeline({
  animated,
  duration,
  animate,
  makeStatic,
  closePanels,
}: {
  readonly animated: boolean;
  readonly duration: number;
  readonly animate: () => void;
  readonly makeStatic: () => void;
  readonly closePanels: () => void;
}) {
  const [friseOpen, setFriseOpen] = useState(false);
  const [timelinePlaying, setTimelinePlaying] = useState(false);
  const [clock, setClock] = useState<SceneClockHandle | null>(null);
  const timelineOpen = animated && friseOpen;

  const openFrise = () => {
    closePanels();
    setFriseOpen(true);
  };

  const closeFrise = () => {
    setFriseOpen(false);
    setTimelinePlaying(false);
  };

  const toggleAnimated = () => {
    if (animated) {
      makeStatic();
      closeFrise();
      return;
    }
    animate();
    openFrise();
    clock?.seek(0);
    setTimelinePlaying(true);
  };

  const toggleTime = () => (timelineOpen ? closeFrise() : openFrise());

  /** Relancer une scène arrivée au bout la reprend au début. */
  const playPause = () => {
    if (!timelinePlaying && clock !== null && clock.now() >= duration - 0.05) clock.seek(0);
    setTimelinePlaying((current) => !current);
  };

  return { timelineOpen, timelinePlaying, clock, setClock, setTimelinePlaying, toggleAnimated, toggleTime, playPause };
}
