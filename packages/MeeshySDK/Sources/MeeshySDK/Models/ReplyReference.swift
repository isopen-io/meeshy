import Foundation

// Extrait de `CoreModels.swift` (1 778 lignes, hors budget 1000-1200 — un
// fichier hors budget est interdit d'ajout). Le lot #4945 fait porter à la
// citation les FAITS du média cité : on extrait d'abord, on ajoute ensuite.

// MARK: - Reply Reference

public struct ReplyReference: Codable, Sendable {
    public let messageId: String
    public let authorName: String
    public let authorColor: String
    /// Avatar de l'auteur cite, GRAVE dans la citation — jamais re-resolu au
    /// rendu.
    ///
    /// La citation est une feuille `Equatable` a `==` MANUEL : une lecture de
    /// store faite pendant le rendu serait invisible de cette comparaison, et
    /// l'avatar qui arrive apres coup ne redessinerait jamais la cellule. La
    /// donnee est deja sur le fil (`APIMessageReplyTo.sender`), elle etait
    /// simplement jetee par les constructeurs.
    ///
    /// **Optionnel, et il doit le rester** : `MeeshyMessage.init(from:)` decode
    /// `replyTo` par `decodeIfPresent`, qui PROPAGE l'echec d'un sous-decodage.
    /// Un champ requis ferait donc disparaitre du cache L2 le message ENTIER
    /// des que son blob `replyToJson` a ete grave avant ce champ — pas
    /// seulement sa citation. Meme discipline que
    /// `ForwardReference.conversationType`.
    ///
    /// `nil` ne ferme AUCUNE porte : `authorName` et `authorColor` sont
    /// presents a tous les sites de construction, donc l'avatar se dessine
    /// quand meme en initiales colorees. La porte vers le profil ne depend
    /// jamais de la presence d'une photo.
    public let authorAvatarUrl: String?
    public let previewText: String
    public let isMe: Bool
    public let attachmentType: String?
    public let attachmentThumbnailUrl: String?
    /// La piece jointe citee est PROTEGEE — vue unique ou floutee — donc son
    /// contenu ne doit ni s'afficher ni s'annoncer dans la citation.
    ///
    /// GRAVE au moment ou la citation est composee, exactement comme
    /// `authorAvatarUrl`, et pour la meme raison : la citation est une feuille
    /// `Equatable` a `==` MANUEL, une lecture de store faite au rendu serait
    /// invisible de ce comparateur. Chaque constructeur le derive de la source
    /// qu'il tient — `APIMessageAttachment` sur les chemins reseau et cache,
    /// `MeeshyMessageAttachment` sur la bulle optimiste.
    ///
    /// **Optionnel, et il doit le rester** : `MeeshyMessage.init(from:)` decode
    /// `replyTo` par `decodeIfPresent`, qui PROPAGE l'echec d'un sous-decodage.
    /// Un champ requis ferait disparaitre du cache L2 le message ENTIER des que
    /// son blob `replyToJson` a ete grave avant ce champ. Meme discipline que
    /// `authorAvatarUrl` et `ForwardReference.conversationType`.
    ///
    /// `nil` = inconnu, traite comme NON protege : la vignette d'une citation
    /// ordinaire ne doit pas disparaitre parce qu'un blob ancien se tait. La
    /// porte reste FERMEE la ou elle compte, `MessageListViewController
    /// .openQuotedMedia` refusant d'ouvrir un attachement protege apres
    /// relecture du message REEL dans le store.
    public let attachmentIsProtected: Bool?

    /// Les sept FAITS du média cité (#4945) — ce qui permet à la citation de
    /// rendre un flou ThumbHash à l'ouverture et une ligne « 1024×768 · 0:42 ·
    /// 1,2 Mo » sans attendre le réseau. La passerelle les servait
    /// (`attachmentFullSelect`) et iOS les décodait (`APIMessageAttachment`) ;
    /// ils étaient jetés une couche avant l'écran, par les trois constructeurs
    /// à l'identique, parce que le type porteur ne les déclarait pas.
    ///
    /// **Tous optionnels, et ils doivent le rester** — même règle que
    /// `authorAvatarUrl` : un blob `replyToJson` gravé avant eux doit se relire
    /// sans emporter le message entier. Se recopient en UNE ligne depuis
    /// chaque source par `QuotedAttachmentFacts`.
    public let attachmentThumbHash: String?
    public let attachmentWidth: Int?
    public let attachmentHeight: Int?
    public let attachmentDurationMs: Int?
    public let attachmentFileSize: Int?
    public let attachmentPageCount: Int?
    public let attachmentMimeType: String?

