'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { ReferenceAccess } from '@meeshy/shared/types/post-reference';
import { formatTimeRemaining } from '@meeshy/shared/utils/time-remaining';
import { useI18n } from '@/hooks/use-i18n';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { resolveKeyframeState, resolveClipTransitionOpacity, safeBackgroundImageUrl, backgroundSoundCredit, canvasV3SceneDurationsMs, type StoryKeyframeData, type StoryClipTransitionData } from '@/lib/story-transforms';
import { config } from '@/lib/config';
import { Avatar } from './Avatar';
import { TranslationToggle } from './TranslationToggle';
import { CommentList } from './CommentList';
import { StoryViewersSheet } from './StoryViewersSheet';
import { useCommentsInfiniteQuery, useCommentsList } from '@/hooks/queries/use-comments-query';
import { useCreateCommentMutation, useLikeCommentMutation, useUnlikeCommentMutation, useDeleteCommentMutation } from '@/hooks/queries/use-comment-mutations';
import { useReactToStoryMutation } from '@/hooks/social/use-stories';
import { useAuthStore } from '@/stores/auth-store';
import { getUserLanguagePreferences } from '@/utils/user-language-preferences';
import { CanvasV3Scene, type CanvasV3MediaResolution } from './CanvasV3Scene';
import { BackgroundSoundBadge } from './BackgroundSoundBadge';
import type { CanvasV3 } from '@meeshy/shared/types/canvas-v3';
import { resolvePrismTranslation } from '@meeshy/shared/utils/conversation-helpers';

/// Voile de lisibilité — identique aux DEUX chemins (legacy et v3, constat
/// 19). `CanvasV3Scene` reste un composant PUR : StoryViewer choisit tout
/// seul son contenu/sa classe et lui reste propriétaire (défini ICI) — il ne
/// fait que transiter par la prop `overlay` de la scène, seule capable de le
/// positionner ENTRE ses plans internes (`OVERLAY_Z`, `CanvasV3Scene.tsx`) ;
/// un frère DOM externe ne le peut plus depuis que la racine de la scène
/// établit son propre contexte d'empilement (`containerType`, requis par le
/// `cqw` du texte).
const READABILITY_SCRIM_CLASS =
  'absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/60 pointer-events-none';

// ============================================================================
// Types
// ============================================================================

/// Per-text overlay produced by the iOS composer (and eventually the web
/// composer). Positions are normalized 0-1 against the 9:16 canvas. Each text
/// carries its own translation map per Prisme — render time picks the best
/// available language match.
export interface StoryTextObjectData {
  id: string;
  content: string;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  translations?: Record<string, string>;
  sourceLanguage?: string;
  textStyle?: 'bold' | 'neon' | 'typewriter' | 'handwriting';
  textColor?: string;
  /// Legacy css-px size (old web payloads). Rendered as raw `px`.
  textSize?: number;
  /// Canonical iOS size in design pixels on the 1080-wide reference canvas.
  /// Rendered relative to the live canvas width (`cqw`) so a story authored on
  /// iOS keeps the same proportions on web instead of being ~2.25× too large.
  fontSizeDesign?: number;
  textAlign?: string;
  textBg?: string;
  zIndex?: number;
  /// W1 — timing par élément + keyframes posés par le composer iOS.
  startTime?: number;
  keyframes?: StoryKeyframeData[];
}

export interface StoryMediaObjectData {
  id: string;
  postMediaId: string;
  mediaType: 'image' | 'video';
  x: number;
  y: number;
  scale: number;
  rotation: number;
  isBackground?: boolean;
  zIndex?: number;
  /// W1 inc.2 — timing par élément + keyframes posés par le composer iOS.
  startTime?: number;
  keyframes?: StoryKeyframeData[];
  /// Fenêtre de SOURCE : où l'on entre dans le fichier. `undefined` ≡ 0.
  /// À ne pas confondre avec `startTime`, qui dit quand la piste démarre sur
  /// la timeline.
  sourceStart?: number;
}

export interface StoryAudioObjectData {
  id: string;
  postMediaId: string;
  x: number;
  y: number;
  volume: number;
  isBackground?: boolean;
  zIndex?: number;
  /// Fenêtre TIMELINE : quand la piste joue sur la slide.
  startTime?: number;
  duration?: number;
  loop?: boolean;
  /// Fenêtre de SOURCE : où l'on entre dans le fichier. `undefined` ≡ 0.
  sourceStart?: number;
  intrinsicDuration?: number;
}

interface StoryData {
  id: string;
  authorId?: string;
  author: { name: string; avatar?: string };
  content?: string;
  originalLanguage?: string;
  translations?: Array<{ languageCode: string; languageName: string; content: string }>;
  storyEffects?: {
    /// F2 — un blob v3 (`packages/shared/types/canvas-v3`) porte `v: 3` ;
    /// un blob legacy ne le porte jamais. Le viewer discrimine sur ce seul
    /// champ, sans parser le reste avec Zod (coût de bundle évité côté web).
    v?: number;
    /// Logement du document v3 lui-même : sans ces deux clés, l'entonnoir
    /// `postToStoryData` n'avait nulle part où poser `scenes`/`sound` et les
    /// jetait — la garde ci-dessus ne voyait alors JAMAIS un blob v3.
    scenes?: CanvasV3['scenes'];
    sound?: CanvasV3['sound'];
    background?: string; // "#hex" | "gradient:from,to" | "image_url"
    textStyle?: 'bold' | 'neon' | 'typewriter' | 'handwriting';
    textColor?: string;
    textPosition?: { x: number; y: number };
    filter?: 'vintage' | 'bw' | 'warm' | 'cool' | 'dramatic' | null;
    stickers?: Array<{ emoji: string; x: number; y: number; scale: number; rotation: number }>;
    /// Per-element overlays produced by the iOS composer. Web previously rendered
    /// `content` as a single flat block (audit T9), losing all positioning,
    /// styling, and per-element translations. These arrays mirror the iOS
    /// `StoryEffects.{textObjects, mediaObjects, audioPlayerObjects}` shape.
    textObjects?: StoryTextObjectData[];
    mediaObjects?: StoryMediaObjectData[];
    audioObjects?: StoryAudioObjectData[];
    /// W1 inc.4 — crossfades intra-slide entre clips foreground (parité
    /// reader iOS R14). Passthrough intégral depuis le JSON serveur.
    clipTransitions?: StoryClipTransitionData[];
    /// Slide duration in milliseconds (5000 default if absent). Without this,
    /// every story fell to the hardcoded 5s STORY_DURATION even when the author
    /// set a longer duration to fit a 30s video.
    slideDurationMs?: number;
  };
  /// Lookup of `postMediaId -> { url, mimeType }` for resolving foreground
  /// `mediaObjects` / `audioObjects` URLs at render time.
  mediaById?: Map<string, CanvasV3MediaResolution>;
  mediaUrl?: string;
  mediaType?: 'image' | 'video';
  createdAt: string;
  expiresAt: string;
  viewCount: number;
  /**
   * Le droit du LECTEUR d'ouvrir cette story malgré son expiration parce qu'il
   * y est référencé — déclaré par le serveur, jamais recalculé depuis
   * `expiresAt` côté client (CLAUDE.md § Prisme référence). Absent = comme
   * `'none'` : un contenu expiré sans ce champ reste bloqué.
   */
  referenceAccess?: ReferenceAccess;
}

