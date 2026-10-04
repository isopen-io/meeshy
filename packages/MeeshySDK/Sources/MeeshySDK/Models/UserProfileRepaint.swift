import Foundation

/// **UN PORTRAIT ET UN NOM, PARTOUT OÙ UNE COPIE LES GARDE** (#9307) — la loi
/// UNIQUE qui repeint un pair quand la passerelle annonce `user:updated`.
/// Jumelle de `repaintProfile` (web, `apps/web/src/lib/api/my-portrait.ts`).
///
/// Chaque charge servie RECOPIE l'identité de son auteur : la ligne de
/// participant, l'expéditeur de chaque message, l'ami, la demande d'ami, la
/// fiche d'un pair. La règle se dit une fois ici, et chaque site l'appelle —
/// une règle réécrite par surface finirait par dire deux noms pour une
/// personne.
///
/// - Une copie DÉSIGNE le pair par son identifiant d'UTILISATEUR, jamais par
///   son pseudo (qui change justement) ni par un `Participant.id`.
/// - Le NOM voyage en GROUPE (`hasNameGroup`) ; il a deux formes :
///   - une ligne de PARTICIPANT ou un EXPÉDITEUR porte le nom COMPOSÉ —
///     `displayName > « Prénom Nom » > username`, la composition que la
///     passerelle réécrit dans `Participant.displayName` au renommage ;
///   - un objet COMPTE (`MeeshyUser`, `FriendRequestUser`) porte
///     `User.displayName` tel que servi : effacé, il reste effacé.
/// - Le PORTRAIT est tri-état : clé absente ⇒ rien ne bouge ; `null` ⇒ photo
///   RETIRÉE.
/// - Chaque fonction rend `nil` quand rien ne change : l'appelant n'écrit ni ne
///   republie une copie intacte.
extension UserUpdatedEvent {

