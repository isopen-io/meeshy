import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { attachmentSrc } from '@/lib/api/media-url';
import type { Attachment } from '@/lib/api/types';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { useMediaLoadFailure } from '@/lib/media/media-failure';
import { showsPausedBadge, type StagePresentation } from '@/lib/view/media-stage';
import { infoDuration, lateralSeek } from '@/lib/view/media-transport';
import { useEffacingControl } from '@/lib/view/use-effacing-control';
import { useMediaPlayback } from '@/lib/view/use-media-playback';
import { takeVideoHandoff } from '@/lib/view/video-handoff';

import { Glyph, GlyphSvg } from './glyph';
import { MEDIA_GLYPHS } from './glyphs-media';
import { MediaUnavailable } from './media-unavailable';
import { ViewerInfoLine } from './viewer-info-line';

/**
 * LA BARRE DE LECTURE EST UN CHUNK À PART (#6359) — elle ne sert qu'une
 * visionneuse ouverte sur une VIDÉO. Une visionneuse de photos, le cas
 * majoritaire, ne paie ni ses octets ni sa feuille (`budgets.json ›
 * on_demand_chunks.media_transport`). Le chunk se charge quand la page vidéo
 * active monte ses portails ; il porte la piste ET les deux contrôles du rail
 * (#9577), un seul téléchargement pour les deux.
 */
const MediaTransport = lazy(() => import('./media-transport').then((module) => ({ default: module.MediaTransport })));
const VideoRailControls = lazy(() => import('./media-transport').then((module) => ({ default: module.VideoRailControls })));

/** Où la page vidéo ACTIVE pose ce qui lui appartient hors de la scène — trois places que la visionneuse lui remet. */
export type ViewerVideoSlots = {
  /** La barre de progression, sur toute la largeur, sous la scène. */
  readonly transport: HTMLElement | null;
  /** Le muet et « ⋯ », dans la colonne d'actions, sous « Composer ». */
  readonly rail: HTMLElement | null;
  /** La ligne d'informations « cotes · poids · durée ». */
  readonly info: HTMLElement | null;
};

/**
 * Un portail rend HORS de la scène, mais ses événements React remontent
 * l'arbre des COMPOSANTS jusqu'à elle : un clic y basculerait le plateau en
 * plein cadre (le chrome disparaîtrait sous le doigt qui règle le son), un
 * appui y armerait l'appui long, et Espace y déclencherait le raccourci
 * lecture/pause au lieu d'activer le bouton. Ces contrôles ne parlent qu'à la
 * vidéo.
 */
function OffStage({ children }: { readonly children: ReactNode }) {
  const stop = (event: { stopPropagation: () => void }): void => event.stopPropagation();
  return (
    <div
      className="contents"
      onClick={stop}
      onPointerDown={stop}
      onPointerMove={stop}
      onPointerUp={stop}
      onKeyDown={(event) => {
        if (event.key === ' ' || event.key === 'Enter') event.stopPropagation();
      }}
    >
      {children}
    </div>
  );
}

/**
 * LA PAGE VIDÉO (#6221, #6359, #9577) — le média et le play/pause AU CENTRE ;
 * hors de la scène, par portails : la barre de progression (toute la largeur),
 * le muet et « ⋯ » (colonne d'actions) et la ligne d'informations, dont la
 * durée décompte pendant la lecture. Seule la page ACTIVE les monte — une
 * page voisine préchargée n'a rien à parcourir ni à commander.
 *
 * LA PAUSE S'EFFACE (#9577) une seconde après le début de la lecture : elle
 * ne cache plus ce qu'on regarde. Un toucher sur la scène la ramène et réarme
 * la seconde ; un toucher sur le bouton VISIBLE met en pause ; en pause, il
 * reste affiché. Effacé, le bouton reste dans le document, nommé et
 * focalisable : y arriver au clavier le ramène, et un lecteur d'écran
 * l'active sans le voir.
 *
 * DOUBLE TAP LATÉRAL (#6369, miroir `MediaStageSeek` du SDK) — un double tap
 * sur le tiers gauche de la scène recule de 10 s, sur le tiers droit avance
 * de 10 s. `lateralSeek` rend `null` au CENTRE (le tap simple y garde son
 * effet immédiat, comme sur une page voisine) et sur un média SANS DURÉE
 * (aucune collision possible avec le double tap de ZOOM d'une image, qui n'a
 * pas de durée) : rien d'autre à coordonner entre les deux gestes.
 */
