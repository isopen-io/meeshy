import Foundation
import MeeshySDK

// MARK: - L'écran « Médias, liens et documents », genre par genre (#8103)
//
// La passerelle (`view=media&kinds=…`) sert des MESSAGES ; l'écran montre des
// ÉLÉMENTS. Un message peut en porter plusieurs, et d'un autre genre que celui
// demandé (une photo et un PDF dans le même envoi) : chaque segment ne garde
// donc que ce qui est le sien, selon la MÊME partition que la clause serveur
// (`ConversationMediaKind.ofAttachment`). Miroir de `itemsOfKind` côté web
// (`apps/web/src/lib/view/media-hub.ts`).
//
// Fonctions PURES : l'index persisté, les pages réseau et la recherche locale
// hors ligne passent tous par elles — un seul tri, une seule exclusion.

/// Un élément d'un segment — ce qu'une cellule rend.
struct ConversationMediaHubItem: Identifiable, Equatable {
    enum Payload: Equatable {
        case attachment(MessageAttachment)
        case link(url: String, host: String, conversation: ConversationCardTarget?)
        case place(SharedPlace)

        static func == (lhs: Payload, rhs: Payload) -> Bool {
            switch (lhs, rhs) {
            case let (.attachment(a), .attachment(b)):
                return a.id == b.id && a.fileUrl == b.fileUrl && a.thumbnailUrl == b.thumbnailUrl
                    && a.thumbHash == b.thumbHash && a.originalName == b.originalName && a.fileSize == b.fileSize
            case let (.link(u1, h1, c1), .link(u2, h2, c2)):
                return u1 == u2 && h1 == h2 && c1 == c2
            case let (.place(p1), .place(p2)):
                return p1 == p2
            default:
                return false
            }
        }
    }

    /// `messageId:…` — unique dans un segment, stable d'une page à l'autre.
    let id: String
    let kind: ConversationMediaKind
    let messageId: String
    let sentAt: Date
    let senderName: String
    let isMe: Bool
    let payload: Payload

    var attachment: MessageAttachment? {
        if case .attachment(let attachment) = payload { return attachment }
        return nil
    }
}

enum ConversationMediaHubRules {

    // MARK: - Admission

    /// Un porteur a-t-il sa place dans l'écran ? Mêmes exclusions que la
    /// galerie (`ConversationMediaRules.admits`) : vue unique, supprimé, échu,
    /// masqué « pour moi » — l'index persisté peut garder une copie que le fil
    /// a déjà retirée.
    static func admits(_ message: MeeshyMessage, now: Date, isHidden: (String) -> Bool) -> Bool {
        guard message.deletedAt == nil, !message.holdsViewOnce, !isHidden(message.id) else { return false }
        if let expiresAt = message.expiresAt, expiresAt <= now { return false }
        return true
    }

    // MARK: - Les éléments d'un genre

    /// Les éléments d'un genre, du plus récent au plus ancien.
    static func items(
        of carriers: [MeeshyMessage],
        kind: ConversationMediaKind,
        now: Date,
        isHidden: (String) -> Bool
    ) -> [ConversationMediaHubItem] {
        carriers
            .filter { admits($0, now: now, isHidden: isHidden) }
            .sorted(by: newestFirst)
            .flatMap { items(of: $0, kind: kind) }
    }

    static func items(of message: MeeshyMessage, kind: ConversationMediaKind) -> [ConversationMediaHubItem] {
        switch kind {
        case .visual, .audio, .document, .contact:
            return attachmentItems(of: message, kind: kind)
        case .link, .conversation:
            return linkItems(of: message, kind: kind)
        case .location:
            return placeItems(of: message)
        }
    }

    /// Le genre d'une pièce, ou `nil` si elle n'appartient à aucun segment de
    /// pièces : un LIEU voyage parfois en pièce `.location`, dont le type MIME
    /// ferait sinon un « document ».
    static func kind(of attachment: MessageAttachment) -> ConversationMediaKind? {
        guard attachment.type != .location else { return nil }
        return ConversationMediaKind.ofAttachment(mimeType: attachment.mimeType)
    }

