import { useEffect, useMemo, useRef, useState } from 'react';

import type { ProtectedMediaDeps } from '@/lib/api/protected-media';
import { useProtectedMediaSrc } from '@/lib/api/use-protected-media';
import { electBackgroundTrack } from '@/lib/canvas/background-sound';
import type { SceneCarrier } from '@/lib/canvas/carrier';
import type { CanvasDocument } from '@/lib/canvas/document';

/** L'aperçu adresse ses médias par `mediaURL` : le porteur est VIDE et
 * CONSTANT (même valeur que `PREVIEW_CARRIER` de `story-compose.tsx`). */
const SOUND_CARRIER: SceneCarrier = { postId: 'story-studio-preview', media: [] };

/**
 * **LE SON DE FOND DE L'APERÇU DU STUDIO** — extrait de `story-compose.tsx`
 * (#8415, budget de taille) sans changement de comportement.
 */
export function useStudioBackgroundSound(previewDocument: CanvasDocument | null, media: ProtectedMediaDeps) {
  /** LE SON DE FOND S'ÉCOUTE (défaut 6, revue-correction #6900) — la MÊME
   * élection que le lecteur (`electBackgroundTrack`), sur l'URL locale :
   * `ScenePlayer` ne joue AUCUN objet `audio` — c'est aux HÔTES de jouer le
   * son, comme `StorySceneLayer` le fait déjà pour la lecture. Un son POSÉ
   * n'est pas élu : il ne s'écoute pas ici, et c'est cohérent avec ce que le
   * lecteur en fera. */
  const backgroundTrack = useMemo(
    () => (previewDocument === null ? null : electBackgroundTrack({ document: previewDocument, sceneIndex: 0, carrier: SOUND_CARRIER })),
    [previewDocument],
  );
  /**
   * #7015, revue-correction — **LE TROISIÈME `<audio>` DE LA MÊME SOURCE.**
   *
   * L'aperçu élit sa piste avec `electBackgroundTrack`, exactement comme le
   * lecteur de story et celui des Réels, et posait sa `src` TELLE QUELLE. Une
   * piste EMPRUNTÉE est servie par `GET static.byFilename`, une route
   * AUTHENTIFIÉE : la balise part sans en-tête et rend `401`. La
   * bibliothèque n'est pas encore branchée à cet écran (`background-sound.ts`
   * : « `library` reste HORS PÉRIMÈTRE »), donc rien ne l'atteint AUJOURD'HUI
   * — c'est précisément pourquoi le site unique se branche maintenant, avant
   * qu'un emprunt ne rouvre le défaut. Sur un `blob:` ou une pièce jointe
   * ordinaire, le hook rend la source INCHANGÉE et SYNCHRONEMENT : rien ne
   * change pour le chemin nominal.
   */
  const { src: soundSrc } = useProtectedMediaSrc(backgroundTrack?.src ?? '', media);
  const [soundMuted, setSoundMuted] = useState(true);
  const soundAudioRef = useRef<HTMLAudioElement | null>(null);
  // La dépendance est la source RÉSOLUE, jamais celle qu'on a demandée : une
  // piste protégée n'est montée qu'APRÈS sa résolution, et un effet calé sur
  // `track.src` ne se rejouerait pas — il aurait tourné une fois, sur un `ref`
  // nul, et la piste ne démarrerait jamais.
  useEffect(() => {
    const el = soundAudioRef.current;
    if (el === null || backgroundTrack === null) return;
    el.volume = backgroundTrack.volume;
    void el.play().catch(() => {
      // La politique de lecture automatique refuse le son NON coupé : le
      // bouton — un vrai geste utilisateur — reste la seule voie, jamais un
      // second essai silencieux qui masquerait le refus.
    });
  }, [soundSrc]);

  return { soundSrc, soundMuted, setSoundMuted, soundAudioRef };
}
