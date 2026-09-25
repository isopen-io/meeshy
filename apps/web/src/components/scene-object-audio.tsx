import { useEffect, useRef } from 'react';

import { protectedMediaDeps, type ProtectedMediaDeps } from '@/lib/api/protected-media';
import { useProtectedMediaSrc } from '@/lib/api/use-protected-media';
import { objectMediaSrc, type SceneCarrier } from '@/lib/canvas/carrier';
import type { CanvasObject } from '@/lib/canvas/document';

import type { SceneClockHandle } from './scene-clock';
import { useMediaSeek } from './scene-media-seek';
import { SceneObjectFrame } from './scene-object-frame';

const isAutoplayRefusal = (error: unknown): boolean => error instanceof Error && error.name === 'NotAllowedError';

/** Les dépendances de PRODUCTION du transport protégé — nommées pour qu'un
 * témoin puisse prouver que la couche est BRANCHÉE dessus, même motif que
 * `BackgroundTrackAudio.defaultMediaDeps`. */
export const defaultAudioMediaDeps = protectedMediaDeps;

/**
 * Un AUDIO **non-fond**. Le son de FOND (`payload.isBackground === true`) est
 * servi par l'hôte, qui l'élit avec `electBackgroundTrack`
 * (`lib/canvas/background-sound.ts`, consommé par `story-scene-layer.tsx` et
 * `story-compose.tsx`) : ce composant ne le double JAMAIS, et c'est
 * `SceneCanvas` (`scene-player.tsx`) qui l'écarte de la liste des couches —
 * filtre POSÉ à la revue-correction #6901, où ce commentaire l'affirmait déjà
 * sans qu'il existe (T-E12 : la même piste partait deux fois, en écho).
 * Suit `playing` et le muet du mode — même garde `NotAllowedError` que la
 * vidéo de fond (T-E11).
 */
export function SceneObjectAudio({
  object,
  carrier,
  playing,
  muted,
  clock,
  seekClock = null,
  onPlaybackBlocked,
  mediaDeps = defaultAudioMediaDeps,
}: {
  readonly object: CanvasObject;
  readonly carrier: SceneCarrier;
  readonly playing: boolean;
  readonly muted: boolean;
  readonly clock: SceneClockHandle | null;
  /** L'horloge du parcours au doigt (#7879) — le son s'y recale à chaque `seek`. */
  readonly seekClock?: SceneClockHandle | null;
  readonly onPlaybackBlocked: (() => void) | undefined;
  /** Injectable pour les témoins UNIQUEMENT — la production prend
   * `defaultAudioMediaDeps`, dont l'identité est gardée par un témoin. */
  readonly mediaDeps?: ProtectedMediaDeps;
}) {
  /**
   * #7015, revue-correction — **UN SON POSÉ PEUT ÊTRE EMPRUNTÉ, LUI AUSSI.**
   *
   * `objectMediaSrc` résout `payload.mediaURL` par `attachmentSrc` — la MÊME
   * voie que l'élection du fond, donc la MÊME URL `/api/v1/static/…` pour une
   * piste de bibliothèque. Seul `isBackground` sépare les deux couches, et
   * c'est un rôle de MIXAGE que n'importe quel son porte ou non
   * (`ComposerHostRules.swift` : « le CRÉDIT : `soundId` ; le rôle de
   * MIXAGE : `isBackground`, n'importe quel son ») : une piste empruntée
   * posée en AVANT-PLAN arrive ici, et la balise n'enverrait aucun en-tête.
   *
   * `useProtectedMediaSrc` rend la source INCHANGÉE et SYNCHRONEMENT pour
   * tout le reste — une pièce jointe ordinaire ne paie rien. `null` ⇒ aucune
   * balise, la même dégradation dessinée que le fond.
   */
  const posee = objectMediaSrc(object, carrier);
  const { src } = useProtectedMediaSrc(posee ?? '', mediaDeps);
  const ref = useRef<HTMLAudioElement | null>(null);
  const loop = object.payload.loop === true;
  useMediaSeek({ ref, clock: seekClock, loop });

  // TOUS LES HOOKS AVANT LE RETOUR ANTICIPÉ (revue-correction #6901) : `src`
  // dépend du PORTEUR (`carrier.media`), qui change quand le fil se
  // rafraîchit — un `useEffect` posé APRÈS le `return null` change le NOMBRE
  // de hooks d'un rendu à l'autre. Sous React (`bun run build:react`) c'est
  // une exception (« Rendered fewer hooks than expected »), sous Preact un
  // effet qui ne se rejoue ni ne se nettoie plus. Aucun lint ne le garde ici :
  // web-v2 n'a pas de configuration eslint.
  useEffect(() => {
    const el = ref.current;
    if (el === null) return;
    if (!playing) {
      el.pause();
      return;
    }
    void el.play().catch((error: unknown) => {
      if (!el.muted && isAutoplayRefusal(error)) onPlaybackBlocked?.();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, muted, src]);

  // `null` — la piste PROTÉGÉE que la passerelle refuse, qui a disparu, que la
  // modération a coupée, ou que le réseau n'a pas rendue ; `''` — l'objet qui
  // n'adresse aucun fichier. Les deux se rendent pareil : AUCUNE balise. Une
  // balise sans source jouable est pire que pas de balise (elle réclame le
  // réseau et n'émet rien).
  if (src === null || src === '') return null;

  return (
    <SceneObjectFrame object={object} kind="audio" clock={clock}>
      <audio ref={ref} src={src} muted={muted} loop={loop} preload="none" />
    </SceneObjectFrame>
  );
}
