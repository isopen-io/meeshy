import Foundation

// MARK: - List Preview Truncation

public extension String {
    /// Cap (in grapheme clusters) for list-row message previews
    /// (`lastMessagePreview` and its translations). Rows render at most
    /// 2 lines, but CoreText typesets the FULL string on every measurement
    /// (cost is O(total length); `lineLimit` does not bound it) — an
    /// unbounded preview multiplied across rows starves the main thread.
    /// Mirrors the gateway-side `LAST_MESSAGE_PREVIEW_MAX_LENGTH`
    /// (`services/gateway/src/routes/conversations/utils/last-message-preview.ts`,
    /// qui plafonne AUSSI chaque aperçu traduit de `lastMessageTranslations`).
    static let meeshyPreviewMaxLength = 300

    /// `prefix` walks Characters (grapheme clusters), so the cut never
    /// splits an emoji or a combining sequence.
    var meeshyPreviewTruncated: String {
        String(prefix(Self.meeshyPreviewMaxLength))
    }
}

// MARK: - API Conversation Models

public struct APIConversationUserNested: Decodable, Sendable {
    public let id: String?
    public let username: String?
    public let displayName: String?
    public let firstName: String?
    public let lastName: String?
    public let avatar: String?
    public let banner: String?
    public let isOnline: Bool?
    public let lastActiveAt: Date?
}

public struct APIConversationUser: Decodable, Sendable {
    public let id: String
    public let userId: String?
    public let username: String?
    public let displayName: String?
    public let firstName: String?
    public let lastName: String?
    public let avatar: String?
    public let banner: String?
    public let isOnline: Bool?
    public let lastActiveAt: Date?
    public let type: String?
    public let user: APIConversationUserNested?

    public var name: String {
        nonEmpty(displayName) ?? nonEmpty(user?.displayName) ?? nonEmpty(username) ?? nonEmpty(user?.username) ?? id
    }

    public var resolvedAvatar: String? {
        nonEmpty(avatar) ?? nonEmpty(user?.avatar)
    }

    public var resolvedBanner: String? {
        nonEmpty(banner) ?? nonEmpty(user?.banner)
    }

    public var resolvedUserId: String? {
        userId ?? user?.id
    }

    private func nonEmpty(_ s: String?) -> String? {
        guard let s, !s.trimmingCharacters(in: .whitespaces).isEmpty else { return nil }
        return s
    }
}

public struct APIMessageCount: Decodable, Sendable {
    public let attachments: Int?
}

public struct APIConversationLastMessage: Decodable, Sendable {
    public let id: String
    public let content: String?
    public let senderId: String?
    public let createdAt: Date
    public let messageType: String?
    public let sender: APIConversationUser?
    public let attachments: [APIMessageAttachment]?
    public let _count: APIMessageCount?
    public let isBlurred: Bool?
    public let isViewOnce: Bool?
    public let expiresAt: Date?
    /// Position hissée par le gateway (message géolocalisé). Un message
    /// position-seule a un `content` vide : c'est ce champ qui permet à la
    /// ligne d'aperçu de composer son libellé côté client.
    public let location: SharedPlace?

    enum CodingKeys: String, CodingKey {
        case id, content, senderId, createdAt, messageType, sender, attachments
        case _count
        case isBlurred, isViewOnce, expiresAt, location
    }
}

@available(*, deprecated, renamed: "APIParticipant")
public typealias APIConversationMember = APIParticipant

public struct APIConversationPreferences: Codable, Sendable {
    public var isPinned: Bool?
    public var isMuted: Bool?
    public var isArchived: Bool?
    public var deletedForUserAt: Date?
    public var tags: [String]?
    public var categoryId: String?
    public var reaction: String?
    public var customName: String?
    public var mentionsOnly: Bool?
    /// Monotonic version for optimistic-concurrency resolution
    /// (`incoming.version <= local -> drop`). Populated by the gateway
    /// in Phase 1 of the unification refactor. Optional for backward
    /// compatibility with pre-Phase-1 server responses and old cache
    /// rows; the Store treats `nil` as version 0.
    public var version: Int?

