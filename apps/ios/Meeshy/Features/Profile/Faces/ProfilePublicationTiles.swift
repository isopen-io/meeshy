import Foundation
import MeeshySDK
import MeeshyUI

/// Les tuiles de « Publications » sur la Vitrine (planche `Main`) : mes trois dernières publications, en VALEURS pour
/// la grille du kit (K49). Aucun type d'affichage ici : un identifiant, un genre de tuile, un nom dit, une pastille.
enum ProfilePublicationTiles {

    /// La planche en montre trois, sur une rangée : la suite vit derrière « Tout voir ».
    static let limit = 3

    /// Les tuiles à rendre. Cache vide pendant le premier chargement ⇒ trois squelettes, jamais un spinner ; rien à
    /// montrer une fois servi ⇒ aucune tuile (la section se tait).
    static func items(posts: [FeedPost], isLoading: Bool) -> [MeeshyMediaGridItem] {
        guard !posts.isEmpty else {
            return isLoading ? (0..<limit).map { skeleton(index: $0) } : []
        }
        return posts.prefix(limit).map(item(for:))
    }

    /// Ce que la section montre. Un premier chargement en échec sur un cache vide propose Réessayer au lieu de se
    /// taire ; un rechargement en cours repasse aux squelettes ; une liste déjà servie ne cède jamais à une erreur ;
    /// le serveur qui répond « rien » rend le vide et sa sortie (planche `Etat-Vide` vue 3).
    static func state(posts: [FeedPost], isLoading: Bool, pagination: PaginationState) -> ProfilePublicationsState {
        let tiles = items(posts: posts, isLoading: isLoading)
        if !tiles.isEmpty { return .tiles(tiles) }
        switch pagination {
        case .error: return .failed
        case .exhausted: return .empty
        case .idle, .loadingMore: return .silent
        }
    }

    static func item(for post: FeedPost) -> MeeshyMediaGridItem {
        let hasPicture = thumbnail(of: post) != nil
        let text = post.content.trimmingCharacters(in: .whitespacesAndNewlines)
        return MeeshyMediaGridItem(
            id: post.id,
            kind: hasPicture ? .media : .text,
            label: spokenLabel(of: post, text: text),
            badge: badge(of: post),
            text: hasPicture || text.isEmpty ? nil : text
        )
    }

    /// L'image de la tuile : la vignette du premier média visuel, sinon l'image elle-même.
    static func thumbnail(of post: FeedPost) -> String? {
        let visual = post.media.first { $0.type == .image || $0.type == .video }
        guard let visual else { return nil }
        if let thumbnail = visual.thumbnailUrl, !thumbnail.isEmpty { return thumbnail }
        guard visual.type == .image, let url = visual.url, !url.isEmpty else { return nil }
        return url
    }

    /// Un réel porte le glyphe de lecture et sa durée, écrite par le SDK (`durationFormatted`), comme sur la planche.
    static func badge(of post: FeedPost) -> MeeshyMediaTileBadge? {
        guard post.isReel else { return nil }
        let played = post.media.first { $0.type == .video || $0.type == .audio }
        return MeeshyMediaTileBadge(systemImage: "play.fill", value: played?.durationFormatted)
    }

    /// Ce que le lecteur d'écran dit d'une tuile : son genre, puis le début de son texte s'il en a un.
    static func spokenLabel(of post: FeedPost, text: String) -> String {
        let kind = ProfilePublicationsCopy.kindName(of: post)
        guard !text.isEmpty else { return kind }
        return "\(kind), \(String(text.prefix(80)))"
    }

    private static func skeleton(index: Int) -> MeeshyMediaGridItem {
        MeeshyMediaGridItem(id: "skeleton-\(index)", kind: .skeleton, label: ProfilePublicationsCopy.loading)
    }
}

/// Les trois états de « Publications » sur la Vitrine.
enum ProfilePublicationsState: Equatable {
    case silent
    case tiles([MeeshyMediaGridItem])
    case failed
    case empty
}

/// Les mots de « Publications ».
nonisolated enum ProfilePublicationsCopy {

    static var title: String {
        String(localized: "profile.vitrine.posts.title", defaultValue: "Publications", bundle: .main)
    }

    static var seeAll: String {
        String(localized: "profile.vitrine.posts.seeAll", defaultValue: "Tout voir", bundle: .main)
    }

    static var loading: String {
        String(localized: "profile.vitrine.posts.loading", defaultValue: "Chargement d'une publication", bundle: .main)
    }

    static var failed: String {
        String(localized: "profile.vitrine.posts.failed", defaultValue: "Publications indisponibles", bundle: .main)
    }

    static var retry: String {
        String(localized: "common.retry", defaultValue: "Réessayer", bundle: .main)
    }

    static var emptyTitle: String {
        String(localized: "profile.vitrine.posts.empty.title", defaultValue: "Rien de publié pour l'instant", bundle: .main)
    }

    static var publish: String {
        String(localized: "profile.vitrine.posts.empty.publish", defaultValue: "Publier quelque chose", bundle: .main)
    }

    static func kindName(of post: FeedPost) -> String {
        if post.isReel { return String(localized: "profile.vitrine.posts.reel", defaultValue: "Réel", bundle: .main) }
        if post.isStory { return String(localized: "profile.vitrine.posts.story", defaultValue: "Story", bundle: .main) }
        if post.media.contains(where: { $0.type == .video }) {
            return String(localized: "profile.vitrine.posts.video", defaultValue: "Vidéo", bundle: .main)
        }
        if post.media.contains(where: { $0.type == .image }) {
            return String(localized: "profile.vitrine.posts.photo", defaultValue: "Photo", bundle: .main)
        }
        return String(localized: "profile.vitrine.posts.post", defaultValue: "Publication", bundle: .main)
    }
}
