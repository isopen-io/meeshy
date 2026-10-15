import Foundation

// MARK: - Les familles du catalogue v2 (#10502 → #10509)
//
// Chaque structure porte les champs PROPRES de sa famille ; l'enveloppe
// (`SocialEventV2`) porte le reste. Les optionnels absents ne s'écrivent pas
// (une clé `null` serait refusée par un schéma fermé).

// MARK: interaction (#10502)

public struct SocialInteraction: Encodable, Sendable, Equatable {
    public enum Action: String, Encodable, Sendable, CaseIterable {
        case react, unreact
        case commentOpen = "comment_open"
        case commentSubmit = "comment_submit"
        case share, save, unsave, follow, unfollow
        case profileTap = "profile_tap"
        case hashtagTap = "hashtag_tap"
        case soundTap = "sound_tap"
        case mentionTap = "mention_tap"
        case captionExpand = "caption_expand"
        case translationToggle = "translation_toggle"
        case originalView = "original_view"
        case repost, quote
        case downloadOpen = "download_open"
    }

    public enum ShareDestination: String, Encodable, Sendable, CaseIterable {
        case copyLink = "copy_link"
        case conversation
        case nativeSheet = "native_sheet"
        case story, repost
        case externalApp = "external_app"
        case other
    }

    public let action: Action
    public let destination: ShareDestination?
    public let dwellBeforeMs: Int?
    public let mutationId: String?

    public init(action: Action, destination: ShareDestination? = nil, dwellBeforeMs: Int? = nil, mutationId: String? = nil) {
        self.action = action
        self.destination = action == .share ? (destination ?? .other) : nil
        self.dwellBeforeMs = dwellBeforeMs.map { max(0, $0) }
        self.mutationId = mutationId
    }

    private enum CodingKeys: String, CodingKey { case destination, dwellBeforeMs, mutationId }
}

// MARK: negative (#10503)

public struct SocialNegative: Encodable, Sendable, Equatable {
    public enum Action: String, Encodable, Sendable, CaseIterable {
        case quickSkip = "quick_skip"
        case notInterested = "not_interested"
        case seeLess = "see_less"
        case hide
        case hideAuthor = "hide_author"
        case muteAuthor = "mute_author"
        case reportOpen = "report_open"
        case reportSubmit = "report_submit"
        case block
        case unfollowFromContent = "unfollow_from_content"
    }

    public let action: Action
    public let reasonCode: String?
    public let visibleMs: Int?

    public init(action: Action, reasonCode: String? = nil, visibleMs: Int? = nil) {
        self.action = action
        self.reasonCode = reasonCode.map { String($0.prefix(64)) }
        self.visibleMs = visibleMs
    }

    /// Le skip RAPIDE : un réel ou une story quitté avant 1 s de visibilité.
    public static let quickSkipThresholdMs = 1_000

    /// `nil` dès qu'on est resté assez longtemps pour que ce ne soit pas un rejet.
    public static func quickSkip(visibleMs: Int) -> SocialNegative? {
        guard visibleMs >= 0, visibleMs < quickSkipThresholdMs else { return nil }
        return SocialNegative(action: .quickSkip, visibleMs: visibleMs)
    }

    private enum CodingKeys: String, CodingKey { case reasonCode, visibleMs }
}

// MARK: link (#10505)

public struct SocialLinkEvent: Encodable, Sendable, Equatable {
    public enum Action: String, Encodable, Sendable, CaseIterable {
        case outboundClick = "outbound_click"
        case trackingLinkFollowed = "tracking_link_followed"
        case previewOpen = "preview_open"
    }

    public let action: Action
    /// Le domaine ENREGISTRABLE (eTLD+1) — jamais l'URL, son chemin ni sa requête.
    public let domain: String
    public let trackingLinkId: String?

    public init(action: Action, domain: String, trackingLinkId: String? = nil) {
        self.action = action
        self.domain = domain
        self.trackingLinkId = trackingLinkId
    }

    private enum CodingKeys: String, CodingKey { case domain, trackingLinkId }
}

// MARK: discovery (#10505)

public struct SocialDiscovery: Encodable, Sendable, Equatable {
    public enum Action: String, Encodable, Sendable, CaseIterable {
        case searchSubmitted = "search_submitted"
        case searchResultClick = "search_result_click"
        case searchAbandoned = "search_abandoned"
        case profileVisit = "profile_visit"
        case hashtagVisit = "hashtag_visit"
        case soundVisit = "sound_visit"
        case communityVisit = "community_visit"
    }

    public enum ResultKind: String, Encodable, Sendable, CaseIterable {
        case post, profile, hashtag, sound, community, mixed, other
    }

    public let action: Action
    /// Servi par la route de recherche (`meta.searchId`) ; le TEXTE de la
    /// requête ne part jamais — l'empreinte est calculée par la passerelle.
    public let searchId: String?
    public let queryLength: Int?
    public let queryLanguage: String?
    public let resultCount: Int?
    public let resultKind: ResultKind?