export function ViewerVideoPage({
  attachment,
  isActive,
  presentation,
  onToggleRef,
  slots,
  showsFacts,
  language,
}: {
  readonly attachment: Attachment;
  readonly isActive: boolean;
  readonly presentation: StagePresentation;
  readonly onToggleRef: (toggle: (() => void) | null) => void;
  readonly slots: ViewerVideoSlots;
  /** Les cotes et le poids de la ligne d'informations — avec un porteur seulement (règle du pied). */
  readonly showsFacts: boolean;
  readonly language: InterfaceLanguage;
}) {
  /** `report` (#7225, W6) — la visionneuse est l'écran où une vidéo se
   * REGARDE vraiment : c'est là que la reprise se voit et que la progression
   * doit remonter. Même verbe et mêmes champs que la tuile du fil
   * (`video-tile.tsx`) : `watched`, `lastWatchPositionMs`/`watchedComplete`. */
  const consumption = attachment.currentUserConsumption;
  /* LA POSITION CONFIÉE PAR LA TUILE DU FIL (#8234) — passer au plein écran
     pendant la lecture reprend à la même image ; elle prime sur la reprise
     SERVIE, plus ancienne qu'elle par construction. Lue UNE fois, au montage. */
  const [handedOffMs] = useState(() => takeVideoHandoff(attachment.id));
  const playback = useMediaPlayback({
    attachmentId: attachment.id,
    tracksTime: true,
    report: {
      kind: 'watched',
      ...(attachment.duration !== undefined ? { durationMs: attachment.duration } : {}),
      ...(handedOffMs !== null
        ? { resume: { positionMs: handedOffMs, complete: false } }
        : consumption != null
          ? { resume: { positionMs: consumption.lastWatchPositionMs, complete: consumption.watchedComplete } }
          : {}),
    },
  });
  const { status, toggle, bind } = playback;
  const playing = status === 'playing';
  const statusRef = useRef(status);
  statusRef.current = status;
  const toggleRef = useRef(toggle);
  toggleRef.current = toggle;
  const { effaced, reveal } = useEffacingControl(isActive && playing);

  useEffect(() => {
    if (isActive) {
      onToggleRef(() => toggleRef.current());
      if (statusRef.current !== 'playing') toggleRef.current();
    } else {
      if (statusRef.current === 'playing') toggleRef.current();
      onToggleRef(null);
    }
    return () => onToggleRef(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

  const posterUrl = attachment.thumbnailUrl !== undefined && attachment.thumbnailUrl !== '' ? attachmentSrc(attachment.thumbnailUrl) : undefined;
  const paused = showsPausedBadge(presentation, true, playing);
  const videoSrc = attachmentSrc(attachment.fileUrl);
  const failure = useMediaLoadFailure(videoSrc);

  /* Une vidéo introuvable (#8141) dessine le MÊME état qu'une image : ni
     lecteur noir muet, ni chargement sans fin. */
  if (attachment.fileUrl === '' || failure.failed) {
    return (
      <div data-viewer-media-failed className="relative flex size-full items-center justify-center bg-media-backdrop">
        <MediaUnavailable language={language} {...(failure.retryable ? { onRetry: failure.retry } : {})} />
      </div>
    );
  }

  // `stopPropagation` seulement quand la zone latérale RÉCLAME le geste : au
  // centre, `lateralSeek` rend `null` et l'événement continue de remonter
  // jusqu'à `onStageClick`, exactement comme s'il n'y avait ici aucun
  // gestionnaire — le tap simple garde son effet immédiat.
  const onLateralDoubleClick = (event: ReactMouseEvent<HTMLDivElement>): void => {
    const rect = event.currentTarget.getBoundingClientRect();
    const jump = lateralSeek({ x: event.clientX - rect.left, width: rect.width, position: playback.position, duration: playback.duration });
    if (jump === null) return;
    event.stopPropagation();
    playback.seek(jump.to);
  };

  /* UN TOUCHER RAMÈNE LA PAUSE — le doigt posé, ou la souris qui bouge ; sans
     couper le geste, que la scène continue d'entendre (plateau, glissement). */
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.pointerType === 'mouse' && effaced) reveal();
  };

  const duration = infoDuration({ playing, position: playback.position, duration: playback.duration, durationMs: attachment.duration });

  return (
    <div
      className="relative flex size-full items-center justify-center bg-media-backdrop"
      onDoubleClick={isActive ? onLateralDoubleClick : undefined}
      {...(isActive ? { onPointerDown: reveal, onPointerMove } : {})}
    >
      <video
        key={`${attachment.fileUrl}:${failure.attempt}`}
        ref={bind}
        playsInline
        preload="auto"
        {...(posterUrl !== undefined ? { poster: posterUrl } : {})}
        src={videoSrc}
        onError={failure.onError}
        className="media-viewer-media"
      />
      {paused ? (
        <span className="absolute rounded-full bg-scrim px-3 py-1 text-mini font-medium text-on-media">En pause</span>
      ) : null}
      {isActive ? (
        <button
          type="button"
          data-viewer-center-toggle=""
          data-effaced={effaced ? 'true' : 'false'}
          aria-label={translate(language, playing ? 'media.video.pause' : 'media.video.play')}
          className="media-viewer-center-toggle"
          onClick={(event) => {
            event.stopPropagation();
            toggle();
          }}
          onFocus={reveal}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {playing ? <GlyphSvg glyph={MEDIA_GLYPHS.pause} size={28} /> : <Glyph name="fillPlay" size={28} />}
        </button>
      ) : null}
      {isActive && slots.transport !== null
        ? createPortal(
            <OffStage>
              <Suspense fallback={null}>
                <MediaTransport playback={playback} language={language} />
              </Suspense>
            </OffStage>,
            slots.transport,
          )
        : null}
      {isActive && slots.rail !== null
        ? createPortal(
            <OffStage>
              <Suspense fallback={null}>
                <VideoRailControls playback={playback} language={language} />
              </Suspense>
            </OffStage>,
            slots.rail,
          )
        : null}
      {isActive && slots.info !== null
        ? createPortal(<ViewerInfoLine attachment={attachment} facts={showsFacts} duration={duration} language={language} />, slots.info)
        : null}
    </div>
  );
}
