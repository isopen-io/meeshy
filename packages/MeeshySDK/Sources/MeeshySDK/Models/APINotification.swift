import Foundation

// MARK: - API Notification (matches gateway NotificationFormatter output)

public struct APINotification: Codable, Identifiable, Sendable, Equatable, CacheIdentifiable {
    public let id: String
    public let userId: String
    public let type: String
    public let priority: String?
    // Mirror the APN/FCM push header so the iOS in-app toast (driven by
    // `notification:new` over Socket.IO) can render the same "sender +
    // conversation" framing as the native banner. Both fields are
    // populated by `buildPushHeader()` on the gateway and are absent on
    // REST-fetched notifications (kept optional for backwards compat).
    public let title: String?
    public let subtitle: String?
    public let content: String?
    public let actor: NotificationActor?
    public let context: NotificationContext?
    public let metadata: NotificationMetadata?
    public let state: NotificationState
    public let delivery: NotificationDelivery?

    public init(
        id: String, userId: String, type: String, priority: String?,
        title: String? = nil, subtitle: String? = nil,
        content: String?, actor: NotificationActor?, context: NotificationContext?,
        metadata: NotificationMetadata?, state: NotificationState, delivery: NotificationDelivery?
    ) {
        self.id = id; self.userId = userId; self.type = type; self.priority = priority
        self.title = title; self.subtitle = subtitle
        self.content = content; self.actor = actor; self.context = context
        self.metadata = metadata; self.state = state; self.delivery = delivery
    }

    public var notificationType: MeeshyNotificationType {
        MeeshyNotificationType(rawValue: type) ?? .system
    }

    public var isRead: Bool { state.isRead }
    public var readAt: String? { state.readAt }
    public var createdAt: String { state.createdAt }

    public var senderId: String? { actor?.id }
    public var senderName: String? { actor?.displayName ?? actor?.username }
    public var senderAvatar: String? { actor?.avatar }

    /// Miniature (image) du contenu social lié (post/story/réel) à afficher en
    /// vignette de la ligne — `nil` quand le contenu n'a pas de média visuel.
    public var postThumbnailURLString: String? {
        guard let url = metadata?.postThumbnailUrl, !url.isEmpty else { return nil }
        return url
    }

    public var message: String? { content ?? metadata?.messagePreview }

    public var data: NotificationData? {
        guard let context else { return nil }
        return NotificationData(
            conversationId: context.conversationId,
            messageId: context.messageId,
            postId: context.postId,
            achievementId: nil,
            callId: context.callSessionId,
            friendRequestId: context.friendRequestId,
            preview: metadata?.messagePreview
        )
    }

    // MARK: - Formatted title for display