    public let isStoryReply: Bool
    public var storyPublishedAt: Date?
    public var storyReactionCount: Int?
    public var storyCommentCount: Int?
    /// Nombre de partages de la story, figé au moment de la réponse.
    public var storyShareCount: Int?
    public var storyThumbnailUrl: String?
    /// Emoji de l'humeur citée. Non-nil ⇒ cette réponse cite un mood/statut
    /// (rendu dédié : emoji + contenu + date) plutôt qu'une story générique.
    /// `storyPublishedAt` porte alors la date de publication du mood.
    public var moodEmoji: String?

    /// Le PREDICAT unique des deux peaux (`BubbleQuotedReply`,
    /// `FocalQuotedReplyView`) : un media cite protege ne montre ni vignette ni
    /// icone de lecture, et n'arme AUCUNE zone 2 — le tap retombe alors en zone
    /// 3 (retour au message cite), ou le media garde son propre geste de
    /// revelation. Miroir de `BubbleGridCell.attachmentIsProtected`
    /// (`isViewOnce || isBlurred`), cote citation.
    ///
    /// Sans lui, une citation affichait la vignette NON FLOUTEE d'un media a
    /// vue unique et posait par-dessus un bouton play que le verrou de l'hote
    /// refusait d'honorer : une exposition, doublee d'un controle qui ment.
    public var quotedMediaIsProtected: Bool { attachmentIsProtected == true }

    /// ZONE 1 de la LOI DES ZONES, cote DONNEE : cette citation designe-t-elle
    /// une PERSONNE dont la fiche peut s'ouvrir ?
    ///
    /// Une story ou une humeur citee porte `authorName == "Story"` (ou vide) et
    /// aucun avatar : il n'y a pas de personne a ouvrir, l'hote fabriquerait
    /// une fiche a ce nom.
    ///
    /// Ce que la donnee OFFRE, jamais ce qu'une peau CABLE : l'armement reste
    /// la conjonction de ce fait et de la presence d'un gestionnaire.
    public var offersAuthorGate: Bool { !isStoryReply }

    /// ZONE 2 cote DONNEE : cette citation porte-t-elle un media que l'on peut
    /// ouvrir ou jouer EN PLEIN ECRAN ?
    ///
    /// La story en est exclue : son chemin (zone 3 -> viewer) EST deja le plein
    /// ecran demande, et le dedoubler serait un second point actionnable pour
    /// une seule capacite. Un media PROTEGE en est exclu aussi — voir
    /// `quotedMediaIsProtected`.
    ///
    /// Lu par la couche d'ACCESSIBILITE des deux hotes de rangee
    /// (`BubbleStandardLayout`, `FocalRow`), qui doivent offrir cette zone en
    /// action nommee : leur `.accessibilityElement(children: .combine)` fusionne
    /// la rangee en UN element et leur `.accessibilityLabel` REMPLACE le
    /// libelle, si bien qu'aucun geste pose dans la citation n'est atteignable
    /// autrement. Les deux peaux ecrivent la meme loi dans leur propre
    /// armement, sous des gardes de source qui epinglent leurs expressions.
    public var offersMediaGate: Bool {
        !isStoryReply
            && !quotedMediaIsProtected
            && (attachmentType != nil || attachmentThumbnailUrl?.isEmpty == false)
    }

