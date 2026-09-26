import Foundation
import MeeshySDK

/// Quelle conversation une URL d'un message désigne-t-elle ? (#8099)
///
/// **Traduit, n'analyse pas** : l'analyse est celle des liens universels
/// (`DeepLinkParser.parse`), la seule table des formes de lien Meeshy. Une
/// seconde table aurait divergé au premier format ajouté à l'une d'elles.
///
/// Reconnu : `/join/<id>` et `/chat/<id>` (lien de PARTAGE ou d'invitation,
/// `https://meeshy.me/…` ou `meeshy://…`), `/c/<id>` et `/conversation/<id>`
/// (lien DIRECT). Jamais `/l/<token>` : un lien de SUIVI peut viser un post, un
/// réel ou un site externe — le présumer conversation ferait une carte fausse.
enum ConversationLinkTarget {

    static func target(for urlString: String) -> ConversationCardTarget? {
        guard let url = URL(string: urlString.trimmingCharacters(in: .whitespacesAndNewlines)) else { return nil }
        return target(for: url)
    }

    static func target(for url: URL) -> ConversationCardTarget? {
        guard isWebOrMeeshyScheme(url) else { return nil }
        switch DeepLinkParser.parse(url) {
        case .joinLink(let identifier), .chatLink(let identifier):
            return .shareLink(identifier: identifier)
        case .conversation(let id, let draftText) where draftText == nil && isConversationPath(url):
            return .direct(conversationId: id)
        default:
            return nil
        }
    }

    /// Les surfaces widget / App Shortcut (`meeshy://contact/…`,
    /// `meeshy://quickreply/…`, `meeshy://send?…`) se lisent aussi en
    /// `.conversation` : ce sont des raccourcis d'appareil, pas des liens qu'on
    /// partage — la carte ne s'y pose pas.
    private static func isConversationPath(_ url: URL) -> Bool {
        let head: String? = url.scheme?.lowercased() == "meeshy"
            ? url.host?.lowercased()
            : url.pathComponents.first(where: { $0 != "/" })?.lowercased()
        return head == "c" || head == "conversation"
    }

    private static func isWebOrMeeshyScheme(_ url: URL) -> Bool {
        guard let scheme = url.scheme?.lowercased() else { return false }
        return scheme == "https" || scheme == "http" || scheme == "meeshy"
    }
}