    public var formattedTitle: String {
        // Source unique : le gateway calcule le titre « acteur + action »
        // localisé et conscient de l'entité (story / réel / publication…) puis
        // le persiste. On l'affiche tel quel — identique au push et au web.
        // Le switch ci-dessous n'est qu'un REPLI pour les anciennes notifications
        // ou les types non gérés côté serveur (messages, appels, système…).
        if let title, !title.trimmingCharacters(in: .whitespaces).isEmpty {
            return title
        }

        let actorName = actor?.displayedName ?? "Quelqu'un"
        let conversationTitle = context?.conversationTitle ?? "la conversation"

        switch notificationType {
        case .newMessage, .legacyNewMessage:
            return "Message de \(actorName)"
        case .messageReply, .reply, .legacyStoryReply:
            return "Reponse de \(actorName)"
        case .messageReaction, .reaction, .legacyMessageReaction:
            // L'acteur seul (#9049) : la phrase « a réagi ❤️ à votre message :
            // « … » » est le CORPS servi — la répéter ici la ferait lire deux fois.
            return actorName
        case .userMentioned, .mention, .legacyMention:
            return "\(actorName) vous a mentionne"
        case .friendRequest, .contactRequest, .legacyFriendRequest:
            return "\(actorName) veut se connecter"
        case .friendAccepted, .contactAccepted, .legacyFriendAccepted:
            return "\(actorName) a accepte votre invitation"
        case .contactJoined:
            return "\(actorName) a rejoint Meeshy"
        case .contactRecentlyActive:
            return String(
                format: String(
                    localized: "notification.contactRecentlyActive.fallbackTitle",
                    defaultValue: "%@ était sur Meeshy récemment",
                    bundle: .main
                ),
                actorName
            )
        case .gameDuoInvited:
            return String(
                format: String(localized: "notification.game.duoInvited.fallbackTitle", defaultValue: "%@ t’invite à un duo", bundle: .main),
                actorName
            )
        case .gameDuoAccepted:
            return String(
                format: String(localized: "notification.game.duoAccepted.fallbackTitle", defaultValue: "%@ a accepté ton duo", bundle: .main),
                actorName
            )
        case .gameLeagueResult, .gameSeasonStep, .gameMissionWindow:
            return notificationType.gameSurfaceTitle ?? ""
        case .newConversationDirect:
            // Direct DM: the conversation has no real title — surface the
            // sender name so the user immediately knows who started it.
            // Mirror of the gateway push body
            // ("Nouvelle conversation avec ${actor.displayName}").
            return "Nouvelle conversation avec \(actorName)"
        case .newConversationGroup:
            // Group invite: the conversation title is the meaningful label.
            return "Invitation au groupe \(conversationTitle)"
        case .addedToConversation, .newConversation:
            return "Invitation a \(conversationTitle)"
        case .removedFromConversation:
            return "Retire de \(conversationTitle)"
        case .communityInvite, .legacyGroupInvite:
            return "Invitation a \(conversationTitle)"
        case .communityJoined, .memberJoined, .legacyGroupJoined:
            return "\(actorName) a rejoint \(conversationTitle)"
        case .communityLeft, .memberLeft, .legacyGroupLeft:
            return "\(actorName) a quitte \(conversationTitle)"
        case .memberRemoved:
            return "\(actorName) a ete retire de \(conversationTitle)"
        case .memberPromoted:
            return "\(actorName) a ete promu"
        case .memberDemoted:
            return "\(actorName) a ete retrogade"
        case .memberRoleChanged:
            return "Role modifie pour \(actorName)"
        case .missedCall, .callDeclined, .legacyCallMissed:
            return "Appel manque de \(actorName)"
        case .incomingCall, .incomingCallAlert, .callEnded, .legacyCallIncoming:
            return "Appel de \(actorName)"
        case .postLike, .legacyPostLike, .storyReaction, .statusReaction, .commentLike:
            if let content, !content.isEmpty {
                return "\(actorName) \(content)"
            }
            let emoji = metadata?.emoji ?? metadata?.reactionEmoji
            if notificationType != .commentLike, socialProseKind == "MOOD" {
                return moodReactionFallbackTitle(actorName: actorName, emoji: emoji)
            }
            let typeLabel: String = {
                if notificationType == .storyReaction || metadata?.postType == "STORY" { return "story" }
                if notificationType == .commentLike { return "commentaire" }
                return "publication"
            }()
            if let emoji {
                return "\(actorName) a reagi \(emoji) a votre \(typeLabel)"
            }
            return "\(actorName) a aime votre \(typeLabel)"
        case .commentReaction:
            let emoji = metadata?.emoji ?? metadata?.reactionEmoji
            if let emoji {
                return "\(actorName) a reagi \(emoji) a votre commentaire"
            }
            return "\(actorName) a reagi a votre commentaire"
        case .commentReply:
            return "\(actorName) a repondu a votre commentaire"
        case .postComment, .legacyPostComment:
            if socialProseKind == "MOOD" {
                return String(format: String(localized: "notification.comment.fallbackTitle.mood", defaultValue: "%@ a commenté votre humeur", bundle: .main), actorName)
            }
            return "\(actorName) a commente votre publication"
        case .storyNewComment:
            return "\(actorName) a commente votre story"
        case .friendStoryComment:
            return "\(actorName) a commente une story"
        case .storyThreadReply:
            return "\(actorName) a repondu dans un fil de commentaires"
        // Phase 4F — friend new content
        case .friendNewStory:
            return "\(actorName) a publie une nouvelle story"
        case .friendNewPost:
            return "\(actorName) a publie une nouvelle publication"
        case .friendNewMood:
            return "\(actorName) a partage une humeur"
        case .postRepost:
            return String(format: repostFallbackTitleFormat, actorName)
        case .translationCompleted, .translationReady, .legacyTranslationReady, .transcriptionCompleted:
            return "Traduction disponible"
        case .voiceCloneReady:
            return "Clone vocal pret"
        // Un titre PAR palier — le corps (serveur, langue du lecteur) dit
        // lequel ; le titre dit de quelle ÉCHELLE il s'agit. « Nouveau badge »
        // pour une série de sept jours ou un niveau atteint disait faux.
        case .badgeEarned:
            return "Badge débloqué"
        case .streakMilestone:
            return "Série de jours actifs"
        case .levelUp:
            return "Niveau atteint"
        case .achievementUnlocked, .legacyAchievementUnlocked:
            return "Succès débloqué"
        case .securityAlert, .legacySystemAlert:
            return "Alerte de securite"
        case .loginNewDevice:
            let device = metadata?.deviceName ?? metadata?.deviceOS ?? "un appareil inconnu"
            return "Connexion depuis \(device)"
        case .passwordChanged:
            return "Mot de passe modifie"
        case .twoFactorEnabled:
            return "Verification en 2 etapes activee"
        case .twoFactorDisabled:
            return "Verification en 2 etapes desactivee"
        case .legacyAffiliateSignup:
            return "Inscription via votre lien"
        case .legacyStatusUpdate:
            return "Mise a jour de statut"
        case .messageEdited:
            return "Message modifie"
        case .messageDeleted:
            return "Message supprime"
        case .messagePinned:
            return "Message epingle"
        case .messageForwarded:
            return "Message transfere"
        case .reportResolved: return "Signalement traité"
        case .contentRemoved: return String(localized: "notification.contentRemoved.fallbackTitle", defaultValue: "Votre contenu a été retiré par un administrateur", bundle: .main)
        case .system, .maintenance, .updateAvailable:
            return content ?? "Notification systeme"
        }
    }

