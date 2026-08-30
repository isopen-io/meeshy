// MARK: - Galeries plein écran des médias SOCIAUX (post, story, réel, commentaires)
import SwiftUI
import MeeshySDK
import MeeshyUI

/// Légende d'un média social, RÈGLE UNIQUE partagée par les quatre surfaces qui
/// ouvrent `ConversationMediaGalleryView` hors conversation : carte de post,
/// détail de post, commentaires, et le repli solo de `CommentMediaView`.
///
/// C'est la MÊME règle que `ConversationViewModel.mediaCaptionMap` côté
/// conversation, à laquelle ces surfaces n'avaient simplement pas accès :
/// elles montaient la galerie SANS `captionMap`, donc un média de post ou de
/// commentaire ne pouvait structurellement afficher aucune légende — pas même
/// la sienne. (`FeedMedia` ne déclarait d'ailleurs pas `caption` : le décodeur
/// jetait `PostMedia.caption` avant qu'aucune vue puisse la demander.)
enum SocialMediaCaption {
    /// 1) la légende propre du média ; 2) à défaut le texte du porteur, mais
    /// SEULEMENT s'il n'a qu'un seul visuel — au-delà, ce texte décrit le LOT et
    /// le coller sous chaque pièce ferait mentir la légende.
    static func map(for media: [FeedMedia], carrierText: String?) -> [String: String] {
        let visuals = media.filter { CommentMediaGallery.isPageable($0) }
        let fallback = visuals.count == 1 ? carrierText : nil
        return visuals.reduce(into: [String: String]()) { result, item in
            if let caption = resolve(own: item.caption, carrierText: fallback) {
                result[item.id] = caption
            }
        }
    }

    /// `nil` quand ni la légende propre ni le texte du porteur ne porte de
    /// caractère — le plein écran n'affiche alors aucun bandeau.
    static func resolve(own: String?, carrierText: String?) -> String? {
        for candidate in [own, carrierText] {
            let trimmed = (candidate ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            if !trimmed.isEmpty { return trimmed }
        }
        return nil
    }
}

/// Instantané des médias visuels portés par les commentaires d'un objet social
/// (post, story, réel) — l'équivalent, pour un objet social, de ce que
/// `ConversationViewModel.allVisualAttachments` est pour une conversation.
///
/// Valeur PURE, dérivée par `CommentMediaGallery.snapshot(from:)` : elle se teste
/// sans monter une seule vue.
struct CommentMediaGallerySnapshot {
    let attachments: [MessageAttachment]
    /// `attachment.id → légende`. MÊME priorité que
    /// `ConversationViewModel.mediaCaptionMap` côté conversation : 1) la légende
    /// propre du média (`PostMedia.caption`), 2) à défaut le TEXTE du porteur,
    /// résolu par le Prisme (`FeedComment.displayContent`) — un commentaire ne
    /// porte qu'un seul média, donc la clause « si visuel UNIQUE » y est toujours
    /// vraie.
    let captions: [String: String]
    let senders: [String: ConversationViewModel.MediaSenderInfo]

    static let empty = CommentMediaGallerySnapshot(attachments: [], captions: [:], senders: [:])

    func contains(_ attachmentId: String) -> Bool {
        attachments.contains { $0.id == attachmentId }
    }
}

/// Dérivation PURE d'un instantané de galerie depuis les commentaires d'un objet.
enum CommentMediaGallery {
    /// Médias feuilletables : image et vidéo. L'audio a son propre plein écran
    /// (`AudioFullscreenView`, file de lecture coordonnée) et le document n'est
    /// pas dans le périmètre commentaire — même filtre que `mediaCaptionMap`
    /// côté conversation et que le plein écran d'un post.
    private static let pageableTypes: Set<FeedMediaType> = [.image, .video]

    static func isPageable(_ media: FeedMedia) -> Bool { pageableTypes.contains(media.type) }

