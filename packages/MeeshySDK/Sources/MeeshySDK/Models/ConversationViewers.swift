import Foundation

/// Qui a l'écran de quelle conversation ouvert (#8892), tel que le serveur
/// l'annonce par `viewing:start` / `viewing:stop` / `viewing:snapshot`.
///
/// Indexé par conversation : chaque socket est dans TOUTES ses rooms, la liste
/// apprend donc qui est dans chaque conversation sans l'avoir ouverte. Valeur
/// immuable — chaque événement rend un nouvel état.
/// Ce qu'un avatar dit d'une personne dans UNE conversation (#8892, #9061,
/// #9065) : absente, ICI (l'écran ouvert, point fixe), ici ET active — elle
/// défile, écoute ou agit — ou ici et en PLEIN ÉCRAN sur un élément ouvert
/// depuis la conversation. Le point pulse dans les deux derniers cas ; son
/// mood, lui, s'immobilise en plein écran. Un littéral booléen vaut « ici »
/// ou « absente ».
public enum ConversationHere: Equatable, Sendable, ExpressibleByBooleanLiteral {
    case absent
    case here
    case active
    case focused

    public init(booleanLiteral value: Bool) {
        self = value ? .here : .absent
    }

    public var isHere: Bool { self != .absent }
    public var isActive: Bool { self == .active || self == .focused }
    public var isFocused: Bool { self == .focused }
}

/// Qui est ici, et qui y est actif, dans UNE conversation — lu une fois par
/// configuration de cellule et remis aux rangées en valeur.
public struct ConversationHereRoster: Equatable, Sendable {
    public let here: Set<String>
    public let active: Set<String>
    public let focused: Set<String>

    public init(here: Set<String> = [], active: Set<String> = [], focused: Set<String> = []) {
        self.here = here
        self.active = active
        self.focused = focused
    }

    public subscript(userId: String) -> ConversationHere {
        guard here.contains(userId) else { return .absent }
        if focused.contains(userId) { return .focused }
        return active.contains(userId) ? .active : .here
    }
}

public struct ConversationViewers: Equatable, Sendable {
    public let usersByConversation: [String: Set<String>]
    /// Les pairs ICI qui regardent, écoutent ou agissent en ce moment (#9061) —
    /// `viewing:activity`. L'app les éteint quand l'activité se tait.
    public let activeByConversation: [String: Set<String>]
    /// Parmi eux, ceux qui regardent un élément en plein écran (#9065).
    public let focusedByConversation: [String: Set<String>]

    public init(
        usersByConversation: [String: Set<String>] = [:],
        activeByConversation: [String: Set<String>] = [:],
        focusedByConversation: [String: Set<String>] = [:]
    ) {
        self.usersByConversation = usersByConversation.filter { !$0.value.isEmpty }
        self.activeByConversation = activeByConversation.filter { !$0.value.isEmpty }
        self.focusedByConversation = focusedByConversation.filter { !$0.value.isEmpty }
    }

    public func isHere(userId: String, conversationId: String) -> Bool {
        usersByConversation[conversationId]?.contains(userId) ?? false
    }

    public func users(in conversationId: String) -> Set<String> {
        usersByConversation[conversationId] ?? []
    }

    public func isActive(userId: String, conversationId: String) -> Bool {
        activeByConversation[conversationId]?.contains(userId) ?? false
    }

    public func activeUsers(in conversationId: String) -> Set<String> {
        activeByConversation[conversationId] ?? []
    }

    public func focusedUsers(in conversationId: String) -> Set<String> {
        focusedByConversation[conversationId] ?? []
    }

    public func here(userId: String, conversationId: String) -> ConversationHere {
        roster(in: conversationId)[userId]
    }

    public func roster(in conversationId: String) -> ConversationHereRoster {
        ConversationHereRoster(
            here: users(in: conversationId),
            active: activeUsers(in: conversationId),
            focused: focusedUsers(in: conversationId)
        )
    }

    public func applying(_ event: ConversationViewingEvent) -> ConversationViewers {
        switch event {
        case .arrived(let change):
            return replacing(change.conversationId, with: users(in: change.conversationId).union([change.userId]))
        case .left(let change):
            return replacing(change.conversationId, with: users(in: change.conversationId).subtracting([change.userId]))
                .resting(userId: change.userId, conversationId: change.conversationId)
        case .snapshot(let snapshot):
            return replacing(snapshot.conversationId, with: Set(snapshot.userIds))
        case .active(let change):
            return stirring(userId: change.userId, conversationId: change.conversationId, focus: change.focus)
        case .sessionStarted:
            return ConversationViewers()
        }
    }

    /// Chaque activité dit si elle vient d'un plein écran : une activité sans
    /// `focus` y met fin, le pair est revenu au fil.
    public func stirring(userId: String, conversationId: String, focus: Bool = false) -> ConversationViewers {
        var active = activeByConversation
        active[conversationId] = activeUsers(in: conversationId).union([userId])
        var focused = focusedByConversation
        let current = focusedUsers(in: conversationId)
        focused[conversationId] = focus ? current.union([userId]) : current.subtracting([userId])
        return ConversationViewers(usersByConversation: usersByConversation, activeByConversation: active, focusedByConversation: focused)
    }

    public func resting(userId: String, conversationId: String) -> ConversationViewers {
        var active = activeByConversation
        active[conversationId] = activeUsers(in: conversationId).subtracting([userId])
        var focused = focusedByConversation
        focused[conversationId] = focusedUsers(in: conversationId).subtracting([userId])
        return ConversationViewers(usersByConversation: usersByConversation, activeByConversation: active, focusedByConversation: focused)
    }

    private func replacing(_ conversationId: String, with users: Set<String>) -> ConversationViewers {
        var next = usersByConversation
        next[conversationId] = users
        return ConversationViewers(
            usersByConversation: next,
            activeByConversation: activeByConversation,
            focusedByConversation: focusedByConversation
        )
    }
}

public extension MeeshyMessage {
    /// La clé sous laquelle le serveur annonce l'auteur dans `viewing:*` :
    /// l'identifiant de COMPTE d'un inscrit, celui de PARTICIPATION d'un
    /// visiteur anonyme. `senderId` est toujours l'identifiant de participation.
    var viewingKey: String {
        senderIsAnonymous ? senderId : (senderUserId ?? senderId)
    }
}