    public init(
        isPinned: Bool? = nil,
        isMuted: Bool? = nil,
        isArchived: Bool? = nil,
        deletedForUserAt: Date? = nil,
        tags: [String]? = nil,
        categoryId: String? = nil,
        reaction: String? = nil,
        customName: String? = nil,
        mentionsOnly: Bool? = nil,
        version: Int? = nil
    ) {
        self.isPinned = isPinned
        self.isMuted = isMuted
        self.isArchived = isArchived
        self.deletedForUserAt = deletedForUserAt
        self.tags = tags
        self.categoryId = categoryId
        self.reaction = reaction
        self.customName = customName
        self.mentionsOnly = mentionsOnly
        self.version = version
    }
}

public struct APIConversation: Decodable, Sendable {
    public let id: String
    public let type: String
    public let identifier: String?
    public let title: String?
    public let description: String?
    public let avatar: String?
    public let banner: String?
    public let communityId: String?
    public let isActive: Bool?
    public let memberCount: Int?
    /// Vrai quand `memberCount` arrive plafonné à 199 (lecteur non admin
    /// plateforme) — à propager tel quel vers `MeeshyConversation`.
    public let memberCountCapped: Bool?
    public let isAnnouncementChannel: Bool?
    public let defaultWriteRole: String?
    public let slowModeSeconds: Int?
    public let autoTranslateEnabled: Bool?
    public let lastMessageAt: Date?
    public let participants: [APIParticipant]?
    /// Le LECTEUR est-il un participant actif de cette conversation ? Calculé
    /// serveur, seule autorité sur la question : `GET /conversations/search`
    /// rend aussi les salons `public`/`global` dont il n'est pas membre, et
    /// n'y émet plus AUCUN participant (décision du user, 2026-08-19).
    ///
    /// `nil` = le serveur ne l'a pas dit (route qui ne le calcule pas, ou
    /// gateway antérieur) — le lecteur retombe alors sur son comportement
    /// d'avant, jamais sur « pas membre ».
    public let isMember: Bool?
    public let lastMessage: APIConversationLastMessage?
    /// Prisme Linguistique de la ligne de liste — `{ langue: aperçu traduit }`,
    /// déjà restreint par le gateway aux langues du prisme du LECTEUR et tronqué
    /// au même plafond que `lastMessage.content`.
    ///
    /// Vit au niveau conversation, pas dans `lastMessage`, pour deux raisons :
    /// c'est la clé que `MeeshyConversation` décode depuis toujours pour son
    /// cache disque, et la carte compacte n'a pas la forme d'un
    /// `[APITextTranslation]` (deux formes sous un même nom auraient dérivé).
    public let lastMessageTranslations: [String: String]?
    /// Langue d'origine du dernier message — celle de `lastMessage.content`.
    /// Sans elle, `resolvedLastMessagePreview` ne peut pas distinguer « pas de
    /// traduction vers ma langue » de « le message EST déjà dans ma langue ».
    public let lastMessageOriginalLanguage: String?
    public let recentMessages: [APIConversationLastMessage]?
    public let userPreferences: [APIConversationPreferences]?
    public let unreadCount: Int?
    public let updatedAt: Date?
    public let encryptionMode: String?
    public let currentUserRole: String?
    public let currentUserJoinedAt: Date?
    public let createdAt: Date
    public let closedAt: Date?
    public let closedBy: String?

