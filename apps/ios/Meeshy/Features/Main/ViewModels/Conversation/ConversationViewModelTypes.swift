import Foundation
import MeeshySDK

struct ConversationTranslationRequestFailure: Equatable {
    enum Kind { case text, audio }
    let messageId: String
    let language: String
    let kind: Kind
    let message: String
}

extension ConversationTranslationRequestFailure {
    /// Le refus d'une traduction SERVEUR en E2EE (#11214) : la feuille quitte
    /// son état « en cours » et dit pourquoi.
    static func serverRefused(messageId: String, language: String, kind: Kind) -> Self {
        Self(
            messageId: messageId, language: language, kind: kind,
            message: String(
                localized: "message.translation.e2ee.serverRefused",
                defaultValue: "Chiffrée de bout en bout : cette conversation se traduit sur votre appareil, jamais par le serveur.",
                bundle: .main
            )
        )
    }
}

/// **Aucun texte clair ne part vers la traduction SERVEUR d'un message que le
/// serveur ne lit pas** (#11214, fail-closed). La conversation ET le message le
/// disent (`DeviceTranslationEligibility.serverReadsMessage`) ; un régime
/// inconnu se lit comme un régime qu'il ne lit pas. `conversationEncryptionMode`
/// est exigé à chaque appel : un défaut l'aurait ouvert. La traduction y passe
/// par l'appareil (`DeviceTranslationCoordinator`).
enum ServerTranslationAdmission {
    static func admits(_ message: Message?, conversationEncryptionMode: String?) -> Bool {
        DeviceTranslationEligibility.serverReadsMessage(
            conversationEncryptionMode: conversationEncryptionMode,
            isEncrypted: message?.isEncrypted ?? false,
            encryptionMode: message?.encryptionMode
        )
    }
}

struct ConversationBubbleLanguageSelection: Equatable {
    var activeDisplayLangCode: String?
    var secondaryLangCode: String?
}

struct ConversationMediaSenderInfo {
    let senderName: String
    let senderAvatarURL: String?
    let senderColor: String
    let sentAt: Date
    /// #7362 — la galerie plein écran n'a aucune autre source pour savoir
    /// qui a envoyé une pièce donnée ; c'est ce qui gouverne
    /// `GalleryImageOpenReport` (jamais reporter sa propre image). Défaut
    /// `false` : les galeries POST / COMMENTAIRE (`SocialMediaGalleryPresentation`,
    /// `CommentMediaGallery`) construisent ce type sans connaître la
    /// notion — elles ne reportent de toute façon aucune consommation
    /// (`ConversationMediaGalleryView.reportsAttachmentConsumption`).
    ///
    /// `var`, pas `let` : un stored `let` porteur d'un initialiseur
    /// littéral n'entre PAS dans l'init memberwise synthétisé (le
    /// compilateur le traite comme fixé à la déclaration, pas comme un
    /// défaut substituable) — seul un `var` avec défaut y ajoute un
    /// paramètre substituable (SE-0242).
    var isMe: Bool = false
    /// #10956 — le COMPTE de l'auteur (`viewingKey`), la clé de sa présence servie ;
    /// `nil` pour les galeries qui ne le savent pas (post, commentaire).
    var senderUserId: String? = nil
    /// #10946 — son contour équipé, la référence servie avec le message.
    var senderRing: ServedProfileDecorItem? = nil
}

struct ConversationAudioItem: Identifiable {
    let id: String // attachment.id
    let attachment: MessageAttachment
    let message: Message
    let transcription: MessageTranscription?
    let translatedAudios: [MessageTranslatedAudio]
}

/// Outcome of `jumpToQuotedMessage`.
enum ConversationJumpResult {
    /// The message was already present in the local store — caller should
    /// perform an instant scroll + highlight.
    case foundLocally
    /// The message was fetched from the server and loaded into the store.
    /// Caller should scroll + highlight after the snapshot settles.
    case loadedFromServer
    /// The message could not be found (deleted, not accessible, network error).
    case notFound
}

enum ConversationViewOnceOpening {
    /// Le plein écran à présenter, sur cette pièce.
    case fullscreen(MessageAttachment)
    /// Le texte est révélé à sa place dans le fil.
    case inPlace
    /// Le texte révélé a été RETOUCHÉ : il passe à « déjà ouvert » (#7579).
    case closed
    /// Rien à ouvrir : message inconnu, sans vue unique, ou déjà ouvert.
    case unavailable
}