    /// `displayName > « Prénom Nom » > username`, `nil` hors groupe du nom.
    public var composedName: String? {
        guard hasNameGroup else { return nil }
        let fullName = [firstName, lastName]
            .compactMap { $0?.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
            .joined(separator: " ")
        return Self.nonBlank(displayName) ?? Self.nonBlank(fullName) ?? username
    }

    public func repainted(_ participant: PaginatedParticipant) -> PaginatedParticipant? {
        guard participant.userId == userId else { return nil }
        let name = hasNameGroup ? composedName : participant.displayName
        let repainted = PaginatedParticipant(
            id: participant.id, userId: participant.userId,
            username: hasNameGroup ? username : participant.username,
            firstName: hasNameGroup ? firstName : participant.firstName,
            lastName: hasNameGroup ? lastName : participant.lastName,
            displayName: name,
            avatar: avatar.applied(to: participant.avatar),
            conversationRole: participant.conversationRole, isOnline: participant.isOnline,
            lastActiveAt: participant.lastActiveAt, joinedAt: participant.joinedAt,
            isActive: participant.isActive, type: participant.type
        )
        let unchanged = repainted.username == participant.username
            && repainted.firstName == participant.firstName
            && repainted.lastName == participant.lastName
            && repainted.displayName == participant.displayName
            && repainted.avatar == participant.avatar
        return unchanged ? nil : repainted
    }

    public func repainted(_ message: MeeshyMessage) -> MeeshyMessage? {
        guard message.senderUserId == userId || message.senderId == userId else { return nil }
        var repainted = message
        if let name = composedName {
            repainted.senderName = name
            repainted.senderUsername = username
            repainted.senderColor = DynamicColorGenerator.colorForName(name)
        }
        repainted.senderAvatarURL = avatar.applied(to: message.senderAvatarURL)
        let unchanged = repainted.senderName == message.senderName
            && repainted.senderUsername == message.senderUsername
            && repainted.senderAvatarURL == message.senderAvatarURL
        return unchanged ? nil : repainted
    }

    /// La table `messages` range dans `senderId` l'identifiant d'UTILISATEUR
    /// résolu (`MessagePersistenceActor`, « self-heal » du `senderId`).
    public func repainted(_ record: MessageRecord) -> MessageRecord? {
        guard record.senderId == userId else { return nil }
        var repainted = record
        if let name = composedName {
            repainted.senderName = name
            repainted.senderUsername = username
            repainted.senderColor = DynamicColorGenerator.colorForName(name)
        }
        repainted.senderAvatarURL = avatar.applied(to: record.senderAvatarURL)
        let unchanged = repainted.senderName == record.senderName
            && repainted.senderUsername == record.senderUsername
            && repainted.senderAvatarURL == record.senderAvatarURL
        return unchanged ? nil : repainted
    }

    public func repainted(_ user: FriendRequestUser) -> FriendRequestUser? {
        guard user.id == userId else { return nil }
        let repainted = FriendRequestUser(
            id: user.id,
            username: hasNameGroup ? (username ?? user.username) : user.username,
            firstName: hasNameGroup ? firstName : user.firstName,
            lastName: hasNameGroup ? lastName : user.lastName,
            displayName: hasNameGroup ? displayName : user.displayName,
            avatar: avatar.applied(to: user.avatar),
            isOnline: user.isOnline, lastActiveAt: user.lastActiveAt
        )
        return repainted == user ? nil : repainted
    }

    public func repainted(_ request: FriendRequest) -> FriendRequest? {
        let sender = request.sender.flatMap(repainted)
        let receiver = request.receiver.flatMap(repainted)
        guard sender != nil || receiver != nil else { return nil }
        return FriendRequest(
            id: request.id, senderId: request.senderId, receiverId: request.receiverId,
            message: request.message, status: request.status,
            sender: sender ?? request.sender, receiver: receiver ?? request.receiver,
            respondedAt: request.respondedAt, createdAt: request.createdAt, updatedAt: request.updatedAt
        )
    }

    public func repainted(_ user: MeeshyUser) -> MeeshyUser? {
        guard user.id == userId else { return nil }
        let repainted = user.repaintingPublicProfile(
            username: hasNameGroup ? (username ?? user.username) : user.username,
            firstName: hasNameGroup ? firstName : user.firstName,
            lastName: hasNameGroup ? lastName : user.lastName,
            displayName: hasNameGroup ? displayName : user.displayName,
            avatar: avatar.applied(to: user.avatar),
            banner: banner.applied(to: user.banner)
        )
        let unchanged = repainted.username == user.username
            && repainted.firstName == user.firstName
            && repainted.lastName == user.lastName
            && repainted.displayName == user.displayName
            && repainted.avatar == user.avatar
            && repainted.banner == user.banner
        return unchanged ? nil : repainted
    }

    private static func nonBlank(_ value: String?) -> String? {
        guard let value, !value.trimmingCharacters(in: .whitespaces).isEmpty else { return nil }
        return value
    }
}

extension UserUpdatedEvent.OptionalMediaChange {
    /// `.unchanged` garde la copie ; `.replaced(nil)` la RETIRE — un `if let`
    /// aurait gardé l'ancienne photo après une suppression.
    public func applied(to current: String?) -> String? {
        switch self {
        case .unchanged: return current
        case .replaced(let url): return url
        }
    }
}

extension UserUpdatedEvent: Equatable {
    public static func == (lhs: UserUpdatedEvent, rhs: UserUpdatedEvent) -> Bool {
        lhs.userId == rhs.userId
            && lhs.displayName == rhs.displayName
            && lhs.firstName == rhs.firstName
            && lhs.lastName == rhs.lastName
            && lhs.username == rhs.username
            && lhs.hasNameGroup == rhs.hasNameGroup
            && lhs.avatar == rhs.avatar
            && lhs.banner == rhs.banner
    }
}

extension Array {
    /// Applique une règle de repeinture ligne à ligne ; `nil` quand aucune
    /// ligne ne change — l'appelant ne republie pas une liste intacte. L'ordre
    /// est conservé.
    public func repaintedElements(by rule: (Element) -> Element?) -> [Element]? {
        var changed = false
        let repainted = map { element -> Element in
            guard let next = rule(element) else { return element }
            changed = true
            return next
        }
        return changed ? repainted : nil
    }
}

extension MeeshyUser {
    /// Copie du compte avec les six champs PUBLICS que porte `user:updated`
    /// remplacés — tout le reste recopié (`MeeshyUser` n'a que des `let`).
    func repaintingPublicProfile(
        username: String, firstName: String?, lastName: String?,
        displayName: String?, avatar: String?, banner: String?
    ) -> MeeshyUser {
        MeeshyUser(
            id: id, username: username, email: email,
            firstName: firstName, lastName: lastName,
            displayName: displayName, bio: bio,
            avatar: avatar, avatarThumbHash: avatar == self.avatar ? avatarThumbHash : nil,
            banner: banner, bannerThumbHash: banner == self.banner ? bannerThumbHash : nil,
            role: role,
            systemLanguage: systemLanguage, regionalLanguage: regionalLanguage,
            isOnline: isOnline, lastActiveAt: lastActiveAt,
            createdAt: createdAt, updatedAt: updatedAt,
            blockedUserIds: blockedUserIds,
            isActive: isActive, deactivatedAt: deactivatedAt,
            isAnonymous: isAnonymous, isMeeshyer: isMeeshyer,
            phoneNumber: phoneNumber,
            emailVerifiedAt: emailVerifiedAt, phoneVerifiedAt: phoneVerifiedAt,
            customDestinationLanguage: customDestinationLanguage,
            autoTranslateEnabled: autoTranslateEnabled,
            deviceLocale: deviceLocale,
            timezone: timezone,
            registrationCountry: registrationCountry,
            profileCompletionRate: profileCompletionRate,
            signalIdentityKeyPublic: signalIdentityKeyPublic,
            voicePublic: voicePublic,
            voiceSampleUrl: voiceSampleUrl,
            voiceSampleDurationMs: voiceSampleDurationMs,
            voiceQuality: voiceQuality,
            activation: activation
        )
    }
}
