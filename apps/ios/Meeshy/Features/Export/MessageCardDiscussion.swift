import Foundation
import MeeshySDK

/// **« Imager la discussion »** (#9039) — depuis « Transférer », la discussion
/// qui MÈNE au message choisi devient une carte de l'atelier « Imagine ».
///
/// Elle réutilise le moteur d'Imager tel quel : ses 784 templates, ses formats,
/// sa disposition, l'enregistrement et le partage EN IMAGE (#9038). La
/// discussion s'y écrit comme la réponse d'une carte — une ligne par message,
/// « Auteur : texte » —, titrée du nom de la conversation, et ses médias
/// peignables s'y posent.
///
/// LE PÉRIMÈTRE, borné pour la mémoire : les `maxMessages` derniers messages
/// jusqu'au message choisi COMPRIS (ce qui le suit n'en fait pas partie — on
/// image ce qui y a mené), et au plus `maxMedia` médias, les plus récents. Au-
/// delà, une carte au format story ne se lit plus, et chaque média chargé est
/// une image décodée de plus en mémoire pendant la peinture.
///
/// LES MÊMES GARDES QUE « Imager » un message : un message protégé (vue unique,
/// flouté, supprimé, avis système) ou qui DISPARAÎT — flamme à durée ou après
/// lecture, même vivante : la loi de sortie, #9573 — n'entre pas dans la
/// fenêtre, ni son texte, ni ses médias. Les mots sont ceux que le lecteur lit : le
/// texte servi par le Prisme, sinon l'original.
///
/// UNE RÉPONSE QUI CITE UN CONTENU PROTÉGÉ ferme la discussion entière
/// (décision porteur du 2026-10-08, #9573, comme le web) : si elle tombe dans
/// la portée de la fenêtre, aucune carte — la sauter peindrait une discussion
/// trouée à l'endroit de ce qu'elle citait.
enum MessageCardDiscussion {

    static let maxMessages = 12
    static let maxMedia = 4

    /// Les messages imagés, dans l'ordre du fil — vide quand la portée de la
    /// fenêtre contient une réponse qui cite un contenu protégé.
    static func window(of messages: [Message], endingAt messageId: String, now: Date) -> [Message] {
        guard let end = messages.firstIndex(where: { $0.id == messageId }) else { return [] }
        let exportable = Array(messages[...end].filter { MessageCardSubject.isExportable($0, now: now) }.suffix(maxMessages))
        guard let first = exportable.first,
              let start = messages[...end].firstIndex(where: { $0.id == first.id }),
              !messages[start...end].contains(where: \.quotesProtectedContent)
        else { return [] }
        return exportable
    }

    /// « Imager la discussion » s'offre-t-il jusqu'à ce message ? — la fenêtre
    /// a quelque chose à peindre. Un bouton qui n'ouvrirait qu'une erreur n'est
    /// pas rendu.
    static func offers(messages: [Message], endingAt messageId: String, now: Date = Date()) -> Bool {
        !window(of: messages, endingAt: messageId, now: now).isEmpty
    }

    static func subject(of messages: [Message], servedText: (Message) -> String?, viewer: MessageCardSubject.Viewer,
                        title: String?) -> MessageCardSubject? {
        guard let last = messages.last else { return nil }
        let lines = messages.map { message in
            "\(author(of: message, viewer: viewer)) : \(said(by: message, servedText: servedText(message)))"
        }
        // Chaque média garde l'auteur de SON message — la discussion en mêle plusieurs (#9235).
        let media = messages.flatMap { message in
            MessageCardSubject.paintableMedia(of: message).map { $0.by(mediaAuthor(of: message, viewer: viewer)) }
        }.suffix(maxMedia)
        return MessageCardSubject(
            quoted: nil,
            reply: MessageCardPart(author: nonBlank(title) ?? defaultTitle, text: lines.joined(separator: "\n")),
            sentAt: last.createdAt,
            media: Array(media)
        )
    }

    /// La requête de l'atelier, depuis la discussion chargée — `nil` quand rien ne s'image.
    static func request(messages: [Message], endingAt messageId: String, servedText: (Message) -> String?,
                        viewer: MessageCardSubject.Viewer, handle: String?, conversationTitle: String?,
                        accentColor: String, now: Date = Date()) -> MessageCardExportRequest? {
        let window = window(of: messages, endingAt: messageId, now: now)
        guard let subject = subject(of: window, servedText: servedText, viewer: viewer, title: conversationTitle) else { return nil }
        return MessageCardExportRequest(
            subject: subject,
            languages: [],
            subjectIn: { _ in nil },
            handle: handle,
            conversationTitle: conversationTitle,
            accentColor: accentColor,
            quick: false
        )
    }

    private static func author(of message: Message, viewer: MessageCardSubject.Viewer) -> String {
        let isViewer = message.isMe || (!viewer.id.isEmpty && message.senderId == viewer.id)
        let names = isViewer ? [viewer.displayName, message.senderName, message.senderUsername] : [message.senderName, message.senderUsername]
        return names.lazy.compactMap { nonBlank($0) }.first ?? "Meeshy"
    }

    private static func mediaAuthor(of message: Message, viewer: MessageCardSubject.Viewer) -> MessageCardMediaAuthor {
        let isViewer = message.isMe || (!viewer.id.isEmpty && message.senderId == viewer.id)
        return MessageCardMediaAuthor(name: author(of: message, viewer: viewer),
                                      handle: isViewer ? (viewer.username ?? message.senderUsername) : message.senderUsername)
    }

    /// Le texte servi, ou — pour un message sans mots — ce que ses médias sont.
    private static func said(by message: Message, servedText: String?) -> String {
        if let text = nonBlank(servedText ?? message.content) { return text }
        return MessageCardSubject.paintableMedia(of: message).map { symbol(of: $0.media.kind) }.joined(separator: " ")
    }

    private static func nonBlank(_ value: String?) -> String? {
        guard let value, !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
        return value
    }

    private static func symbol(of kind: MessageCardMediaKind) -> String {
        switch kind {
        case .image: return "📷"
        case .video: return "🎬"
        case .audio: return "🎤"
        }
    }

    static var defaultTitle: String {
        String(localized: "export.discussion.title", defaultValue: "Discussion", bundle: .main)
    }

    static var menuLabel: String {
        String(localized: "forward.imageDiscussion", defaultValue: "Imager la discussion", bundle: .main)
    }
}
