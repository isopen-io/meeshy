import type { ContentSurface } from '@meeshy/shared/types/content-surfaces';

/**
 * **LE CATALOGUE TYPÉ DES ÉVÉNEMENTS SOCIAUX v2** (#10499, décision
 * `services/gateway/decisions/2026-10-13-social-events-v2-…` § 2–5) — la forme
 * que le web émet. Chaque champ est une énumération, un identifiant ou un
 * entier : aucune chaîne libre, aucun texte saisi, aucune URL complète,
 * aucune image.
 */

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

export type EventTargetRef = {
  readonly kind: TargetKind;
  /** ObjectId ; nom normalisé d'un hashtag ; id de lien de suivi ou eTLD+1 d'un lien. */
  readonly id: string;
  readonly parent?: { readonly kind: TargetKind; readonly id: string };
};

/** Les surfaces du contrat v2 qui n'existent pas encore dans `CONTENT_SURFACES` (extension additive, § 2). */
export type EventSurface = ContentSurface | 'search' | 'notifications' | 'comments' | 'link_preview';

export type RankingSource =
  | 'following'
  | 'for_you'
  | 'trending'
  | 'nearby'
  | 'search'
  | 'hashtag'
  | 'sound'
  | 'profile'
  | 'bookmarks'
  | 'other';

export type ListingContext = {
  readonly feedRequestId?: string;
  readonly position?: number;
  readonly rankingSource?: RankingSource;
  readonly listingSessionId?: string;
};

/** L'impression visible au sens MRC (§ 3). */
export type ImpressionVisibility = {
  readonly maxVisibleFraction: number;
  readonly visibleMs: number;
  readonly viewable: boolean;
};

export type PrismContext = {
  readonly displayedLanguage: string;
  readonly originalLanguage?: string;
  readonly translated: boolean;
  readonly translationSource?: 'server' | 'device';
};

type Located = {
  readonly target: EventTargetRef;
  readonly surface?: EventSurface;
  readonly listing?: ListingContext;
  readonly prism?: PrismContext;
};

export type ShareDestination = 'copy_link' | 'conversation' | 'native_sheet' | 'story' | 'repost' | 'external_app' | 'other';

export type InteractionAction =
  | 'react'
  | 'unreact'
  | 'comment_open'
  | 'comment_submit'
  | 'share'
  | 'save'
  | 'unsave'
  | 'follow'
  | 'unfollow'
  | 'profile_tap'
  | 'hashtag_tap'
  | 'sound_tap'
  | 'mention_tap'
  | 'caption_expand'
  | 'translation_toggle'
  | 'original_view'
  | 'repost'
  | 'quote'
  | 'download_open';

export type NegativeAction =
  | 'quick_skip'
  | 'not_interested'
  | 'see_less'
  | 'hide'
  | 'hide_author'
  | 'mute_author'
  | 'report_open'
  | 'report_submit'
  | 'block'
  | 'unfollow_from_content';

export type PlaybackExitReason = 'completed' | 'swiped' | 'closed' | 'backgrounded' | 'error' | 'other';

export type PlaybackSummary = {
  readonly playbackId: string;
  readonly mediaId: string;
  readonly mediaDurationMs: number;
  readonly startupMs: number;
  readonly exitBeforeStart: boolean;
  readonly playedMs: number;
  readonly rebufferCount: number;
  readonly rebufferMs: number;
  readonly errorCode?: string;
  readonly errorDomain?: string;
  readonly avgBitrateKbps?: number;
  readonly renditionChanges: number;
  readonly loops: number;
  readonly pauses: number;
  readonly seeks: number;
  readonly mutedAtStart: boolean;
  readonly muteToggles: number;
  readonly captionsOn: boolean;
  /** Bitmask : 1 = 25 %, 2 = 50 %, 4 = 75 %, 8 = 100 %. */
  readonly quartiles: number;
  readonly exitReason: PlaybackExitReason;
};

export type LinkAction = 'outbound_click' | 'tracking_link_followed' | 'preview_open';

export type DiscoveryAction =
  | 'search_submitted'
  | 'search_result_click'
  | 'search_abandoned'
  | 'profile_visit'
  | 'hashtag_visit'
  | 'sound_visit'
  | 'community_visit';

export type StoryAction =
  | 'reply_sent'
  | 'quick_reaction'
  | 'poll_vote'
  | 'sticker_tap'
  | 'link_sticker_tap'
  | 'mention_sticker_tap'
  | 'exit_before_end'
  | 'tap_forward'
  | 'tap_back'
  | 'swipe_next_author'
  | 'hold_pause';