    // MARK: - Body content (below title)

    public var formattedBody: String? {
        switch notificationType {
        case .messageReaction, .reaction, .legacyMessageReaction:
            // La phrase SERVIE (#9049) — « a réagi ❤️ à votre message : « … » » —
            // à défaut l'extrait du message.
            return Self.firstNonEmpty(content, metadata?.messagePreview)
        case .newMessage, .legacyNewMessage, .messageReply, .userMentioned, .mention, .legacyMention, .reply, .legacyStoryReply:
            // `content` already embeds attachment details (durée audio, taille,
            // dimensions) built server-side; fall back to the raw preview.
            return Self.firstNonEmpty(content, metadata?.messagePreview)
        // Comments & replies — show the actual comment / reply text.
        case .postComment, .legacyPostComment, .commentReply,
             .storyNewComment, .friendStoryComment, .storyThreadReply:
            return Self.firstNonEmpty(metadata?.commentPreview, content)
        // Reactions / likes / reposts on an entity — surface a text excerpt of
        // the entity. Media-only content (e.g. a photo story) shows no body text:
        // the thumbnail carries the visual and the context line already states
        // « Votre story · 📷 Photo », so a body fallback would just triplicate it.
        case .postLike, .legacyPostLike, .storyReaction, .statusReaction, .postRepost:
            return metadata?.postPreview
        case .commentLike, .commentReaction:
            return metadata?.commentPreview
        // Friend new content — the excerpt, or a media summary when text-less.
        case .friendNewStory, .friendNewPost, .friendNewMood:
            return Self.firstNonEmpty(metadata?.excerpt, mediaSummary)
        case .loginNewDevice:
            return loginDeviceBody
        case .reportResolved:
            return content
        case .contentRemoved:
            return removalBody
        // Le jeu : la phrase est SERVIE, dans la langue du lecteur — il n'y a ni extrait ni aperçu à lui préférer.
        case .gameDuoInvited, .gameDuoAccepted, .gameLeagueResult, .gameSeasonStep, .gameMissionWindow:
            return Self.firstNonEmpty(content)
        default:
            return nil
        }
    }

    /// Secondary, muted context line: WHICH entity the notification concerns
    /// (« Story · « aperçu » », « En réponse à « … » ») and its lifecycle
    /// (« publiée il y a 2 j · expirée ») so an expired story is self-explanatory.
    public var formattedContext: String? {
        // Types sociaux : base d'entité (sous-titre serveur localisé préféré,
        // sinon repli client) + date de PUBLICATION du contenu lié (locale
        // appareil — « du 23/06/2026 14:30 ») + état d'expiration. Pour les
        // autres types, le sous-titre serveur (nom du groupe, etc.) est la ligne.
        switch notificationType {
        case .postComment, .legacyPostComment, .storyNewComment, .friendStoryComment, .storyThreadReply,
             .postLike, .legacyPostLike, .storyReaction, .statusReaction, .postRepost,
             .commentLike, .commentReaction, .commentReply,
             .friendNewStory, .friendNewPost, .friendNewMood:
            return decoratedSocialContext
        default:
            return (subtitle?.isEmpty == false) ? subtitle : nil
        }
    }

