import type { ContentSurface } from '@meeshy/shared/types/content-surfaces';
import {
  ANONYMOUS_V2_TYPES,
  SAMPLEABLE_V2_TYPES,
  type CaptureKind,
  type DeviceTier as PlaybackDeviceTier,
  type NotificationChannel,
  type PlaybackExitReason,
  type RankingSource,
  type ScrollContentKind,
  type SearchResultKind,
  type ShareDestination,
  type SocialEventV2Action,
  type TargetKind,
} from '@meeshy/shared/types/social-events-v2';

/**
 * **LE CATALOGUE TYPÉ DES ÉVÉNEMENTS SOCIAUX v2, VU DU WEB** (#10499, décision
 * `services/gateway/decisions/2026-10-13-social-events-v2-…` § 2–5) — chaque
 * famille avec ses champs, sur les énumérations UNIQUES de
 * `@meeshy/shared/types/social-events-v2` (aucune jumelle). Chaque champ est
 * une énumération, un identifiant ou un entier : aucune chaîne libre, aucun
 * texte saisi, aucune URL complète, aucune image.
 */
export type { CaptureKind, NotificationChannel, PlaybackExitReason, RankingSource, ScrollContentKind, SearchResultKind, ShareDestination, TargetKind };

export type EventTargetRef = {
  readonly kind: TargetKind;
  /** ObjectId ; nom normalisé d'un hashtag ; id de lien de suivi ou eTLD+1 d'un lien. */
  readonly id: string;
  readonly parent?: { readonly kind: TargetKind; readonly id: string };
};

/** L'écran — `CONTENT_SURFACES`, seul site de la liste (`packages/shared/types/content-surfaces.ts`). */
export type EventSurface = ContentSurface;

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

export type InteractionAction = SocialEventV2Action<'interaction'>;
export type NegativeAction = SocialEventV2Action<'negative'>;
export type LinkAction = SocialEventV2Action<'link'>;
export type DiscoveryAction = SocialEventV2Action<'discovery'>;
export type StoryAction = SocialEventV2Action<'story'>;
export type NotificationAction = SocialEventV2Action<'notification'>;
export type ScreenCaptureAction = SocialEventV2Action<'screen_capture'>;

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
  /** W11 (#11317) — le tier de l'appareil (`capability-tier.ts`), accepté par la passerelle depuis S25. */
  readonly deviceTier?: PlaybackDeviceTier;
  /** W11 (#11317) — Web Vitals de la page et longues images de la séance ; la passerelle les ignore tant qu'elle ne les lit pas. */
  readonly lcpMs?: number;
  readonly cls?: number;
  readonly inpMs?: number;
  readonly longFrames?: number;
  readonly longFramesBlockingMs?: number;
  readonly longFrameWorstMs?: number;
};

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
  | (Located & { readonly type: 'link'; readonly action: LinkAction; readonly domain?: string; readonly trackingLinkId?: string })
  | (Partial<Located> & {
      readonly type: 'discovery';
      readonly action: DiscoveryAction;
      readonly searchId?: string;
      readonly queryLength?: number;
      readonly queryLanguage?: string;
      readonly resultCount?: number;
      readonly resultKind?: SearchResultKind;
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
      /** `isCaptured` voit l'enregistrement ET la recopie : jamais distingués. */
      readonly captureKind?: CaptureKind;
    }
  | { readonly type: 'scroll'; readonly action: 'listing'; readonly surface?: EventSurface } & ScrollListingSummary
  | (Located & { readonly type: 'scroll'; readonly action: 'content' } & ScrollContentSummary)
  | (Located & { readonly type: 'visibility'; readonly action: 'measured'; readonly impressionEventId?: string } & ImpressionVisibility);

export type SocialEventV2Type = SocialEventV2Input['type'];

export type SocialEventV2 = SocialEventV2Input & { readonly eventId: string; readonly occurredAt: string };

/** Ce qu'un VISITEUR peut émettre en v2 (§ 6) — le reste est réservé aux comptes. */
export const VISITOR_V2_TYPES: ReadonlySet<SocialEventV2Type> = new Set(ANONYMOUS_V2_TYPES);

/** Les types que la passerelle peut échantillonner (§ 7) ; tout le reste part toujours. */
export const SAMPLED_V2_TYPES: ReadonlySet<SocialEventV2Type> = new Set(SAMPLEABLE_V2_TYPES);
