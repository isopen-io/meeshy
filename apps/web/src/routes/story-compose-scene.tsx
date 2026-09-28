import { lazy, Suspense, type ComponentProps, type RefObject } from 'react';

import { GlyphSvg } from '@/components/glyph';
import { MEDIA_TRANSPORT_GLYPHS } from '@/components/glyphs-media-transport';
import type { SceneClockHandle } from '@/components/scene-clock';
import { backgroundCss } from '@/lib/canvas/background';
import type { SceneCarrier } from '@/lib/canvas/carrier';
import type { CanvasDocument } from '@/lib/canvas/document';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { keyboardPose } from '@/lib/stories/studio-grip';
import { STORY_PLAIN_BACKGROUND } from '@/lib/stories/story-document';
import { StudioStageGestures, type StudioStageObject } from '@/routes/story-compose-stage';
import { StudioTextInput } from '@/routes/story-compose-text-input';

const ScenePlayer = lazy(() => import('@/components/scene-player'));

/**
 * **LA SCÈNE DU STUDIO** — la carte 9:16 et tout ce qui s'y TOUCHE : l'aperçu
 * par le moteur partagé, le son de fond, la saisie du texte, le calque des
 * gestes et la voie du clavier. Extraite de `story-compose.tsx` (#8515,
 * budget de taille) : l'écran décide, la scène peint et remonte les gestes.
 *
 * LE PLATEAU EN LECTURE SEULE PENDANT L'ENVOI (#7707) — le plan publié lit le
 * brouillon tel qu'il était au premier clic sur Publier : un geste après coup
 * ne changerait plus rien à ce qui part (`StoryViewModel+Publication.swift:549`).
 */
export function StudioScene({
  lang,
  stageRef,
  pageId,
  locked,
  preview,
  sound,
  timeline,
  writing,
  objects,
}: {
  readonly lang: InterfaceLanguage;
  readonly stageRef: RefObject<HTMLDivElement | null>;
  readonly pageId: string;
  readonly locked: boolean;
  readonly preview: {
    readonly document: CanvasDocument | null;
    readonly carrier: SceneCarrier;
    readonly preferredLanguages: readonly string[];
    readonly onContentReady: () => void;
    readonly onClock: (clock: SceneClockHandle | null) => void;
  };
  readonly sound: {
    readonly src: string | null;
    readonly muted: boolean;
    readonly audioRef: RefObject<HTMLAudioElement | null>;
    readonly onToggle: () => void;
  };
  /** La frise ouverte : la scène se règle dans le TEMPS — ni saisie ni geste. */
  readonly timeline: { readonly open: boolean; readonly playing: boolean; readonly onEnded: () => void };
  /** La saisie — `null` quand la scène n'invite à écrire aucun texte. */
  readonly writing: ComponentProps<typeof StudioTextInput> | null;
  readonly objects: {
    readonly items: readonly StudioStageObject[];
    readonly nameOf: (id: string) => string;
  } & Omit<ComponentProps<typeof StudioStageGestures>, 'stageRef' | 'objects' | 'locked'>;
}) {
  return (
    <div className="absolute inset-0 grid place-items-center px-2.5 py-0.5" style={{ containerType: 'size' }}>
      <div
        data-scene-stage
        data-story-studio-current-page={pageId}
        ref={stageRef}
        role="group"
        aria-label={translate(lang, 'story.studio.stage')}
        className="relative overflow-hidden"
        style={{
          width: 'min(100cqw, 100cqh * 9 / 16)',
          height: 'min(100cqh, 100cqw * 16 / 9)',
          containerType: 'inline-size',
          borderRadius: 22,
          backgroundColor: backgroundCss(STORY_PLAIN_BACKGROUND, 'var(--color-ios-card)'),
        }}
        inert={locked}
      >
        {preview.document !== null ? (
          <Suspense fallback={null}>
            <ScenePlayer
              document={preview.document}
              sceneIndex={0}
              mode="preview"
              playing
              carrier={preview.carrier}
              preferredLanguages={preview.preferredLanguages}
              muted={sound.muted}
              onContentReady={preview.onContentReady}
              // L'horloge est remise DÈS le montage, frise fermée : le moteur ne
              // la rappelle qu'à son changement, et une frise ouverte après
              // coup n'aurait jamais reçu la sienne (tête immobile).
              onClock={preview.onClock}
              // LA FRISE (maquette) : lecture en BOUCLE, objets hors de leur
              // fenêtre CACHÉS en lecture et en FANTÔME (.25) à l'arrêt ;
              // frise fermée, la scène se règle dans l'espace : tout se voit.
              {...(timeline.open && timeline.playing ? {} : { ghostOutsideWindow: timeline.open ? 0.25 : 1 })}
              {...(timeline.open ? { playing: timeline.playing, onEnded: timeline.onEnded } : {})}
            />
          </Suspense>
        ) : null}
        {sound.src !== null && sound.src !== '' ? (
          <>
            {/* eslint-disable-next-line jsx-a11y/media-has-caption -- son de fond décoratif, aucun sous-titre à porter ici (P1) */}
            <audio ref={sound.audioRef} data-story-studio-sound src={sound.src} loop muted={sound.muted} />
            <button
              type="button"
              data-story-studio-sound-toggle
              aria-label={translate(lang, sound.muted ? 'story.studio.sound.unmute' : 'story.studio.sound.mute')}
              aria-pressed={!sound.muted}
              onClick={sound.onToggle}
              className="absolute start-2 bottom-2 grid place-items-center rounded-full"
              style={{ width: 44, height: 44, backgroundColor: 'rgba(0,0,0,0.45)', color: 'white', zIndex: 3 }}
            >
              <GlyphSvg glyph={sound.muted ? MEDIA_TRANSPORT_GLYPHS.speakerSlash : MEDIA_TRANSPORT_GLYPHS.speakerHigh} size={20} />
            </button>
          </>
        ) : null}
        {timeline.open || writing === null ? null : <StudioTextInput {...writing} />}
        {/* LA SÉLECTION SILENCIEUSE (lot 6) — toucher sélectionne sans
            entourer, glisser déplace, deux doigts pincent et tournent, appui
            long ouvre le menu, double-tap ouvre l'édition, toucher l'invite
            écrit (#8515). Frise ouverte, la scène se règle dans le temps. */}
        {timeline.open ? null : (
          <>
            <StudioStageGestures
              stageRef={stageRef}
              objects={objects.items}
              locked={locked}
              onSelect={objects.onSelect}
              onEdit={objects.onEdit}
              onCommit={objects.onCommit}
              onMenu={objects.onMenu}
              onWrite={objects.onWrite}
            />
            {/* La voie du CLAVIER et du lecteur d'écran : un bouton par objet. */}
            {objects.items.map((object) => (
              <button
                key={object.id}
                type="button"
                className="sr-only"
                data-story-object-edit={object.id}
                onClick={() => objects.onEdit(object.id)}
                // Tout ce que le doigt fait, le clavier le fait : flèches,
                // `+`/`−` et `[`/`]` déplacent, agrandissent et tournent.
                onKeyDown={(event) => {
                  const next = keyboardPose(object.pose, event.key, event.shiftKey);
                  if (next === null) return;
                  event.preventDefault();
                  objects.onCommit(object.id, next);
                }}
              >
                {translate(lang, 'story.studio.objects.edit', { name: objects.nameOf(object.id) })}
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