    /// Les médias visuels de TOUS les commentaires fournis, dans leur ordre,
    /// avec la légende et l'auteur de chacun.
    ///
    /// Un même média ne figure qu'UNE fois : deux commentaires ne peuvent pas
    /// porter la même pièce (`commentId` est une FK sur `PostMedia`), mais un
    /// hôte qui concatène une liste et ses réponses peut présenter deux fois le
    /// même commentaire — le pager n'aurait alors plus d'index unique par page.
    static func snapshot(from comments: [FeedComment]) -> CommentMediaGallerySnapshot {
        var attachments: [MessageAttachment] = []
        var captions: [String: String] = [:]
        var senders: [String: ConversationViewModel.MediaSenderInfo] = [:]
        var seen = Set<String>()

        for comment in comments {
            for media in comment.media where pageableTypes.contains(media.type) {
                guard seen.insert(media.id).inserted else { continue }
                attachments.append(media.toMessageAttachment())
                if let caption = Self.caption(of: media, in: comment) { captions[media.id] = caption }
                senders[media.id] = ConversationViewModel.MediaSenderInfo(
                    senderName: comment.author,
                    senderAvatarURL: comment.authorAvatarURL,
                    senderColor: comment.authorColor,
                    sentAt: comment.timestamp
                )
            }
        }

        return CommentMediaGallerySnapshot(
            attachments: attachments, captions: captions, senders: senders
        )
    }

    /// Légende d'un média de commentaire. Un commentaire ne porte qu'UN média
    /// (`commentId` est une FK sur `PostMedia`), donc la clause « si visuel
    /// unique » de `SocialMediaCaption` y est toujours vraie.
    ///
    /// Site UNIQUE de la règle pour les commentaires : la galerie partagée ET le
    /// repli solo de `CommentMediaView` l'appellent, faute de quoi le MÊME média
    /// porterait deux légendes selon que l'hôte a câblé la liste ou non.
    static func caption(of media: FeedMedia, carrierText: String?) -> String? {
        SocialMediaCaption.resolve(own: media.caption, carrierText: carrierText)
    }

    static func caption(of media: FeedMedia, in comment: FeedComment) -> String? {
        caption(of: media, carrierText: comment.displayContent)
    }

    /// Aplatit les commentaires racines et leurs réponses dans l'ORDRE OÙ
    /// L'ÉCRAN LES AFFICHE — chaque racine suivie de son fil. C'est cet ordre que
    /// le pager suit : feuilleter doit descendre la page, pas sauter au hasard.
    static func flatten(
        topLevel: [FeedComment], replies: [String: [FeedComment]]
    ) -> [FeedComment] {
        topLevel.flatMap { [$0] + (replies[$0.id] ?? []) }
    }

    /// Signature bon marché du contenu qui INFLUE sur l'instantané : identité du
    /// commentaire, identité de son média, texte affiché (la légende) et légende
    /// propre du média. Une réaction, un compteur de réponses ou une traduction
    /// d'un AUTRE commentaire ne la font pas bouger — donc ne redéclenchent aucun
    /// rafraîchissement.
    static func signature(
        topLevel: [FeedComment], replies: [String: [FeedComment]]
    ) -> Int {
        var hasher = Hasher()
        for comment in topLevel {
            combine(comment, into: &hasher)
            for reply in replies[comment.id] ?? [] { combine(reply, into: &hasher) }
        }
        return hasher.finalize()
    }