    public init(
        id: String, type: String, identifier: String? = nil, title: String? = nil,
        description: String? = nil, avatar: String? = nil, banner: String? = nil,
        communityId: String? = nil, isActive: Bool? = nil, memberCount: Int? = nil,
        memberCountCapped: Bool? = nil,
        isAnnouncementChannel: Bool? = nil, defaultWriteRole: String? = nil,
        slowModeSeconds: Int? = nil, autoTranslateEnabled: Bool? = nil,
        lastMessageAt: Date? = nil, participants: [APIParticipant]? = nil,
        lastMessage: APIConversationLastMessage? = nil,
        lastMessageTranslations: [String: String]? = nil,
        lastMessageOriginalLanguage: String? = nil,
        recentMessages: [APIConversationLastMessage]? = nil,
        userPreferences: [APIConversationPreferences]? = nil, unreadCount: Int? = nil,
        updatedAt: Date? = nil, encryptionMode: String? = nil,
        currentUserRole: String? = nil, currentUserJoinedAt: Date? = nil,
        createdAt: Date,
        closedAt: Date? = nil, closedBy: String? = nil,
        isMember: Bool? = nil
    ) {
        self.id = id; self.type = type; self.identifier = identifier; self.title = title
        self.description = description; self.avatar = avatar; self.banner = banner
        self.communityId = communityId; self.isActive = isActive; self.memberCount = memberCount
        self.memberCountCapped = memberCountCapped
        self.isAnnouncementChannel = isAnnouncementChannel; self.defaultWriteRole = defaultWriteRole
        self.slowModeSeconds = slowModeSeconds; self.autoTranslateEnabled = autoTranslateEnabled
        self.lastMessageAt = lastMessageAt; self.participants = participants
        self.lastMessage = lastMessage
        self.lastMessageTranslations = lastMessageTranslations
        self.lastMessageOriginalLanguage = lastMessageOriginalLanguage
        self.recentMessages = recentMessages
        self.userPreferences = userPreferences; self.unreadCount = unreadCount
        self.updatedAt = updatedAt; self.encryptionMode = encryptionMode
        self.currentUserRole = currentUserRole; self.currentUserJoinedAt = currentUserJoinedAt
        self.createdAt = createdAt
        self.closedAt = closedAt; self.closedBy = closedBy
        self.isMember = isMember
    }
}

// MARK: - Update Conversation Response (PUT — lighter than full APIConversation)

public struct UpdateConversationResponse: Decodable, Sendable {
    public let id: String
    public let type: String
    public let identifier: String?
    public let title: String?
    public let description: String?
    public let avatar: String?
    public let banner: String?
    public let communityId: String?
    public let isActive: Bool?
    public let isAnnouncementChannel: Bool?
    public let defaultWriteRole: String?
    public let slowModeSeconds: Int?
    public let autoTranslateEnabled: Bool?
    public let updatedAt: Date?
    public let createdAt: Date

    public func toAPIConversation() -> APIConversation {
        APIConversation(
            id: id, type: type, identifier: identifier, title: title,
            description: description, avatar: avatar, banner: banner,
            communityId: communityId, isActive: isActive,
            memberCount: nil, isAnnouncementChannel: isAnnouncementChannel,
            defaultWriteRole: defaultWriteRole, slowModeSeconds: slowModeSeconds,
            autoTranslateEnabled: autoTranslateEnabled, lastMessageAt: nil,
            participants: nil, lastMessage: nil, recentMessages: nil,
            userPreferences: nil, unreadCount: nil, updatedAt: updatedAt,
            encryptionMode: nil, currentUserRole: nil, currentUserJoinedAt: nil,
            createdAt: createdAt, closedAt: nil, closedBy: nil
        )
    }
}

