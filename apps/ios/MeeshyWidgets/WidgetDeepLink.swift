import Foundation

enum WidgetDeepLink {
    private static let segmentAllowed = CharacterSet(
        charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~"
    )

    static func conversation(_ id: String) -> URL? {
        url(host: "conversation", id: id)
    }

    static func contact(_ id: String) -> URL? {
        url(host: "contact", id: id)
    }

    static func quickReply(conversationId: String, draft: String) -> URL? {
        let encodedDraft = draft.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
        return url(host: "quickreply", id: conversationId, query: "?text=\(encodedDraft)")
    }

    private static func url(host: String, id: String, query: String = "") -> URL? {
        guard let segment = id.addingPercentEncoding(withAllowedCharacters: segmentAllowed),
              !segment.isEmpty else { return nil }
        return URL(string: "meeshy://\(host)/\(segment)\(query)")
    }
}
