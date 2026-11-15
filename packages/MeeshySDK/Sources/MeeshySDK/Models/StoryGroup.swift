import CoreGraphics
import Foundation

// MARK: - Story Group
public struct StoryGroup: Identifiable, Codable, Sendable, CacheIdentifiable {
    public let id: String
    public let username: String
    public let avatarColor: String
    public let avatarURL: String?
    public let stories: [StoryItem]

    /// Snapshot serveur de la présence de l'auteur (payload feed stories,
    /// `storyAuthorSelect` gateway). Sert de résolution IMMÉDIATE à
    /// l'interstitiel d'identité au switch de groupe — l'app peut le
    /// raffiner avec le PresenceManager temps réel quand une entrée existe.
    /// Optionnel → migration douce des caches GRDB et payloads antérieurs.
    public let authorPresence: UserPresence?
    /// Le contour équipé de l'auteur (#10946), servi avec lui (#10945) ; `nil` sans contour ni
    /// sur un cache antérieur (décodage additif).
    public let authorRing: ServedProfileDecorItem?

    public var hasUnviewed: Bool { stories.contains { !$0.isViewed } }
    public var latestStory: StoryItem? { stories.last }

    /// `true` quand TOUTES les stories du groupe sont expirées (ou le groupe est
    /// vide). Le tray (app) filtre ces groupes : sans ce filtre, une vignette de
    /// groupe entièrement expiré (cache TTL > 24h, ou story expirée en cours de
    /// session sans re-fetch) ouvre puis ferme instantanément le viewer via
    /// `skipExpiredStoriesIfNeeded` (tap-puis-flash). Pur + testable via `now`
    /// explicite. Source de vérité d'expiration : `StoryItem.isExpired(at:)`.
    public func isFullyExpired(at now: Date = Date()) -> Bool {
        stories.allSatisfy { $0.isExpired(at: now) }
    }

    public init(id: String, username: String, avatarColor: String, avatarURL: String? = nil,
                stories: [StoryItem], authorPresence: UserPresence? = nil, authorRing: ServedProfileDecorItem? = nil) {
        self.id = id; self.username = username; self.avatarColor = avatarColor; self.avatarURL = avatarURL
        self.stories = stories; self.authorPresence = authorPresence; self.authorRing = authorRing
    }

    public func with(stories: [StoryItem]) -> StoryGroup {
        StoryGroup(id: id, username: username, avatarColor: avatarColor, avatarURL: avatarURL,
                   stories: stories, authorPresence: authorPresence, authorRing: authorRing)
    }
}
