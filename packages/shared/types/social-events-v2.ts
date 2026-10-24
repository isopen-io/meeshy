/**
 * Le contrat v2 de `POST /api/v1/social/events` (#10499, décision
 * `services/gateway/decisions/2026-10-13-social-events-v2-chaque-interaction-avec-un-contenu-est-capturee.md`).
 *
 * La SOURCE UNIQUE des énumérations que la passerelle valide et que les
 * clients (web, iOS par recopie de ses valeurs) émettent. Toute nouvelle
 * valeur s'ajoute ICI ; une valeur inconnue d'un client plus neuf que le
 * serveur est rabattue sur `other` ou ôtée, jamais un refus du lot.
 *
 * Trois règles de compatibilité tiennent le contrat :
 *  - les cinq types de COMPTAGE (`impression`, `open`, `view`, `dwell`,
 *    `download`) gardent leurs champs obligatoires ; tout champ v2 y est
 *    facultatif, et un ancien serveur le retire en silence ;
 *  - les types v2 voyagent dans une requête À PART, jamais avec un type de
 *    comptage : un ancien serveur refuse en 400 tout lot qui porte un type
 *    qu'il ne connaît pas, et ce refus ne doit jamais emporter un comptage ;
 *  - le serveur v2 annonce ce qu'il accepte (`data.accepts`, en-tête
 *    `X-Social-Events-Version: 2`) ; un 400 sur une requête v2 fait jeter ses
 *    événements v2 et met la file v2 en sommeil.
 */

export const SOCIAL_EVENTS_SCHEMA_VERSION = 2 as const;
export const SOCIAL_EVENTS_VERSION_HEADER = 'X-Social-Events-Version';

/**
 * `dwell-start` (#10764) : le PREMIER CONTACT d'une session de consommation,
 * envoyé dès qu'elle commence, sous la clé de session que la mesure finale
 * reprendra. Type à part — jamais un `dwell` incomplet — parce qu'un serveur
 * qui ne sait pas FUSIONNER une session doit le refuser : il compterait le
 * premier contact puis ignorerait la mesure (mise à jour d'une ligne déjà
 * créée). Les clients l'envoient dans une requête à lui.
 */
export const COUNTING_EVENT_TYPES = ['impression', 'open', 'view', 'dwell', 'dwell-start', 'download'] as const;
export type CountingEventType = (typeof COUNTING_EVENT_TYPES)[number];

export const SOCIAL_EVENT_V2_TYPES = [
  'interaction',
  'negative',
  'playback',
  'link',
  'discovery',
  'story',
  'notification',
  'screen_capture',
  'scroll',
  'visibility',
] as const;
export type SocialEventV2Type = (typeof SOCIAL_EVENT_V2_TYPES)[number];

export const TARGET_KINDS = [
  'post',
  'reel',
  'story',
  'status',
  'comment',
  'profile',
  'hashtag',
  'sound',
  'community',
  'link',
  'notification',
] as const;
export type TargetKind = (typeof TARGET_KINDS)[number];

/** Les cibles qui SONT un `Post` (même collection, même garde d'audience). */
export const POST_TARGET_KINDS = ['post', 'reel', 'story', 'status'] as const satisfies readonly TargetKind[];

// ─── Actions par famille ─────────────────────────────────────────────────────

export const INTERACTION_ACTIONS = [
  'react',
  'unreact',
  'comment_open',
  'comment_submit',
  'share',
  'save',
  'unsave',
  'follow',
  'unfollow',
  'profile_tap',
  'hashtag_tap',
  'sound_tap',
  'mention_tap',
  'caption_expand',
  'translation_toggle',
  'original_view',
  'repost',
  'quote',
  'download_open',
] as const;

export const NEGATIVE_ACTIONS = [
  'quick_skip',
  'not_interested',
  'see_less',
  'hide',
  'hide_author',
  'mute_author',
  'report_open',
  'report_submit',
  'block',
  'unfollow_from_content',
] as const;

export const PLAYBACK_ACTIONS = ['session'] as const;

