import Foundation
import MeeshySDK

/// **Ce que l'écran de partage unique reçoit** (#10947, planche
/// `docs/product/partage-unique/planche-partage-unique.html`).
///
/// Toutes les portes — barre rapide, « Plus… », sélection multiple, pièce d'un
/// message, story, publication, profil, invitation, lien profond — posent l'UNE
/// de ces formes, et l'écran fait le reste. Le plan (`SharePlanner`, miroir de
/// `planShare`) se lit depuis `entry` : la loi de sortie décide, l'écran masque.
enum ShareSubject {
    /// Un ou plusieurs messages, dans l'ordre de la conversation (D1, D6).
    case messages([Message], sourceConversationId: String?, conversationIsEncrypted: Bool)
    /// UNE pièce d'un message (V2) — « Tout le message » élargit sans fermer.
    case piece(Message, attachmentId: String, sourceConversationId: String?, conversationIsEncrypted: Bool)
    case text(String)
    case link(URL)
    /// Une story, un post, un réel, un profil (D15), une invitation : une carte
    /// qui part comme un lien.
    case card(ShareCard)
    /// Ce qu'une autre app remet à l'extension de partage (V1, V9) : des
    /// fichiers déjà copiés dans l'App Group, et le texte ou le lien joint.
    case incoming(ShareIncoming)

    var sourceConversationId: String? {
        switch self {
        case .messages(_, let source, _), .piece(_, _, let source, _): return source
        case .text, .link, .card, .incoming: return nil
        }
    }

    /// Les messages source, dans l'ordre — vides pour un contenu qui n'en vient pas.
    var sourceMessages: [Message] {
        switch self {
        case .messages(let messages, _, _): return messages
        case .piece(let message, _, _, _): return [message]
        case .text, .link, .card, .incoming: return []
        }
    }

    /// Les pièces venues d'une autre app, dans l'ordre d'envoi.
    var incomingMediaIds: [String] {
        guard case .incoming(let incoming) = self else { return [] }
        return incoming.media.map(\.id)
    }
}

/// **Ce qu'une autre app remet à l'extension de partage** — des fichiers déjà
/// copiés dans le conteneur App Group, et le texte joint (déjà composé avec le
/// lien, `ShareSender.composeContent`). Le texte joint devient le corps du
/// message ; la légende s'y ajoute (D3, D9).
nonisolated struct ShareIncoming: Equatable, Sendable {
    var media: [ShareIncomingMedia]
    var text: String?
    /// Ce que la feuille n'a pas pu copier, et pourquoi : l'écran le DIT (V9).
    var shortfalls: [ShareShortfall] = []
    /// Un partage RELAYÉ par l'extension (`ShareRelayHandoff`) rouvre l'écran
    /// sur les conversations que l'auteur y avait déjà choisies.
    var preselectedConversationIds: [String] = []

    /// Un texte qui n'est qu'une adresse web part comme un lien (aperçu, « Copier le lien »).
    var link: URL? {
        guard let text, text.hasPrefix("http://") || text.hasPrefix("https://"),
              !text.contains(where: \.isWhitespace) else { return nil }
        return URL(string: text)
    }
}

/// Pourquoi des pièces remises par une autre app ne partent pas.
nonisolated enum ShareShortfall: Hashable, Sendable {
    /// iCloud non téléchargé, disque plein, copie échouée.
    case unprepared
    /// Ces pièces n'ont pas été copiées : elles dépassaient les 500 Mo d'un
    /// partage (D10, #11429).
    case overBudget(uncopied: Int)
    /// L'app n'a remis qu'un chemin de fichier, que Meeshy n'ouvre pas : seul
    /// le fichier lui-même se partage (#11134, #11430).
    case refusedSource
}

/// Une pièce venue d'une autre app — son fichier local sert l'aperçu.
nonisolated struct ShareIncomingMedia: Identifiable, Equatable, Sendable {
    let id: String
    let mimeType: String
    let bytes: Int
    let fileURL: URL?
    /// Le nom que le fichier portait chez l'app hôte (#11531) : ce que le
    /// serveur garde, quand `fileURL` porte un nom technique (`0.jpeg`).
    var originalName: String? = nil

    var kind: AttachmentKind { AttachmentKind(mimeType: mimeType) }
}

