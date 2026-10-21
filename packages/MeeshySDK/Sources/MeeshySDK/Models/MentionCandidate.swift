import Foundation

// MARK: - MentionCandidate

/// A resolved mention candidate for display in the autocomplete panel.
/// Carries enough information to render an avatar row and insert the mention text.
public struct MentionCandidate: Identifiable, Equatable, Sendable {
    public let id: String
    public let username: String
    public let displayName: String
    public let avatarURL: String?
    /// Le contour équipé de la personne, la référence servie (#10946) — `nil` sans contour.
    public let ring: ServedProfileDecorItem?

    public init(id: String, username: String, displayName: String, avatarURL: String?, ring: ServedProfileDecorItem? = nil) {
        self.id = id
        self.username = username
        self.displayName = displayName
        self.avatarURL = avatarURL
        self.ring = ring
    }
}