    private static func combine(_ comment: FeedComment, into hasher: inout Hasher) {
        hasher.combine(comment.id)
        hasher.combine(comment.displayContent)
        for media in comment.media where pageableTypes.contains(media.type) {
            hasher.combine(media.id)
            hasher.combine(media.caption)
        }
    }
}

/// Porteur d'instantané partagé par l'environnement.
///
/// # Pourquoi une CLASSE, et pourquoi elle ne publie RIEN
///
/// C'est la doctrine du budget de rendu de `ConversationMediaGalleryView`
/// appliquée en amont : *de l'état que seule UNE vue consomme ne doit pas vivre
/// là où tout le monde le regarde*. Un `CommentMediaGallerySnapshot` posé
/// directement dans l'environnement invaliderait CHAQUE ligne de commentaire à
/// chaque commentaire reçu, alors qu'une seule vue le lit — et seulement à
/// l'instant d'un tap.
///
/// La boîte est donc :
/// - une **référence d'identité stable** : l'environnement ne transporte que le
///   pointeur, jamais la liste, donc écrire dedans n'invalide aucune vue ;
/// - **`ObservableObject` sans un seul `@Published`** : `@StateObject` garantit
///   une instanciation unique (iOS 16, où `@State` réévalue son expression
///   initiale), et `objectWillChange` ne part jamais ;
/// - **paresseuse** : `update(comments:)` est O(1) (stockage COW + invalidation),
///   la dérivation O(n) n'est payée qu'au premier `snapshot()` — c'est-à-dire au
///   tap qui ouvre le plein écran, jamais pendant le défilement.
final class CommentMediaGalleryContext: ObservableObject {
    // iOS 26.1 : la `deinit` synthétisée d'un type `@MainActor` est ISOLÉE
    // (SE-0466, isolation MainActor par défaut) et double-libère au démontage
    // hors d'une tâche — `pointer being freed was not allocated`, abrt.
    // Garde : `MainActorDeinitSourceGuardTests`.
    nonisolated deinit {}

    private var topLevel: [FeedComment] = []
    private var replies: [String: [FeedComment]] = [:]
    private var cached: CommentMediaGallerySnapshot?

    init(topLevel: [FeedComment] = [], replies: [String: [FeedComment]] = [:]) {
        self.topLevel = topLevel
        self.replies = replies
    }

    /// O(1) — deux stockages COW et une invalidation. L'aplatissement ET la
    /// dérivation, tous deux O(n), sont différés au premier `snapshot()`.
    func update(topLevel: [FeedComment], replies: [String: [FeedComment]]) {
        self.topLevel = topLevel
        self.replies = replies
        cached = nil
    }

    func snapshot() -> CommentMediaGallerySnapshot {
        if let cached { return cached }
        let resolved = CommentMediaGallery.snapshot(
            from: CommentMediaGallery.flatten(topLevel: topLevel, replies: replies)
        )
        cached = resolved
        return resolved
    }
}

private struct CommentMediaGalleryKey: EnvironmentKey {
    /// `nil` = aucun hôte n'a déclaré de galerie au-dessus. Une surface de
    /// commentaire non câblée retombe alors sur le média tapé seul, jamais sur
    /// la galerie d'un autre objet — l'absence DÉGRADE, elle ne trappe pas.
    static let defaultValue: CommentMediaGalleryContext? = nil
}

extension EnvironmentValues {
    var commentMediaGallery: CommentMediaGalleryContext? {
        get { self[CommentMediaGalleryKey.self] }
        set { self[CommentMediaGalleryKey.self] = newValue }
    }
}

private struct CommentMediaGalleryModifier: ViewModifier {
    let topLevel: [FeedComment]
    let replies: [String: [FeedComment]]
    @StateObject private var context = CommentMediaGalleryContext()

    func body(content: Content) -> some View {
        content
            .environment(\.commentMediaGallery, context)
            .adaptiveOnChange(
                of: CommentMediaGallery.signature(topLevel: topLevel, replies: replies),
                initial: true
            ) { _, _ in
                context.update(topLevel: topLevel, replies: replies)
            }
    }
}

extension View {
    /// Déclare, pour toute la sous-arborescence, les commentaires dont les médias
    /// se feuillettent ensemble en plein écran. À poser par l'hôte qui DÉTIENT la
    /// liste (feuille de commentaires, carte de post, visionneuse de story) —
    /// `CommentMediaView` la lit au moment du TAP, jamais pendant le rendu.
    func commentMediaGallery(
        topLevel: [FeedComment], replies: [String: [FeedComment]] = [:]
    ) -> some View {
        modifier(CommentMediaGalleryModifier(topLevel: topLevel, replies: replies))
    }
}