/// Une carte : un contenu Meeshy qui part comme un lien qu'on ouvre.
struct ShareCard: Equatable {
    let kind: ShareCardKind
    /// L'identifiant du contenu (post, story, utilisateur, conversation).
    let contentId: String
    let title: String
    let subtitle: String?
    var url: URL?
    let imageURL: String?
    /// L'auteur nommé dans le texte qui part (« Story de X : lien »).
    var authorName: String?

    /// Le texte qui part dans la conversation : la phrase de la story, sinon le lien.
    var messageText: String? {
        guard let link = url?.absoluteString else { return title.isEmpty ? nil : title }
        guard kind == .story, let authorName else { return link }
        return String(format: String(localized: "share.story.shareText", defaultValue: "🔗 Story de %1$@ : %2$@", bundle: .meeshyShare), authorName, link)
    }
}

extension ShareSubject {
    /// Une story : elle part comme une carte, son lien se copie (D14 : pas de
    /// republication). Le lien suivi `meeshy.me/l/<token>` la remplace dès qu'il
    /// est résolu ; d'ici là, l'adresse directe.
    static func story(id: String, authorName: String, imageURL: String? = nil) -> ShareSubject {
        .card(ShareCard(
            kind: .story, contentId: id,
            title: String(format: String(localized: "share.preview.story", defaultValue: "Story de %@", bundle: .meeshyShare), authorName),
            subtitle: nil, url: URL(string: "https://meeshy.me/story/\(id)"), imageURL: imageURL, authorName: authorName
        ))
    }
}

extension ShareSubject {

    /// L'entrée du plan — la forme que lit `SharePlanner`. `removedMessageIds`
    /// retire les messages que l'utilisateur a ôtés de « Ce qui part ».
    func entry(removedMessageIds: Set<String> = []) -> ShareEntry {
        switch self {
        case .messages(let messages, _, let encrypted):
            return .messages(messages.filter { !removedMessageIds.contains($0.id) }.map { $0.shareMessage(conversationIsEncrypted: encrypted) })
        case .piece(let message, let attachmentId, _, let encrypted):
            return .piece(message: message.shareMessage(conversationIsEncrypted: encrypted), attachmentId: attachmentId)
        case .text(let text):
            return .text(text)
        case .link(let url):
            return .link(url: url.absoluteString, text: nil)
        case .card(let card):
            return .card(card.kind, url: card.url?.absoluteString)
        case .incoming(let incoming):
            guard incoming.media.isEmpty else {
                return .media(incoming.media.map { ShareMedia(id: $0.id, mimeType: $0.mimeType, bytes: $0.bytes) }, text: incoming.text)
            }
            if let link = incoming.link { return .link(url: link.absoluteString, text: nil) }
            return .text(incoming.text ?? "")
        }
    }

    /// « Tout le message » (V2) : la pièce s'élargit au message qui la porte.
    var widenedToWholeMessage: ShareSubject? {
        guard case .piece(let message, _, let source, let encrypted) = self else { return nil }
        return .messages([message], sourceConversationId: source, conversationIsEncrypted: encrypted)
    }

    /// Le texte qui part pour une entrée qui n'est pas un message : le texte
    /// lui-même, le lien, ou la carte. La légende s'y joint (D3 : « le texte du
    /// message ») ; elle reste à part pour un transfert (D4).
    func composedText(caption: String) -> String? {
        let trimmed = caption.trimmingCharacters(in: .whitespacesAndNewlines)
        let body: String?
        switch self {
        case .text(let text): body = text
        case .link(let url): body = url.absoluteString
        case .card(let card): body = card.messageText
        case .incoming(let incoming): body = incoming.text
        case .messages, .piece: return nil
        }
        guard let body, !body.isEmpty else { return trimmed.isEmpty ? nil : trimmed }
        return trimmed.isEmpty ? body : "\(trimmed)\n\(body)"
    }
}
