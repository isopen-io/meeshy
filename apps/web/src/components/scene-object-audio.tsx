import { useRef } from 'react';

import { protectedMediaDeps, type ProtectedMediaDeps } from '@/lib/api/protected-media';
import { useProtectedMediaSrc } from '@/lib/api/use-protected-media';
import { objectMediaSrc, type SceneCarrier } from '@/lib/canvas/carrier';
import { sceneAudioChipForm, type CanvasObject } from '@/lib/canvas/document';
import { objectMediaTimeline } from '@/lib/canvas/media-seek';
import { cqw } from '@/lib/canvas/units';

import { GlyphSvg } from './glyph';
import { FEED_GLYPHS } from './glyphs-feed';
import type { SceneClockHandle } from './scene-clock';
import { useSceneMediaSync } from './scene-media-seek';
import { SceneObjectFrame } from './scene-object-frame';

const isAutoplayRefusal = (error: unknown): boolean => error instanceof Error && error.name === 'NotAllowedError';

/** Les dépendances de PRODUCTION du transport protégé — nommées pour qu'un
 * témoin puisse prouver que la couche est BRANCHÉE dessus, même motif que
 * `BackgroundTrackAudio.defaultMediaDeps`. */
export const defaultAudioMediaDeps = protectedMediaDeps;

/**
 * Un AUDIO **non-fond** : sa piste, et sa PASTILLE sur la scène (#9737).
 * Le son de FOND (`payload.isBackground === true`) est
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
   * voie que l'élection du fond, donc la MÊME URL `static.byFilename` pour une
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

  // TOUS LES HOOKS AVANT LE RETOUR ANTICIPÉ (revue-correction #6901) : `src`
  // dépend du PORTEUR (`carrier.media`), qui change quand le fil se
  // rafraîchit — un `useEffect` posé APRÈS le `return null` change le NOMBRE
  // de hooks d'un rendu à l'autre. Sous React (`bun run build:react`) c'est
  // une exception (« Rendered fewer hooks than expected »), sous Preact un
  // effet qui ne se rejoue ni ne se nettoie plus. Aucun lint ne le garde ici :
  // web-v2 n'a pas de configuration eslint.
  // LE SON POSÉ SUIT LA TIMELINE DE LA SCÈNE (#7879) : sa fenêtre, sa coupe,
  // sa boucle — la même loi que les vidéos, en lecture comme au seek.
  useSceneMediaSync({
    ref,
    clock: seekClock,
    timeline: objectMediaTimeline(object),
    playing,
    restartKeys: [muted, src],
    onPlayRefused: (error, el) => {
      if (!el.muted && isAutoplayRefusal(error)) onPlaybackBlocked?.();
    },
  });

  // `null` — la piste PROTÉGÉE que la passerelle refuse, qui a disparu, que la
  // modération a coupée, ou que le réseau n'a pas rendue ; `''` — l'objet qui
  // n'adresse aucun fichier. Les deux se rendent pareil : AUCUNE balise. Une
  // balise sans source jouable est pire que pas de balise (elle réclame le
  // réseau et n'émet rien).
  if (src === null || src === '') return null;

  return (
    <SceneObjectFrame object={object} kind="audio" clock={clock}>
      <audio ref={ref} src={src} muted={muted} loop={loop} preload="none" />
      <SceneAudioChip object={object} />
    </SceneObjectFrame>
  );
}

/** Le référentiel de design : 1080 de large (`cqw`, `lib/canvas/units.ts`). */
const CHIP = { height: 84, padding: 28, gap: 14, font: 34, bar: 5, barGap: 5, maxBars: 24, wave: 96 } as const;
const design = (value: number): string => cqw(value / 1080);

/** Au plus `maxBars` barres, prises à pas régulier sur les échantillons gravés. */
function chipBars(samples: readonly number[]): readonly number[] {
  if (samples.length <= CHIP.maxBars) return samples;
  return Array.from({ length: CHIP.maxBars }, (_, i) => samples[Math.round((i * (samples.length - 1)) / (CHIP.maxBars - 1))] ?? 0);
}

/**
 * LA PASTILLE D'UN SON DE PREMIER PLAN (#9737, miroir `AudioForegroundChip`) —
 * sur la scène, à la place, l'échelle et la rotation de l'objet (le cadre les
 * pose), dans la forme de sa provenance (`sceneAudioChipForm`) : la note et
 * l'onde d'un enregistrement, la note et « titre · @auteur » d'un emprunt.
 * Immobile : aucune image n'est recalculée pendant la lecture. Un son de FOND
 * n'arrive jamais ici (`SceneCanvas` l'écarte, `sceneAudioPresence`).
 */
function SceneAudioChip({ object }: { readonly object: CanvasObject }) {
  const form = sceneAudioChipForm(object);
  const bars = form.kind === 'recording' ? chipBars(form.samples) : [];
  return (
    <span
      data-scene-audio-chip={form.kind}
      {...(form.kind === 'recording' ? { 'aria-hidden': 'true' as const } : {})}
      className="flex items-center whitespace-nowrap"
      style={{
        height: design(CHIP.height),
        gap: design(CHIP.gap),
        padding: `0 ${design(CHIP.padding)}`,
        borderRadius: 9999,
        fontSize: design(CHIP.font),
        lineHeight: 1,
        fontWeight: 600,
        backgroundColor: 'var(--color-scrim)',
        color: 'var(--color-on-media)',
      }}
    >
      <span data-scene-audio-note="" aria-hidden="true" className="inline-grid shrink-0">
        <GlyphSvg glyph={FEED_GLYPHS.musicNote} style={{ width: '1.1em', height: '1.1em' }} />
      </span>
      {form.kind === 'borrowed' ? (
        form.label
      ) : bars.length > 0 ? (
        <span aria-hidden="true" className="flex items-center" style={{ gap: design(CHIP.barGap), height: '55%' }}>
          {bars.map((level, i) => (
            <span
              key={i}
              data-scene-audio-bar=""
              style={{ width: design(CHIP.bar), height: `${Math.round(Math.min(1, Math.max(0.12, level)) * 100)}%`, borderRadius: 9999, backgroundColor: 'currentColor' }}
            />
          ))}
        </span>
      ) : (
        <svg data-scene-audio-wave="" aria-hidden="true" viewBox="0 0 22 10" fill="none" style={{ width: design(CHIP.wave), height: '45%' }}>
          <path d="M1 5 Q3.5 0 6 5 T11 5 T16 5 T21 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      )}
    </span>
  );
}