export type NotificationAction = 'received' | 'displayed' | 'opened' | 'dismissed';
export type NotificationChannel = 'apns' | 'fcm' | 'webpush' | 'in_app';

export type ScreenCaptureAction = 'screenshot' | 'recording_started' | 'recording_stopped';

export type VisibleTarget = { readonly kind: TargetKind; readonly id: string; readonly visibleFraction: number };

/** L'histogramme de vitesse, en ms passées dans [<500, 500–1500, 1500–4000, ≥4000] pt/s. */
export type VelocityHistogram = readonly [number, number, number, number];

export type ScrollListingSummary = {
  readonly listingSessionId: string;
  readonly segment: number;
  readonly durationMs: number;
  readonly activeScrollMs: number;
  readonly itemsRendered: number;
  readonly itemsViewable: number;
  readonly maxPosition: number;
  readonly distancePt: number;
  readonly velocityHistogram: VelocityHistogram;
  readonly directionChanges: number;
  readonly upDistanceRatio: number;
  readonly flings: number;
  readonly stops: number;
  readonly refreshes: number;
  readonly paginations: number;
  readonly reachedEnd: boolean;
};

export type ScrollContentKind = 'carousel' | 'long_text' | 'comments' | 'story_slides' | 'thread';

export type ScrollContentSummary = {
  readonly contentKind: ScrollContentKind;
  readonly itemsTotal: number;
  readonly maxIndexReached: number;
  readonly swipes: number;
  readonly maxScrollFraction: number;
  readonly readThroughFraction: number;
  readonly durationMs: number;
};

/** Un événement v2 tel qu'une surface le DÉCLARE — l'enveloppe est posée par la file. */
export type SocialEventV2Input =
  | (Located & {
      readonly type: 'interaction';
      readonly action: InteractionAction;
      readonly destination?: ShareDestination;
      readonly dwellBeforeMs?: number;
      readonly mutationId?: string;
    })
  | (Located & { readonly type: 'negative'; readonly action: NegativeAction; readonly reasonCode?: string; readonly visibleMs?: number })
  | (Located & { readonly type: 'playback'; readonly action: 'session' } & PlaybackSummary)
  | (Located & { readonly type: 'link'; readonly action: LinkAction; readonly domain: string; readonly trackingLinkId?: string })
  | (Located & {
      readonly type: 'discovery';
      readonly action: DiscoveryAction;
      readonly searchId?: string;
      readonly queryLength?: number;
      readonly queryLanguage?: string;
      readonly resultCount?: number;
      readonly resultKind?: TargetKind;
    })
  | (Located & {
      readonly type: 'story';
      readonly action: StoryAction;
      readonly slideIndex: number;
      readonly slideCount: number;
      readonly elapsedMs: number;
    })
  | (Located & {
      readonly type: 'notification';
      readonly action: NotificationAction;
      readonly notificationType?: string;
      readonly channel: NotificationChannel;
      readonly deliveryLatencyMs?: number;
    })
  | {
      readonly type: 'screen_capture';
      readonly action: ScreenCaptureAction;
      readonly surface?: EventSurface;
      readonly visibleTargets: readonly VisibleTarget[];
      readonly recordingMs?: number;
    }
  | { readonly type: 'scroll'; readonly action: 'listing'; readonly surface?: EventSurface } & ScrollListingSummary
  | (Located & { readonly type: 'scroll'; readonly action: 'content' } & ScrollContentSummary)
  | (Located & { readonly type: 'visibility'; readonly action: 'measured'; readonly impressionEventId?: string } & ImpressionVisibility);

export type SocialEventV2Type = SocialEventV2Input['type'];

export type SocialEventV2 = SocialEventV2Input & { readonly eventId: string; readonly occurredAt: string };

/** Ce qu'un VISITEUR peut émettre en v2 (§ 6) — le reste est réservé aux comptes. */
export const VISITOR_V2_TYPES: ReadonlySet<SocialEventV2Type> = new Set(['visibility', 'playback', 'scroll', 'screen_capture', 'link', 'discovery']);

/** Les types que la passerelle peut échantillonner (§ 7) ; tout le reste part toujours. */
export const SAMPLED_V2_TYPES: ReadonlySet<SocialEventV2Type> = new Set(['scroll', 'playback', 'visibility']);