extension MeeshyConversation {
    /// Reporte sur une conversation connue les seules métadonnées qu'une
    /// réponse de mise à jour affirme.
    ///
    /// `PUT/PATCH /conversations/:id` rend le CONTENEUR : titre, description,
    /// visuels, réglages. Il ne rend ni le rang du lecteur, ni l'effectif, ni
    /// les participants, ni l'aperçu du dernier message — et
    /// `UpdateConversationResponse.toAPIConversation()` comble ces trous par
    /// `nil`. Reconstruire la conversation à partir de cette réponse rendait
    /// donc à l'appelant un objet amputé : le créateur perdait son propre rang
    /// et l'effectif retombait à zéro juste après une sauvegarde RÉUSSIE.
    ///
    /// La règle est celle du tri-état déjà en vigueur sur le fil : on n'écrit
    /// que ce que le serveur a dit. Un champ absent de la réponse laisse la
    /// valeur locale intacte — il ne l'efface pas.
    public func mergingMetadata(from updated: APIConversation) -> MeeshyConversation {
        var merged = self
        merged.title = updated.title ?? title
        merged.description = updated.description ?? description
        merged.avatar = updated.avatar ?? avatar
        merged.banner = updated.banner ?? banner
        merged.isActive = updated.isActive ?? isActive
        merged.isAnnouncementChannel = updated.isAnnouncementChannel ?? isAnnouncementChannel
        merged.defaultWriteRole = updated.defaultWriteRole ?? defaultWriteRole
        merged.slowModeSeconds = updated.slowModeSeconds ?? slowModeSeconds
        merged.autoTranslateEnabled = updated.autoTranslateEnabled ?? autoTranslateEnabled
        merged.updatedAt = updated.updatedAt ?? updatedAt
        return merged
    }
}

