import { useEffect, useState } from 'react';
import { activeSegmentIndex, type TimedSegment } from './transcript-karaoke';

/**
 * LE SEGMENT PRONONCÉ, À LA CADENCE DE L'IMAGE (#7911).
 *
 * `useMediaPlayback.position` est ARRONDIE À LA SECONDE — le bon pas pour
 * l'onde et le rapport de consommation, pas pour un karaoké : une voix dit
 * deux à trois mots par seconde, et un surlignage qui avance par sauts d'une
 * seconde en saute la moitié. Ce hook lit `currentTime` à chaque image, mais
 * ne re-rend que quand l'INDEX change — `setState` sur une valeur identique
 * est ignoré (dimension 4, « Zero Unnecessary Re-render »).
 *
 * À l'arrêt, `null` : le texte redevient uniforme (miroir iOS,
 * `activeSegmentIndex` rend `nil` quand rien ne joue).
 */
export function useKaraokeIndex(
  element: HTMLMediaElement | null,
  segments: readonly TimedSegment[] | undefined,
  playing: boolean,
): number | null {
  const [index, setIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!playing || element === null || segments === undefined) {
      setIndex(null);
      return;
    }
    let frame = 0;
    const tick = (): void => {
      setIndex(activeSegmentIndex(segments, element.currentTime));
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [element, segments, playing]);

  return index;
}