interface StoryViewerProps {
  stories: StoryData[];
  initialIndex?: number;
  userLanguage?: string;
  currentUserId?: string;
  onClose: () => void;
  onView?: (storyId: string) => void;
  onReply?: (storyId: string, text: string) => void;
  onDelete?: (storyId: string) => void;
  onReport?: (storyId: string) => void;
  onShare?: (storyId: string) => void;
  onRepost?: (storyId: string) => void;
  /**
   * L'ANCRAGE — « garder ça pour de bon ». Action DISTINCTE de `onRepost`,
   * pas une variante : le miroir laisse la story éphémère (20 h), l'ancrage
   * la rend permanente en la republiant comme post. Deux effets différents,
   * donc deux contrôles (loi 4 : un contrôle existe s'il a un effet).
   */
  onRepostAsPost?: (storyId: string) => void;
  /** Whether to show the comments panel (default: true) */
  enableComments?: boolean;
  /** Commentaire ciblé par une navigation notification (`#comment-<id>`) :
   *  ouvre automatiquement le panneau et délègue scroll + surlignage (et la
   *  chasse aux pages) au CommentList. */
  targetCommentId?: string | null;
  /** Parent top-level quand `targetCommentId` est une réponse (`?parent=`). */
  targetParentCommentId?: string | null;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_STORY_DURATION_MS = 6000;

/// Reference canvas width the iOS composer authors against (`CanvasGeometry`).
/// Design-pixel text sizes are projected back to the live canvas relative to it.
const STORY_DESIGN_WIDTH = 1080;

const REACTION_EMOJIS = ['❤️', '🔥', '😂', '😮', '😢', '👏'];

const FILTER_MAP: Record<string, string> = {
  vintage: 'sepia(0.5) saturate(1.3)',
  bw: 'grayscale(1)',
  warm: 'saturate(1.3) brightness(1.05)',
  cool: 'saturate(0.9) hue-rotate(15deg)',
  dramatic: 'contrast(1.3) saturate(1.2)',
};

// ============================================================================
// Helpers
// ============================================================================

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}min`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h`;
}

/// `expiresAt` decides WHEN to block, never WHETHER access is allowed once
/// blocked — that verdict belongs to `referenceAccess` alone (CLAUDE.md §
/// Prisme référence: "jamais recalculé depuis expiresAt").
function isPastExpiry(expiresAt: string | undefined, now: number): boolean {
  return Boolean(expiresAt) && new Date(expiresAt as string).getTime() <= now;
}

/// Descente du Prisme sur la carte de traductions d'UN overlay de texte.
///
/// Cycle 123 — cette fonction ne voyait que le RANG 1 (`preferredLanguage`,
/// une seule langue) et rattrapait à la main le décalage de région par un
/// `startsWith` de préfixe. Deux défauts en un : elle ratait toute traduction
/// d'un rang inférieur — cas NOMINAL dès que la locale appareil (rang 4)
/// diffère de la langue applicative — et son préfixe sur-matchait (`fry`
/// Frisian pour une préférence `fr`). La descente est déléguée à la SSOT
/// unique du Prisme (`resolvePrismTranslation`), qui parcourt la chaîne
/// ORDONNÉE et canonicalise les trois sources de codes par
/// `normalizeLanguageForDedup`.
///
/// `null` de la SSOT ⇒ servir l'ORIGINAL (règle #1 du Prisme) : soit la langue
/// d'origine a gagné à son rang, soit aucune langue du lecteur n'est servie.
/// Jamais un repli implicite sur une traduction quelconque.
function resolvePrismeText(obj: StoryTextObjectData, preferredLanguages: readonly string[]): string {
  const resolved = resolvePrismTranslation({
    translations: obj.translations,
    originalLanguage: obj.sourceLanguage,
    preferredLanguages,
  });
  return resolved ? resolved.text : obj.content;
}

function textObjectClass(style?: StoryTextObjectData['textStyle']): string {
  switch (style) {
    case 'bold':
      return 'font-bold';
    case 'typewriter':
      return 'font-mono';
    case 'handwriting':
      return 'italic';
    case 'neon':
      return 'font-semibold';
    default:
      return '';
  }
}

function textObjectShadow(style?: StoryTextObjectData['textStyle']): string {
  return style === 'neon'
    ? '0 0 10px currentColor, 0 0 20px currentColor'
    : '0 1px 4px rgba(0,0,0,0.5)';
}

