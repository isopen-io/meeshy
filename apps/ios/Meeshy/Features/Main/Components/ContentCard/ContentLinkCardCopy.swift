import Foundation
import MeeshySDK

/// Les mots de la carte d'un lien de contenu (#19332) — ceux que l'app emploie
/// déjà pour les quatre types (« Publication », « Réel », « Story »,
/// « Humeur ») et pour « Publication de X », plus les seuls qui manquaient,
/// tous au catalogue de l'app dans ses sept langues.
enum ContentLinkCardCopy {

    static func kind(_ kind: PostType) -> String {
        switch kind {
        case .post: return String(localized: "content.kind.post", defaultValue: "Publication", bundle: .main)
        case .reel: return String(localized: "content.kind.reel", defaultValue: "Réel", bundle: .main)
        case .story: return String(localized: "content.kind.story", defaultValue: "Story", bundle: .main)
        case .status: return String(localized: "content.kind.mood", defaultValue: "Humeur", bundle: .main)
        }
    }

    /// « Publication de Amani Diallo » — les mots du partage (`share.preview.*`).
    static func byAuthor(_ kind: PostType, author: String) -> String {
        let format: String
        switch kind {
        case .post: format = String(localized: "share.preview.post", defaultValue: "Publication de %@", bundle: .main)
        case .reel: format = String(localized: "share.preview.reel", defaultValue: "Réel de %@", bundle: .main)
        case .story: format = String(localized: "share.preview.story", defaultValue: "Story de %@", bundle: .main)
        case .status: format = String(localized: "contentCard.byAuthor.mood", defaultValue: "Humeur de %@", bundle: .main)
        }
        return String(format: format, author)
    }

    static var unavailable: String {
        String(localized: "feed.post.detail.unavailable.title", defaultValue: "Ce contenu n'est plus disponible", bundle: .main)
    }

    static var opensHint: String {
        String(localized: "search.posts.opens", defaultValue: "Ouvre le contenu", bundle: .main)
    }

    static var loading: String {
        String(localized: "skeleton.link_row.loading", defaultValue: "Chargement d'un lien", bundle: .main)
    }

    static var saved: String {
        String(localized: "contentCard.a11y.saved", defaultValue: "Dans vos favoris", bundle: .main)
    }

    /// « 1 234 vues », accordé par le catalogue (la clé du compteur de vues
    /// d'un média de bulle).
    static func views(_ count: Int) -> String {
        String(localized: "bubble.media.a11y.viewCount", defaultValue: "\(count) vues", bundle: .main)
    }

    static func favorites(_ count: Int) -> String {
        String(localized: "contentCard.stat.favorites", defaultValue: "\(count) favoris", bundle: .main)
    }

    /// Un seul élément pour VoiceOver : « Publication de X. Texte. 1 234 vues,
    /// 5 j'aime, 12 favoris, dans vos favoris » — les compteurs que la carte
    /// MONTRE, avec leur accord du catalogue, jamais l'abrégé visuel.
    static func accessibilityLabel(for card: ContentCard) -> String {
        let counters: [String?] = [
            views(card.stats.views),
            card.stats.likes > 0 ? PostStatAccessibility.likesLabel(card.stats.likes) : nil,
            card.stats.comments > 0 ? PostStatAccessibility.commentsLabel(card.stats.comments) : nil,
            favorites(card.stats.bookmarks),
            card.isBookmarkedByMe ? saved : nil,
        ]
        let body = [card.moodEmoji, card.text].compactMap { $0 }.joined(separator: " ")
        let sentences: [String] = [
            byAuthor(card.kind, author: card.author.name),
            body,
            counters.compactMap { $0 }.joined(separator: ", "),
        ]
        return sentences.filter { !$0.isEmpty }.joined(separator: ". ")
    }
}
