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
/// flouté, éphémère échu, supprimé, avis système) n'entre pas dans la fenêtre —
/// ni son texte, ni ses médias. Les mots sont ceux que le lecteur lit : le
/// texte servi par le Prisme, sinon l'original.
enum MessageCardDiscussion {

    static let maxMessages = 12
    static let maxMedia = 4

    /// Les messages imagés, dans l'ordre du fil.
    static func window(of messages: [Message], endingAt messageId: String, now: Date) -> [Message] {
        guard let end = messages.firstIndex(where: { $0.id == messageId }) else { return [] }
        let exportable = messages[...end].filter { MessageCardSubject.isExportable($0, now: now) }
        return Array(exportable.suffix(maxMessages))
    }

    static func subject(of messages: [Message], servedText: (Message) -> String?, viewer: MessageCardSubject.Viewer,
                        title: String?) -> MessageCardSubject? {
        guard let last = messages.last else { return nil }
        let lines = messages.map { message in
            "\(author(of: message, viewer: viewer)) : \(said(by: message, servedText: servedText(message)))"
        }
        let media = messages.flatMap { MessageCardSubject.paintableMedia(of: $0) }.suffix(maxMedia)
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