    private static func attachmentItems(of message: MeeshyMessage, kind: ConversationMediaKind) -> [ConversationMediaHubItem] {
        message.attachments
            .filter { !$0.isViewOnce && Self.kind(of: $0) == kind }
            .map { attachment in
                item(of: message, kind: kind, key: attachment.id, payload: .attachment(attachment))
            }
    }

    private static func linkItems(of message: MeeshyMessage, kind: ConversationMediaKind) -> [ConversationMediaHubItem] {
        urls(in: message.content).compactMap { url in
            let target = ConversationLinkTarget.target(for: url)
            if kind == .conversation, target == nil { return nil }
            guard let parsed = URL(string: url) else { return nil }
            let isWeb = ["http", "https"].contains(parsed.scheme?.lowercased() ?? "")
            if kind == .link, !isWeb { return nil }
            let host = parsed.host?.lowercased() ?? parsed.scheme ?? url
            return item(of: message, kind: kind, key: url,
                        payload: .link(url: url, host: host, conversation: target))
        }
    }

    private static func placeItems(of message: MeeshyMessage) -> [ConversationMediaHubItem] {
        let place = message.location ?? message.attachments.lazy.compactMap { attachment -> SharedPlace? in
            guard let latitude = attachment.latitude, let longitude = attachment.longitude else { return nil }
            return SharedPlace(latitude: latitude, longitude: longitude,
                               name: attachment.originalName.isEmpty ? nil : attachment.originalName)
        }.first
        guard let place else { return [] }
        return [item(of: message, kind: .location, key: "place", payload: .place(place))]
    }

    private static func item(
        of message: MeeshyMessage, kind: ConversationMediaKind, key: String,
        payload: ConversationMediaHubItem.Payload
    ) -> ConversationMediaHubItem {
        ConversationMediaHubItem(
            id: "\(message.id):\(key)", kind: kind, messageId: message.id, sentAt: message.createdAt,
            senderName: message.senderName ?? "", isMe: message.isMe, payload: payload
        )
    }

    // MARK: - Les adresses d'un texte

    private static let linkDetector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue)
    private static let meeshySchemePattern = try? NSRegularExpression(pattern: #"meeshy://[^\s<>"]+"#, options: [.caseInsensitive])

    /// Les URL d'un texte, dédoublonnées, dans l'ordre : web (`http`, `https`)
    /// par le détecteur du système, plus les liens `meeshy://` qu'il ignore.
    static func urls(in text: String) -> [String] {
        guard !text.isEmpty else { return [] }
        let range = NSRange(text.startIndex..<text.endIndex, in: text)
        let web = (linkDetector?.matches(in: text, range: range) ?? []).compactMap { match -> (Int, String)? in
            guard let url = match.url, let scheme = url.scheme?.lowercased(),
                  scheme == "http" || scheme == "https" else { return nil }
            return (match.range.location, url.absoluteString)
        }
        let meeshy = (meeshySchemePattern?.matches(in: text, range: range) ?? []).compactMap { match -> (Int, String)? in
            guard let swiftRange = Range(match.range, in: text) else { return nil }
            return (match.range.location, String(text[swiftRange]))
        }
        return (web + meeshy)
            .sorted { $0.0 < $1.0 }
            .map(\.1)
            .reduce(into: [String]()) { unique, url in
                if !unique.contains(url) { unique.append(url) }
            }
    }

    // MARK: - Recherche locale

    /// Un porteur répond-il à la recherche ? Contenu ou nom d'origine d'une
    /// pièce, sans casse ni accents — la clause serveur (`q=`) sur l'index
    /// déjà vu, pour que la recherche réponde dès la frappe, hors ligne compris.
    static func matches(_ message: MeeshyMessage, query: String) -> Bool {
        let term = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !term.isEmpty else { return true }
        let options: String.CompareOptions = [.caseInsensitive, .diacriticInsensitive]
        if message.content.range(of: term, options: options) != nil { return true }
        return message.attachments.contains { !$0.isViewOnce && $0.originalName.range(of: term, options: options) != nil }
    }

    // MARK: - Ordre

    static func newestFirst(_ lhs: MeeshyMessage, _ rhs: MeeshyMessage) -> Bool {
        lhs.createdAt == rhs.createdAt ? lhs.id > rhs.id : lhs.createdAt > rhs.createdAt
    }
}
