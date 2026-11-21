import Foundation
import MeeshySDK

/// Les genres de la rangée de puces des publications d'un autre (planche `Autre-Publications`, K04) :
/// Tout · Photos · Réels · Stories · Statuts. Un texte seul n'a pas de genre : il ne se lit que sous « Tout ».
nonisolated enum ProfilePublicationGenre: String, CaseIterable, Hashable, Sendable {
    case all
    case photos
    case reels
    case stories
    case statuses

    /// Le genre d'une publication, lu sur son type servi puis sur ses médias ; `nil` pour un texte seul.
    static func of(_ post: FeedPost) -> ProfilePublicationGenre? {
        if post.isReel { return .reels }
        if post.isStory { return .stories }
        if (post.type ?? "").uppercased() == "STATUS" { return .statuses }
        if post.media.contains(where: { $0.type == .image || $0.type == .video }) { return .photos }
        return nil
    }

    func matches(_ post: FeedPost) -> Bool {
        self == .all || Self.of(post) == self
    }

    var title: String {
        switch self {
        case .all: return String(localized: "profile.posts.genre.all", defaultValue: "Tout", bundle: .main)
        case .photos: return String(localized: "profile.posts.genre.photos", defaultValue: "Photos", bundle: .main)
        case .reels: return String(localized: "profile.posts.genre.reels", defaultValue: "Réels", bundle: .main)
        case .stories: return String(localized: "profile.posts.genre.stories", defaultValue: "Stories", bundle: .main)
        case .statuses: return String(localized: "profile.posts.genre.statuses", defaultValue: "Statuts", bundle: .main)
        }
    }

    /// Ce que dit le vide d'un genre : « Aucun réel », « Aucune photo »…
    var emptyTitle: String {
        switch self {
        case .all: return String(localized: "profile.posts.empty", defaultValue: "Aucune publication", bundle: .main)
        case .photos: return String(localized: "profile.posts.genre.empty.photos", defaultValue: "Aucune photo", bundle: .main)
        case .reels: return String(localized: "profile.posts.empty.reels", defaultValue: "Aucun réel", bundle: .main)
        case .stories: return String(localized: "profile.posts.genre.empty.stories", defaultValue: "Aucune story", bundle: .main)
        case .statuses: return String(localized: "profile.posts.genre.empty.statuses", defaultValue: "Aucun statut", bundle: .main)
        }
    }
}