extension APIConversation {
    public func toConversation(currentUserId: String) -> MeeshyConversation {
        let otherParticipant = participants?.first { $0.userId != currentUserId }
        let otherUser = otherParticipant?.user

        let convType: MeeshyConversation.ConversationType = {
            switch type.lowercased() {
            case "direct", "dm": return .direct
            case "group": return .group
            case "community": return .community
            case "channel": return .channel
            case "public": return .public
            case "global": return .global
            case "bot": return .bot
            case "broadcast": return .broadcast
            default: return .direct
            }
        }()

        let displayName: String = {
            if convType == .direct {
                if let participant = otherParticipant {
                    return participant.user?.name ?? participant.name
                }
                if let sender = lastMessage?.sender,
                   (sender.resolvedUserId ?? sender.id) != currentUserId {
                    return sender.name
                }
            }
            if let t = title, !t.isEmpty { return t }
            return "Conversation"
        }()

        let participantAvatar: String? = otherParticipant?.resolvedAvatar ?? otherUser?.resolvedAvatar
        let participantBanner: String? = otherParticipant?.resolvedBanner ?? otherUser?.resolvedBanner
        let participantUsername: String? = otherUser?.username ?? otherParticipant?.user?.username
        let currentRole = currentUserRole ?? participants?.first(where: { $0.userId == currentUserId })?.role
        let prefs = userPreferences?.first

        let tags: [MeeshyConversationTag] = (prefs?.tags ?? []).enumerated().map { index, tagName in
            MeeshyConversationTag(name: tagName, color: MeeshyConversationTag.colors[index % MeeshyConversationTag.colors.count])
        }

        let lastMsgAttachments: [MeeshyMessageAttachment] = (lastMessage?.attachments ?? []).map { apiAtt in
            MeeshyMessageAttachment(
                id: apiAtt.id,
                originalName: apiAtt.originalName ?? "",
                mimeType: apiAtt.mimeType ?? "application/octet-stream",
                fileSize: apiAtt.fileSize ?? 0,
                fileUrl: apiAtt.fileUrl ?? "",
                width: apiAtt.width,
                height: apiAtt.height,
                thumbnailUrl: apiAtt.thumbnailUrl,
                duration: apiAtt.duration,
                imageVariants: apiAtt.imageVariants,
                reactionSummary: apiAtt.reactionSummary,
                currentUserReactions: apiAtt.currentUserReactions
            )
        }
        // Use the MAX of payload size and backend `_count` : a payload that
        // truncates attachments (gateway returns only first N to save bandwidth)
        // should never under-display the "+N" suffix in the conversation row.
        // Conversely, a server `_count` that lags behind a fresh payload
        // (optimistic insert just landed locally) must not erase what we see.
        let lastMsgAttCount = max(lastMessage?._count?.attachments ?? 0, lastMsgAttachments.count)
        let lastMsgSenderName = lastMessage?.sender?.name

        let recentPreviews: [RecentMessagePreview] = (recentMessages ?? []).map { msg in
            let sName = msg.sender?.name ?? "?"
            let attMime = msg.attachments?.first?.mimeType
            let attCount = msg._count?.attachments ?? msg.attachments?.count ?? 0
            return RecentMessagePreview(
                id: msg.id,
                content: msg.content ?? "",
                senderName: sName,
                messageType: msg.messageType ?? "text",
                createdAt: msg.createdAt,
                attachmentMimeType: attMime,
                attachmentCount: attCount
            )
        }

        var conversation = MeeshyConversation(
            id: id, identifier: identifier ?? id, type: convType, title: displayName,
            description: description, avatar: convType != .direct ? avatar : nil,
            banner: banner, communityId: communityId,
            isActive: isActive ?? true,
            memberCount: memberCount ?? participants?.count ?? 2,
            memberCountCapped: memberCountCapped ?? false,
            lastMessageAt: lastMessageAt ?? lastMessage?.createdAt ?? createdAt,
            encryptionMode: encryptionMode ?? (convType == .direct ? "e2ee" : nil),
            createdAt: createdAt, updatedAt: updatedAt ?? createdAt,
            unreadCount: unreadCount ?? 0, lastMessagePreview: lastMessage?.content?.meeshyPreviewTruncated,
            lastMessageAttachments: lastMsgAttachments,
            lastMessageAttachmentCount: lastMsgAttCount,
            lastMessageId: lastMessage?.id,
            lastMessageSenderName: lastMsgSenderName,
            lastMessageIsBlurred: lastMessage?.isBlurred ?? false,
            lastMessageIsViewOnce: lastMessage?.isViewOnce ?? false,
            lastMessageExpiresAt: lastMessage?.expiresAt,
            lastMessageLocation: lastMessage?.location,
            recentMessages: recentPreviews,
            tags: tags, isAnnouncementChannel: isAnnouncementChannel ?? false,
            defaultWriteRole: defaultWriteRole,
            slowModeSeconds: slowModeSeconds,
            autoTranslateEnabled: autoTranslateEnabled,
            isPinned: prefs?.isPinned ?? false,
            sectionId: prefs?.categoryId,
            isMuted: prefs?.isMuted ?? false,
            mentionsOnly: prefs?.mentionsOnly ?? false,
            isArchivedByUser: prefs?.isArchived ?? false,
            customName: prefs?.customName,
            participantUserId: otherParticipant?.userId,
            participantUsername: participantUsername,
            participantAvatarURL: participantAvatar,
            participantBanner: participantBanner,
            closedAt: closedAt,
            closedBy: closedBy,
            currentUserRole: currentRole,
            currentUserJoinedAt: currentUserJoinedAt,
            reaction: prefs?.reaction
        )

        // Prisme de l'aperçu. Ces deux champs ne passent pas par l'init
        // memberwise — ils sont arrivés APRÈS lui et l'élargir aurait touché
        // chacun de ses appelants. La doc de `lastMessageTranslations` annonçait
        // ce câblage (« when the gateway starts shipping these in
        // /conversations it will be wired through the API → domain converter »)
        // ; le gateway les expédie désormais.
        //
        // Clés minuscules comme sur le chemin socket
        // (`ConversationSyncEngine.previewTranslations`) : `resolvedLastMessagePreview`
        // compare en minuscules, et deux conventions divergentes rendraient la
        // résolution dépendante du chemin par lequel la ligne est arrivée.
        if let translations = lastMessageTranslations, !translations.isEmpty {
            conversation.lastMessageTranslations = Dictionary(
                translations.map { ($0.key.lowercased(), $0.value) },
                uniquingKeysWith: { _, latest in latest }
            )
        }
        conversation.lastMessageOriginalLanguage = lastMessageOriginalLanguage

        return conversation
    }
}
