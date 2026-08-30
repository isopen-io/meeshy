import Foundation

// MARK: - Ce qu'une bannière in-app AFFICHE

/// Les cinq pièces d'une bannière in-app — la notification qui descend du haut
/// de l'écran puis s'efface.
///
/// Elle en a besoin de cinq et pas de trois parce qu'une bannière doit dire
/// **CE QUI vient d'arriver**, pas seulement qui l'a fait et ce qu'il a écrit.
/// Un commentaire sur un réel, une réaction à une story et la publication d'une
/// humeur se ressemblaient toutes trois — « Alice » / « super ! » — et rien ne
/// les distinguait (signalé par le porteur produit, 2026-08-30).
///
/// Les sept cadrages, tels que le produit les demande :
///
/// | cas | `headline` | `body` |
/// |---|---|---|
/// | commentaire de contenu | X a commenté une story / un réel / un post | vignette + commentaire |
/// | nouvelle publication | X a publié un réel / une humeur / un post / une story | vignette + contenu |
/// | message privé | X | message |
/// | message de groupe | X dans « nom local du groupe » | message / média / indicateur de protection |
/// | relation acceptée | X a accepté votre demande | — |
/// | demande de relation | X veut se connecter | — |
/// | réaction à un contenu | X a réagi à votre story / humeur / post / réel / commentaire | vignette + réaction |
public struct NotificationBannerPresentation: Equatable, Sendable {
    /// Ligne 1 : QUI, et QUOI. Jamais vide.
    public let headline: String
    /// Ligne 2 : la charge — le commentaire, le message, l'aperçu du contenu
    /// visé. `nil` quand la headline se suffit (demande de relation, contenu
    /// sans texte dont le serveur retombe sur la phrase d'action).
    public let body: String?
    /// La réaction, rendue COMME une réaction et non noyée dans une phrase.
    /// `nil` quand la headline la porte déjà — le serveur l'y fusionne
    /// (« a réagi 🔥 à votre story ») et la répéter serait du bruit.
    public let reactionBadge: String?
    /// Vignette du contenu visé (miniature du post / de la story / du réel, ou
    /// la photo du message). `nil` ⇒ la bannière pose `contentSymbol`.
    public let thumbnailURL: String?
    /// Icône typée du contenu visé (SF Symbol), toujours résolue : c'est ce qui
    /// tient la place de la vignette quand il n'y en a pas.
    public let contentSymbol: String

    public init(
        headline: String,
        body: String?,
        reactionBadge: String?,
        thumbnailURL: String?,
        contentSymbol: String
    ) {
        self.headline = headline
        self.body = body
        self.reactionBadge = reactionBadge
        self.thumbnailURL = thumbnailURL
        self.contentSymbol = contentSymbol
    }
}

// MARK: - Construction depuis l'événement du fil

public extension SocketNotificationEvent {

    /// Les familles de cadrage. Le TYPE décide, jamais la forme des champs :
    /// `subtitle` porte le nom du GROUPE pour un message et la PHRASE D'ACTION
    /// pour tout le reste — deux sens pour un champ, et seul le type les sépare.
    enum BannerFraming: Equatable, Sendable {
        /// Message de conversation : le cadrage est « X », ou « X dans <groupe> ».
        /// Le nom du groupe est celui que l'APPAREIL connaît (renommage local +
        /// emoji favori), que le serveur ne peut pas composer.
        case conversation
        /// Demande / acceptation de relation : la headline dit tout, le corps du
        /// serveur n'est qu'un intitulé de rubrique (« Nouvelle demande de
        /// contact ») qui n'ajoute rien.
        case relation
        /// Tout le reste : la headline est `<acteur> <phrase d'action serveur>`.
        case action
    }

    var bannerFraming: BannerFraming {
        switch notificationType {
        case .newMessage, .legacyNewMessage,
             .messageReply, .reply, .legacyStoryReply,
             .userMentioned, .mention, .legacyMention,
             .messageReaction, .reaction, .legacyMessageReaction:
            return .conversation
        case .friendRequest, .contactRequest, .legacyFriendRequest,
             .friendAccepted, .contactAccepted, .legacyFriendAccepted:
            return .relation
        default:
            return .action
        }
    }

    /// Construit la bannière.
    ///
    /// - Parameter groupName: le nom LOCAL de la conversation (renommée +
    ///   emoji favori), résolu par l'app. `nil` ⇒ repli sur le titre serveur.
    ///   C'est la SEULE part de la présentation qui ne peut pas venir du
    ///   serveur : lui ne connaît que le nom canonique.
    func bannerPresentation(groupName: String? = nil) -> NotificationBannerPresentation {
        NotificationBannerPresentation(
            headline: bannerHeadline(groupName: groupName),
            body: bannerBody,
            reactionBadge: bannerReactionBadge,
            thumbnailURL: bannerThumbnailURL,
            contentSymbol: bannerContentSymbol
        )
    }

    // MARK: Headline

