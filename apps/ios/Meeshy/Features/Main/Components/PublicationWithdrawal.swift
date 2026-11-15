import Foundation
import MeeshySDK

/// **Ce qui ôte une publication de l'écran de celui qui agit** (#11535) : sa
/// suppression (par l'auteur, sans motif ; par la modération, avec), ou son
/// passage en PRIVÉ par la modération — seul l'auteur la voit encore. Les deux
/// la font quitter le fil du modérateur : l'hôte applique le même retrait
/// optimiste et le même retour arrière, seul l'appel et le retour diffèrent.
enum PublicationWithdrawal: Equatable, Sendable {
    case delete(reason: String?)
    case makePrivate(authorId: String, reason: String)

    func perform(postId: String, with posts: any PostServiceProviding) async throws {
        switch self {
        case .delete(let reason):
            try await posts.delete(postId: postId, reason: reason)
        case .makePrivate(let authorId, let reason):
            try await posts.makePrivate(postId: postId, authorId: authorId, reason: reason)
        }
    }

    func successText(deleted: String) -> String {
        switch self {
        case .delete(let reason):
            return ContentRemovalKind.successText(reason: reason, deleted: deleted)
        case .makePrivate:
            return Self.madePrivateText
        }
    }

    func failureText(deleteError: String) -> String {
        switch self {
        case .delete:
            return deleteError
        case .makePrivate:
            return Self.makePrivateFailedText
        }
    }

    static var madePrivateText: String {
        String(localized: "moderation.private.done", defaultValue: "Publication rendue privée — l'auteur est prévenu", bundle: .main)
    }

    static var makePrivateFailedText: String {
        String(localized: "moderation.private.error", defaultValue: "Impossible de rendre cette publication privée", bundle: .main)
    }
}

/// **Le geste que la feuille de motif fait motiver** (#11535) : retirer le
/// contenu, ou rendre la publication privée. La feuille est la même ; ses mots
/// disent lequel des deux part.
enum ContentModerationGesture: Equatable, Sendable {
    case remove
    case makePrivate

    static let privateSymbol = "lock"

    func titleKey(for kind: ContentRemovalKind) -> String {
        switch self {
        case .remove: return "moderation.removal.title.\(kind.rawValue)"
        case .makePrivate: return "moderation.private.title.\(kind == .story || kind == .reel ? kind.rawValue : "post")"
        }
    }

    func sheetTitle(for kind: ContentRemovalKind, count: Int) -> String {
        guard self == .makePrivate else { return kind.sheetTitle(count: count) }
        switch kind {
        case .reel: return String(localized: "moderation.private.title.reel", defaultValue: "Rendre ce réel privé", bundle: .main)
        case .story: return String(localized: "moderation.private.title.story", defaultValue: "Rendre cette story privée", bundle: .main)
        case .post, .message, .comment: return String(localized: "moderation.private.title.post", defaultValue: "Rendre cette publication privée", bundle: .main)
        }
    }

    var reasonLabel: String {
        switch self {
        case .remove: return String(localized: "moderation.removal.reason.label", defaultValue: "Motif du retrait", bundle: .main)
        case .makePrivate: return String(localized: "moderation.private.reason.label", defaultValue: "Motif", bundle: .main)
        }
    }

    var reasonPlaceholder: String {
        switch self {
        case .remove: return String(localized: "moderation.removal.reason.placeholder", defaultValue: "Expliquez pourquoi ce contenu est retiré…", bundle: .main)
        case .makePrivate: return String(localized: "moderation.private.reason.placeholder", defaultValue: "Expliquez pourquoi cette publication devient privée…", bundle: .main)
        }
    }

    var confirmLabel: String {
        switch self {
        case .remove: return String(localized: "moderation.removal.confirm", defaultValue: "Retirer", bundle: .main)
        case .makePrivate: return String(localized: "moderation.private.confirm", defaultValue: "Rendre privé", bundle: .main)
        }
    }

    var actionLabel: String {
        switch self {
        case .remove: return String(localized: "moderation.removal.action", defaultValue: "Retirer", bundle: .main)
        case .makePrivate: return String(localized: "moderation.private.action", defaultValue: "Rendre privé", bundle: .main)
        }
    }
}
