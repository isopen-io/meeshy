import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';

import { maskedAttachment } from '@meeshy/shared/utils/attachment-protection';

import { Avatar } from '@/components/avatar';

import type { Attachment } from '@/lib/api/types';
import { attachmentSrc } from '@/lib/api/media-url';
import type { ConversationsDeps } from '@/lib/api/conversations';
import type { SceneGalleryEntry } from '@/lib/feed/gallery-lot';
import { useMediaLoadFailure } from '@/lib/media/media-failure';
import { thumbHashPlaceholder } from '@/lib/media/thumbhash';
import { initialsOf } from '@/lib/view/conversation';
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
import { PROTECTED_ATTACHMENT_KEY, kindOf } from '@/lib/view/message';
import { safeAreaInsets } from '@/lib/view/safe-area';
import { useBackDismiss } from '@/lib/view/use-back-dismiss';
import { lateralSeek } from '@/lib/view/media-transport';
import { useAttachmentOpenReport } from '@/lib/view/use-attachment-open-report';
import { useMediaPlayback } from '@/lib/view/use-media-playback';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';
import { READER_LOCALE } from '@/lib/reader';

import '@/styles/media-viewer.css';

import { Glyph, GlyphSvg } from './glyph';
import { MEDIA_GLYPHS } from './glyphs-media';
import { MediaFilmstrip } from './media-filmstrip';
import { MediaUnavailable } from './media-unavailable';
import { ViewerScenePage } from './viewer-scene-page';

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
 * DEUX PELLICULES, UN SEUL CHUNK (D-54, amendé par #6303/#8103) : depuis le
 * fil, `items` est le tableau `visual` DU MESSAGE (`Attachments`) ; depuis
 * l'écran « Médias, liens et documents », c'est l'index VISUEL de la
 * conversation ENTIÈRE (`conversation-media-hub.ts`), paginé — l'hôte
 * l'étend quand la page courante approche du bout (`onNearEnd`) et remet
 * l'auteur et la date de CHAQUE page (`carrierAt`). Ce chunk ne tient aucun
 * magasin : la liste vient toujours de l'hôte, et ses octets ne se chargent
 * que dans la fenêtre ±1.
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
  /** CE MESSAGE EST-IL LE MIEN ? (#7363, W6) — gouverne le rapport
   * d'OUVERTURE d'une page image (`useAttachmentOpenReport`) : un
   * expéditeur qui rouvre son propre envoi ne s'auto-déclare pas
   * destinataire. Défaut `false`, même patron que `Attachments.isMine`. */
  readonly isMine?: boolean;
  /** INJECTABLE pour les témoins — `apiDeps` par défaut. */
  readonly deps?: ConversationsDeps;
  /**
   * LA NATURE « SCÈNE » D'UNE PAGE (#6902, D-78, § B de la spécification
   * `scenes-plein-ecran`) — miroir `GallerySceneContext` : une entrée de
   * `items` dont l'id se trouve dans cette carte se peint par `ScenePlayer`
   * (`ViewerScenePage`) plutôt que par le repli image/vidéo, quel que soit
   * son `mimeType` (`composeSceneGalleryLot`, `lib/feed/gallery-lot.ts`) —
   * **la nature d'une page se lit sur cette carte, jamais sur le MIME**
   * (miroir `PostGalleryLot.swift:16-20`). `undefined` ⇒ visionneuse de
   * médias ORDINAIRE, comportement STRICTEMENT inchangé.
   */
  readonly scenes?: ReadonlyMap<string, SceneGalleryEntry>;
  /**
   * LE PORTEUR DE CHAQUE PAGE (#6303) — une pellicule conversation-entière
   * feuillette des pièces de messages DIFFÉRENTS : l'auteur et la date
   * suivent la page, jamais la première. Prime sur `carrier` quand il est posé.
   */
  readonly carrierAt?: (index: number) => MediaCarrier | undefined;
  /**
   * L'EXTENSION (#6303) — appelée quand la page courante est à moins de
   * `NEAR_END_PAGES` du bout de `items` : l'hôte charge la page suivante de
   * l'index et REMET une liste plus longue. Les pages ne s'ajoutent qu'à la
   * FIN, donc la page courante ne bouge pas.
   */
  readonly onNearEnd?: () => void;
  /** L'AUTEUR DE CHAQUE PAGE (#6303) — le rapport d'ouverture se ferme sur SA
   * propre pièce, page par page ; prime sur `isMine` quand il est posé. */
  readonly isMineAt?: (index: number) => boolean;
  /**
   * OÙ SE POSE LA COUCHE (#8103) — `document.body` par défaut. Ouverte depuis
   * une feuille (`<dialog>` en `showModal()`), elle doit vivre DANS ce
   * dialogue : la couche supérieure du navigateur recouvre tout ce qui est
   * hors d'elle, et le rend inerte.
   */
  readonly container?: Element | null;
};

