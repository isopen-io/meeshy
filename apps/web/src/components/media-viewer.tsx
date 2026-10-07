import { Suspense, lazy, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { maskedAttachment } from '@meeshy/shared/utils/attachment-protection';

import type { Attachment } from '@/lib/api/types';
import { attachmentSrc } from '@/lib/api/media-url';
import type { ConversationsDeps } from '@/lib/api/conversations';
import type { SceneGalleryEntry } from '@/lib/feed/gallery-lot';
import { useMediaLoadFailure } from '@/lib/media/media-failure';
import { thumbHashPlaceholder } from '@/lib/media/thumbhash';
import { initialsOf } from '@/lib/view/conversation';
import { nextFocusIndex } from '@/lib/view/focus-trap';
import { useLongPress } from '@/lib/view/long-press';
import { useCarryOnClose } from '@/lib/view/audio-carry-on-close';
import { electDescription, type MediaCarrier } from '@/lib/view/media';
import { standaloneSharePage, type MediaViewerPage } from '@/lib/view/viewer-page-offers';
import {
  CARDED_STAGE,
  DOUBLE_TAP_SCALE,
  STAGE,
  UNZOOMED,
  rendersFullPixels,
  stageAfter,
  viewerZoomTransform,
  type StagePresentation,
  type ViewerZoom,
} from '@/lib/view/media-stage';
import { PROTECTED_ATTACHMENT_KEY, kindOf } from '@/lib/view/message';
import { safeAreaInsets } from '@/lib/view/safe-area';
import { prefersReducedMotion } from '@/lib/view/reduced-motion';
import { yieldingChrome } from '@/lib/view/chrome-yields';
import { SCENE_OPENING_EASING, SCENE_OPENING_MS, takeSceneOpening } from '@/lib/view/scene-opening';
import { useBackDismiss } from '@/lib/view/use-back-dismiss';
import { useConversationViewingFocus } from '@/lib/view/use-conversation-viewing';
import { useSendSheetOpen } from '@/lib/view/use-send-sheet-open';
import { useAttachmentOpenReport } from '@/lib/view/use-attachment-open-report';
import { useViewerPinch } from '@/lib/view/use-viewer-pinch';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';
import { READER_LOCALE } from '@/lib/reader';

import '@/styles/media-viewer.css';

import { Glyph } from './glyph';
import { MediaFilmstrip } from './media-filmstrip';
import { MediaUnavailable } from './media-unavailable';
import { GLYPH_SIZE } from './ui-chrome';
import { ViewerCaption } from './viewer-caption';
import { ViewerInfoLine } from './viewer-info-line';
import { ViewerBottomBar, ViewerReplyCapsule, ViewerTopBar, type ViewerIdentityModel } from './viewer-chrome';
import { useViewerSwipe } from './viewer-chrome-gestures';
import type { NoticeKey } from './viewer-media-actions';
import { ViewerScenePage } from './viewer-scene-page';

/**
 * LES ACTIONS DE LA PAGE (#6303) — Enregistrer, Réagir, Répondre, Créer avec
 * ce média — sont un chunk À LA DEMANDE (`viewer-media-actions.tsx`, budget
 * `viewer_media_actions`) : une page qui n'offre rien (pièce protégée, hôte
 * sans action) ne le télécharge jamais, et la visionneuse garde son poids.
 */
const ViewerMediaActions = lazy(() => import('./viewer-media-actions'));

/** LA PAGE AUDIO (#8333) — chunk à la demande : une visionneuse de photos ne la télécharge jamais (`budgets.json › viewer_audio_page`). */
const ViewerAudioPage = lazy(() => import('./viewer-audio-page'));

/** LA PAGE VIDÉO (#9577) — chunk à la demande, même raison : la pause qui s'efface, le décompte et les portails du transport ne servent qu'une vidéo (`budgets.json › viewer_video_page`). */
const ViewerVideoPage = lazy(() => import('./viewer-video-page'));

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
 * 1 ↔ 2,5 sur une page IMAGE), pincement à deux doigts (#9532, borné par
 * `MAX_SCALE`, centré où les doigts se posent — `useViewerPinch` ; un second
 * doigt n'est jamais un glissé ni un appui long), déplacement d'une image
 * agrandie au doigt (#9562, la pagination cède tant qu'elle est agrandie),
 * flèches/pellicule pour la pagination.
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
   * L'EXTENSION VERS LE PASSÉ (#6303) — la pellicule ouverte depuis le FIL est
   * dans l'ordre du fil (le plus ancien d'abord) : ses pages plus anciennes
   * arrivent par le DÉBUT. Appelée quand la page courante est à moins de
   * `NEAR_END_PAGES` du début ; la page regardée ne bouge pas (épinglage par
   * identité, voir `pinned`).
   */
  readonly onNearStart?: () => void;
  /** LA LANGUE DE CHAQUE PAGE QUAND SA PIÈCE N'A PAS DE TRANSCRIPTION (#8333) — une pellicule de vocaux feuillette des messages d'auteurs différents ; prime sur `fallbackLanguage`. */
  readonly fallbackLanguageAt?: (index: number) => string | undefined;
  /**
   * CE QUE LA PAGE OFFRE (#6303) — `null` ⇒ aucune action. L'hôte décide page
   * par page (`mediaPageOffers`, sur la pièce ORIGINALE) ; la visionneuse ne
   * fait que rendre.
   */
  readonly actionsAt?: (index: number) => MediaViewerPage | null;
  /**
   * UN MÉDIA NU QUE L'HÔTE SAIT PUBLIC (#8884) — l'image d'un commentaire, le
   * média d'une publication : « Partager » seul, sans message (ni réaction ni
   * citation). Explicite, JAMAIS déduit : voir le commentaire de `page`.
   * Ignoré quand `actionsAt` est posé.
   */
  readonly shareMedia?: boolean;
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
 * LE PIED DE LA PAGE (`bottomMetadataOverlay`) — la LÉGENDE ; ABSENT sans
 * `carrier` (loi 4). L'AUTEUR et la DATE montent dans la barre haute
 * (`carrierIdentity`, #8879 — l'identité qualifie le média, elle ne se répète
 * pas sous lui). Les cotes, le poids et la durée ne sont plus ici (#9577) :
 * ils forment la ligne d'informations (`ViewerInfoLine`), sous la barre de
 * progression.
 *
 * `sceneEntry` (#6902) — la légende d'une page scène vient de `sceneEntry`
 * (`resolveSceneCaption`, PAR PAGE) plutôt que du `carrier` FIXE de toute la
 * visionneuse — deux scènes voisines d'un même lot peuvent porter des
 * légendes différentes, un `carrier.caption` unique ne le pourrait pas.
 */
function carrierFooter(params: { readonly carrier: MediaCarrier | undefined; readonly sceneEntry?: SceneGalleryEntry }): ReactNode {
  const { carrier, sceneEntry } = params;
  if (carrier === undefined) return undefined;
  const captionText = sceneEntry !== undefined ? sceneEntry.caption : carrier.caption !== null ? carrier.caption.text : undefined;
  // UNE SEULE RÈGLE POUR `lang`, quelle que soit la nature de la page
  // (revue-correction #6902) : l'attribut ne se pose que sur un texte servi
  // dans une AUTRE langue que le document — la première forme du lot le posait
  // inconditionnellement sur une légende de scène, y compris `lang="fr"` sur
  // une page française.
  const captionSource = sceneEntry !== undefined ? sceneEntry.captionLanguage : (carrier.caption?.language ?? undefined);
  const captionLang = captionSource !== undefined && captionSource !== READER_LOCALE ? captionSource : undefined;
  if (captionText === undefined || captionText === '') return undefined;

  return (
    <ViewerCaption
      probe={{ 'data-viewer-caption-text': '' }}
      text={captionText}
      trackingLinks={carrier.trackingLinks}
      className="line-clamp-4 text-body"
      lang={captionLang}
    />
  );
}

/**
 * L'IDENTITÉ DU PORTEUR (#8879) — l'auteur et l'heure de la pièce, en haut,
 * comme story et réel. LA PHOTO DE L'AUTEUR (#6985) VOYAGE dans le carrier,
 * résolue par l'hôte : `initialsOf` reste le repli quand `avatarUrl` est nul,
 * un visage s'affiche toujours, jamais un trou. Pas de `profileUsername` : le
 * carrier ne porte que le nom affiché (suivi : le porter pour le lien profil).
 */
function carrierIdentity(carrier: MediaCarrier | undefined): ViewerIdentityModel | undefined {
  if (carrier === undefined || carrier.sender === null) return undefined;
  return {
    name: carrier.sender.displayName,
    initials: initialsOf(carrier.sender.displayName),
    avatarColor: 'var(--accent)',
    ...(carrier.sender.avatarUrl === null ? {} : { avatarSrc: carrier.sender.avatarUrl }),
    time: {
      iso: carrier.sentAt,
      label: new Date(carrier.sentAt).toLocaleString(READER_LOCALE, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
    },
  };
}

/** L'issue d'une action, dite dans l'UNIQUE région vivante de la couche (#8879) — trois secondes, puis elle se tait. */
function useNotice(): readonly [NoticeKey | null, (key: NoticeKey) => void] {
  const [notice, setNotice] = useState<NoticeKey | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );
  const show = (key: NoticeKey): void => {
    setNotice(key);
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => setNotice(null), 3_000);
  };
  return [notice, show];
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
  onZoomChange,
}: {
  /** ZOOMER FAIT CÉDER LE CHROME (#8644) : la visionneuse l'apprend d'ici. */
  readonly onZoomChange?: (zoomed: boolean) => void;
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
  const [zoom, setZoom] = useState<ViewerZoom>(UNZOOMED);
  const imageRef = useRef<HTMLImageElement>(null);
  const pinch = useViewerPinch({
    zoom,
    image: imageRef,
    onCommit: (next) => {
      setZoom(next);
      onZoomChange?.(next.scale > 1);
    },
  });
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
      style={{ touchAction: 'none', ...(placeholder !== undefined ? { backgroundImage: `url("${placeholder}")`, backgroundSize: 'cover' } : {}) }}
      {...pinch}
      onDoubleClick={(event) => {
        event.stopPropagation();
        const next = zoom.scale > 1 ? 1 : DOUBLE_TAP_SCALE;
        setZoom({ ...UNZOOMED, scale: next });
        onZoomChange?.(next > 1);
      }}
    >
      <img
        ref={imageRef}
        key={failure.attempt}
        src={src}
        onError={failure.onError}
        alt={described.text}
        {...(lang !== undefined ? { lang } : {})}
        className="media-viewer-media transition-transform"
        style={{ transform: viewerZoomTransform(zoom), transformOrigin: zoom.origin }}
        draggable={false}
      />
    </div>
  );
}

/** Une page HORS de la fenêtre de rendu — le fond ThumbHash seul, aucun octet de média chargé. */
function ViewerBackdropPage({ attachment }: { readonly attachment: Attachment }) {
  const placeholder = thumbHashPlaceholder(attachment.thumbHash);
  return (
    <div
      className="size-full bg-media-backdrop"
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
      className="flex size-full flex-col items-center justify-center gap-2 bg-media-backdrop text-on-media-3"
    >
      <Glyph name={kind === 'video' ? 'fillPlay' : 'image'} size={40} className="opacity-40" />
      <Glyph name="eyeSlash" size={GLYPH_SIZE.lg} className="opacity-40" />
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
  onNearStart,
  fallbackLanguageAt,
  actionsAt,
  shareMedia,
  container,
}: MediaViewerProps) {
  /* LA PAGE SE SUIT PAR SON IDENTITÉ (#6303), miroir `GalleryPagePinning`
     (`+SourceGrowth.swift`) : la liste peut GRANDIR par le début (pages plus
     anciennes) pendant qu'on regarde — une position figée glisserait alors sur
     une autre photo. Une pièce retirée retombe sur sa dernière position. */
  const [pinned, setPinned] = useState(() => {
    const at = clampIndex(startIndex, items.length);
    return { id: items[at]?.id, index: at };
  });
  const pinnedAt = pinned.id === undefined ? -1 : items.findIndex((attachment) => attachment.id === pinned.id);
  const index = pinnedAt >= 0 ? pinnedAt : clampIndex(pinned.index, items.length);
  /* L'OUVERTURE CONFIÉE PAR LA CARTE DU FIL (#8598) — reprise UNE fois, pour
     la page d'entrée seule : une page atteinte ensuite ne rejoue rien. */
  const [opening] = useState(() => {
    const entry = items[pinned.index];
    if (entry === undefined || scenes?.has(entry.id) !== true) return null;
    const taken = takeSceneOpening(entry.id);
    return taken === null ? null : { itemId: entry.id, opening: taken };
  });
  const [presentation, setPresentation] = useState<StagePresentation>(CARDED_STAGE);
  const [zoomedId, setZoomedId] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const activePlayToggleRef = useRef<(() => void) | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);

  useBackDismiss(onClose);
  useConversationViewingFocus();

  const [transportSlot, setTransportSlot] = useState<HTMLElement | null>(null);
  const [railSlot, setRailSlot] = useState<HTMLElement | null>(null);
  const [infoSlot, setInfoSlot] = useState<HTMLElement | null>(null);
  const [notice, announce] = useNotice();
  const language = currentInterfaceLanguage();

  const current = items[index];
  const currentCarrier = carrierAt?.(index) ?? carrier;
  /* FERMER N'ARRÊTE PAS LE VOCAL (#9256) — la page audio active remet ce
     qu'elle jouait, le mini-lecteur de la coquille le reprend. */
  /* « PARTAGER » D'UN MÉDIA NU (#8884) — l'image d'un commentaire, le média
     d'une publication, sans message à citer ni à réagir : l'hôte qui SAIT son
     média public le demande (`shareMedia`). JAMAIS par défaut : les visionneuses
     de messages protégés reçoivent des pièces RÉVÉLÉES (drapeaux levés,
     `revealedAttachment`) — un repli implicite les ferait sortir. Un hôte qui
     répond `actionsAt` → `null` a dit qu'il ne sait pas : on ne lui invente rien. */
  const page =
    actionsAt !== undefined ? actionsAt(index) : shareMedia === true && current !== undefined ? standaloneSharePage(current) : null;
  const registerCarry = useCarryOnClose({
    currentId: current?.id,
    title: currentCarrier?.sender?.displayName ?? null,
    conversationId: page?.conversationId ?? null,
    messageId: page?.messageId ?? null,
  });
  const currentSceneEntry = current === undefined ? undefined : scenes?.get(current.id);
  const insets = safeAreaInsets();
  // La hauteur du couloir HAUT — le haut du plateau dans le repère du
  // viewport, que `fullStageBox` retranche pour recentrer une page scène
  // sur le viewport ENTIER (revue-correction #6902).
  const topCorridorHeight = STAGE.topCorridorHeight + insets.top;

  /* LA FEUILLE D'ENVOI (#8884) est montée par la coquille, DANS `#root` : tant
     que la visionneuse le tient inerte, « Partager » ouvrirait une feuille
     qu'aucun doigt ni aucune touche n'atteint. Elle lève l'inertie le temps de
     la feuille (modale elle-même : le reste est inerte par `showModal`) et la
     rétablit à sa fermeture. DÉCLARÉ AVANT l'effet d'ouverture : au démontage,
     les nettoyages courent dans l'ordre — celui-ci remet l'inertie, celui de
     l'ouverture la retire, et `#root` ne reste jamais inerte derrière nous. */
  const sendSheetOpen = useSendSheetOpen();
  useEffect(() => {
    if (!sendSheetOpen) return;
    const root = document.getElementById('root');
    root?.removeAttribute('inert');
    return () => root?.setAttribute('inert', '');
  }, [sendSheetOpen]);

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

  /* LE FOND SE LÈVE AVEC LA SCÈNE (#8598) — ouverte depuis une carte, la
     couche part TRANSPARENTE (le fil reste visible derrière la scène qui
     grandit) et les couloirs apparaissent en fondu : jamais un noir qui tombe
     d'un bloc. Même durée que la boîte (`ViewerScenePage`). */
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (opening?.opening.origin == null || dialog === null || typeof dialog.animate !== 'function' || prefersReducedMotion()) return;
    const timing = { duration: SCENE_OPENING_MS, easing: SCENE_OPENING_EASING };
    dialog.animate(
      [{ backgroundColor: 'color-mix(in srgb, var(--color-media-backdrop) 0%, transparent)' }, { backgroundColor: 'var(--color-media-backdrop)' }],
      timing,
    );
    for (const chrome of dialog.querySelectorAll<HTMLElement>('[data-viewer-top-bar], [data-viewer-bottom-bar], [data-scene-viewer-controls]')) {
      chrome.animate([{ opacity: 0 }, { opacity: 1 }], timing);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onNearEndRef = useRef(onNearEnd);
  onNearEndRef.current = onNearEnd;
  useEffect(() => {
    if (items.length - 1 - index < NEAR_END_PAGES) onNearEndRef.current?.();
  }, [index, items.length]);

  const onNearStartRef = useRef(onNearStart);
  onNearStartRef.current = onNearStart;
  useEffect(() => {
    if (index < NEAR_END_PAGES) onNearStartRef.current?.();
  }, [index, items.length]);

  const goTo = (next: number): void => {
    const at = clampIndex(next, items.length);
    setPinned({ id: items[at]?.id, index: at });
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
        (el) => !el.hasAttribute('disabled') && el.closest('[inert]') === null,
      );
      if (focusables.length === 0) return;
      const activeElement = document.activeElement;
      const currentPos = focusables.indexOf(activeElement as HTMLElement);
      const next = nextFocusIndex(focusables.length, currentPos === -1 ? 0 : currentPos, e.shiftKey);
      e.preventDefault();
      focusables[next]?.focus();
    }
  };

  const audioPage = current !== undefined && kindOf(current) === 'audio';
  const longPress = useLongPress({
    onOpen: () => {
      if (!audioPage) setPresentation(() => stageAfter(CARDED_STAGE, 'longPress'));
    },
  });

  /* LE GESTE COMMUN DES PLEIN ÉCRANS (#8879, `viewer-chrome-gestures.ts`) :
     glisser vers le bas FERME (la scène suit le doigt), l'horizontale
     PAGINE, glisser vers le haut entre en plein cadre depuis la carte. La
     visionneuse n'en porte plus la mécanique — story et réel ferment du même
     doigt. Une image zoomée garde le doigt pour elle-même. */
  const swipe = useViewerSwipe({
    onDismiss: onClose,
    onNext: () => goTo(index + 1),
    onPrevious: () => goTo(index - 1),
    onUp: () => {
      if (presentation.kind === 'carded') setPresentation({ kind: 'full', pausedOnEntry: false });
    },
    follow: trackRef,
    enabled: zoomedId === null || zoomedId !== current?.id,
    rtl: document.dir === 'rtl',
  });

  // Tap sur la scène — bascule le plateau. Les contrôles du chrome coupent
  // eux-mêmes leurs événements (`viewer-chrome.tsx`) : le tap sur une action
  // réelle ne bascule rien. Un toucher qui a glissé n'est pas un tap.
  const onStageClick = (): void => {
    if (swipe.wasDrag() || audioPage) return;
    setPresentation((p) => stageAfter(p, 'tap'));
  };

  /* LE CHROME CÈDE AU PLEIN CADRE ET AU ZOOM (#8644) : une image agrandie ne
     se lit pas sous « Fermer », sa légende et la pellicule. Au navigateur, un
     double tap est aussi deux taps (la bascule plein cadre s'annule) : c'est
     l'état zoomé de la page COURANTE qui compte. */
  const chromeHidden = presentation.kind === 'full' || (zoomedId !== null && zoomedId === current?.id);
  if (current === undefined) return null;

  const identity = carrierIdentity(currentCarrier);
  const footer = carrierFooter({ carrier: currentCarrier, ...(currentSceneEntry !== undefined ? { sceneEntry: currentSceneEntry } : {}) });
  const replyOffered = page !== null && page.offers.reply ? page.onReply : undefined;
  const railOffered = page !== null && (page.offers.react || page.offers.compose || page.offers.share);
  /* UNE VIDÉO QUI SE LIT (#9577) — sa page pose, par portail, le muet et « ⋯ »
     dans la colonne d'actions et la durée dans la ligne d'informations. Une
     scène n'a ni cotes ni poids ; une pièce masquée ne se lit pas. */
  const playsVideo = currentSceneEntry === undefined && kindOf(current) === 'video' && !maskedAttachment(current);
  const showsFacts = currentCarrier !== undefined && currentSceneEntry === undefined;
  const rail =
    railOffered || playsVideo ? (
      <div className="flex flex-col items-center gap-2">
        {page !== null && railOffered ? (
          <Suspense fallback={null}>
            <ViewerMediaActions key={`rail:${current.id}`} slot="rail" page={page} language={language} onClose={onClose} announce={announce} hidden={chromeHidden} />
          </Suspense>
        ) : null}
        {playsVideo ? <div ref={setRailSlot} data-viewer-video-controls="" className="flex flex-col items-center gap-2" /> : null}
      </div>
    ) : undefined;
  /* LA COLONNE FLOTTE SUR LA SCÈNE (#9578), miroir `cadreActionColumn` : posée
     au bord de fin du plateau, elle ne prend aucune hauteur à la scène, et la
     barre de progression colle sous elle. Une page SCÈNE garde son pied posé
     sur elle (placement `overlay`), où la colonne partage la rangée de la
     légende sans rien retrancher ; une page AUDIO aussi, dans le couloir : sa
     colonne de commandes et sa transcription occupent toute la scène, une
     colonne posée dessus les couvrirait. */
  const floatsRail = currentSceneEntry === undefined && !audioPage;
  const floatingRail = floatsRail && rail !== undefined ? yieldingChrome({ hidden: chromeHidden, reducedMotion: prefersReducedMotion() }) : null;

  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={`${scenes !== undefined ? 'Scène' : 'Média'} ${index + 1} sur ${items.length}`}
      data-media-viewer
      data-viewer-index={index}
      data-viewer-attachment={current.id}
      {...(scenes !== undefined ? { 'data-scene-fullscreen': '' } : {})}
      className="media-viewer-layer fixed inset-0 flex flex-col bg-media-backdrop"
      onKeyDown={onKeyDown}
      tabIndex={-1}
    >
      {/* Barre haute — le chrome COMMUN des plein écrans (#8879) : l'auteur et
          l'heure, « … » (Enregistrer y vit, iOS #6145), puis la croix EN FIN de
          rangée. Dans le COULOIR noir au-dessus du plateau ; sa hauteur
          (`safe-top + 56`) est exactement `topCorridorHeight`. Elle cède au
          plein cadre ET au zoom (#8644) : inerte, donc intouchable autant
          qu'invisible (#7040) — un appui en haut ne FERME jamais sous un doigt
          qui ne voit rien. Au-dessus d'une page scène en plein viewport
          (`z-10`, #6902). */}
      <ViewerTopBar
        placement="corridor"
        hidden={chromeHidden}
        exit={{ kind: 'close', label: 'Fermer', onExit: onClose, buttonRef: closeButtonRef }}
        {...(identity !== undefined ? { identity } : {})}
        {...(page !== null && page.offers.save
          ? {
              trailing: (
                <Suspense fallback={null}>
                  <ViewerMediaActions key={`menu:${current.id}`} slot="menu" page={page} language={language} onClose={onClose} announce={announce} />
                </Suspense>
              ),
            }
          : {})}
      />

      {/* L'issue d'une action : UNE région vivante pour toute la couche. */}
      <p
        role="status"
        aria-live="polite"
        data-viewer-notice={notice ?? ''}
        className={
          notice === null
            ? 'sr-only'
            : 'pointer-events-none absolute inset-x-0 z-20 mx-auto w-fit rounded-full bg-scrim px-3 py-1 text-mini text-on-media'
        }
        style={notice === null ? undefined : { top: 'calc(var(--safe-top, 0px) + 64px)' }}
      >
        {notice === null ? '' : translate(language, notice)}
      </p>

      {/* Le cadre — pages, et la colonne d'actions qui flotte sur lui (#9578). */}
      <div data-viewer-stage="" className="media-viewer-stage">
        <div
          ref={trackRef}
          className="media-viewer-track-frame relative flex-1"
          onClick={onStageClick}
          onContextMenu={(e) => e.preventDefault()}
          onPointerDown={(e: ReactPointerEvent<HTMLDivElement>) => {
            if (!e.isPrimary) {
              swipe.handlers.onPointerCancel(e);
              longPress.onPointerCancel();
              return;
            }
            swipe.handlers.onPointerDown(e);
            longPress.onPointerDown(e);
          }}
          onPointerMove={(e: ReactPointerEvent<HTMLDivElement>) => {
            swipe.handlers.onPointerMove(e);
            longPress.onPointerMove(e);
          }}
          onPointerUp={(e: ReactPointerEvent<HTMLDivElement>) => {
            swipe.handlers.onPointerUp(e);
            longPress.onPointerUp();
          }}
          onPointerCancel={(e: ReactPointerEvent<HTMLDivElement>) => {
            swipe.handlers.onPointerCancel(e);
            longPress.onPointerCancel();
          }}
        >
          {items.map((attachment, i) => {
            const distance = i - index;
            if (Math.abs(distance) > 1 && i !== index) return null; // hors fenêtre ET hors page courante : pas monté du tout
            const fullPixels = rendersFullPixels(distance);
            const isMasked = maskedAttachment(attachment);
            const sceneEntry = scenes?.get(attachment.id);
            return (
              <div
                key={attachment.id === '' ? String(i) : attachment.id}
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
                    corridorSlot={transportSlot}
                    opening={opening !== null && opening.itemId === attachment.id ? opening.opening : null}
                  />
                ) : isMasked ? (
                  <ViewerMaskedPage attachment={attachment} />
                ) : kindOf(attachment) === 'audio' ? (
                  <Suspense fallback={<ViewerBackdropPage attachment={attachment} />}>
                    <ViewerAudioPage
                      attachment={attachment}
                      isActive={i === index}
                      languages={languages}
                      fallbackLanguage={fallbackLanguageAt?.(i) ?? fallbackLanguage}
                      language={language}
                      pageIndex={i}
                      pageCount={items.length}
                      onToggleRef={(fn) => {
                        if (i === index) activePlayToggleRef.current = fn;
                      }}
                      onCarryRef={(carry) => {
                        if (i === index) registerCarry(attachment.id, carry);
                      }}
                      {...(displayLanguage !== undefined ? { displayLanguage } : {})}
                      {...(deps !== undefined ? { deps } : {})}
                    />
                  </Suspense>
                ) : kindOf(attachment) === 'video' ? (
                  <Suspense fallback={<ViewerBackdropPage attachment={attachment} />}>
                    <ViewerVideoPage
                      attachment={attachment}
                      isActive={i === index}
                      presentation={presentation}
                      onToggleRef={(fn) => {
                        if (i === index) activePlayToggleRef.current = fn;
                      }}
                      slots={{ transport: transportSlot, rail: railSlot, info: infoSlot }}
                      showsFacts={(carrierAt?.(i) ?? carrier) !== undefined}
                      language={language}
                    />
                  </Suspense>
                ) : (
                  <ViewerImagePage
                    attachment={attachment}
                    languages={languages}
                    fallbackLanguage={fallbackLanguageAt?.(i) ?? fallbackLanguage}
                    isActive={i === index}
                    isMine={isMineAt?.(i) ?? isMine}
                    language={language}
                    onZoomChange={(zoomed) => setZoomedId(zoomed ? attachment.id : null)}
                    {...(displayLanguage !== undefined ? { displayLanguage } : {})}
                    {...(deps !== undefined ? { deps } : {})}
                  />
                )}
              </div>
            );
          })}
        </div>
        {floatingRail !== null ? (
          <div
            data-viewer-stage-rail=""
            data-viewer-rail-slot=""
            data-chrome-yields={floatingRail['data-chrome-yields']}
            inert={floatingRail.inert}
            className="media-viewer-stage-rail viewer-chrome pointer-events-none"
            style={floatingRail.style}
          >
            {rail}
          </div>
        ) : null}
      </div>

      {/* Barre basse. Sous une image ou une vidéo (#9578), de haut en bas : la
          barre de progression d'un bord à l'autre, COLLÉE sous la scène (#6359,
          la page vidéo ACTIVE y rend `MediaTransport` par un portail), la ligne
          d'informations « cotes · poids · durée », la légende, la capsule
          « Répondre… » (l'hôte seul décide qu'il sait répondre : loi 4), puis la
          pellicule. Sur une page scène en plein viewport, le pied se pose SUR
          elle avec le voile commun (#6902 : l'encre tombe sur la couleur de la
          scène, jamais sur le noir du plateau), légende et colonne sur une même
          rangée, comme sous un vocal. */}
      {floatsRail ? (
        <ViewerBottomBar placement="corridor" hidden={chromeHidden} probe={{ 'data-viewer-footer': '' }}>
          <div ref={setTransportSlot} data-viewer-transport-slot />
          {playsVideo ? (
            <div ref={setInfoSlot} data-viewer-info-slot="" />
          ) : (
            <ViewerInfoLine attachment={current} facts={showsFacts} duration={null} language={language} />
          )}
          {footer !== undefined ? (
            <div data-viewer-caption="" className="viewer-ink-shadow flex min-w-0 flex-col gap-1 px-4">
              {footer}
            </div>
          ) : null}
          {replyOffered !== undefined ? (
            <div className="px-3">
              <ViewerReplyCapsule label={translate(language, 'media.viewer.reply')} onReply={replyOffered} />
            </div>
          ) : null}
          {items.length > 1 && !audioPage ? <MediaFilmstrip items={items} currentIndex={index} onSelect={goTo} language={language} /> : null}
        </ViewerBottomBar>
      ) : (
        <ViewerBottomBar
          placement={currentSceneEntry !== undefined ? 'overlay' : 'corridor'}
          hidden={chromeHidden}
          probe={{ 'data-viewer-footer': '' }}
          {...(footer !== undefined ? { caption: footer } : {})}
          {...(rail !== undefined ? { rail } : {})}
          reply={{ label: translate(language, 'media.viewer.reply'), onReply: replyOffered }}
        >
          <div ref={setTransportSlot} data-viewer-transport-slot />
          {audioPage ? <ViewerInfoLine attachment={current} facts={showsFacts} duration={null} language={language} /> : null}
          {items.length > 1 && !audioPage ? <MediaFilmstrip items={items} currentIndex={index} onSelect={goTo} language={language} /> : null}
        </ViewerBottomBar>
      )}
    </div>,
    container ?? document.body,
  );
}
