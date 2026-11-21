import Foundation
import MeeshySDK

/// Les crans d'expiration d'un lien qu'on crée (planches `Lien-Creer` et `Lien-Suivi-Creer`) : quatre pour un lien de
/// partage, trois pour un lien de suivi, chacun dans l'ordre de sa planche.
nonisolated enum LinkExpiryNotch: String, CaseIterable, Hashable, Sendable {
    case hours24
    case days7
    case days30
    case never

    static let shareNotches: [LinkExpiryNotch] = [.hours24, .days7, .days30, .never]
    static let trackingNotches: [LinkExpiryNotch] = [.never, .days7, .days30]

    /// La fin du lien comptée depuis `now` ; `nil` pour « Jamais ».
    func deadline(from now: Date) -> Date? {
        switch self {
        case .hours24: return now.addingTimeInterval(24 * 3_600)
        case .days7: return now.addingTimeInterval(7 * 86_400)
        case .days30: return now.addingTimeInterval(30 * 86_400)
        case .never: return nil
        }
    }

    /// La date qui part vers la passerelle (ISO 8601) ; « Jamais » OMET la clé, un `null` serait refusé.
    func wireDeadline(from now: Date) -> String? {
        deadline(from: now).map { WireDate.string(from: $0) }
    }
}

/// L'adresse courte qu'on choisit (`meeshy.me/l/<adresse>`, `meeshy.me/chat/<adresse>`) : la règle de la passerelle
/// (2 à 50 caractères, lettres, chiffres, tirets, sans tiret au bord) resserrée au plancher de 5 qu'elle impose à un
/// compte ordinaire. Vide = une adresse tirée au hasard par le serveur.
nonisolated enum LinkSlugRules {
    static let minLength = 5
    static let maxLength = 50

    /// Ce que la saisie devient : minuscules sans accents, espaces en tirets, tout le reste retiré, sans tiret au bord.
    static func normalized(_ raw: String) -> String {
        let folded = raw.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "en"))
            .lowercased()
            .replacingOccurrences(of: " ", with: "-")
        let kept = String(folded.unicodeScalars.filter { allowed.contains($0) }.map(Character.init))
        let collapsed = kept.replacingOccurrences(of: "-{2,}", with: "-", options: .regularExpression)
        return String(collapsed.trimmingCharacters(in: CharacterSet(charactersIn: "-_")).prefix(maxLength))
    }

    static func isAcceptable(_ slug: String) -> Bool {
        slug.isEmpty || (slug.count >= minLength && slug.count <= maxLength && normalized(slug) == slug)
    }

    private static let allowed = CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyz0123456789-_")
}

// MARK: - La cible d'un lien de suivi

/// Ce qu'un lien de suivi suit (planche `Lien-Suivi-Creer`, étape 1), dans l'ordre de la planche. Un contenu part
/// typé (`targetType` / `targetId`, #19503) ET avec son adresse directe : une passerelle qui ignore la cible typée
/// résout le lien par son `originalUrl` (`DeepLinkRouter.destination(forOriginalURL:)`).
nonisolated enum TrackingLinkTarget: String, CaseIterable, Identifiable, Hashable, Sendable {
    case publication
    case reel
    case story
    case status
    case conversation
    case profile
    case external

    var id: String { rawValue }

    /// Le type que la passerelle range (`TrackingTargetType`) ; `nil` pour une adresse externe.
    var wireType: String? {
        switch self {
        case .publication: return "POST"
        case .reel: return "REEL"
        case .story: return "STORY"
        case .status: return "STATUS"
        case .conversation: return "CONVERSATION"
        case .profile: return "PROFILE"
        case .external: return nil
        }
    }

    /// Le genre de publication qu'on choisit sous la cible ; `nil` quand la cible ne se choisit pas parmi mes publications.
    var publicationGenre: ProfilePublicationGenre? {
        switch self {
        case .publication: return .photos
        case .reel: return .reels
        case .story: return .stories
        case .status: return .statuses
        case .conversation, .profile, .external: return nil
        }
    }

    /// Une cible qui demande de choisir un contenu (« Quel réel ? »).
    var picksContent: Bool { self != .profile && self != .external }

    /// Une publication de MOI que cette cible peut suivre : une story seulement PUBLIQUE, car `meeshy.me/l/…`
    /// s'ouvre sans compte et élargirait l'audience d'une story réservée.
    func accepts(_ post: FeedPost) -> Bool {
        guard let genre = publicationGenre else { return false }
        let served = ProfilePublicationGenre.of(post)
        switch self {
        case .publication: return served == .photos || served == nil
        case .story: return served == genre && (post.visibility ?? "").uppercased() == "PUBLIC"
        default: return served == genre
        }
    }

    /// L'adresse directe de la cible, que la passerelle garde comme destination.
    func destination(contentId: String) -> String {
        switch self {
        case .publication, .status: return "https://meeshy.me/feeds/post/\(contentId)"
        case .reel: return "https://meeshy.me/reel/\(contentId)"
        case .story: return "https://meeshy.me/story/\(contentId)"
        case .conversation: return "https://meeshy.me/conversation/\(contentId)"
        case .profile: return "https://meeshy.me/@\(contentId)"
        case .external: return contentId
        }
    }
}

/// Un contenu choisi sous la cible : son identifiant et ce qui le nomme sur le billet.
nonisolated struct TrackingLinkContent: Identifiable, Hashable, Sendable {
    let id: String
    let title: String
    var thumbnailURL: String? = nil
}

/// Qui crée le lien : la cible « Mon profil » suit sa vitrine.
nonisolated struct TrackingLinkOwner: Equatable, Sendable {
    let userId: String
    let username: String
}

extension TrackingLinkContent {
    /// Les contenus de MOI qu'une cible peut suivre, dans l'ordre servi ; le titre est le début du texte, sinon le nom
    /// de la cible.
    static func choices(from posts: [FeedPost], for target: TrackingLinkTarget) -> [TrackingLinkContent] {
        posts.filter(target.accepts).map { post in
            let text = post.content.trimmingCharacters(in: .whitespacesAndNewlines)
            let firstLine = text.split(separator: "\n").first.map(String.init) ?? ""
            return TrackingLinkContent(id: post.id,
                                       title: firstLine.isEmpty ? LinkCreationCopy.noun(of: target) : String(firstLine.prefix(40)),
                                       thumbnailURL: ProfilePublicationTiles.thumbnail(of: post))
        }
    }
}
