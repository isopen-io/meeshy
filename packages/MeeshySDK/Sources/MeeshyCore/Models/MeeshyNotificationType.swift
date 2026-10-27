import Foundation

// MARK: - Notification Type
// Raw values match backend lowercase strings exactly

public enum MeeshyNotificationType: String, Codable, CaseIterable, Sendable {
    // Message events
    case newMessage = "new_message"
    case messageReply = "message_reply"
    case messageEdited = "message_edited"
    case messageDeleted = "message_deleted"
    case messagePinned = "message_pinned"
    case messageForwarded = "message_forwarded"

    // Conversation events
    case newConversation = "new_conversation"
    /// First-message notification for a freshly created **direct** conversation.
    /// Emitted by `gateway/.../NotificationService.createConversationInviteNotification`
    /// when `conversationType == "direct"`. Distinct from `.newConversation` so
    /// the iOS UI can choose a DM-specific icon / avatar treatment, but the
    /// navigation target is identical: open the conversation by `conversationId`.
    case newConversationDirect = "new_conversation_direct"
    /// Same as `.newConversationDirect` but for a freshly created **group**
    /// conversation (`conversationType == "group"`).
    case newConversationGroup = "new_conversation_group"
    case addedToConversation = "added_to_conversation"
    case removedFromConversation = "removed_from_conversation"

    // Contact/Friend events
    case contactRequest = "contact_request"
    case contactAccepted = "contact_accepted"
    case friendRequest = "friend_request"
    case friendAccepted = "friend_accepted"
    /// Un contact du carnet vient d'arriver sur Meeshy (#8105). L'acteur est
    /// l'arrivant, nommé comme le destinataire l'a enregistré ; plusieurs
    /// arrivées rapprochées se regroupent en une seule notification
    /// (`metadata.joinerIds`). Suit la préférence « contacts ».
    case contactJoined = "contact_joined"
    /// Un ami, ou un contact du carnet, redevient actif sur Meeshy (#8285) —
    /// au plus une fois toutes les 3 h par acteur, décidé par la passerelle.
    /// L'acteur est celui qui revient ; le toucher ouvre son profil.
    case contactRecentlyActive = "contact_recently_active"

    // Interaction events
    case userMentioned = "user_mentioned"
    case mention = "mention"
    case messageReaction = "message_reaction"
    case reaction = "reaction"
    case reply = "reply"

    // Social/Post events
    case postLike = "post_like"
    case postComment = "post_comment"
    case postRepost = "post_repost"
    case storyReaction = "story_reaction"
    case statusReaction = "status_reaction"
    case commentLike = "comment_like"
    case commentReply = "comment_reply"
    case commentReaction = "comment_reaction"
    case storyNewComment = "story_new_comment"
    case friendStoryComment = "friend_story_comment"
    case storyThreadReply = "story_thread_reply"
    // Friend content events (Phase 4F) — fired when a friend publishes new content
    case friendNewStory = "friend_new_story"
    case friendNewPost = "friend_new_post"
    case friendNewMood = "friend_new_mood"

    // Call events
    case missedCall = "missed_call"
    case incomingCall = "incoming_call"
    case callEnded = "call_ended"
    case callDeclined = "call_declined"
    /// Guideline 5 (MIIT) — China-region incoming-call push. Distinct raw
    /// value from `.incomingCall` because CallEventsHandler.ts always sends
    /// `data.type: "call"` for the incoming-call push (both the 'voip' and
    /// 'apns' routing share this payload) — VoIPPushManager already depends
    /// on this exact literal (`payloadType == "call"`) to validate PushKit
    /// payloads, so the string can't be renamed to "incoming_call" without
    /// breaking that unrelated, functioning path. Routes identically to
    /// `.incomingCall` for icon/preference-filtering purposes, but drives
    /// the full call-answer flow (not just a conversation deep-link) in
    /// `RootView.navigateFromNotification` since it is the ONLY affordance
    /// a backgrounded/killed-app China user has to engage the call.
    case incomingCallAlert = "call"