    /// Base d'entité + date du contenu + expiry, jointes par « · ». La date
    /// n'est ajoutée que si le contenu lié porte une `postCreatedAt` — elle est
    /// distincte de l'horodatage d'arrivée de la notif (affiché à droite).
    private var decoratedSocialContext: String? {
        let base = serverSubtitleBase ?? legacySocialEntityBase
        let parts = [base, contentPublishedLabel, expiryLabel]
            .compactMap { value -> String? in (value?.isEmpty == false) ? value : nil }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    /// Sous-titre serveur (localisé, conscient de l'entité) s'il est présent.
    private var serverSubtitleBase: String? {
        guard let subtitle, !subtitle.trimmingCharacters(in: .whitespaces).isEmpty else { return nil }
        return subtitle
    }

    /// Repli client (anciennes notifs / sous-titre serveur absent) : libellé
    /// d'entité + aperçu, SANS date ni expiry (ajoutés par `decoratedSocialContext`).
    private var legacySocialEntityBase: String? {
        switch notificationType {
        case .commentReply:
            if let parent = metadata?.parentCommentPreview, !parent.isEmpty {
                return String(format: String(localized: "notification.reply.toComment.preview", defaultValue: "En réponse à « %@ »", bundle: .main), parent)
            }
            return String(localized: "notification.reply.toComment", defaultValue: "En réponse à votre commentaire", bundle: .main)
        case .commentLike, .commentReaction, .friendNewStory, .friendNewPost, .friendNewMood:
            // Le body montre déjà le commentaire/extrait — pas d'aperçu dupliqué ici.
            return socialKindLabel
        default:
            var line = socialKindLabel
            if let preview = metadata?.postPreview, !preview.isEmpty {
                line += " · « \(preview) »"
            }
            return line
        }
    }

    /// Date de publication du contenu lié (« il y a 6 min » / « hier 14:30 » /
    /// « 23/06/2026 14:30 »), formatée pour l'appareil. `nil` si absente.
    private var contentPublishedLabel: String? {
        guard let iso = context?.postCreatedAt, let date = Self.parseISODate(iso) else { return nil }
        return NotificationDateFormatter.string(for: date)
    }

    /// **Le motif d'un retrait se lit TOUJOURS** (#11151) : le corps servi le
    /// porte déjà (« Motif : … ») ; sinon il y est ajouté, une seule fois.
    private var removalBody: String? {
        let served = Self.firstNonEmpty(content)
        guard let reason = Self.firstNonEmpty(metadata?.reason) else { return served }
        if let served, served.contains(reason) { return served }
        let reasonLine = String(
            format: String(localized: "notification.contentRemoved.reason", defaultValue: "Motif : %@", bundle: .main),
            reason
        )
        guard let served else { return reasonLine }
        return "\(served)\n\(reasonLine)"
    }

    private var loginDeviceBody: String? {
        var parts: [String] = []
        if let location = metadata?.location, !location.isEmpty {
            parts.append(location)
        } else {
            let loc = [metadata?.city, metadata?.countryName].compactMap { $0 }.joined(separator: ", ")
            if !loc.isEmpty { parts.append(loc) }
        }
        if let ip = metadata?.ipAddress, !ip.isEmpty {
            parts.append("IP: \(ip)")
        }
        if let os = metadata?.deviceOS, !os.isEmpty {
            parts.append(os)
        }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }
}

// MARK: - Social context & lifecycle helpers

extension APINotification {
    /// Libellé typé du contenu social : distingue story / réel / humeur /
    /// publication (un STATUS se dit « humeur »). Lit `metadata.postType` (réactions, commentaires) ou
    /// `metadata.contentType` (friend_new_*), avec repli sur le type de notif.
    /// #10525 — la phrase d'une republication sans titre servi (ligne d'avant
    /// le titre persisté) nomme le contenu republié, comme la passerelle : un
    /// STATUS est « votre humeur ».
    private var repostFallbackTitleFormat: String {
        switch socialProseKind {
        case "REEL": return String(localized: "notification.repost.fallbackTitle.reel", defaultValue: "%@ a republié votre réel", bundle: .main)
        case "STORY": return String(localized: "notification.repost.fallbackTitle.story", defaultValue: "%@ a republié votre story", bundle: .main)
        case "MOOD": return String(localized: "notification.repost.fallbackTitle.mood", defaultValue: "%@ a republié votre humeur", bundle: .main)
        default: return String(localized: "notification.repost.fallbackTitle.post", defaultValue: "%@ a republié votre publication", bundle: .main)
        }
    }

