import Foundation
import MeeshySDK
import MeeshyUI

/// Les publications d'un autre en VALEURS pour la grille du kit (K49, planche `Autre-Publications`) : le compte, les
/// tuiles du genre choisi et la phrase de fin. Aucun type d'affichage ici.
enum ProfilePublicationsGrid {

    /// Sur un cache vide pendant le premier chargement : six squelettes, jamais un spinner.
    static let skeletonCount = 6

    /// Le rapport d'un réel vertical, projeté de la scène : il se lit debout dans la maçonnerie.
    static let reelAspect = Double(SceneShape.aspect)

    static func tiles(posts: [FeedPost], isLoading: Bool, genre: ProfilePublicationGenre) -> [MeeshyMediaGridItem] {
        guard !posts.isEmpty else {
            guard isLoading else { return [] }
            return (0..<skeletonCount).map {
                MeeshyMediaGridItem(id: "skeleton-\($0)", kind: .skeleton, label: ProfilePublicationsCopy.loading)
            }
        }
        return posts.filter(genre.matches).map(item(for:))
    }

    /// Une tuile : l'image peinte par l'hôte quand la publication en a une, sinon son texte servi (le Prisme a déjà
    /// choisi la langue), sur-titré « Statut » ou « Traduit ».
    static func item(for post: FeedPost) -> MeeshyMediaGridItem {
        let text = post.displayContent.trimmingCharacters(in: .whitespacesAndNewlines)
        let label = spokenLabel(of: post, text: text)
        guard ProfilePublicationTiles.thumbnail(of: post) != nil else {
            let overline = textOverline(of: post)
            return MeeshyMediaGridItem(id: post.id, kind: .text, label: label, badge: overline?.badge,
                                       overline: overline?.text, text: text.isEmpty ? nil : text)
        }
        return MeeshyMediaGridItem(id: post.id, kind: .media, label: label, aspect: aspect(of: post),
                                   badge: mediaBadge(of: post))
    }

    /// Un réel dit sa durée, un album son nombre de photos, une vidéo sa durée ; une photo seule ne dit rien.
    static func mediaBadge(of post: FeedPost) -> MeeshyMediaTileBadge? {
        if post.isReel { return ProfilePublicationTiles.badge(of: post) }
        let pictures = post.media.filter { $0.type == .image || $0.type == .video }
        if pictures.count > 1 { return MeeshyMediaTileBadge(systemImage: "square.on.square", value: "\(pictures.count)") }
        guard let video = pictures.first, video.type == .video else { return nil }
        return MeeshyMediaTileBadge(systemImage: "play.fill", value: video.durationFormatted)
    }

    static func textOverline(of post: FeedPost) -> (text: String, badge: MeeshyMediaTileBadge)? {
        if ProfilePublicationGenre.of(post) == .statuses {
            return (ProfilePublicationGenre.statusName, MeeshyMediaTileBadge(systemImage: "face.smiling"))
        }
        guard post.isTranslated else { return nil }
        return (ProfilePublicationsGridCopy.translated, MeeshyMediaTileBadge(systemImage: "translate"))
    }

    static func aspect(of post: FeedPost) -> Double? {
        if post.isReel { return reelAspect }
        return post.media.first { $0.type == .image || $0.type == .video }?.aspectRatio
    }

    /// Le lecteur d'écran dit le genre, « traduit » quand le texte l'est, puis le début du texte.
    static func spokenLabel(of post: FeedPost, text: String) -> String {
        let kind = ProfilePublicationGenre.of(post) == .statuses
            ? ProfilePublicationGenre.statusName
            : ProfilePublicationsCopy.kindName(of: post)
        let parts = [kind, post.isTranslated ? ProfilePublicationsGridCopy.translatedSpoken : nil,
                     text.isEmpty ? nil : String(text.prefix(80))]
        return parts.compactMap { $0 }.joined(separator: ", ")
    }

    /// « 64 au total », ou « 64+ au total » tant que le compte n'est qu'une borne basse ; rien avant tout compte.
    static func totalLine(counts: ProfilePostsCounts) -> String? {
        let total = counts.posts + counts.reels + counts.stories
        guard total > 0 else { return nil }
        let shown = ProfilePostsCounts.displayValue(total, isApproximate: counts.isApproximate)
        return String(format: ProfilePublicationsGridCopy.totalFormat, shown)
    }

    /// Le mois et l'année de la première publication, dans la langue de l'interface : « janvier 2026 ».
    static func sinceText(_ date: Date, locale: Locale = .current) -> String {
        let formatter = DateFormatter()
        formatter.locale = locale
        formatter.setLocalizedDateFormatFromTemplate("MMMMyyyy")
        return formatter.string(from: date)
    }

    /// « Tout ce que Léo a publié depuis janvier 2026. » — le prénom de l'auteur, la date de sa première publication.
    static func endMessage(authorName: String, firstPublished: Date, locale: Locale = .current) -> String {
        let firstName = authorName.split(separator: " ").first.map(String.init) ?? authorName
        return String(format: ProfilePublicationsGridCopy.endFormat, firstName, sinceText(firstPublished, locale: locale))
    }
}

extension ProfilePublicationGenre {
    nonisolated static var statusName: String {
        String(localized: "profile.posts.genre.status", defaultValue: "Statut", bundle: .main)
    }
}

/// Les mots des publications d'un autre.
nonisolated enum ProfilePublicationsGridCopy {

    static var title: String {
        String(localized: "profile.vitrine.posts.title", defaultValue: "Publications", bundle: .main)
    }

    static var genres: String {
        String(localized: "profile.posts.genre.label", defaultValue: "Genre de publication", bundle: .main)
    }

    static var totalFormat: String {
        String(localized: "profile.posts.total", defaultValue: "%@ au total", bundle: .main)
    }

    static var translated: String {
        String(localized: "profile.posts.tile.translated", defaultValue: "Traduit", bundle: .main)
    }

    static var translatedSpoken: String {
        String(localized: "profile.posts.tile.translated.spoken", defaultValue: "traduit", bundle: .main)
    }

    static var endTitle: String {
        String(localized: "profile.posts.end.title", defaultValue: "Tu as tout vu", bundle: .main)
    }

    static var endFormat: String {
        String(localized: "profile.posts.end.since", defaultValue: "Tout ce que %1$@ a publié depuis %2$@.", bundle: .main)
    }

    static var seeAll: String {
        String(localized: "profile.posts.empty.filter.action", defaultValue: "Tout voir", bundle: .main)
    }

    static var highlights: String {
        String(localized: "profile.posts.highlights.title", defaultValue: "À la une", bundle: .main)
    }
}