function parseBackground(bg?: string): React.CSSProperties {
  if (!bg) {
    return {
      background: 'linear-gradient(135deg, var(--gp-terracotta), var(--gp-deep-teal))',
    };
  }

  if (bg.startsWith('#')) {
    return { background: bg };
  }

  if (bg.startsWith('gradient:')) {
    const parts = bg.slice('gradient:'.length).split(',');
    const from = parts[0]?.trim() || 'var(--gp-terracotta)';
    const to = parts[1]?.trim() || 'var(--gp-deep-teal)';
    return { background: `linear-gradient(135deg, ${from}, ${to})` };
  }

  // W7 — treat as image URL, but ONLY internal/allow-listed ones: an
  // arbitrary URL here would make every viewer of the story issue a request
  // to a third-party host (tracking pixel / viewer IP-leak). Anything else
  // falls back to the default gradient.
  const allowedOrigins = typeof window !== 'undefined'
    ? [window.location.origin, config.backend.url]
    : [config.backend.url];
  const safe = safeBackgroundImageUrl(bg, allowedOrigins);
  if (!safe) {
    return {
      background: 'linear-gradient(135deg, var(--gp-terracotta), var(--gp-deep-teal))',
    };
  }
  return {
    backgroundImage: `url(${safe})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  };
}

// ============================================================================
// Sub-components
// ============================================================================

/// Small wrapper around `<audio>` that respects the per-object volume from the
/// composer. React's native `<audio>` doesn't take `volume` as a prop — must be
/// set imperatively via a ref. Background-tagged audio renders display:none so
/// it plays silently in the background; foreground renders the `controls` UI.
function StoryAudioElement({
  audio,
  src,
}: {
  audio: StoryAudioObjectData;
  src: string;
}) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.volume = Math.max(0, Math.min(1, audio.volume));
    }
  }, [audio.volume]);

  if (audio.isBackground) {
    return <audio ref={ref} src={src} autoPlay loop style={{ display: 'none' }} />;
  }
  return (
    <audio
      ref={ref}
      src={src}
      autoPlay
      loop
      controls
      className="absolute pointer-events-auto"
      style={{
        left: `${audio.x * 100}%`,
        top: `${audio.y * 100}%`,
        transform: 'translate(-50%, -50%)',
        width: '60%',
        zIndex: audio.zIndex ?? 3,
      }}
    />
  );
}

function ProgressBar({
  total,
  current,
  isFrozen,
  durationMs,
}: {
  total: number;
  current: number;
  /** Pause utilisateur OU buffering vidéo (W2) — la barre gèle dans les deux cas. */
  isFrozen: boolean;
  durationMs: number;
}) {
  return (
    <div className="flex gap-1 px-3 pt-3 pb-1">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className="flex-1 h-0.5 rounded-full bg-white/30 overflow-hidden"
        >
          <div
            className={cn(
              'h-full rounded-full bg-white',
              i < current && 'w-full',
              i > current && 'w-0',
              i === current && !isFrozen && 'animate-story-progress',
              i === current && isFrozen && 'story-progress-paused'
            )}
            style={
              i === current
                ? {
                    animationDuration: `${durationMs}ms`,
                    animationTimingFunction: 'linear',
                    animationFillMode: 'forwards',
                  }
                : undefined
            }
          />
        </div>
      ))}
    </div>
  );
}

function CloseIcon() {
  return (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M6 18L18 6M6 6l12 12"
      />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
      />
    </svg>
  );
}

function FlagIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M3 3v18M3 4h13l-2 4 2 4H3"
      />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
      />
    </svg>
  );
}

/**
 * L'ancrage — « garder sur mon fil ». Glyphe DISTINCT du repost : les deux
 * actions publient, mais l'une laisse l'éphémère éphémère et l'autre le rend
 * permanent. Un même glyphe pour deux permanences différentes tromperait.
 */
function KeepOnFeedIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function RepostIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
      />
    </svg>
  );
}

// ============================================================================
// StoryViewer
// ============================================================================

function StoryViewer({
  stories,
  initialIndex = 0,
  userLanguage,
  currentUserId,
  onClose,
  onView,
  onReply,
  onDelete,
  onReport,
  onShare,
  onRepost,
  onRepostAsPost,
  enableComments = true,
  targetCommentId,
  targetParentCommentId,
}: StoryViewerProps) {
  const { t } = useI18n('common');
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [replyText, setReplyText] = useState('');
  const [isPaused, setIsPaused] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [showViewers, setShowViewers] = useState(false);
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  /// B3.6 — bouton 🔇 : bascule l'état muet du lecteur LOCAL de la piste de
  /// fond v3 (`storyEffects.sound`). Persiste à travers la navigation
  /// carte→carte de la session, comme les lecteurs reels usuels.
  const [isBackgroundSoundMuted, setIsBackgroundSoundMuted] = useState(true);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const viewedRef = useRef<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);

  const authUser = useAuthStore((s) => s.user);

  // Story comments — query is enabled only when a valid story is active and comments are enabled
  const currentStoryId = stories[currentIndex]?.id ?? '';
  const commentsQuery = useCommentsInfiniteQuery({
    postId: currentStoryId,
    enabled: enableComments && !!currentStoryId,
  });
  const comments = useCommentsList(commentsQuery);
  const createCommentMutation = useCreateCommentMutation();
  const likeCommentMutation = useLikeCommentMutation();
  const unlikeCommentMutation = useUnlikeCommentMutation();
  const deleteCommentMutation = useDeleteCommentMutation();
  const reactToStoryMutation = useReactToStoryMutation();

  const story = stories[currentIndex];

  /// Constat 15 — la chaîne ORDONNÉE du Prisme (`getUserLanguagePreferences`,
  /// source de vérité unique côté web, déjà consommée par PinnedMessageBanner
  /// / useConversationFiltering), jamais une seule langue tronquée à son rang 1.
  /// Correction rattrapage (revue) — `/story/:id` est une route PUBLIQUE
  /// (`middleware.ts` ne garde que `/admin`) : `authUser` vaut `null` pour un
  /// visiteur SANS compte, alors que `userLanguage` (prop, `usePreferredLanguage()`
  /// → language-store persistant) reste DISPONIBLE sans compte. Vider la chaîne
  /// dans ce cas ferait retomber `resolvePrismeText()` sur l'original —
  /// régression du Prisme pour tout visiteur anonyme. Le repli n'est engagé QUE
  /// sans compte ; avec compte, la chaîne complète prime toujours sur la langue
  /// unique.
  ///
  /// Mémoïsée, et déclarée AVANT les retours anticipés (`!story`,
  /// `referenceAccessBlocked`) : la chaîne alimente maintenant l'auto-résolution
  /// de `TranslationToggle`, donc son identité compte.
  const preferredLanguages = useMemo(
    () => (authUser ? getUserLanguagePreferences(authUser) : userLanguage ? [userLanguage] : []),
    [authUser, userLanguage],
  );

  /// Cycle 123 — le CORPS effectivement servi, tenu par la puce de langue.
  ///
  /// Le bloc de texte rendait `story.content` — l'ORIGINAL — pendant que
  /// `TranslationToggle` (monté `showContent={false}`, car l'hôte le positionne
  /// lui-même) annonçait la langue résolue : la puce disait « Français »
  /// au-dessus d'un paragraphe anglais. Le Prisme était ANNONCÉ sans être
  /// APPLIQUÉ. Même relais que `PostDetail`, à une différence près : le viewer
  /// fait DÉFILER les stories, donc la version annoncée est estampillée de
  /// l'`id` de la story qui l'a produite. Sans cette estampille, la story
  /// suivante afficherait le corps de la précédente le temps d'une frame —
  /// le signal ne partant qu'APRÈS le rendu.
  const [displayedBody, setDisplayedBody] = useState<{ storyId: string; content: string } | null>(null);
  const handleBodyDisplayedChange = useCallback(
    (version: { content: string }) => {
      if (!currentStoryId) return;
      setDisplayedBody({ storyId: currentStoryId, content: version.content });
    },
    [currentStoryId],
  );

  // Le rendu ne consomme jamais le droit de référence ; seule la vue
  // AFFICHÉE le fait (StoryPage.onView → POST /posts/:id/view). Calculé ici,
  // avant tout hook qui en dépend — `referenceAccess` tranche seul si un
  // contenu expiré s'ouvre malgré tout, jamais `expiresAt` recalculé.
  const isCurrentStoryExpired = isPastExpiry(story?.expiresAt, Date.now());
  const referenceAccessBlocked = isCurrentStoryExpired && story?.referenceAccess !== 'granted';

  // ---- Navigation ----
  const goNext = useCallback(() => {
    if (currentIndex < stories.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      onClose();
    }
  }, [currentIndex, stories.length, onClose]);

  const goPrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
    }
  }, [currentIndex]);

  // ---- Mark as viewed ----
  // N'écarte l'enregistrement QUE quand le contenu n'est pas réellement
  // montré — c'est-à-dire quand `referenceAccessBlocked` affiche l'écran de
  // fin à la place (voir plus haut). Un contenu expiré affiché grâce à
  // `referenceAccess === 'granted'` DOIT enregistrer sa vue exactement comme
  // une story vivante : c'est ce même appel (`POST /posts/:id/view`) qui ouvre
  // la fenêtre de 24h, crée le `PostView` que l'auteur voit dans « vu par »,
  // et marque `user_mentioned` comme lu. Un simple `isCurrentStoryExpired`
  // écartait aussi ce cas — la fenêtre ne s'ouvrait alors jamais sur web.
  useEffect(() => {
    if (!story) return;
    if (referenceAccessBlocked) return;
    if (!viewedRef.current.has(story.id)) {
      viewedRef.current.add(story.id);
      onView?.(story.id);
    }
  }, [story, onView, referenceAccessBlocked]);

  // ---- Auto-advance timer ----
  // Honor the per-story `slideDurationMs` (set by the composer to fit longer
  // videos / TTS narrations) instead of a global 5s constant.
  const storyDurationMs = stories[currentIndex]?.storyEffects?.slideDurationMs ?? DEFAULT_STORY_DURATION_MS;

  // ---- W2 (parité iOS ⇄ Web, 2026-08-23) — l'enchaînement multi-scènes ----
  // Homonyme SANS rapport avec le « W2 — unified-timeline gate » ci-dessous,
  // qui vient d'un autre lot : celui-ci enchaîne les SCÈNES d'un document v3.
  // Le contrat autorise 10 scènes par document ; l'hôte n'en jouait qu'une, et
  // la story passait à la suivante à la fin de la scène 1. Le découpage est
  // celui d'iOS : une scène projetée en familles v1 EST une slide, sa durée est
  // celle d'une slide (`canvasV3SceneDurationsMs`), et l'HÔTE décide quand
  // l'index change — exactement le partage de `MeeshyScenePlayer`, qui reçoit
  // `sceneIndex` en Binding et ne l'avance jamais lui-même.
  const [sceneIndex, setSceneIndex] = useState(0);
  const sceneDurationsMs = useMemo(
    () => canvasV3SceneDurationsMs(stories[currentIndex]?.storyEffects),
    [stories, currentIndex],
  );
  // Le rang SERVI, borné au document courant : un changement de story pose son
  // `setSceneIndex(0)` au rendu SUIVANT, si bien qu'un document plus court
  // serait sinon peint à un rang qu'il n'a pas (écran noir d'une image).
  const activeSceneIndex = Math.min(sceneIndex, Math.max(0, sceneDurationsMs.length - 1));
  // Le SEGMENT que le timer court : la scène courante, ou la story entière pour
  // un blob legacy (aucune scène à enchaîner).
  const segmentDurationMs = sceneDurationsMs[activeSceneIndex] ?? storyDurationMs;

  useEffect(() => {
    setSceneIndex(0);
  }, [currentIndex]);

  // Fin de segment : la scène suivante s'il en reste une, sinon la story cède
  // la place. `goNext` reste le SEUL point de sortie d'une story.
  const advance = useCallback(() => {
    if (activeSceneIndex + 1 < sceneDurationsMs.length) {
      setSceneIndex(activeSceneIndex + 1);
      return;
    }
    goNext();
  }, [activeSceneIndex, sceneDurationsMs.length, goNext]);

  // W2 — unified-timeline gate (portage du pattern iOS R1/R2) : le timer NE
  // court plus sur une vidéo de fond qui bufferise. `isBuffering` est piloté
  // par les événements natifs du <video> principal (waiting/stalled → gel,
  // playing/canplay → reprise) ; le watchdog 5 s ci-dessous garantit qu'un
  // flux mort ne gèle jamais la story pour toujours (parité iOS
  // playbackStallWatchdogSeconds).
  const [isBuffering, setIsBuffering] = useState(false);
  const remainingMsRef = useRef<number>(segmentDurationMs);
  const startedAtRef = useRef<number | null>(null);

  useEffect(() => {
    remainingMsRef.current = segmentDurationMs;
    startedAtRef.current = null;
    setIsBuffering(false);
  }, [currentIndex, activeSceneIndex, segmentDurationMs]);

  const isTimerFrozen = isPaused || isBuffering;
  useEffect(() => {
    if (isTimerFrozen) return;

    // Reprend depuis le temps RESTANT — un gel (pause utilisateur ou
    // buffering) ne rejoue plus la durée entière alors que la barre CSS,
    // elle, conservait déjà sa position (défaut préexistant corrigé).
    startedAtRef.current = Date.now();
    timerRef.current = setTimeout(() => {
      advance();
    }, remainingMsRef.current);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (startedAtRef.current != null) {
        remainingMsRef.current = Math.max(
          0,
          remainingMsRef.current - (Date.now() - startedAtRef.current)
        );
        startedAtRef.current = null;
      }
    };
  }, [currentIndex, activeSceneIndex, isTimerFrozen, advance, segmentDurationMs]);

  // Watchdog anti-deadlock : un buffering qui dure > 5 s retombe sur
  // l'horloge murale (le timer reprend) plutôt que de geler la story.
  useEffect(() => {
    if (!isBuffering) return;
    const watchdog = setTimeout(() => setIsBuffering(false), 5000);
    return () => clearTimeout(watchdog);
  }, [isBuffering]);

  // W1 — playhead du slide pour l'interpolation des keyframes : rAF actif
  // UNIQUEMENT si le slide courant porte des keyframes (les stories statiques
  // ne paient rien) ; hérite du gel W2/pause gratuitement — quand le timer est
  // gelé, startedAtRef est nul et le temps consommé cesse d'avancer.
  // Constat 18 — un blob v3 ne porte plus `textObjects`/`mediaObjects` au
  // premier niveau (ces familles v1 vivent dans `scenes[0].objects`) : sans ce
  // second regard, le rAF ci-dessous ne s'armait JAMAIS pour une story v3 et
  // `playheadSec` restait figé à 0 — l'animation câblée en F7a mourait quand
  // même à l'exécution.
  // W2 (multi-scènes) — la scène REGARDÉE est celle qui joue, plus la seule première : sans
  // quoi une scène 2 animée ne verrait jamais son rAF s'armer.
  const v3Scene = stories[currentIndex]?.storyEffects?.scenes?.[activeSceneIndex];
  const slideHasKeyframes = Boolean(
    stories[currentIndex]?.storyEffects?.textObjects?.some((t) => t.keyframes?.length)
    || stories[currentIndex]?.storyEffects?.mediaObjects?.some(
      (m) => !m.isBackground && m.keyframes?.length
    )
    || v3Scene?.objects?.some((o) => o.timing?.keyframes?.length)
  );
  // W1 inc.4 — les crossfades intra-slide consomment le même playhead que
  // les keyframes (et héritent du même gel W2 pause/buffering).
  const slideNeedsPlayhead = slideHasKeyframes
    || Boolean(stories[currentIndex]?.storyEffects?.clipTransitions?.length)
    || Boolean(v3Scene?.clipTransitions?.length);
  const [playheadSec, setPlayheadSec] = useState(0);
  useEffect(() => {
    setPlayheadSec(0);
    if (!slideNeedsPlayhead) return;
    let raf = 0;
    const tick = () => {
      // W2 (multi-scènes) — tête de lecture RELATIVE à la scène qui joue : `timing.start` et
      // les `keyframes` d'un objet sont écrits dans le repère de SA scène (une
      // scène projetée par `StoryEffects(rendering:sceneIndex:)` démarre à 0).
      // Servir le temps cumulé de la story ferait jouer toute scène suivante
      // hors de sa fenêtre d'animation. Le segment étant déjà celui de la scène,
      // la relativité tombe de la soustraction existante.
      const consumedMs = segmentDurationMs - remainingMsRef.current;
      const liveMs = startedAtRef.current != null ? Date.now() - startedAtRef.current : 0;
      setPlayheadSec(Math.max(0, (consumedMs + liveMs) / 1000));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [slideNeedsPlayhead, currentIndex, activeSceneIndex, segmentDurationMs]);

  const primaryVideoGateHandlers = {
    onWaiting: () => setIsBuffering(true),
    onStalled: () => setIsBuffering(true),
    onPlaying: () => setIsBuffering(false),
    onCanPlay: () => setIsBuffering(false),
  };

  // ---- W5 — préchargement du slide SUIVANT ----
  // Aucun preload n'existait : chaque avance payait le cold-fetch du média.
  // Image : un décodage `new Image()` chauffe le cache HTTP du navigateur.
  // Vidéo : un élément détaché `preload="auto"` amorce le buffer (le <video>
  // monté ensuite réutilise la même entrée de cache). Fenêtre N+1 seulement —
  // parité avec la fenêtre glissante du prefetcher iOS, sans exploser la
  // bande passante mobile.
  useEffect(() => {
    const next = stories[currentIndex + 1];
    if (!next?.mediaUrl) return;
    if (next.mediaType === 'video') {
      const v = document.createElement('video');
      v.preload = 'auto';
      v.muted = true;
      v.src = next.mediaUrl;
      return () => { v.removeAttribute('src'); v.load(); };
    }
    const img = new Image();
    img.src = next.mediaUrl;
    return undefined;
  }, [currentIndex, stories]);

  // ---- Escape key ----
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') goNext();
      if (e.key === 'ArrowLeft') goPrev();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, goNext, goPrev]);

  // ---- Lock body scroll ----
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // ---- Pause when typing ----
  const handleInputFocus = useCallback(() => setIsPaused(true), []);
  const handleInputBlur = useCallback(() => setIsPaused(false), []);

  // ---- Reply ----
  const handleReply = useCallback(() => {
    const text = replyText.trim();
    if (!text || !story) return;
    onReply?.(story.id, text);
    setReplyText('');
    inputRef.current?.blur();
  }, [replyText, story, onReply]);

  const handleReplyKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleReply();
      }
    },
    [handleReply]
  );

  // ---- Click navigation ----
  const handleAreaClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // Ignore if clicking on interactive elements
      const target = e.target as HTMLElement;
      if (
        target.closest('button') ||
        target.closest('input') ||
        target.closest('a') ||
        target.closest('[role="button"]')
      ) {
        return;
      }

      const rect = e.currentTarget.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const midpoint = rect.width / 2;

      if (clickX < midpoint) {
        goPrev();
      } else {
        goNext();
      }
    },
    [goPrev, goNext]
  );

  // Reset reply text and close comments / viewers panels on story change
  useEffect(() => {
    setReplyText('');
    setShowComments(false);
    setShowViewers(false);
    setShowReactionPicker(false);
    setIsPaused(false);
  }, [currentIndex]);

  // Mirrors handleOpenComments/handleCloseComments: the picker pauses the
  // auto-advance timer for the same reason the comments panel does — a
  // two-tap emoji pick must survive the 6s window instead of being wiped by
  // the currentIndex-change reset when the timer fires mid-interaction.
  const handleOpenReactionPicker = useCallback(() => {
    setShowReactionPicker(true);
    setIsPaused(true);
  }, []);

  const handleCloseReactionPicker = useCallback(() => {
    setShowReactionPicker(false);
    setIsPaused(false);
  }, []);

  const handleToggleReactionPicker = useCallback(() => {
    if (showReactionPicker) {
      handleCloseReactionPicker();
    } else {
      handleOpenReactionPicker();
    }
  }, [showReactionPicker, handleOpenReactionPicker, handleCloseReactionPicker]);

  const handleReact = useCallback(
    (emoji: string) => {
      if (!currentStoryId) return;
      reactToStoryMutation.mutate({ storyId: currentStoryId, emoji });
      handleCloseReactionPicker();
    },
    [currentStoryId, reactToStoryMutation, handleCloseReactionPicker],
  );

  // Comments handlers
  const handleOpenComments = useCallback(() => {
    setShowComments(true);
    setIsPaused(true);
  }, []);

  const handleCloseComments = useCallback(() => {
    setShowComments(false);
    setIsPaused(false);
  }, []);

  // Ciblage d'un commentaire depuis une notification : le panneau s'ouvre de
  // lui-même (timeline en pause, comme un clic sur le bouton commentaires) —
  // le CommentList fait ensuite la chasse + scroll + surlignage. Déclaré APRÈS
  // le reset sur changement de story pour gagner l'ordre d'exécution au mount.
  useEffect(() => {
    if (enableComments && targetCommentId) handleOpenComments();
  }, [enableComments, targetCommentId, handleOpenComments]);

  // Viewers list (author only) — pause the timeline while it's open, mirroring
  // the comments panel.
  const handleOpenViewers = useCallback(() => {
    setShowViewers(true);
    setIsPaused(true);
  }, []);

  const handleCloseViewers = useCallback(() => {
    setShowViewers(false);
    setIsPaused(false);
  }, []);

  const handleSubmitComment = useCallback(
    (content: string, parentId?: string) => {
      if (!currentStoryId) return;
      createCommentMutation.mutate({ postId: currentStoryId, content, parentId });
    },
    [currentStoryId, createCommentMutation],
  );

  const handleLikeComment = useCallback(
    (commentId: string) => {
      likeCommentMutation.mutate({ postId: currentStoryId, commentId });
    },
    [currentStoryId, likeCommentMutation],
  );

  const handleUnlikeComment = useCallback(
    (commentId: string) => {
      unlikeCommentMutation.mutate({ postId: currentStoryId, commentId });
    },
    [currentStoryId, unlikeCommentMutation],
  );

  const handleDeleteComment = useCallback(
    (commentId: string) => {
      deleteCommentMutation.mutate({ postId: currentStoryId, commentId });
    },
    [currentStoryId, deleteCommentMutation],
  );

  // All hooks are declared above — safe to early-return here
  if (!story) {
    onClose();
    return null;
  }

  // Contenu expiré et droit de référence éteint (ou absent) : l'écran de fin,
  // jamais le contenu. `referenceAccess` est la SEULE source de ce verdict —
  // voir `isCurrentStoryExpired`/`referenceAccessBlocked` ci-dessus.
  if (referenceAccessBlocked) {
    return createPortal(
      <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center gap-4 text-white">
        <p className="max-w-xs text-center text-sm text-white/70">
          {t('storyReferenceUnavailable', "Ce contenu n'est plus disponible.")}
        </p>
        <button
          onClick={onClose}
          className="rounded-full bg-white/15 px-6 py-2 text-sm font-medium hover:bg-white/25 transition-colors"
        >
          {t('common.close')}
        </button>
      </div>,
      document.body
    );
  }

  const effects = story.storyEffects;
  // Constat 12 — `v >= 3`, jamais `v === 3` : un futur `v:4` (servi TEL QUEL
  // par le gateway à un client caps-3) reste lu en v3, jamais vide sur le repli.
  const isCanvasV3 = typeof effects?.v === 'number' && effects.v >= 3;
  /// L'annonce du fond (B3.3-6) n'existe que pour un blob v3 — `sound` n'a
  /// pas de logement dans la forme legacy locale de `storyEffects`.
  const backgroundSound = isCanvasV3 ? effects?.sound : undefined;
  /// Constat 3 — le crédit de bibliothèque voyage sur l'objet `kind:audio` de
  /// FOND de la scène, jamais dégradé en `♫ —` alors que la métadonnée existe.
  const backgroundSoundMeta = isCanvasV3 ? backgroundSoundCredit(effects?.scenes) : undefined;
  const bgStyles = parseBackground(effects?.background);
  const cssFilter = effects?.filter ? FILTER_MAP[effects.filter] : undefined;
  const textColor = effects?.textColor || '#ffffff';
  const textPos = effects?.textPosition || { x: 50, y: 50 };

  const textStyleClass = (() => {
    switch (effects?.textStyle) {
      case 'bold':
        return 'font-bold text-2xl';
      case 'typewriter':
        return 'font-mono text-lg';
      case 'handwriting':
        return 'italic text-xl';
      case 'neon':
        return 'font-semibold text-xl';
      default:
        return 'text-lg';
    }
  })();

  const textShadow =
    effects?.textStyle === 'neon'
      ? `0 0 10px currentColor, 0 0 20px currentColor`
      : '0 1px 4px rgba(0,0,0,0.5)';

  return createPortal(
    <div className="fixed inset-0 z-50 bg-black flex items-center justify-center">
      {/* Story container - constrained to mobile aspect ratio on desktop */}
      <div
        className="relative w-full h-full max-w-[480px] max-h-[100dvh] overflow-hidden"
        onClick={handleAreaClick}
        style={{
          ...bgStyles,
          filter: cssFilter,
        }}
      >
        {/* F2 — un blob v3 monte la scène pure (`CanvasV3Scene`) ; le chemin
            legacy ci-dessous (média de fond, overlays `effects.*`, stickers)
            devient le REPLI, jamais rendu simultanément. */}
        {isCanvasV3 ? (
          <CanvasV3Scene
            doc={effects as CanvasV3}
            /* W2 (multi-scènes) — le rang que l'hôte fait avancer au fil de sa tête de lecture.
               La scène reste PURE : elle peint le rang demandé, elle ne décide
               jamais d'en changer (miroir du Binding `sceneIndex` d'iOS). */
            sceneIndex={activeSceneIndex}
            mediaById={story.mediaById}
            preferredLanguages={preferredLanguages}
            className="absolute inset-0"
            muted={isBackgroundSoundMuted}
            playheadSec={playheadSec}
            videoGateHandlers={primaryVideoGateHandlers}
            /* W1 — le repli du libellé d'un lieu sans nom ni adresse. La scène
               est PURE et ne traduit pas ; l'hôte lui passe le mot de la locale
               active, miroir du `story.location.here` d'iOS. */
            hereLabel={t('storyLocationHere', 'Ici')}
            /* Constat 19 (corrigé rattrapage) — le voile doit peindre SOUS
               les objets posés/le texte, comme sur le chemin legacy
               ci-dessous (le média de fond principal SEUL est sous le voile,
               :944-950). Un frère externe ne peut plus le faire : la racine
               de la scène est un contexte d'empilement local (`container-
               Type`), un frère APRÈS elle ne peint qu'au-dessus de la scène
               ENTIÈRE, fg compris — d'où `overlay`, qui délègue le CONTENU du
               voile à StoryViewer et sa POSITION dans les plans à la scène
               (voir `OVERLAY_Z`, `CanvasV3Scene.tsx`). */
            overlay={<div className={READABILITY_SCRIM_CLASS} data-testid="story-readability-scrim" />}
          />
        ) : (
          <>
        {/* Media background */}
        {story.mediaUrl && story.mediaType === 'image' && (
          <img
            src={story.mediaUrl}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}
        {story.mediaUrl && story.mediaType === 'video' && (
          <video
            src={story.mediaUrl}
            autoPlay
            muted
            playsInline
            loop
            className="absolute inset-0 w-full h-full object-cover"
            data-testid="story-primary-video"
            {...primaryVideoGateHandlers}
          />
        )}

        {/* Gradient overlay for readability */}
        <div className={READABILITY_SCRIM_CLASS} data-testid="story-readability-scrim" />

        {/* Foreground media objects (iOS composer outputs normalized x/y in
            0-1 — multiply by 100 for CSS %). Resolved via the postMediaId
            lookup built in story-transforms. Background-tagged objects render
            full-bleed; foreground positioned. */}
        {effects?.mediaObjects?.map((m) => {
          const resolved = story.mediaById?.get(m.postMediaId);
          if (!resolved?.url) return null;
          if (m.isBackground) {
            return m.mediaType === 'video' ? (
              <video
                key={m.id}
                src={resolved.url}
                autoPlay
                muted
                playsInline
                loop
                className="absolute inset-0 w-full h-full object-cover"
                style={{ zIndex: m.zIndex ?? 0 }}
                {...primaryVideoGateHandlers}
              />
            ) : (
              <img
                key={m.id}
                src={resolved.url}
                alt=""
                className="absolute inset-0 w-full h-full object-cover"
                style={{ zIndex: m.zIndex ?? 0 }}
              />
            );
          }
          // Foreground: 65% of canvas short-dimension at scale=1, matches iOS
          // `baseMediaSize = shortDim * 0.65` heuristic so cross-platform render
          // stays roughly consistent.
          // W1 inc.2 — keyframes interpolés (parité iOS, fallback statique).
          const mkf = resolveKeyframeState(m.keyframes, playheadSec, m.startTime ?? 0);
          const mx = mkf?.x ?? m.x;
          const my = mkf?.y ?? m.y;
          const mScale = mkf?.scale ?? m.scale;
          const sizePct = 65 * mScale;
          // W1 inc.4 — crossfade intra-slide : opacité keyframes × facteur
          // transition (parité reader iOS R14 : composition multiplicative,
          // clips hors fenêtre masqués sur les slides à transitions). Sans
          // transitions, `undefined` préserve le style historique.
          const clipTransitions = effects?.clipTransitions;
          const fgOpacity = clipTransitions?.length
            ? (mkf?.opacity ?? 1) * resolveClipTransitionOpacity(m, clipTransitions, playheadSec)
            : mkf?.opacity;
          const fgStyle = {
            left: `${mx * 100}%`,
            top: `${my * 100}%`,
            width: `${sizePct}%`,
            opacity: fgOpacity,
            transform: `translate(-50%, -50%) rotate(${m.rotation}deg)`,
            zIndex: m.zIndex ?? 1,
          };
          return m.mediaType === 'video' ? (
            <video
              key={m.id}
              src={resolved.url}
              autoPlay
              muted
              playsInline
              loop
              className="absolute pointer-events-none rounded-lg"
              style={fgStyle}
            />
          ) : (
            <img
              key={m.id}
              src={resolved.url}
              alt=""
              className="absolute pointer-events-none rounded-lg"
              style={fgStyle}
            />
          );
        })}

        {/* Per-text overlays produced by the iOS composer. Position is
            normalized 0-1; iOS sends actual normalized values so we multiply
            by 100 for CSS percentages. Each text descends the ORDERED Prisme
            chain (`preferredLanguages`, cycle 123) — jamais le seul rang 1. */}
        {/* `containerType: inline-size` scopes `cqw` units to the canvas width
            so iOS design-pixel font sizes (1080 reference) scale to the live
            canvas. Isolated to this full-bleed wrapper so it never becomes the
            containing block for the fixed-position overlays elsewhere. */}
        <div className="absolute inset-0 pointer-events-none" style={{ containerType: 'inline-size' }}>
        {effects?.textObjects?.map((t) => {
          const resolvedText = resolvePrismeText(t, preferredLanguages);
          if (!resolvedText) return null;
          // Canonical iOS size is design px on the 1080-wide canvas → express it
          // as a fraction of the live canvas width (`cqw`). Legacy `textSize` is
          // raw css px. Fallback default keeps old behaviour for untyped data.
          const fontSize = t.fontSizeDesign != null
            ? `${((t.fontSizeDesign / STORY_DESIGN_WIDTH) * 100).toFixed(4)}cqw`
            : `${t.textSize ?? 24}px`;
          // W1 — keyframes interpolés (fallback : pose statique). `time` est
          // relatif au startTime de l'objet, easing par segment (parité iOS).
          const kf = resolveKeyframeState(t.keyframes, playheadSec, t.startTime ?? 0);
          const kx = kf?.x ?? t.x;
          const ky = kf?.y ?? t.y;
          const kScale = kf?.scale ?? t.scale;
          return (
            <div
              key={t.id}
              className={cn(
                'absolute pointer-events-none select-none whitespace-pre-wrap text-center',
                textObjectClass(t.textStyle),
              )}
              style={{
                left: `${kx * 100}%`,
                top: `${ky * 100}%`,
                opacity: kf?.opacity,
                transform: `translate(-50%, -50%) scale(${kScale}) rotate(${t.rotation}deg)`,
                fontSize,
                color: t.textColor ? (t.textColor.startsWith('#') ? t.textColor : `#${t.textColor}`) : '#ffffff',
                textShadow: textObjectShadow(t.textStyle),
                textAlign: (t.textAlign as 'left' | 'right' | 'center' | undefined) ?? 'center',
                background: t.textBg
                  ? (t.textBg.startsWith('#') ? t.textBg : `#${t.textBg}`)
                  : undefined,
                padding: t.textBg ? '4px 10px' : undefined,
                borderRadius: t.textBg ? '6px' : undefined,
                maxWidth: '85%',
                zIndex: t.zIndex ?? 2,
              }}
            >
              {resolvedText}
            </div>
          );
        })}
        </div>

        {/* Foreground / background audio players. Volume is set on mount via
            a ref because React's native `<audio>` doesn't accept `volume` as
            a prop. Background audio plays silently (display:none). */}
        {effects?.audioObjects?.map((a) => {
          const resolved = story.mediaById?.get(a.postMediaId);
          if (!resolved?.url) return null;
          return (
            <StoryAudioElement
              key={a.id}
              audio={a}
              src={resolved.url}
            />
          );
        })}

        {/* Stickers */}
        {effects?.stickers?.map((sticker, i) => (
          <div
            key={i}
            className="absolute pointer-events-none select-none"
            style={{
              left: `${sticker.x * 100}%`,
              top: `${sticker.y * 100}%`,
              transform: `translate(-50%, -50%) scale(${sticker.scale}) rotate(${sticker.rotation}deg)`,
              fontSize: '2rem',
            }}
          >
            {sticker.emoji}
          </div>
        ))}
          </>
        )}

        {/* Content layer - above background, below UI controls */}
        <div className="absolute inset-0 flex flex-col pointer-events-none">
          {/* Progress bars */}
          <div className="pointer-events-auto">
            <ProgressBar
              total={stories.length}
              current={currentIndex}
              isFrozen={isPaused || isBuffering}
              durationMs={storyDurationMs}
            />
          </div>

          {/* Header */}
          <div className="flex items-center gap-3 px-3 py-2 pointer-events-auto">
            <Avatar
              src={story.author.avatar}
              name={story.author.name}
              size="sm"
            />
            <div className="flex-1 min-w-0">
              <span className="text-sm font-semibold text-white drop-shadow-sm">
                {story.author.name}
              </span>
              <span className="text-xs text-white/70 ml-2">
                {timeAgo(story.createdAt)}
              </span>
            </div>
            {/* F3 — l'annonce du fond + bouton 🔇 (B3.3-6), après les
                détails d'auteur : n'existe que si `storyEffects.sound`
                existe (B3.5), sinon rend rien. */}
            <BackgroundSoundBadge
              sound={backgroundSound}
              title={backgroundSoundMeta?.title}
              username={backgroundSoundMeta?.username}
              durationSeconds={backgroundSoundMeta?.durationSeconds}
              muted={isBackgroundSoundMuted}
              onToggleMute={() => setIsBackgroundSoundMuted((m) => !m)}
              muteLabel={t('mute', 'Mute')}
              unmuteLabel={t('unmute', 'Unmute')}
            />
            {onShare && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onShare(story.id);
                }}
                className="p-1 rounded-full text-white/90 hover:text-white hover:bg-white/10 transition-colors duration-300"
                aria-label={t('share', 'Share')}
              >
                <ShareIcon />
              </button>
            )}
            {onRepost && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRepost(story.id);
                }}
                className="p-1 rounded-full text-white/90 hover:text-white hover:bg-white/10 transition-colors duration-300"
                aria-label={t('repost', 'Repost')}
              >
                <RepostIcon />
              </button>
            )}
            {onRepostAsPost && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRepostAsPost(story.id);
                }}
                className="p-1 rounded-full text-white/90 hover:text-white hover:bg-white/10 transition-colors duration-300"
                aria-label={t('repostAsPost', 'Keep on my feed')}
                title={t('repostAsPost', 'Keep on my feed')}
              >
                <KeepOnFeedIcon />
              </button>
            )}
            {onReport && currentUserId && story.authorId && story.authorId !== currentUserId && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onReport(story.id);
                }}
                className="p-1 rounded-full text-white/90 hover:text-white hover:bg-white/10 transition-colors duration-300"
                aria-label={t('report', 'Report')}
              >
                <FlagIcon />
              </button>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              className="p-1 rounded-full text-white/90 hover:text-white hover:bg-white/10 transition-colors duration-300"
              aria-label={t('common.close')}
            >
              <CloseIcon />
            </button>
          </div>

          {/* Spacer to push text to its positioned location */}
          <div className="flex-1 relative">
            {/* Story text content — F2: le v3 loge son propre texte dans la
                scène (`CanvasV3Scene`), jamais dans ce bloc `textStyleClass`. */}
            {!isCanvasV3 && story.content && (
              <div
                className="absolute pointer-events-auto max-w-[85%]"
                style={{
                  left: `${textPos.x}%`,
                  top: `${textPos.y}%`,
                  transform: 'translate(-50%, -50%)',
                  color: textColor,
                  textShadow,
                }}
              >
                {/* Le corps servi est celui que la puce ANNONCE : sans ce
                    relais (`onDisplayedChange`), la puce afficherait
                    « Français » au-dessus d'un paragraphe resté en version
                    originale — le Prisme annoncé sans être appliqué. */}
                <p className={cn(textStyleClass, 'text-center leading-relaxed')}>
                  {displayedBody?.storyId === story.id ? displayedBody.content : story.content}
                </p>

                {/* Translation toggle */}
                {story.originalLanguage &&
                  story.translations &&
                  story.translations.length > 0 && (
                    <div className="mt-2 flex justify-center">
                      {/* `key` par story : l'exploration manuelle du lecteur est
                          une propriété de LA story qu'il lit, jamais un état qui
                          survit au défilement vers la suivante. */}
                      <TranslationToggle
                        key={story.id}
                        originalContent={story.content}
                        originalLanguage={story.originalLanguage}
                        translations={story.translations}
                        userLanguage={userLanguage}
                        preferredLanguages={preferredLanguages}
                        variant="inline"
                        showContent={false}
                        onDisplayedChange={handleBodyDisplayedChange}
                      />
                    </div>
                  )}
              </div>
            )}
          </div>

          {/* View count & actions */}
          <div className="px-4 pb-1 flex items-center justify-between pointer-events-auto">
            <div className="flex items-center gap-3">
              {currentUserId && story.authorId === currentUserId ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (showViewers) handleCloseViewers();
                    else handleOpenViewers();
                  }}
                  className="text-xs text-white/60 hover:text-white transition-colors duration-300 underline-offset-2 hover:underline"
                  aria-label={t('viewers.open', 'See who viewed')}
                  aria-expanded={showViewers}
                >
                  {story.viewCount} vue{story.viewCount !== 1 ? 's' : ''}
                </button>
              ) : (
                <span className="text-xs text-white/50">
                  {story.viewCount} vue{story.viewCount !== 1 ? 's' : ''}
                </span>
              )}
              {story.expiresAt && (() => {
                const remaining = formatTimeRemaining(new Date(story.expiresAt).getTime(), Date.now());
                if (remaining === null) return null;
                return <span className="text-xs text-white/40">{remaining}</span>;
              })()}
            </div>
            {onDelete && currentUserId && story.authorId === currentUserId && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(story.id);
                  onClose();
                }}
                className="p-1.5 rounded-full text-white/40 hover:text-red-400 hover:bg-white/10 transition-colors duration-300"
                aria-label={t('delete')}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            )}
          </div>

          {/* Reply / Comments row */}
          <div className="px-3 pb-4 pt-1 pointer-events-auto flex flex-col gap-2">
            {/* Viewers panel (author only) — slide up above the input */}
            {showViewers && currentUserId && story.authorId === currentUserId && (
              <StoryViewersSheet
                storyId={story.id}
                open={showViewers}
                onClose={handleCloseViewers}
              />
            )}

            {/* Comments panel — slide up above the input */}
            {enableComments && showComments && (
              <div
                className="bg-black/70 backdrop-blur-md rounded-2xl border border-white/10 p-3 max-h-64 overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-white text-sm font-semibold">Comments</span>
                  <button
                    onClick={handleCloseComments}
                    className="text-white/60 hover:text-white text-xs"
                    aria-label="Close comments"
                  >
                    ✕
                  </button>
                </div>
                <CommentList
                  postId={currentStoryId}
                  comments={comments}
                  currentUserId={authUser?.id ?? null}
                  currentUser={authUser ? { username: authUser.username, avatar: authUser.avatar } : null}
                  userLanguage={userLanguage}
                  preferredLanguages={preferredLanguages}
                  isLoading={commentsQuery.isLoading}
                  hasMore={commentsQuery.hasNextPage}
                  onLoadMore={() => commentsQuery.fetchNextPage()}
                  isLoadingMore={commentsQuery.isFetchingNextPage}
                  onLikeComment={handleLikeComment}
                  onUnlikeComment={handleUnlikeComment}
                  onDeleteComment={handleDeleteComment}
                  onSubmitComment={handleSubmitComment}
                  targetCommentId={targetCommentId}
                  targetParentCommentId={targetParentCommentId}
                  className="text-white"
                />
              </div>
            )}

            {/* Input row */}
            {onReply && (
              <div className="flex items-center gap-2 bg-white/15 backdrop-blur-sm rounded-full px-4 py-2 border border-white/20">
                {enableComments && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenComments();
                    }}
                    className="text-white/70 hover:text-white transition-colors"
                    aria-label="Show comments"
                    data-testid="story-comments-button"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                  </button>
                )}
                <div className="relative">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleReactionPicker();
                    }}
                    className="text-white/70 hover:text-white transition-colors"
                    aria-label={t('react', 'React')}
                    data-testid="story-reaction-button"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                    </svg>
                  </button>

                  {showReactionPicker && (
                    <div
                      data-testid="story-reaction-picker"
                      className="absolute bottom-full left-0 mb-2 z-30 flex items-center gap-1 px-2 py-1.5 rounded-full bg-black/70 backdrop-blur-md border border-white/20"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {REACTION_EMOJIS.map((emoji) => (
                        <button
                          key={emoji}
                          onClick={() => handleReact(emoji)}
                          className="text-xl p-1 rounded-full transition-transform duration-150 hover:scale-125"
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <input
                  ref={inputRef}
                  type="text"
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  onFocus={handleInputFocus}
                  onBlur={handleInputBlur}
                  onKeyDown={handleReplyKeyDown}
                  placeholder={t('replyPlaceholder')}
                  className="flex-1 bg-transparent text-white text-sm placeholder:text-white/50 outline-none"
                />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleReply();
                  }}
                  disabled={!replyText.trim()}
                  className={cn(
                    'p-1 rounded-full transition-colors duration-300',
                    replyText.trim()
                      ? 'text-white hover:bg-white/20'
                      : 'text-white/30'
                  )}
                  aria-label={t('send')}
                >
                  <SendIcon />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Keyframe animation style */}
      <style jsx global>{`
        @keyframes storyProgress {
          from {
            width: 0%;
          }
          to {
            width: 100%;
          }
        }
        .animate-story-progress {
          animation-name: storyProgress;
        }
        .story-progress-paused {
          animation-name: storyProgress;
          animation-play-state: paused;
        }
      `}</style>
    </div>,
    document.body
  );
}

StoryViewer.displayName = 'StoryViewer';

export { StoryViewer };
export type { StoryData, StoryViewerProps };