export const LINK_ACTIONS = ['outbound_click', 'tracking_link_followed', 'preview_open'] as const;

export const DISCOVERY_ACTIONS = [
  'search_submitted',
  'search_result_click',
  'search_abandoned',
  'profile_visit',
  'hashtag_visit',
  'sound_visit',
  'community_visit',
] as const;

export const STORY_ACTIONS = [
  'reply_sent',
  'quick_reaction',
  'poll_vote',
  'sticker_tap',
  'link_sticker_tap',
  'mention_sticker_tap',
  'exit_before_end',
  'tap_forward',
  'tap_back',
  'swipe_next_author',
  'hold_pause',
] as const;

export const NOTIFICATION_ACTIONS = ['received', 'displayed', 'opened', 'dismissed'] as const;

/**
 * La CAPTURE D'ÉCRAN du contenu affiché. On enregistre QU'il y a eu capture,
 * de quels contenus visibles et sur quel écran — jamais l'image, jamais le
 * contenu. `recording_*` vient de `UIScreen.isCaptured` (iOS), qui voit aussi
 * la recopie AirPlay / QuickTime : d'où `captureKind = recording_or_mirroring`.
 */
export const SCREEN_CAPTURE_ACTIONS = ['screenshot', 'recording_started', 'recording_stopped'] as const;

/**
 * Le DÉFILEMENT : `listing` résume une session de listing (un fil, une
 * grille), `content` le défilement À L'INTÉRIEUR d'un contenu (carrousel,
 * texte long, commentaires, slides de story, fil de discussion). Agrégé par
 * session côté client, jamais une écriture par image.
 */
export const SCROLL_ACTIONS = ['listing', 'content'] as const;

export const VISIBILITY_ACTIONS = ['measured'] as const;

export const SOCIAL_EVENT_V2_ACTIONS = {
  interaction: INTERACTION_ACTIONS,
  negative: NEGATIVE_ACTIONS,
  playback: PLAYBACK_ACTIONS,
  link: LINK_ACTIONS,
  discovery: DISCOVERY_ACTIONS,
  story: STORY_ACTIONS,
  notification: NOTIFICATION_ACTIONS,
  screen_capture: SCREEN_CAPTURE_ACTIONS,
  scroll: SCROLL_ACTIONS,
  visibility: VISIBILITY_ACTIONS,
} as const satisfies Record<SocialEventV2Type, readonly string[]>;

export type SocialEventV2Action<T extends SocialEventV2Type> = (typeof SOCIAL_EVENT_V2_ACTIONS)[T][number];

// ─── Énumérations de champs ──────────────────────────────────────────────────

/** `android` = l'application Android NATIVE (additif, #11721) ; `android_shell` = la coque Capacitor. */
export const CLIENT_PLATFORMS = ['ios', 'web', 'android_shell', 'pwa', 'android'] as const;
export const DEVICE_CLASSES = ['phone', 'tablet', 'desktop'] as const;
/** Le TIER de l'appareil qui lit (#11280), du moins au plus capable — porté par une session `playback`. */
export const DEVICE_TIERS = ['low', 'mid', 'high'] as const;
export const NETWORK_TYPES = ['wifi', 'cellular', 'ethernet', 'offline', 'unknown'] as const;
export const NETWORK_SUBTYPES = ['2g', '3g', '4g', '5g'] as const;
export const CONSENT_STATES = ['granted', 'denied', 'unknown'] as const;
export const CLIENT_CAPABILITIES = ['screenshot', 'screen_recording', 'scroll', 'playback_qoe'] as const;
export const RANKING_SOURCES = [
  'following',
  'for_you',
  'trending',
  'nearby',
  'search',
  'hashtag',
  'sound',
  'profile',
  'bookmarks',
  'other',
] as const;
export const SHARE_DESTINATIONS = [
  'copy_link',
  'conversation',
  'native_sheet',
  'story',
  'repost',
  'external_app',
  'other',
] as const;
export const PLAYBACK_EXIT_REASONS = ['completed', 'swiped', 'closed', 'backgrounded', 'error', 'other'] as const;
export const NOTIFICATION_CHANNELS = ['apns', 'fcm', 'webpush', 'in_app'] as const;
export const SCROLL_CONTENT_KINDS = ['carousel', 'long_text', 'comments', 'story_slides', 'thread'] as const;
export const CAPTURE_KINDS = ['screenshot', 'recording_or_mirroring'] as const;
export const TRANSLATION_SOURCES = ['server', 'device'] as const;
export const SEARCH_RESULT_KINDS = ['post', 'profile', 'hashtag', 'sound', 'community', 'mixed', 'other'] as const;