    /// #10526 — une réaction à un mood sans phrase servie dit « votre humeur »,
    /// comme la passerelle, avec ou sans emoji.
    private func moodReactionFallbackTitle(actorName: String, emoji: String?) -> String {
        guard let emoji, !emoji.isEmpty else {
            return String(format: String(localized: "notification.like.fallbackTitle.mood", defaultValue: "%@ a aimé votre humeur", bundle: .main), actorName)
        }
        return String(format: String(localized: "notification.reaction.fallbackTitle.mood", defaultValue: "%1$@ a réagi %2$@ à votre humeur", bundle: .main), actorName, emoji)
    }

    /// Le type d'un contenu social, dans le mot que le lecteur lit : un STATUS
    /// est une « humeur » (§ 7), qu'on le republie, y réagisse ou le commente
    /// (#10525, #10526) — le fil, lui, garde STATUS. Jumelle de `postProseKind`
    /// (`packages/shared/utils/notification-strings.ts`).
    private var socialProseKind: String? {
        let declared = (metadata?.postType ?? metadata?.contentType)?.uppercased()
        if declared == nil, notificationType == .statusReaction { return "MOOD" }
        return declared == "STATUS" ? "MOOD" : declared
    }

    var socialKindLabel: String {
        switch socialProseKind {
        case "STORY": return String(localized: "content.kind.story", defaultValue: "Story", bundle: .main)
        case "REEL": return String(localized: "content.kind.reel", defaultValue: "Réel", bundle: .main)
        case "MOOD": return String(localized: "content.kind.mood", defaultValue: "Humeur", bundle: .main)
        case "POST": return String(localized: "content.kind.post", defaultValue: "Publication", bundle: .main)
        default:
            switch notificationType {
            case .storyReaction, .storyNewComment, .friendStoryComment, .storyThreadReply, .friendNewStory:
                return String(localized: "content.kind.story", defaultValue: "Story", bundle: .main)
            case .friendNewMood:
                return String(localized: "content.kind.mood", defaultValue: "Humeur", bundle: .main)
            default:
                return String(localized: "content.kind.post", defaultValue: "Publication", bundle: .main)
            }
        }
    }

    /// Résumé média pour un contenu sans texte (« 📷 Photo », « 🎥 Vidéo »…).
    var mediaSummary: String? {
        switch metadata?.mediaType?.lowercased() {
        case "image": return String(localized: "media.summary.photo", defaultValue: "📷 Photo", bundle: .main)
        case "video": return String(localized: "media.summary.video", defaultValue: "🎥 Vidéo", bundle: .main)
        case "audio": return String(localized: "media.summary.audio", defaultValue: "🎵 Audio", bundle: .main)
        default: return nil
        }
    }

    /// « expirée » quand la date d'expiration de l'entité liée est dépassée.
    var expiryLabel: String? {
        guard let iso = context?.postExpiresAt, let date = Self.parseISODate(iso) else { return nil }
        return date <= Date() ? "expirée" : nil
    }

    /// Indique si l'entité sociale liée est une story/statut expiré.
    public var isLinkedContentExpired: Bool {
        guard let iso = context?.postExpiresAt, let date = Self.parseISODate(iso) else { return false }
        return date <= Date()
    }

    static func firstNonEmpty(_ values: String?...) -> String? {
        for value in values {
            if let value, !value.isEmpty { return value }
        }
        return nil
    }

    static func parseISODate(_ string: String) -> Date? {
        WireDate.date(from: string)
    }
}

// MARK: - Mutation Helpers

extension APINotification {
    public func withReadState(_ isRead: Bool) -> APINotification {
        let newState = NotificationState(
            isRead: isRead,
            readAt: isRead ? state.readAt ?? state.createdAt : nil,
            createdAt: state.createdAt,
            expiresAt: state.expiresAt
        )
        return APINotification(
            id: id, userId: userId, type: type, priority: priority,
            title: title, subtitle: subtitle,
            content: content, actor: actor, context: context,
            metadata: metadata, state: newState, delivery: delivery
        )
    }
}