/** À combien de pages du bout l'hôte est prié d'étendre la liste. */
export const NEAR_END_PAGES = 3;

/** Un seuil de balayage HORIZONTAL, indépendant du seuil vertical de fermeture — la pagination n'est pas un geste d'immersion. */
const SWIPE_PAGE_THRESHOLD_PX = 60;

function clampIndex(index: number, count: number): number {
  return Math.max(0, Math.min(count - 1, index));
}

/**
 * LE NOM D'UNE PAGE SCÈNE POUR UN LECTEUR D'ÉCRAN (revue-correction #6902) —
 * sa LÉGENDE, sinon « Scène partagée par … » (miroir `ConversationMedia
 * GalleryView.swift:294-309`). La clé `feed.scene.shared_by` existe déjà dans
 * les sept catalogues, posée par #6898 pour la carte du fil : la page plein
 * écran en est le SECOND lecteur, jamais une seconde formulation.
 */
function scenePageLabel(entry: SceneGalleryEntry, carrier: MediaCarrier | undefined, language: InterfaceLanguage): string {
  if (entry.caption !== undefined && entry.caption !== '') return entry.caption;
  return translate(language, 'feed.scene.shared_by', { author: carrier?.sender?.displayName ?? '' });
}

/**
 * `bottomMetadataOverlay` (auteur, date, `w × h`, poids, légende) — ABSENT
 * sans `carrier` (loi 4).
 *
 * `sceneEntry` (#6902) — UNE SCÈNE N'A NI FORMAT, NI COTES, NI POIDS (miroir
 * `ConversationMediaGalleryView.swift:1080-1084`, `« une scène n'a ni format,
 * ni dimensions, ni poids »`) : la ligne `kind`/`sizeLabel`/`weightLabel` ne
 * se peint JAMAIS sur une page scène, et sa légende vient de `sceneEntry`
 * (`resolveSceneCaption`, PAR PAGE) plutôt que du `carrier` FIXE de toute la
 * visionneuse — deux scènes voisines d'un même lot peuvent porter des
 * légendes différentes, un `carrier.caption` unique ne le pourrait pas.
 */