    // Translation events
    case translationCompleted = "translation_completed"
    case translationReady = "translation_ready"
    case transcriptionCompleted = "transcription_completed"
    case voiceCloneReady = "voice_clone_ready"

    // Security events
    case securityAlert = "security_alert"
    case loginNewDevice = "login_new_device"
    case passwordChanged = "password_changed"
    case twoFactorEnabled = "two_factor_enabled"
    case twoFactorDisabled = "two_factor_disabled"

    // Community events
    case communityInvite = "community_invite"
    case communityJoined = "community_joined"
    case communityLeft = "community_left"

    // Member events
    case memberJoined = "member_joined"
    case memberLeft = "member_left"
    case memberRemoved = "member_removed"
    case memberPromoted = "member_promoted"
    case memberDemoted = "member_demoted"
    case memberRoleChanged = "member_role_changed"

    // System events
    case system = "system"
    case maintenance = "maintenance"
    case updateAvailable = "update_available"
    /// L'issue d'un signalement, notifiée au déclarant (art. 16 DSA, #3718).
    /// Absent du catalogue, il décodait en `.system` (#6508).
    case reportResolved = "report_resolved"
    /// Le contenu de l'auteur retiré par un administrateur, avec son motif
    /// (#11151) — adressé à l'auteur seul. Titre et corps servis par la passerelle.
    case contentRemoved = "content_removed"

    // Engagement — les QUATRE types que la passerelle émet
    // (`packages/shared/types/notification.ts`). `level_up` manquait : un
    // niveau atteint décodait en `.system`, s'affichait comme une alerte
    // système et n'ouvrait pas l'écran « Progression » (#5698).
    case achievementUnlocked = "achievement_unlocked"
    case streakMilestone = "streak_milestone"
    case levelUp = "level_up"
    case badgeEarned = "badge_earned"

    // Le Jeu Meeshy (#9490) — au plus UNE notification de jeu par jour et par destinataire,
    // décidé par la passerelle ; réglable par la préférence « Jeu » (`gameEnabled`).
    /// Un ami t'invite à la mission en duo de la semaine. L'acteur est l'ami.
    case gameDuoInvited = "game_duo_invited"
    /// Ton ami a accepté ton invitation au duo. L'acteur est l'ami.
    case gameDuoAccepted = "game_duo_accepted"
    /// Le résultat de ta semaine de ligue (coupe, montée, maintien, descente). Sans acteur.
    case gameLeagueResult = "game_league_result"
    /// Une étape de la saison franchie. Sans acteur.
    case gameSeasonStep = "game_season_step"
    /// La plage de ta mission personnelle du jour vient de s'ouvrir (#9539). Sans acteur — hors du plafond quotidien.
    case gameMissionWindow = "game_mission_window"

    // Legacy uppercase (backward compat)
    case legacyNewMessage = "NEW_MESSAGE"
    case legacyMention = "MENTION"
    case legacyMessageReaction = "MESSAGE_REACTION"
    case legacyFriendRequest = "FRIEND_REQUEST"
    case legacyFriendAccepted = "FRIEND_ACCEPTED"
    case legacyGroupInvite = "GROUP_INVITE"
    case legacyGroupJoined = "GROUP_JOINED"
    case legacyGroupLeft = "GROUP_LEFT"
    case legacyCallMissed = "CALL_MISSED"
    case legacyCallIncoming = "CALL_INCOMING"
    case legacyPostLike = "POST_LIKE"
    case legacyPostComment = "POST_COMMENT"
    case legacyStoryReply = "STORY_REPLY"
    case legacyAffiliateSignup = "AFFILIATE_SIGNUP"
    case legacyAchievementUnlocked = "ACHIEVEMENT_UNLOCKED"
    case legacySystemAlert = "SYSTEM_ALERT"
    case legacyStatusUpdate = "STATUS_UPDATE"
    case legacyTranslationReady = "TRANSLATION_READY"