    public init(action: Action, searchId: String? = nil, queryLength: Int? = nil, queryLanguage: String? = nil, resultCount: Int? = nil, resultKind: ResultKind? = nil) {
        self.action = action
        self.searchId = searchId
        self.queryLength = queryLength
        self.queryLanguage = queryLanguage
        self.resultCount = resultCount
        self.resultKind = resultKind
    }

    private enum CodingKeys: String, CodingKey { case searchId, queryLength, queryLanguage, resultCount, resultKind }
}

// MARK: story (#10506)

public struct SocialStoryEvent: Encodable, Sendable, Equatable {
    public enum Action: String, Encodable, Sendable, CaseIterable {
        case replySent = "reply_sent"
        case quickReaction = "quick_reaction"
        case pollVote = "poll_vote"
        case stickerTap = "sticker_tap"
        case linkStickerTap = "link_sticker_tap"
        case mentionStickerTap = "mention_sticker_tap"
        case exitBeforeEnd = "exit_before_end"
        case tapForward = "tap_forward"
        case tapBack = "tap_back"
        case swipeNextAuthor = "swipe_next_author"
        case holdPause = "hold_pause"
    }

    public let action: Action
    public let slideIndex: Int
    public let slideCount: Int
    public let elapsedMs: Int

    public init(action: Action, slideIndex: Int, slideCount: Int, elapsedMs: Int) {
        self.action = action
        self.slideIndex = max(0, slideIndex)
        self.slideCount = max(0, slideCount)
        self.elapsedMs = max(0, elapsedMs)
    }

    private enum CodingKeys: String, CodingKey { case slideIndex, slideCount, elapsedMs }
}

// MARK: notification (#10507)

public struct SocialNotificationEvent: Encodable, Sendable, Equatable {
    public enum Action: String, Encodable, Sendable, CaseIterable {
        case received, displayed, opened, dismissed
    }

    public enum Channel: String, Encodable, Sendable, CaseIterable {
        case apns, fcm, webpush
        case inApp = "in_app"
    }

    public let action: Action
    public let notificationType: String
    public let channel: Channel
    public let deliveryLatencyMs: Int?

    public init(action: Action, notificationType: String, channel: Channel, deliveryLatencyMs: Int? = nil) {
        self.action = action
        self.notificationType = String(notificationType.prefix(64))
        self.channel = channel
        self.deliveryLatencyMs = deliveryLatencyMs.map { max(0, $0) }
    }

    private enum CodingKeys: String, CodingKey { case notificationType, channel, deliveryLatencyMs }
}

// MARK: screen_capture (#10508)

/// Ce qui était À L'ÉCRAN au moment d'une capture — jamais l'image.
public struct SocialVisibleTarget: Encodable, Sendable, Equatable {
    public let kind: SocialTargetKind
    public let id: String
    /// `nil` : la surface sait que le contenu est à l'écran, pas dans quelle part.
    public let visibleFraction: Double?

    public init(kind: SocialTargetKind, id: String, visibleFraction: Double? = nil) {
        self.kind = kind
        self.id = id
        self.visibleFraction = visibleFraction.map(SocialEventsV2Wire.fraction)
    }
}

public struct SocialScreenCapture: Encodable, Sendable, Equatable {
    public enum Action: String, Encodable, Sendable, CaseIterable {
        case screenshot
        case recordingStarted = "recording_started"
        case recordingStopped = "recording_stopped"
    }

    /// `isCaptured` ne distingue pas un enregistrement d'une recopie
    /// (AirPlay, QuickTime) : la valeur le DIT.
    public enum CaptureKind: String, Encodable, Sendable {
        case screenshot
        case recordingOrMirroring = "recording_or_mirroring"
    }

    public static let maxVisibleTargets = 10

    public let action: Action
    public let visibleTargets: [SocialVisibleTarget]
    public let recordingMs: Int?
    public let captureKind: CaptureKind

    public init(action: Action, visibleTargets: [SocialVisibleTarget], recordingMs: Int? = nil) {
        self.action = action
        self.visibleTargets = Array(visibleTargets.prefix(Self.maxVisibleTargets))
        self.recordingMs = action == .recordingStopped ? recordingMs.map { max(0, $0) } : nil
        self.captureKind = action == .screenshot ? .screenshot : .recordingOrMirroring
    }

    private enum CodingKeys: String, CodingKey { case visibleTargets, recordingMs, captureKind }
}

// MARK: visibility (#10501)

/// La visibilité MRC d'une impression, quand elle n'était pas connue au lot.
public struct SocialVisibility: Codable, Sendable, Equatable {
    public let maxVisibleFraction: Double
    public let visibleMs: Int
    public let viewable: Bool
    public let impressionEventId: String?

    public init(maxVisibleFraction: Double, visibleMs: Int, viewable: Bool, impressionEventId: String? = nil) {
        self.maxVisibleFraction = SocialEventsV2Wire.fraction(maxVisibleFraction)
        self.visibleMs = max(0, visibleMs)
        self.viewable = viewable
        self.impressionEventId = impressionEventId
    }

    private enum CodingKeys: String, CodingKey { case maxVisibleFraction, visibleMs, viewable, impressionEventId }
}
