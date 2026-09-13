import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';

import { maskedAttachment } from '@meeshy/shared/utils/attachment-protection';

import type { Attachment } from '@/lib/api/types';
import { attachmentSrc } from '@/lib/api/media-url';
import { thumbHashPlaceholder } from '@/lib/media/thumbhash';
import { nextFocusIndex } from '@/lib/view/focus-trap';
import { useLongPress } from '@/lib/view/long-press';
import { electDescription, type MediaCarrier } from '@/lib/view/media';
import {
  CARDED_STAGE,
  DISMISS_THRESHOLD,
  DOUBLE_TAP_SCALE,
  STAGE,
  rendersFullPixels,
  resolveStageDrag,
  showsPausedBadge,
  stageAfter,
  type StagePresentation,
} from '@/lib/view/media-stage';
import { kindOf } from '@/lib/view/message';
import { safeAreaInsets } from '@/lib/view/safe-area';
import { useBackDismiss } from '@/lib/view/use-back-dismiss';
import { lateralSeek } from '@/lib/view/media-transport';
import { useMediaPlayback } from '@/lib/view/use-media-playback';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';
import { READER_LOCALE } from '@/lib/reader';

import '@/styles/media-viewer.css';

import { Glyph, GlyphSvg } from './glyph';
import { MEDIA_GLYPHS } from './glyphs-media';
import { MediaFilmstrip } from './media-filmstrip';

/**
 * LA BARRE DE LECTURE EST UN CHUNK À PART (#6359) — elle ne sert qu'une
 * visionneuse ouverte sur une VIDÉO. Une visionneuse de photos, le cas
 * majoritaire, ne paie ni ses octets ni sa feuille (`budgets.json ›
 * on_demand_chunks.media_transport`). Le chunk se charge quand la page vidéo
 * active monte son portail ; en attendant, le couloir reste vide, comme il
 * l'est de toute façon tant que la vidéo n'a pas chargé ses métadonnées.
 */
const MediaTransport = lazy(() => import('./media-transport').then((module) => ({ default: module.MediaTransport })));

/**
 * `MediaViewer` (#6221, § 5 étape 5) — LA VISIONNEUSE PLEIN ÉCRAN, chunk À LA
 * DEMANDE (`lazy(() => import('./media-viewer'))`, `attachment-blocks.tsx`) :
 * scène noire, pellicule (`MediaFilmstrip`) SEULEMENT si `items.length > 1`,
 * fenêtre de rendu ±1 (`prefetchRange`), loi d'immersion PURE (`media-
 * stage.ts`, StagePresentation), retour matériel/navigateur SANS entrée
 * fantôme (`useBackDismiss`), piège à focus (`nextFocusIndex`), `#root`
 * `inert` le temps de l'ouverture.
 *
 * PELLICULE AU MESSAGE, PAS À LA CONVERSATION (D-54, Q2 de la spécification
 * #6221) : `items` est le tableau `visual` DÉJÀ partitionné par
 * `Attachments` — la projection conversation-entière est une ISSUE
 * COMPAGNON (avec réagir/répondre/composer), jamais un raccourci par un
 * magasin global depuis ce chunk.
 *
 * GESTES — ce qui est LIVRÉ : tap (bascule plateau ⇄ plein cadre), glissement
 * vertical qui SUIT le doigt (ferme ≥ 150, entre en plein cadre ≤ −150 depuis
 * `carded`), appui long 500 ms (plein cadre + pause), double-tap (zoom
 * 1 ↔ 2,5 sur une page IMAGE), flèches/pellicule pour la pagination. CE QUI
 * NE L'EST PAS (D-54, écart ASSUMÉ, faute de temps sur ce tour) : le
 * pincement à deux doigts et le déplacement d'une image zoomée au doigt — la
 * loi PURE qui les gouvernerait (`MAX_SCALE`, `media-stage.ts`) est déjà
 * dérivée et testée, seule la mécanique `PointerEvent` à deux points manque.
 * Un contournement matériel n'existe pas : le double-tap reste le chemin
 * complet pour explorer une image en grand.
 */
export type MediaViewerProps = {
  readonly items: readonly Attachment[];
  readonly startIndex: number;
  readonly onClose: () => void;
  readonly languages: readonly string[];
  readonly displayLanguage?: string;
  readonly fallbackLanguage: string;
  readonly carrier?: MediaCarrier;
};