    public var systemIcon: String {
        switch self {
        case .newMessage, .legacyNewMessage, .messageReply: return "bubble.left.fill"
        case .messageReaction, .reaction, .legacyMessageReaction: return "heart.fill"
        case .userMentioned, .mention, .legacyMention: return "at"
        case .friendRequest, .contactRequest, .legacyFriendRequest: return "person.badge.plus"
        case .friendAccepted, .contactAccepted, .legacyFriendAccepted: return "person.2.fill"
        case .contactJoined: return "person.crop.circle.badge.plus"
        case .contactRecentlyActive: return "person.crop.circle.badge.clock"
        case .communityInvite, .legacyGroupInvite: return "person.3.fill"
        case .communityJoined, .memberJoined, .legacyGroupJoined: return "person.badge.checkmark"
        case .communityLeft, .memberLeft, .legacyGroupLeft: return "person.badge.minus"
        case .missedCall, .callDeclined, .legacyCallMissed: return "phone.arrow.down.left"
        case .incomingCall, .incomingCallAlert, .callEnded, .legacyCallIncoming: return "phone.fill"
        case .postLike, .legacyPostLike, .storyReaction, .statusReaction, .commentLike: return "hand.thumbsup.fill"
        case .commentReaction: return "heart.fill"
        case .postComment, .commentReply, .legacyPostComment, .legacyStoryReply: return "text.bubble.fill"
        case .storyNewComment, .friendStoryComment, .storyThreadReply: return "text.bubble.fill"
        case .friendNewStory: return "camera.fill"
        case .friendNewPost: return "square.text.square.fill"
        case .friendNewMood: return "face.smiling.fill"
        case .achievementUnlocked, .legacyAchievementUnlocked: return "trophy.fill"
        case .badgeEarned: return "medal.fill"
        case .streakMilestone: return "flame.fill"
        case .levelUp: return "star.fill"
        case .gameDuoInvited, .gameDuoAccepted: return "person.2.fill"
        case .gameLeagueResult: return "trophy.fill"
        case .gameSeasonStep: return "star.circle.fill"
        case .gameMissionWindow: return "timer"
        case .translationCompleted, .translationReady, .legacyTranslationReady, .transcriptionCompleted: return "globe"
        case .securityAlert, .loginNewDevice, .legacySystemAlert, .passwordChanged, .twoFactorEnabled, .twoFactorDisabled: return "exclamationmark.triangle.fill"
        case .system, .maintenance, .updateAvailable: return "bell.fill"
        case .reportResolved: return "checkmark.shield.fill"
        case .contentRemoved: return "xmark.shield.fill"
        case .legacyAffiliateSignup: return "link.badge.plus"
        case .legacyStatusUpdate: return "circle.fill"
        case .voiceCloneReady: return "waveform"
        case .postRepost: return "arrow.2.squarepath"
        case .addedToConversation, .newConversation, .newConversationDirect, .newConversationGroup: return "bubble.left.and.bubble.right.fill"
        case .removedFromConversation: return "person.badge.minus"
        case .memberRemoved: return "person.badge.minus"
        case .memberPromoted: return "star.fill"
        case .memberDemoted: return "arrow.down.circle.fill"
        case .memberRoleChanged: return "person.badge.shield.checkmark"
        case .messageEdited: return "pencil"
        case .messageDeleted: return "trash"
        case .messagePinned: return "pin.fill"
        case .messageForwarded: return "arrowshape.turn.up.right.fill"
        case .reply: return "arrowshape.turn.up.left.fill"
        }
    }