    func bannerHeadline(groupName: String?) -> String {
        let actor = actorDisplayName
        switch bannerFraming {
        case .conversation:
            guard !isDirect,
                  let group = nonBlank(groupName) ?? nonBlank(conversationTitle)
            else { return actor }
            return String(
                format: String(
                    localized: "notification.banner.inConversation",
                    defaultValue: "%1$@ dans %2$@",
                    bundle: .main
                ),
                actor,
                group
            )
        case .relation, .action:
            // `title` est le cadrage d'en-tête que la passerelle compose
            // (`buildPushHeader`) : l'acteur, ou « Meeshy » quand il n'y en a
            // pas. `subtitle` est la phrase d'action localisée. Leur somme EST
            // le titre riche que le serveur persiste — on ne le réécrit pas ici.
            let head = nonBlank(title) ?? actor
            guard let action = nonBlank(subtitle) else { return head }
            return "\(head) \(action)"
        }
    }

    // MARK: Body

    var bannerBody: String? {
        switch bannerFraming {
        case .relation:
            // « Nouvelle demande de contact » sous « Alice veut se connecter »
            // dit deux fois la même chose, la seconde moins bien.
            return nil

        case .conversation:
            if let label = attachmentLabel {
                if let preview = nonBlank(messagePreview) ?? nonBlank(content) {
                    return "\(label) \u{2022} \(preview)"
                }
                return label
            }
            return nonBlank(messagePreview) ?? nonBlank(content)

        case .action:
            // Le serveur garantit que la LIGNE DE LISTE n'est jamais vide : à
            // défaut d'extrait, `content` retombe sur la phrase d'action
            // elle-même (« a publié une nouvelle story »). Sur une bannière qui
            // porte déjà cette phrase en headline, la répéter est le défaut que
            // `dedupePushSubtitle` corrige côté push — même règle ici.
            guard let raw = nonBlank(content) else { return bannerMediaSummary }
            if let action = nonBlank(subtitle), raw == action { return bannerMediaSummary }
            return raw
        }
    }

    // MARK: Réaction

    var bannerReactionBadge: String? {
        guard isReactionBanner, let emoji = nonBlank(reactionEmoji) else { return nil }
        // Le serveur fusionne déjà l'émoji dans la phrase d'action
        // (« a réagi 🔥 à votre story ») : le rendre une seconde fois en pastille
        // ferait dire deux fois la même chose à deux endroits de la même carte.
        if let action = nonBlank(subtitle), action.contains(emoji) { return nil }
        return emoji
    }

    private var isReactionBanner: Bool {
        switch notificationType {
        case .messageReaction, .reaction, .legacyMessageReaction,
             .postLike, .legacyPostLike, .storyReaction, .statusReaction,
             .commentLike, .commentReaction:
            return true
        default:
            return false
        }
    }

    /// L'émoji de réaction, sous ses DEUX noms de fil : les éventails sur
    /// contenu l'écrivent en `emoji`, ceux sur message en `reactionEmoji`.
    var reactionEmoji: String? {
        nonBlank(metadata?.emoji) ?? nonBlank(metadata?.reactionEmoji)
    }

    // MARK: Vignette & icône

    var bannerThumbnailURL: String? {
        if let thumb = nonBlank(metadata?.postThumbnailUrl) { return thumb }
        // Message : la photo du 1er attachment. Elle est ABSENTE du fil quand le
        // message est protégé (éphémère / vue unique / flouté / chiffré) — la
        // passerelle la retient en bloc (cycle 125). Rien à re-garder ici, mais
        // rien à fabriquer non plus depuis une autre source.
        guard let mime = context?.firstAttachmentMimeType, mime.hasPrefix("image/") else { return nil }
        return nonBlank(context?.firstAttachmentUrl)
    }

    /// Résumé média d'un contenu sans texte — le corps de repli quand l'extrait
    /// manque et que la phrase d'action occupe déjà la headline.
    var bannerMediaSummary: String? {
        switch metadata?.mediaType?.lowercased() {
        case "image": return String(localized: "media.summary.photo", defaultValue: "📷 Photo", bundle: .main)
        case "video": return String(localized: "media.summary.video", defaultValue: "🎥 Vidéo", bundle: .main)
        case "audio": return String(localized: "media.summary.audio", defaultValue: "🎵 Audio", bundle: .main)
        default: return nil
        }
    }

    /// L'icône dit l'ENTITÉ visée quand on la connaît (story / réel / humeur /
    /// publication), le MÉDIA sinon, et à défaut l'action.
    var bannerContentSymbol: String {
        switch metadata?.mediaType?.lowercased() {
        case "image": return "photo.fill"
        case "video": return "play.rectangle.fill"
        case "audio": return "waveform"
        default: break
        }
        switch postType?.uppercased() {
        case "STORY": return "circle.dashed.inset.filled"
        case "REEL": return "play.rectangle.fill"
        case "MOOD", "STATUS": return "face.smiling.fill"
        case "POST": return "square.text.square.fill"
        default: return notificationType.systemIcon
        }
    }

    // MARK: - Helper

    private func nonBlank(_ value: String?) -> String? {
        guard let value else { return nil }
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}