export type ClientPlatform = (typeof CLIENT_PLATFORMS)[number];
export type DeviceClass = (typeof DEVICE_CLASSES)[number];
export type DeviceTier = (typeof DEVICE_TIERS)[number];
export type NetworkType = (typeof NETWORK_TYPES)[number];
export type NetworkSubtype = (typeof NETWORK_SUBTYPES)[number];
export type ConsentState = (typeof CONSENT_STATES)[number];
export type ClientCapability = (typeof CLIENT_CAPABILITIES)[number];
export type RankingSource = (typeof RANKING_SOURCES)[number];
export type ShareDestination = (typeof SHARE_DESTINATIONS)[number];
export type PlaybackExitReason = (typeof PLAYBACK_EXIT_REASONS)[number];
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];
export type ScrollContentKind = (typeof SCROLL_CONTENT_KINDS)[number];
export type CaptureKind = (typeof CAPTURE_KINDS)[number];
export type TranslationSource = (typeof TRANSLATION_SOURCES)[number];
export type SearchResultKind = (typeof SEARCH_RESULT_KINDS)[number];

/** Bits des quartiles atteints par une session de lecture. */
export const PLAYBACK_QUARTILE = { q25: 1, q50: 2, q75: 4, q100: 8 } as const;

/** Bornes du défilement par vitesse, en points logiques par seconde. */
export const SCROLL_VELOCITY_BUCKETS_PT_PER_S = [500, 1500, 4000] as const;

// ─── Classes de traitement (vie privée, § 6) ─────────────────────────────────

/**
 * MESURE : mesure d'audience par contenu (pseudonyme, ne nourrit aucune
 * personnalisation). COMPORTEMENT : rattaché au compte seulement si
 * `User.analyticsConsentAt` est posé, sinon rangé SANS acteur.
 */
export const MEASUREMENT_EVENT_TYPES = [
  'impression',
  'open',
  'view',
  'download',
  'dwell',
  'dwell-start',
  'visibility',
  'playback',
  'notification',
] as const;
export const BEHAVIOUR_EVENT_TYPES = [
  'interaction',
  'negative',
  'discovery',
  'story',
  'link',
  'scroll',
  'screen_capture',
] as const satisfies readonly SocialEventV2Type[];

/** Les types v2 qu'un lecteur SANS compte peut produire. */
export const ANONYMOUS_V2_TYPES = [
  'visibility',
  'playback',
  'scroll',
  'screen_capture',
  'link',
  'discovery',
] as const satisfies readonly SocialEventV2Type[];

/** Jamais échantillonnés ailleurs que ces trois-là (§ 7). */
export const SAMPLEABLE_V2_TYPES = ['scroll', 'playback', 'visibility'] as const satisfies readonly SocialEventV2Type[];

// ─── Bornes ──────────────────────────────────────────────────────────────────