    public var accentHex: String {
        switch self {
        case .newMessage, .legacyNewMessage, .messageReply, .reply, .postComment, .commentReply, .legacyPostComment, .legacyStoryReply, .storyNewComment, .friendStoryComment, .storyThreadReply:
            return "3498DB"
        case .messageReaction, .reaction, .legacyMessageReaction, .postLike, .legacyPostLike, .storyReaction, .statusReaction, .commentLike, .commentReaction:
            return "FF6B6B"
        case .userMentioned, .mention, .legacyMention:
            return "9B59B6"
        case .friendRequest, .contactRequest, .legacyFriendRequest, .friendAccepted, .contactAccepted, .legacyFriendAccepted, .legacyStatusUpdate,
             .contactJoined, .contactRecentlyActive:
            return "4ECDC4"
        case .communityInvite, .communityJoined, .communityLeft, .memberJoined, .memberLeft, .memberRemoved, .memberPromoted, .memberDemoted, .memberRoleChanged, .legacyGroupInvite, .legacyGroupJoined, .legacyGroupLeft:
            return "F8B500"
        // La famille « engagement » porte l'ambre des badges de l'écran
        // « Progression » (`MeeshyColors.warningHex`), distinct de la famille
        // « communauté » ci-dessus — un badge ne ressemble plus à une invitation.
        case .achievementUnlocked, .legacyAchievementUnlocked, .streakMilestone, .levelUp, .badgeEarned,
             .gameDuoInvited, .gameDuoAccepted, .gameLeagueResult, .gameSeasonStep, .gameMissionWindow:
            return "FBBF24"
        case .missedCall, .callDeclined, .incomingCall, .incomingCallAlert, .callEnded, .legacyCallMissed, .legacyCallIncoming:
            return "E91E63"
        case .legacyAffiliateSignup:
            return "2ECC71"
        case .securityAlert, .loginNewDevice, .legacySystemAlert, .passwordChanged, .twoFactorEnabled, .twoFactorDisabled,
             .contentRemoved:
            return "EF4444"
        case .translationCompleted, .translationReady, .legacyTranslationReady, .transcriptionCompleted, .voiceCloneReady:
            return "08D9D6"
        case .system, .maintenance, .updateAvailable, .reportResolved:
            return "6366F1"
        case .friendNewStory, .friendNewPost, .friendNewMood:
            return "6366F1"
        case .postRepost:
            return "9B59B6"
        case .addedToConversation, .newConversation, .newConversationDirect, .newConversationGroup, .removedFromConversation:
            return "4ECDC4"
        case .messageEdited, .messageDeleted, .messagePinned, .messageForwarded:
            return "3498DB"
        }
    }
}

/// La page du jeu qu'une notification de jeu ouvre au toucher. Le duo se joue sur la page de la ligue
/// (sa carte y est posée) : un duo et un résultat de ligue y mènent ; une étape, à la saison.
public enum GameNotificationDestination: String, Equatable, Sendable {
    case league
    case season
    /// La section Héro des missions de Progression (#9539) : ce n'est pas une page du jeu, c'est un endroit de l'écran.
    case missions
}

public extension MeeshyNotificationType {
    /// `true` pour les quatre notifications du jeu — celles que la préférence « Jeu » gouverne.
    var isGame: Bool { gameDestination != nil }

    /// Le titre d'une notification de jeu SANS acteur (la ligue, la saison) : la passerelle ne sert pas de titre, la
    /// phrase est dans le corps, et le client nomme la surface. `nil` pour tout le reste — un duo, lui, est « <ami> … ».
    var gameSurfaceTitle: String? {
        switch self {
        case .gameLeagueResult:
            return String(localized: "notification.game.leagueResult.fallbackTitle", defaultValue: "Ta ligue de la semaine", bundle: .main)
        case .gameSeasonStep:
            return String(localized: "notification.game.seasonStep.fallbackTitle", defaultValue: "Ta saison", bundle: .main)
        case .gameMissionWindow:
            return String(localized: "notification.game.missionWindow.fallbackTitle", defaultValue: "Ta mission du moment", bundle: .main)
        default:
            return nil
        }
    }

    /// Où le toucher mène, `nil` pour tout ce qui n'est pas une notification de jeu.
    var gameDestination: GameNotificationDestination? {
        switch self {
        case .gameDuoInvited, .gameDuoAccepted, .gameLeagueResult: .league
        case .gameSeasonStep: .season
        case .gameMissionWindow: .missions
        default: nil
        }
    }
}