    public init(messageId: String = "", authorName: String, previewText: String, isMe: Bool = false, authorColor: String? = nil, authorAvatarUrl: String? = nil, attachmentType: String? = nil, attachmentThumbnailUrl: String? = nil, attachmentIsProtected: Bool? = nil, isStoryReply: Bool = false,
                storyPublishedAt: Date? = nil, storyReactionCount: Int? = nil, storyCommentCount: Int? = nil, storyShareCount: Int? = nil, storyThumbnailUrl: String? = nil, moodEmoji: String? = nil,
                attachmentFacts: QuotedAttachmentFacts? = nil) {
        self.messageId = messageId
        self.authorName = authorName
        self.previewText = previewText
        self.isMe = isMe
        self.authorColor = authorColor ?? DynamicColorGenerator.colorForName(authorName)
        self.authorAvatarUrl = authorAvatarUrl
        self.attachmentType = attachmentType
        self.attachmentThumbnailUrl = attachmentThumbnailUrl
        self.attachmentIsProtected = attachmentIsProtected
        self.attachmentThumbHash = attachmentFacts?.thumbHash
        self.attachmentWidth = attachmentFacts?.width
        self.attachmentHeight = attachmentFacts?.height
        self.attachmentDurationMs = attachmentFacts?.durationMs
        self.attachmentFileSize = attachmentFacts?.fileSize
        self.attachmentPageCount = attachmentFacts?.pageCount
        self.attachmentMimeType = attachmentFacts?.mimeType
        self.isStoryReply = isStoryReply
        self.storyPublishedAt = storyPublishedAt
        self.storyReactionCount = storyReactionCount
        self.storyCommentCount = storyCommentCount
        self.storyShareCount = storyShareCount
        self.storyThumbnailUrl = storyThumbnailUrl
        self.moodEmoji = moodEmoji
    }
}

// MARK: - Quoted attachment facts

public extension ReplyReference {
    /// Les sept faits du média cité, recopiés en UNE ligne depuis la source
    /// que chaque constructeur tient — `APIMessageAttachment` sur les chemins
    /// réseau et cache, `MeeshyMessageAttachment` sur la bulle optimiste et la
    /// bannière du composeur. Un constructeur qui recopie champ par champ est
    /// un inventaire à tenir à jour ; celui-ci n'en tient qu'un.
    struct QuotedAttachmentFacts: Equatable, Sendable {
        public let thumbHash: String?
        public let width: Int?
        public let height: Int?
        public let durationMs: Int?
        public let fileSize: Int?
        public let pageCount: Int?
        public let mimeType: String?

        public init(thumbHash: String?, width: Int?, height: Int?, durationMs: Int?,
                    fileSize: Int?, pageCount: Int?, mimeType: String?) {
            self.thumbHash = thumbHash
            self.width = width
            self.height = height
            self.durationMs = durationMs
            self.fileSize = fileSize
            self.pageCount = pageCount
            self.mimeType = mimeType
        }

        public init(_ attachment: APIMessageAttachment) {
            self.init(
                thumbHash: attachment.thumbHash,
                width: attachment.width,
                height: attachment.height,
                durationMs: attachment.duration,
                fileSize: attachment.fileSize,
                pageCount: attachment.pageCount,
                mimeType: attachment.mimeType
            )
        }

        /// Le modèle domaine porte `fileSize: Int` avec `0` pour « inconnu »
        /// (`apiAtt.fileSize ?? 0` aux deux sites de conversion) : un zéro n'est
        /// pas une taille, il redevient `nil` pour que la ligne de détails ne
        /// rende jamais « 0 o ».
        public init(_ attachment: MeeshyMessageAttachment) {
            self.init(
                thumbHash: attachment.thumbHash,
                width: attachment.width,
                height: attachment.height,
                durationMs: attachment.duration,
                fileSize: attachment.fileSize > 0 ? attachment.fileSize : nil,
                pageCount: attachment.pageCount,
                mimeType: attachment.mimeType
            )
        }
    }
}

// MARK: - Forward Reference

public struct ForwardReference: Codable, Sendable {
    public let originalMessageId: String
    public let senderName: String
    public let senderAvatar: String?
    public let previewText: String
    public let conversationId: String?
    public let conversationName: String?
    public let attachmentType: String?
    public let attachmentThumbnailUrl: String?
    /// Type de la conversation SOURCE (`direct`, `group`, `public`, `global`,
    /// `community`, `channel`, `bot`, `broadcast`) — mêmes valeurs que
    /// `MeeshyConversation.ConversationType`. Optionnel : les caches GRDB
    /// antérieurs au champ décodent en `nil` sans migration.
    public let conversationType: String?

    public init(originalMessageId: String = "", senderName: String, senderAvatar: String? = nil,
                previewText: String, conversationId: String? = nil, conversationName: String? = nil,
                attachmentType: String? = nil, attachmentThumbnailUrl: String? = nil,
                conversationType: String? = nil) {
        self.originalMessageId = originalMessageId
        self.senderName = senderName
        self.senderAvatar = senderAvatar
        self.previewText = previewText
        self.conversationId = conversationId
        self.conversationName = conversationName
        self.attachmentType = attachmentType
        self.attachmentThumbnailUrl = attachmentThumbnailUrl
        self.conversationType = conversationType
    }
}
