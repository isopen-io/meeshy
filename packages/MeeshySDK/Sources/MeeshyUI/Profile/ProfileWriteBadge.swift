import Foundation
import MeeshySDK

/// Ce que l'app fournit pour la pastille d'« Écrire » (#19646) : la liste des conversations telle que son cache la garde,
/// jamais le réseau. Absente, la fiche ne pose aucune pastille.
@MainActor
public protocol ProfileDirectUnreadProviding: AnyObject, Sendable {
    func cachedConversationList() async -> [MeeshyConversation]
    /// Une annonce à chaque réécriture du cache de la liste (message reçu, conversation lue ailleurs) : la fiche ouverte
    /// relit sa pastille sans changer de personne. Par défaut, rien n'est annoncé.
    func conversationListChanges() -> AsyncStream<Void>
}

public extension ProfileDirectUnreadProviding {
    func conversationListChanges() -> AsyncStream<Void> {
        AsyncStream { $0.finish() }
    }
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

/// Ce que la fiche lit de nos conversations directes dans le cache de la liste : la pastille d'« Écrire », et si une
/// directe est déjà connue — hors ligne, « Écrire » ne promet « sera envoyé » que pour une conversation qui existe
/// (l'app ne sait pas en créer une sans réseau).
public nonisolated struct ProfileDirectDigest: Equatable, Sendable {
    public let badge: ProfileWriteBadge
    public let knowsDirect: Bool

    public init(badge: ProfileWriteBadge, knowsDirect: Bool) {
        self.badge = badge
        self.knowsDirect = knowsDirect
    }

    public static let empty = ProfileDirectDigest(badge: .empty, knowsDirect: false)

    public static func resolve(in conversations: [MeeshyConversation], with userId: String?) -> ProfileDirectDigest {
        guard let target = userId?.lowercased(), !target.isEmpty else { return .empty }
        let knowsDirect = conversations.contains { $0.type == .direct && $0.participantUserId?.lowercased() == target }
        return ProfileDirectDigest(badge: ProfileWriteBadge.resolve(in: conversations, with: userId), knowsDirect: knowsDirect)
    }
}

extension ProfileDirectDigest {
    /// Le cache de la liste chez l'hôte, et lui seul ; sans hôte ou sans personne, rien.
    @MainActor
    public static func load(for userId: String?, from host: (any ProfileDirectUnreadProviding)?) async -> ProfileDirectDigest {
        guard let host, let userId, !userId.isEmpty else { return .empty }
        return resolve(in: await host.cachedConversationList(), with: userId)
    }

    /// La lecture d'ouverture, puis une relecture à chaque réécriture du cache de la liste, tant que la fiche montre la
    /// même personne. Jamais le réseau.
    @MainActor
    public static func updates(for userId: String?,
                               from host: (any ProfileDirectUnreadProviding)?) -> AsyncStream<ProfileDirectDigest> {
        AsyncStream { continuation in
            let task = Task { @MainActor in
                continuation.yield(await load(for: userId, from: host))
                if let host {
                    for await _ in host.conversationListChanges() {
                        continuation.yield(await load(for: userId, from: host))
                    }
                }
                continuation.finish()
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }
}