function CarrierFooter({
  attachment,
  carrier,
  sceneEntry,
}: {
  readonly attachment: Attachment;
  readonly carrier: MediaCarrier | undefined;
  readonly sceneEntry?: SceneGalleryEntry;
}) {
  if (carrier === undefined) return null;
  const captionText = sceneEntry !== undefined ? sceneEntry.caption : carrier.caption !== null ? carrier.caption.text : undefined;
  // UNE SEULE RÈGLE POUR `lang`, quelle que soit la nature de la page
  // (revue-correction #6902) : l'attribut ne se pose que sur un texte servi
  // dans une AUTRE langue que le document — la première forme du lot le posait
  // inconditionnellement sur une légende de scène, y compris `lang="fr"` sur
  // une page française.
  const captionSource = sceneEntry !== undefined ? sceneEntry.captionLanguage : (carrier.caption?.language ?? undefined);
  const captionLang = captionSource !== undefined && captionSource !== READER_LOCALE ? captionSource : undefined;
  const kind = kindOf(attachment);
  const sizeLabel = attachment.width !== undefined && attachment.height !== undefined ? `${attachment.width} × ${attachment.height}` : undefined;
  const weightLabel = `${Math.max(1, Math.round(attachment.fileSize / 1024))} Ko`;

  return (
    <div data-viewer-footer className="media-viewer-chrome flex flex-col gap-1 px-4 pb-2 text-white">
      {carrier.sender !== null ? (
        <div className="flex items-center gap-2 text-mini">
          {/* LA PHOTO DE L'AUTEUR (#6985). Elle VOYAGE dans le carrier, résolue
              par l'hôte — ce module n'en descend aucune, comme il ne descend
              pas la légende. `initialsOf` reste le repli quand `avatarUrl` est
              nul : un visage s'affiche toujours, jamais un trou. */}
          <Avatar
            initials={initialsOf(carrier.sender.displayName)}
            color="var(--accent)"
            size={24}
            name={carrier.sender.displayName}
            {...(carrier.sender.avatarUrl === null ? {} : { src: carrier.sender.avatarUrl })}
          />
          <span className="font-medium">{carrier.sender.displayName}</span>
          <time dateTime={carrier.sentAt} className="opacity-70">
            {new Date(carrier.sentAt).toLocaleString(READER_LOCALE, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
          </time>
        </div>
      ) : null}
      {sceneEntry === undefined ? (
        <div className="flex items-center gap-1.5 text-mini opacity-70">
          <Glyph name={kind === 'video' ? 'fillPlay' : 'image'} size={12} />
          {sizeLabel !== undefined ? <span>{sizeLabel}</span> : null}
          <span>·</span>
          <span>{weightLabel}</span>
        </div>
      ) : null}
      {captionText !== undefined && captionText !== '' ? (
        <p data-viewer-caption className="text-title" {...(captionLang !== undefined ? { lang: captionLang } : {})}>
          {captionText}
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
  isActive,
  isMine,
  deps,
  language,
}: {
  readonly attachment: Attachment;
  readonly languages: readonly string[];
  readonly displayLanguage?: string;
  readonly fallbackLanguage: string;
  readonly language: InterfaceLanguage;
  /** LA PAGE COURANTE (#7363, W6) — déclenche le rapport d'ouverture
   * (`useAttachmentOpenReport`) quand elle le devient. */
  readonly isActive: boolean;
  readonly isMine: boolean;
  readonly deps?: ConversationsDeps;
}) {
  useAttachmentOpenReport({ attachmentId: attachment.id, isActive, isMine, ...(deps !== undefined ? { deps } : {}) });
  const described = electDescription({ attachment, readerLanguages: languages, displayLanguage, fallbackLanguage });
  const lang = described.language !== READER_LOCALE ? described.language : undefined;
  const [zoomed, setZoomed] = useState(false);
  const placeholder = thumbHashPlaceholder(attachment.thumbHash);
  const src = attachment.fileUrl === '' ? '' : attachmentSrc(attachment.fileUrl);
  const failure = useMediaLoadFailure(src);

  /* UN FICHIER INTROUVABLE (#8141) : l'état dessiné REMPLACE l'image — jamais
     l'icône brisée du navigateur avec le nom de fichier (son `alt`) au
     centre. Le fond ThumbHash, lui, est retiré : il peindrait un média qui
     n'existe plus. « Réessayer » seulement si l'échec est transitoire. */
  if (src === '' || failure.failed) {
    return (
      <div data-viewer-media-failed className="relative flex size-full items-center justify-center overflow-hidden">
        <MediaUnavailable language={language} {...(failure.retryable ? { onRetry: failure.retry } : {})} />
      </div>
    );
  }

  return (
    <div
      className="relative flex size-full items-center justify-center overflow-hidden"
      style={placeholder !== undefined ? { backgroundImage: `url("${placeholder}")`, backgroundSize: 'cover' } : undefined}
      onDoubleClick={(event) => {
        event.stopPropagation();
        setZoomed((z) => !z);
      }}
    >
      <img
        key={failure.attempt}
        src={src}
        onError={failure.onError}
        alt={described.text}
        {...(lang !== undefined ? { lang } : {})}
        className="media-viewer-media transition-transform"
        style={{ transform: zoomed ? `scale(${DOUBLE_TAP_SCALE})` : 'scale(1)' }}
        draggable={false}
      />
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
  /** `report` (#7225, W6) — la visionneuse est l'écran où une vidéo se
   * REGARDE vraiment : c'est là que la reprise se voit et que la progression
   * doit remonter. Même verbe et mêmes champs que la tuile du fil
   * (`video-tile.tsx`) : `watched`, `lastWatchPositionMs`/`watchedComplete`. */
  const consumption = attachment.currentUserConsumption;
  const playback = useMediaPlayback({
    attachmentId: attachment.id,
    tracksTime: true,
    report: {
      kind: 'watched',
      ...(attachment.duration !== undefined ? { durationMs: attachment.duration } : {}),
      ...(consumption != null
        ? { resume: { positionMs: consumption.lastWatchPositionMs, complete: consumption.watchedComplete } }
        : {}),
    },
  });
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
  const videoSrc = attachmentSrc(attachment.fileUrl);
  const failure = useMediaLoadFailure(videoSrc);

  /* Une vidéo introuvable (#8141) dessine le MÊME état qu'une image : ni
     lecteur noir muet, ni chargement sans fin. */
  if (attachment.fileUrl === '' || failure.failed) {
    return (
      <div data-viewer-media-failed className="relative flex size-full items-center justify-center bg-black">
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

  return (
    <div className="relative flex size-full items-center justify-center bg-black" onDoubleClick={isActive ? onLateralDoubleClick : undefined}>
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
  /* LE LIBELLÉ VIENT DU CATALOGUE (#7337) — la MÊME table que la tuile
     (`PROTECTED_ATTACHMENT_KEY`, `lib/view/message.ts`), jamais une seconde carte :
     « un second vocabulaire ferait dire deux choses différentes à l'œil et à
     l'oreille pour un même état ». `file` n'atteint pas cette page (la
     visionneuse ne pagine que le VISUEL, D-41) — la table le porte quand
     même, parce qu'elle est la carte du TYPE, pas celle de cette page. */
  const libelle = translate(currentInterfaceLanguage(), PROTECTED_ATTACHMENT_KEY[kind]);
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
  scenes,
  isMine = false,
  deps,
  carrierAt,
  onNearEnd,
  isMineAt,
  container,
}: MediaViewerProps) {
  const [index, setIndex] = useState(() => clampIndex(startIndex, items.length));
  const [presentation, setPresentation] = useState<StagePresentation>(CARDED_STAGE);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const activePlayToggleRef = useRef<(() => void) | null>(null);
  const dragRef = useRef<{ readonly startX: number; readonly startY: number; dx: number; dy: number } | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);

  useBackDismiss(onClose);

  const [transportSlot, setTransportSlot] = useState<HTMLElement | null>(null);
  const language = currentInterfaceLanguage();

  const current = items[index];
  const currentCarrier = carrierAt?.(index) ?? carrier;
  const currentSceneEntry = current === undefined ? undefined : scenes?.get(current.id);
  const insets = safeAreaInsets();
  // La hauteur du couloir HAUT — le haut du plateau dans le repère du
  // viewport, que `fullStageBox` retranche pour recentrer une page scène
  // sur le viewport ENTIER (revue-correction #6902).
  const topCorridorHeight = STAGE.topCorridorHeight + insets.top;

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

  const onNearEndRef = useRef(onNearEnd);
  onNearEndRef.current = onNearEnd;
  useEffect(() => {
    if (items.length - 1 - index < NEAR_END_PAGES) onNearEndRef.current?.();
  }, [index, items.length]);

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
      if (activePlayToggleRef.current !== null) {
        e.preventDefault();
        activePlayToggleRef.current();
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
      aria-label={`${scenes !== undefined ? 'Scène' : 'Média'} ${index + 1} sur ${items.length}`}
      data-media-viewer
      data-viewer-index={index}
      {...(scenes !== undefined ? { 'data-scene-fullscreen': '' } : {})}
      className="media-viewer-layer fixed inset-0 flex flex-col bg-black"
      onKeyDown={onKeyDown}
      tabIndex={-1}
    >
      {/* Couloir haut — AU-DESSUS d'une page scène en plein viewport (`zIndex`, #6902).
          `pointerEvents` SUIT `opacity` (#7040) : `opacity: 0` cache aux YEUX,
          jamais au DOIGT. Sans lui, un appui en haut à gauche en plein cadre
          FERMAIT la visionneuse — un contrôle invisible et vivant, pire qu'un
          contrôle mort, puisqu'on ne peut ni le voir ni prévoir son effet. */}
      <div
        className="media-viewer-chrome relative flex items-center justify-between px-3"
        style={{
          height: topCorridorHeight,
          paddingTop: insets.top,
          opacity: isFull ? 0 : 1,
          pointerEvents: isFull ? 'none' : 'auto',
          zIndex: 10,
        }}
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
          const sceneEntry = scenes?.get(attachment.id);
          return (
            <div
              key={`${i}:${attachment.id}`}
              data-viewer-page
              data-full-pixels={fullPixels}
              className="media-viewer-page absolute inset-0"
              style={{ transform: `translateX(${distance * 100}%)`, display: Math.abs(distance) > 1 ? 'none' : 'block' }}
            >
              {!fullPixels ? (
                <ViewerBackdropPage attachment={attachment} />
              ) : sceneEntry !== undefined ? (
                /* UNE PAGE SCÈNE PREND LE VIEWPORT ENTIER, SANS QUITTER LE FLUX
                   (revue-correction #6902) — c'est `fullStageBox`
                   (`lib/view/media-stage.ts`) qui décale sa boîte de `topInset`
                   pour que son centre retombe au centre du VIEWPORT, jamais un
                   `position: fixed` sur la page : le plateau reçoit un
                   `transform` pendant un glissement de fermeture, et un ancêtre
                   transformé aurait alors RÉANCRÉ la page (mesuré : 390 × 693 →
                   371 × 660 au premier pixel de doigt). Les couloirs
                   (`zIndex: 10`) restent AU-DESSUS de cette boîte. */
                <ViewerScenePage
                  entry={sceneEntry}
                  isActive={i === index}
                  preferredLanguages={languages}
                  topInset={topCorridorHeight}
                  label={scenePageLabel(sceneEntry, carrierAt?.(i) ?? carrier, language)}
                  pausedOnEntry={presentation.kind === 'full' && presentation.pausedOnEntry}
                  onToggleRef={(fn) => {
                    if (i === index) activePlayToggleRef.current = fn;
                  }}
                />
              ) : isMasked ? (
                <ViewerMaskedPage attachment={attachment} />
              ) : kindOf(attachment) === 'video' ? (
                <ViewerVideoPage
                  attachment={attachment}
                  isActive={i === index}
                  presentation={presentation}
                  onToggleRef={(fn) => {
                    if (i === index) activePlayToggleRef.current = fn;
                  }}
                  corridorSlot={transportSlot}
                  language={language}
                />
              ) : (
                <ViewerImagePage
                  attachment={attachment}
                  languages={languages}
                  fallbackLanguage={fallbackLanguage}
                  isActive={i === index}
                  isMine={isMineAt?.(i) ?? isMine}
                  language={language}
                  {...(displayLanguage !== undefined ? { displayLanguage } : {})}
                  {...(deps !== undefined ? { deps } : {})}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Couloir bas — AU-DESSUS d'une page scène en plein viewport (`zIndex`, #6902). */}
      <div
        className="media-viewer-chrome relative flex flex-col"
        style={{
          opacity: isFull ? 0 : 1,
          /* Le JUMEAU du couloir haut (#7040) : même littéral, même défaut. Il
             ne figurait dans aucun signalement — il a été trouvé en posant au
             correctif la question que le dépôt pose aux siens, « qu'est-ce qui
             part À CÔTÉ de ce que je viens de garder ? ». Ce couloir porte la
             PELLICULE : sans cette ligne, ses vignettes se choisissaient à
             l'aveugle sous un doigt qui ne voit rien. */
          pointerEvents: isFull ? 'none' : 'auto',
          paddingBottom: insets.bottom,
          zIndex: 10,
          /* LE VOILE BAS (revue-correction #6902) — une page SCÈNE prend le
             viewport ENTIER : l'auteur, la date (70 % d'opacité) et la légende
             ne tombent plus sur le NOIR du plateau mais sur la couleur de la
             scène, quelle qu'elle soit. Mesuré sur la cible iOS, qui peint le
             MÊME voile sous ce bloc (capture cible `scenes-plein-ecran.light`) ;
             sans lui, une scène claire ramènerait la date sous AA. Posé
             UNIQUEMENT sur une page scène : le rendu image/vidéo, dont deux
             gates de conversation lisent la mise en page, ne bouge pas. */
          ...(currentSceneEntry !== undefined
            ? { background: 'linear-gradient(to top, rgba(0,0,0,0.78), rgba(0,0,0,0.5) 60%, transparent)' }
            : {}),
        }}
      >
        <CarrierFooter attachment={current} carrier={currentCarrier} {...(currentSceneEntry !== undefined ? { sceneEntry: currentSceneEntry } : {})} />
        {/* La place de la barre de lecture (#6359) : la page vidéo ACTIVE y rend `MediaTransport` par un portail ; vide sur une image. */}
        <div ref={setTransportSlot} data-viewer-transport-slot />

        {items.length > 1 ? <MediaFilmstrip items={items} currentIndex={index} onSelect={goTo} language={language} /> : null}
      </div>
    </div>,
    container ?? document.body,
  );
}