/** Un seuil de balayage HORIZONTAL, indépendant du seuil vertical de fermeture — la pagination n'est pas un geste d'immersion. */
const SWIPE_PAGE_THRESHOLD_PX = 60;

function clampIndex(index: number, count: number): number {
  return Math.max(0, Math.min(count - 1, index));
}

/** `bottomMetadataOverlay` (auteur, date, `w × h`, poids, légende) — ABSENT sans `carrier` (loi 4). */
function CarrierFooter({ attachment, carrier }: { readonly attachment: Attachment; readonly carrier: MediaCarrier | undefined }) {
  if (carrier === undefined) return null;
  const lang = carrier.caption !== null && carrier.caption.language !== READER_LOCALE ? carrier.caption.language : undefined;
  const kind = kindOf(attachment);
  const sizeLabel = attachment.width !== undefined && attachment.height !== undefined ? `${attachment.width} × ${attachment.height}` : undefined;
  const weightLabel = `${Math.max(1, Math.round(attachment.fileSize / 1024))} Ko`;

  return (
    <div data-viewer-footer className="media-viewer-chrome flex flex-col gap-1 px-4 pb-2 text-white">
      {carrier.sender !== null ? (
        <div className="flex items-center gap-2 text-mini">
          <span className="font-medium">{carrier.sender.displayName}</span>
          <time dateTime={carrier.sentAt} className="opacity-70">
            {new Date(carrier.sentAt).toLocaleString(READER_LOCALE, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
          </time>
        </div>
      ) : null}
      <div className="flex items-center gap-1.5 text-mini opacity-70">
        <Glyph name={kind === 'video' ? 'fillPlay' : 'image'} size={12} />
        {sizeLabel !== undefined ? <span>{sizeLabel}</span> : null}
        <span>·</span>
        <span>{weightLabel}</span>
      </div>
      {carrier.caption !== null && carrier.caption.text !== '' ? (
        <p data-viewer-caption className="text-title" {...(lang !== undefined ? { lang } : {})}>
          {carrier.caption.text}
        </p>
      ) : null}
    </div>
  );
}

function ViewerImagePage({
  attachment,
  languages,
  displayLanguage,
  fallbackLanguage,
}: {
  readonly attachment: Attachment;
  readonly languages: readonly string[];
  readonly displayLanguage?: string;
  readonly fallbackLanguage: string;
}) {
  const described = electDescription({ attachment, readerLanguages: languages, displayLanguage, fallbackLanguage });
  const lang = described.language !== READER_LOCALE ? described.language : undefined;
  const [zoomed, setZoomed] = useState(false);
  const placeholder = thumbHashPlaceholder(attachment.thumbHash);

  return (
    <div
      className="relative flex size-full items-center justify-center overflow-hidden"
      style={placeholder !== undefined ? { backgroundImage: `url("${placeholder}")`, backgroundSize: 'cover' } : undefined}
      onDoubleClick={(event) => {
        event.stopPropagation();
        setZoomed((z) => !z);
      }}
    >
      {attachment.fileUrl === '' ? (
        <div className="media-viewer-muted-text flex flex-col items-center gap-2">
          <Glyph name="image" size={48} className="media-viewer-fallback-glyph" />
          <span className="text-mini">Média indisponible</span>
        </div>
      ) : (
        <img
          src={attachmentSrc(attachment.fileUrl)}
          alt={described.text}
          {...(lang !== undefined ? { lang } : {})}
          className="media-viewer-media transition-transform"
          style={{ transform: zoomed ? `scale(${DOUBLE_TAP_SCALE})` : 'scale(1)' }}
          draggable={false}
        />
      )}
    </div>
  );
}

/**
 * LA PAGE VIDÉO (#6221, #6359) — le média, le play/pause AU CENTRE, et la
 * barre de lecture rendue DANS LE COULOIR BAS (`corridorSlot`) par un portail.
 * Miroir `cadreCenterPlayPause` + `transportCorridor`
 * (`ConversationMediaGalleryView+Transport.swift`) : la progression RAPPORTE
 * et descend au couloir ; le play/pause COMMANDE et reste là où l'œil est.
 * Seule la page ACTIVE monte l'un et l'autre — une page voisine préchargée
 * n'a rien à parcourir ni à commander.
 *
 * DOUBLE TAP LATÉRAL (#6369, miroir `MediaStageSeek` du SDK) — un double tap
 * sur le tiers gauche de la scène recule de 10 s, sur le tiers droit avance
 * de 10 s. `lateralSeek` rend `null` au CENTRE (le tap simple y garde son
 * effet immédiat, comme sur une page voisine) et sur un média SANS DURÉE
 * (aucune collision possible avec le double tap de ZOOM d'`ViewerImagePage`,
 * qui n'a pas de durée) : rien d'autre à coordonner entre les deux gestes.
 */
function ViewerVideoPage({
  attachment,
  isActive,
  presentation,
  onToggleRef,
  corridorSlot,
  language,
}: {
  readonly attachment: Attachment;
  readonly isActive: boolean;
  readonly presentation: StagePresentation;
  readonly onToggleRef: (toggle: (() => void) | null) => void;
  readonly corridorSlot: HTMLElement | null;
  readonly language: InterfaceLanguage;
}) {
  const playback = useMediaPlayback({ attachmentId: attachment.id, tracksTime: true });
  const { status, toggle, bind } = playback;
  const statusRef = useRef(status);
  statusRef.current = status;
  const toggleRef = useRef(toggle);
  toggleRef.current = toggle;

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
  const paused = showsPausedBadge(presentation, true, status === 'playing');

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

  return (
    <div className="relative flex size-full items-center justify-center bg-black" onDoubleClick={isActive ? onLateralDoubleClick : undefined}>
      <video
        key={attachment.fileUrl}
        ref={bind}
        playsInline
        preload="auto"
        {...(posterUrl !== undefined ? { poster: posterUrl } : {})}
        src={attachmentSrc(attachment.fileUrl)}
        className="media-viewer-media"
      />
      {paused ? (
        <span className="media-viewer-paused-badge absolute rounded-full px-3 py-1 text-mini font-medium text-white">En pause</span>
      ) : null}
      {isActive ? (
        <button
          type="button"
          aria-label={translate(language, status === 'playing' ? 'media.video.pause' : 'media.video.play')}
          className="media-viewer-center-toggle"
          onClick={(event) => {
            event.stopPropagation();
            toggle();
          }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {status === 'playing' ? <GlyphSvg glyph={MEDIA_GLYPHS.pause} size={28} /> : <Glyph name="fillPlay" size={28} />}
        </button>
      ) : null}
      {isActive && corridorSlot !== null
        ? createPortal(
            /* Le portail rend la barre DANS LE COULOIR, mais ses événements
               React remontent l'arbre des COMPOSANTS jusqu'à la scène : un clic
               y basculerait le plateau en plein cadre (le chrome disparaîtrait
               sous le doigt qui règle le son), un appui y armerait l'appui long,
               et Espace y déclencherait le raccourci lecture/pause au lieu
               d'activer le bouton. La barre ne parle qu'à la vidéo. */
            <div
              onClick={(event) => event.stopPropagation()}
              onPointerDown={(event) => event.stopPropagation()}
              onPointerMove={(event) => event.stopPropagation()}
              onPointerUp={(event) => event.stopPropagation()}
              onKeyDown={(event) => {
                if (event.key === ' ' || event.key === 'Enter') event.stopPropagation();
              }}
            >
              <Suspense fallback={null}>
                <MediaTransport playback={playback} durationMs={attachment.duration} language={language} />
              </Suspense>
            </div>,
            corridorSlot,
          )
        : null}
    </div>
  );
}

/** Une page HORS de la fenêtre de rendu — le fond ThumbHash seul, aucun octet de média chargé. */
function ViewerBackdropPage({ attachment }: { readonly attachment: Attachment }) {
  const placeholder = thumbHashPlaceholder(attachment.thumbHash);
  return (
    <div
      className="size-full bg-black"
      style={placeholder !== undefined ? { backgroundImage: `url("${placeholder}")`, backgroundSize: 'cover' } : undefined}
    />
  );
}

/**
 * `ViewerMaskedPage` (#6189, cycle 125) — LE DÉFAUT trouvé par
 * `media-viewer.test.tsx` : `items` (le tableau `visual` ENTIER, D-41) porte
 * une pièce MASQUÉE à SA position, et `MediaGrid` ne pose aucun bouton
 * dessus (aucun tap direct) — mais une flèche ou la pellicule, depuis une
 * page VOISINE déjà ouverte, l'atteignait quand même. `ViewerImagePage`/
 * `ViewerVideoPage` ne consultaient `maskedAttachment` nulle part : la page
 * active rendait le VRAI `<img>`/`<video>`, URL en clair.
 *
 * Même vocabulaire que `MaskedAttachment` (`masked-attachment.tsx`), à
 * l'échelle PLEIN CADRE : ni fichier, ni URL, ni vignette (cycle 125, « une
 * protection de contenu se mesure sur tout ce que la charge TRANSPORTE »).
 */
function ViewerMaskedPage({ attachment }: { readonly attachment: Attachment }) {
  const kind = kindOf(attachment);
  const libelle = kind === 'video' ? 'Vidéo protégée' : kind === 'audio' ? 'Vocal protégé' : 'Photo protégée';
  return (
    <div
      data-protected-attachment="hidden"
      role="img"
      aria-label={libelle}
      className="media-viewer-muted-text flex size-full flex-col items-center justify-center gap-2 bg-black"
    >
      <Glyph name={kind === 'video' ? 'fillPlay' : 'image'} size={40} className="opacity-40" />
      <Glyph name="eyeSlash" size={18} className="opacity-40" />
      <span className="text-mini">{libelle}</span>
    </div>
  );
}

export default function MediaViewer({
  items,
  startIndex,
  onClose,
  languages,
  displayLanguage,
  fallbackLanguage,
  carrier,
}: MediaViewerProps) {
  const [index, setIndex] = useState(() => clampIndex(startIndex, items.length));
  const [presentation, setPresentation] = useState<StagePresentation>(CARDED_STAGE);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const activeVideoToggleRef = useRef<(() => void) | null>(null);
  const dragRef = useRef<{ readonly startX: number; readonly startY: number; dx: number; dy: number } | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);

  useBackDismiss(onClose);

  const [transportSlot, setTransportSlot] = useState<HTMLElement | null>(null);
  const language = currentInterfaceLanguage();

  const current = items[index];
  const insets = safeAreaInsets();

  // #root INERT le temps de l'ouverture — même dispositif que le clone du
  // menu de message (`message-menu.tsx:380-391`), porté ICI au NIVEAU DE LA
  // COUCHE plutôt qu'à un aperçu cloné.
  useEffect(() => {
    const root = document.getElementById('root');
    const previousOverflow = document.body.style.overflow;
    root?.setAttribute('inert', '');
    document.body.style.overflow = 'hidden';
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();
    return () => {
      root?.removeAttribute('inert');
      document.body.style.overflow = previousOverflow;
      previouslyFocusedRef.current?.focus();
    };
  }, []);

  const goTo = (next: number): void => {
    setIndex(clampIndex(next, items.length));
    setPresentation(CARDED_STAGE);
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      goTo(index + 1);
      return;
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      goTo(index - 1);
      return;
    }
    if (e.key === ' ') {
      if (activeVideoToggleRef.current !== null) {
        e.preventDefault();
        activeVideoToggleRef.current();
      }
      return;
    }
    if (e.key === 'Tab') {
      const dialog = dialogRef.current;
      if (dialog === null) return;
      const focusables = Array.from(dialog.querySelectorAll<HTMLElement>('button, [href], [tabindex]:not([tabindex="-1"])')).filter(
        (el) => !el.hasAttribute('disabled'),
      );
      if (focusables.length === 0) return;
      const activeElement = document.activeElement;
      const currentPos = focusables.indexOf(activeElement as HTMLElement);
      const next = nextFocusIndex(focusables.length, currentPos === -1 ? 0 : currentPos, e.shiftKey);
      e.preventDefault();
      focusables[next]?.focus();
    }
  };

  // Tap sur la scène — bascule le plateau. `stopPropagation` sur les
  // contrôles (fermer, pellicule, bouton play) empêche cette bascule de se
  // déclencher par-dessus une action réelle.
  const onStageClick = (): void => {
    if (dragRef.current !== null && (Math.abs(dragRef.current.dx) > 4 || Math.abs(dragRef.current.dy) > 4)) return;
    setPresentation((p) => stageAfter(p, 'tap'));
  };

  const longPress = useLongPress({
    onOpen: () => setPresentation(() => stageAfter(CARDED_STAGE, 'longPress')),
  });

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    dragRef.current = { startX: event.clientX, startY: event.clientY, dx: 0, dy: 0 };
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current;
    if (drag === null) return;
    drag.dx = event.clientX - drag.startX;
    drag.dy = event.clientY - drag.startY;
    if (trackRef.current !== null && Math.abs(drag.dy) > Math.abs(drag.dx)) {
      trackRef.current.style.transform = `translateY(${Math.max(0, drag.dy)}px)`;
    }
  };
  const onPointerUp = (): void => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag === null) return;
    if (trackRef.current !== null) trackRef.current.style.transform = '';

    if (Math.abs(drag.dx) > Math.abs(drag.dy)) {
      if (drag.dx <= -SWIPE_PAGE_THRESHOLD_PX) goTo(index + 1);
      else if (drag.dx >= SWIPE_PAGE_THRESHOLD_PX) goTo(index - 1);
      return;
    }
    const verdict = resolveStageDrag({ dx: drag.dx, dy: drag.dy, presentation, threshold: DISMISS_THRESHOLD });
    if (verdict === 'dismisses') onClose();
    else if (verdict === 'entersFull') setPresentation({ kind: 'full', pausedOnEntry: false });
  };

  const isFull = presentation.kind === 'full';

  if (current === undefined) return null;

  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Média ${index + 1} sur ${items.length}`}
      data-media-viewer
      data-viewer-index={index}
      className="media-viewer-layer fixed inset-0 flex flex-col bg-black"
      onKeyDown={onKeyDown}
      tabIndex={-1}
    >
      {/* Couloir haut */}
      <div
        className="media-viewer-chrome flex items-center justify-between px-3"
        style={{ height: STAGE.topCorridorHeight + insets.top, paddingTop: insets.top, opacity: isFull ? 0 : 1 }}
      >
        <button
          ref={closeButtonRef}
          type="button"
          aria-label="Fermer"
          onClick={onClose}
          className="media-viewer-close tap-target-34 grid place-items-center rounded-full text-white"
        >
          <Glyph name="x" size={16} />
        </button>
      </div>

      {/* Le cadre — pages */}
      <div
        ref={trackRef}
        className="media-viewer-track-frame relative flex-1"
        onClick={onStageClick}
        onContextMenu={(e) => e.preventDefault()}
        onPointerDown={(e: ReactPointerEvent<HTMLDivElement>) => {
          onPointerDown(e);
          longPress.onPointerDown(e);
        }}
        onPointerMove={(e: ReactPointerEvent<HTMLDivElement>) => {
          onPointerMove(e);
          longPress.onPointerMove(e);
        }}
        onPointerUp={() => {
          onPointerUp();
          longPress.onPointerUp();
        }}
        onPointerCancel={() => longPress.onPointerCancel()}
      >
        {items.map((attachment, i) => {
          const distance = i - index;
          if (Math.abs(distance) > 1 && i !== index) return null; // hors fenêtre ET hors page courante : pas monté du tout
          const fullPixels = rendersFullPixels(distance);
          const isMasked = maskedAttachment(attachment);
          return (
            <div
              key={attachment.id}
              data-viewer-page
              data-full-pixels={fullPixels}
              className="media-viewer-page absolute inset-0"
              style={{ transform: `translateX(${distance * 100}%)`, display: Math.abs(distance) > 1 ? 'none' : 'block' }}
            >
              {!fullPixels ? (
                <ViewerBackdropPage attachment={attachment} />
              ) : isMasked ? (
                <ViewerMaskedPage attachment={attachment} />
              ) : kindOf(attachment) === 'video' ? (
                <ViewerVideoPage
                  attachment={attachment}
                  isActive={i === index}
                  presentation={presentation}
                  onToggleRef={(fn) => {
                    if (i === index) activeVideoToggleRef.current = fn;
                  }}
                  corridorSlot={transportSlot}
                  language={language}
                />
              ) : (
                <ViewerImagePage
                  attachment={attachment}
                  languages={languages}
                  fallbackLanguage={fallbackLanguage}
                  {...(displayLanguage !== undefined ? { displayLanguage } : {})}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Couloir bas */}
      <div className="media-viewer-chrome flex flex-col" style={{ opacity: isFull ? 0 : 1, paddingBottom: insets.bottom }}>
        <CarrierFooter attachment={current} carrier={carrier} />
        {/* La place de la barre de lecture (#6359) : la page vidéo ACTIVE y rend `MediaTransport` par un portail ; vide sur une image. */}
        <div ref={setTransportSlot} data-viewer-transport-slot />

        {items.length > 1 ? <MediaFilmstrip items={items} currentIndex={index} onSelect={goTo} /> : null}
      </div>
    </div>,
    document.body,
  );
}
