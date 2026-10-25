import Foundation
import MeeshySDK

/// **Un destinataire de l'écran de partage** — une conversation existante, une
/// personne sans conversation encore ouverte (amie, contact du carnet apparié,
/// résultat de recherche), ou le canal d'une communauté où l'on peut écrire (D11).
///
/// L'identifiant est une clé d'état stable : `conv:<id>`, `user:<id>`.
nonisolated struct ShareRecipient: Identifiable, Equatable, Codable, Sendable {
    enum Kind: String, Equatable, Codable, Sendable {
        case conversation
        case person
    }

    /// Ce que la ligne dit sous le nom — composé en mots par la vue, jamais ici.
    enum Detail: Equatable, Codable, Sendable {
        case direct
        case group(members: Int)
        case friendWithoutConversation
        case contact(handle: String?)
        case handle(String)
        case channel(community: String)
    }

    let id: String
    let kind: Kind
    let conversationId: String?
    let userId: String?
    var title: String
    var detail: Detail
    var avatarURL: String?
    /// La conversation est chiffrée de bout en bout (D7, V8) : le serveur n'y
    /// reçoit aucun clair. `server` et `hybrid` n'en sont pas — le serveur y
    /// reçoit le clair et le chiffre lui-même (#12978).
    let isEncrypted: Bool
    /// Le titre est le NOM DE PROFIL : un renommage le suit. Faux pour un contact
    /// titré par le nom du carnet.
    var followsProfileName = true

    var isGroup: Bool {
        if case .group = detail { return true }
        if case .channel = detail { return true }
        return false
    }

    var destination: ShareDestination { ShareDestination(id: id, encrypted: isEncrypted) }

    init(
        id: String, kind: Kind, conversationId: String?, userId: String?, title: String,
        detail: Detail, avatarURL: String?, isEncrypted: Bool = false, followsProfileName: Bool = true
    ) {
        self.id = id
        self.kind = kind
        self.conversationId = conversationId
        self.userId = userId
        self.title = title
        self.detail = detail
        self.avatarURL = avatarURL
        self.isEncrypted = isEncrypted
        self.followsProfileName = followsProfileName
    }
}

nonisolated extension ShareRecipient {

    init(conversation: MeeshyConversation, communityName: String? = nil) {
        let isDirect = conversation.type == .direct
        self.init(
            id: "conv:\(conversation.id)",
            kind: .conversation,
            conversationId: conversation.id,
            userId: isDirect ? conversation.participantUserId : nil,
            title: conversation.displayName,
            detail: communityName.map { .channel(community: $0) } ?? (isDirect ? .direct : .group(members: conversation.memberCount)),
            avatarURL: conversation.avatar ?? conversation.participantAvatarURL,
            isEncrypted: EndToEndSendGate.requiresSeal(conversationEncryptionModes: [conversation.encryptionMode])
        )
    }

    init(friend user: FriendRequestUser) {
        self.init(
            id: "user:\(user.id)", kind: .person, conversationId: nil, userId: user.id,
            title: user.name, detail: .friendWithoutConversation, avatarURL: user.avatar
        )
    }

    /// Un contact du carnet APPARIÉ : seul un contact qui a un compte Meeshy a
    /// quelqu'un à qui écrire.
    init?(contact: DirectoryContact) {
        guard let user = contact.matchedUser else { return nil }
        self.init(
            id: "user:\(user.id)", kind: .person, conversationId: nil, userId: user.id,
            title: contact.resolvedName, detail: .contact(handle: contact.subtitle), avatarURL: user.avatar,
            followsProfileName: false
        )
    }

    /// #9307 — la ligne d'un pair suit `user:updated` ; `nil` quand rien ne change.
    func repainted(by event: UserUpdatedEvent) -> ShareRecipient? {
        guard userId == event.userId else { return nil }
        var next = self
        if followsProfileName, let renamed = event.composedName { next.title = renamed }
        next.avatarURL = event.avatar.applied(to: avatarURL)
        return next == self ? nil : next
    }
}

/// **La fusion des destinataires** — une personne n'apparaît jamais deux fois.
///
/// Ordre : conversations (dans l'ordre reçu), puis personnes non absorbées. Une
/// personne dont la conversation directe est déjà listée est ABSORBÉE par elle.
/// RÈGLE JUMELLE : `apps/web/src/lib/send/` (destinataires de `SendSheet`).
nonisolated enum ShareRecipientMerge {

    static func merge(conversations: [ShareRecipient], people: [ShareRecipient]) -> [ShareRecipient] {
        var seen = Set<String>()
        var joined = Set<String>()
        let kept = conversations.filter { recipient in
            guard seen.insert(recipient.id).inserted else { return false }
            if let userId = recipient.userId { joined.insert(userId) }
            return true
        }
        let others = people.filter { person in
            guard seen.insert(person.id).inserted else { return false }
            return person.userId.map { !joined.contains($0) } ?? true
        }
        return kept + others
    }

    /// Une conversation trouvée par la recherche n'est un destinataire que si
    /// l'utilisateur peut y ÉCRIRE, donc s'il en est membre. `isMember` est le
    /// drapeau SERVEUR et fait foi ; absent (passerelle antérieure), seuls les
    /// salons `public`/`global` exigent de lire les participants.
    static func isReachableConversation(type: String, participantUserIds: [String], currentUserId: String, isMember: Bool? = nil) -> Bool {
        if let isMember { return isMember }
        guard ["public", "global"].contains(type.lowercased()) else { return true }
        guard !currentUserId.isEmpty else { return false }
        return participantUserIds.contains(currentUserId)
    }

    /// Un filtre local sur le nom, insensible à la casse et aux accents.
    static func matching(_ recipients: [ShareRecipient], query: String) -> [ShareRecipient] {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return recipients }
        return recipients.filter { $0.title.range(of: trimmed, options: [.caseInsensitive, .diacriticInsensitive]) != nil }
    }
}