export const SOCIAL_EVENT_MAX_BYTES = 2048;
export const SOCIAL_EVENTS_V2_BATCH_CAP = 200;
export const VISIBLE_TARGETS_MAX = 10;
export const SOCIAL_EVENT_MAX_AGE_MS = 72 * 60 * 60 * 1000;
export const SOCIAL_EVENT_MAX_FUTURE_MS = 5 * 60 * 1000;
/** MRC : ≥ 50 % visible pendant ≥ 1 s continue ; vidéo en lecture ≥ 2 s. */
export const MRC_VIEWABLE_FRACTION = 0.5;
export const MRC_VIEWABLE_DISPLAY_MS = 1000;
export const MRC_VIEWABLE_VIDEO_MS = 2000;
/** Cadence client recommandée de la file v2 (§ 8 f). */
export const SOCIAL_EVENTS_V2_FLUSH_INTERVAL_MS = 10_000;
export const SOCIAL_EVENTS_V2_FLUSH_MAX_EVENTS = 50;
/** Sommeil de la file v2 après un 400 d'un serveur qui ne la connaît pas. */
export const SOCIAL_EVENTS_V2_SLEEP_AFTER_REFUSAL_MS = 60 * 60 * 1000;

// ─── Formes ──────────────────────────────────────────────────────────────────

export type SocialEventsContext = {
  readonly schemaVersion?: typeof SOCIAL_EVENTS_SCHEMA_VERSION;
  readonly sentAt?: string;
  readonly appSessionId?: string;
  readonly platform?: ClientPlatform;
  readonly appVersion?: string;
  readonly build?: string;
  readonly os?: { readonly name: string; readonly version?: string };
  readonly deviceClass?: DeviceClass;
  readonly network?: { readonly type: NetworkType; readonly subtype?: NetworkSubtype };
  readonly uiLanguage?: string;
  readonly deviceLocale?: string;
  readonly consent?: ConsentState;
  readonly capabilities?: readonly ClientCapability[];
  readonly sampling?: Readonly<Partial<Record<SocialEventV2Type, number>>>;
};

export type SocialEventTargetRef = { readonly kind: TargetKind; readonly id: string };
export type SocialEventTarget = SocialEventTargetRef & { readonly parent?: SocialEventTargetRef };

export type SocialEventListing = {
  readonly feedRequestId?: string;
  readonly position?: number;
  readonly rankingSource?: RankingSource;
  readonly listingSessionId?: string;
};

export type SocialEventVisibility = {
  readonly maxVisibleFraction?: number;
  readonly visibleMs?: number;
  readonly viewable?: boolean;
};

export type SocialEventPrism = {
  readonly displayedLanguage: string;
  readonly originalLanguage?: string;
  readonly translated: boolean;
  readonly translationSource?: TranslationSource;
};

/** Les champs d'enveloppe portés par CHAQUE événement (tous facultatifs). */
export type SocialEventEnvelope = {
  readonly eventId?: string;
  readonly occurredAt?: string;
  readonly target?: SocialEventTarget;
  readonly surface?: string;
  readonly listing?: SocialEventListing;
  readonly prism?: SocialEventPrism;
};

export type VisibleTarget = SocialEventTargetRef & { readonly visibleFraction?: number };

/** Un événement v2 tel qu'un client l'émet : type, action, cible, propriétés. */
export type SocialEventV2 = SocialEventEnvelope & {
  readonly type: SocialEventV2Type;
  readonly action: string;
  readonly target?: SocialEventTarget;
} & Readonly<Record<string, unknown>>;

/** La réponse d'un serveur v2. `ignored`, `accepts`, `sampling` sont absents d'un ancien serveur. */
export type SocialEventsResponseData = {
  readonly recorded: number;
  readonly rejected: number;
  readonly ignored?: number;
  readonly accepts?: readonly string[];
  readonly sampling?: Readonly<Partial<Record<SocialEventV2Type, number>>>;
};

const V2_TYPES: ReadonlySet<string> = new Set(SOCIAL_EVENT_V2_TYPES);
const KINDS: ReadonlySet<string> = new Set(TARGET_KINDS);
const POST_KINDS: ReadonlySet<string> = new Set(POST_TARGET_KINDS);

export const isSocialEventV2Type = (value: unknown): value is SocialEventV2Type =>
  typeof value === 'string' && V2_TYPES.has(value);

export const isTargetKind = (value: unknown): value is TargetKind =>
  typeof value === 'string' && KINDS.has(value);

export const isPostTargetKind = (value: unknown): value is (typeof POST_TARGET_KINDS)[number] =>
  typeof value === 'string' && POST_KINDS.has(value);
