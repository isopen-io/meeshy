import Foundation
import MeeshySDK

/// Ce que l'app fournit pour la pastille d'« Écrire » (#19646) : la liste des conversations telle que son cache la garde,
/// jamais le réseau. Absente, la fiche ne pose aucune pastille.
@MainActor
public protocol ProfileDirectUnreadProviding: AnyObject, Sendable {
    func cachedConversationList() async -> [MeeshyConversation]
}

/// **La pastille d'« Écrire »** (#19646, planche `Sys-Boutons` § 02, état « Compteur ») : les messages non lus de nos
/// conversations directes avec la personne — deux tête-à-tête (clair et chiffré, #12966) s'additionnent. Rien à zéro, ni
/// sur ma fiche, ni sur une fiche bloquée. Elle se voit plafonnée comme la liste (« 99+ ») et se dit avec le vrai nombre.
public nonisolated struct ProfileWriteBadge: Equatable, Sendable {
    public let count: Int

    public init(count: Int) {
        self.count = max(0, count)
    }

    public static let empty = ProfileWriteBadge(count: 0)

    public static func resolve(in conversations: [MeeshyConversation], with userId: String?,
                               isShown: Bool = true) -> ProfileWriteBadge {
        guard isShown, let target = userId?.lowercased(), !target.isEmpty else { return .empty }
        let unread = conversations
            .filter { $0.type == .direct && $0.participantUserId?.lowercased() == target }
            .map { max(0, $0.userState.unreadCount) }
            .reduce(0, +)
        return ProfileWriteBadge(count: unread)
    }

    /// La pastille vue : le nombre, ou « 99+ » ; `nil` à zéro.
    public var text: String? {
        MeeshyBadgeCount.text(count)
    }
}

extension ProfileWriteBadge {
    /// Ce que VoiceOver dit après « Écrire » : « 2 messages non lus » ; `nil` à zéro.
    @MainActor
    public var spoken: String? {
        guard count > 0 else { return nil }
        return String(localized: "profile.write.unread", defaultValue: "\(count) messages non lus", bundle: .module)
    }

    /// Le cache de la liste chez l'hôte, et lui seul ; sans hôte ou sans personne, aucune pastille.
    @MainActor
    public static func load(for userId: String?, from host: (any ProfileDirectUnreadProviding)?,
                            isShown: Bool = true) async -> ProfileWriteBadge {
        guard isShown, let host, let userId, !userId.isEmpty else { return .empty }
        return resolve(in: await host.cachedConversationList(), with: userId)
    }
}
