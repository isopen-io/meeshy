import Foundation

/// Minimal, SDK-visible shape of the Focus filter snapshot. The real type
/// (`MeeshyFocusSnapshot`) lives in the app target because it's bound to an
/// iOS `SetFocusFilterIntent`; the SDK just needs to know which categories
/// are currently allowed.
public struct FocusFilterSnapshot: Sendable, Equatable {
    public var allowDirectMessages: Bool
    public var allowGroupMessages: Bool
    public var allowMentions: Bool
    public var allowReactions: Bool
    public var allowSocial: Bool
    public var allowCalls: Bool
    public var isActive: Bool

    public init(
        allowDirectMessages: Bool = true,
        allowGroupMessages: Bool = true,
        allowMentions: Bool = true,
        allowReactions: Bool = true,
        allowSocial: Bool = true,
        allowCalls: Bool = true,
        isActive: Bool = false
    ) {
        self.allowDirectMessages = allowDirectMessages
        self.allowGroupMessages = allowGroupMessages
        self.allowMentions = allowMentions
        self.allowReactions = allowReactions
        self.allowSocial = allowSocial
        self.allowCalls = allowCalls
        self.isActive = isActive
    }

    public static let permissive = FocusFilterSnapshot()

    /// Returns true if the Focus filter allows this notification type.
    /// When `isActive` is false the filter is a no-op and everything passes.
    public func allows(type: MeeshyNotificationType, isDirectConversation: Bool) -> Bool {
        guard isActive else { return true }

        switch type {
        case .newMessage, .legacyNewMessage, .messageReply, .reply,
             .messageEdited, .messageDeleted, .messagePinned, .messageForwarded:
            return isDirectConversation ? allowDirectMessages : allowGroupMessages

        case .userMentioned, .mention, .legacyMention:
            return allowMentions

        case .messageReaction, .reaction, .legacyMessageReaction,
             .storyReaction, .statusReaction, .commentLike, .postLike, .legacyPostLike:
            return allowReactions

        case .postComment, .legacyPostComment, .postRepost, .commentReply, .legacyStoryReply:
            return allowSocial

        case .missedCall, .legacyCallMissed, .incomingCall, .callEnded, .callDeclined, .legacyCallIncoming:
            return allowCalls

        default:
            // Contacts, communities, system, achievements: always allowed while
            // a Focus filter is active — those are rare and worth surfacing.
            return true
        }
    }
}

/// Client-side filtering rules for notifications based on the user's
/// `UserNotificationPreferences`. The gateway also applies these filters before
/// sending pushes, but we double-check locally so:
///   1. In-app toasts respect the same rules as background banners.
///   2. Toggling a preference off is immediate — no wait for backend sync.
///   3. DND windows honour the device clock (user's local timezone).
///   4. The active iOS Focus filter (if any) can further restrict.
public extension UserNotificationPreferences {
    /// Returns `true` when an incoming notification of this type should surface
    /// to the user (toast, banner, sound).
    func allowsNotification(
        type: MeeshyNotificationType,
        isDirectConversation: Bool = false,
        focus: FocusFilterSnapshot = .permissive,
        now: Date = Date()
    ) -> Bool {
        guard pushEnabled else { return false }
        if isInDoNotDisturbWindow(now: now) { return false }
        guard isTypeEnabled(type) else { return false }
        guard focus.allows(type: type, isDirectConversation: isDirectConversation) else { return false }
        return true
    }

    /// Pure predicate for the per-type toggles.
    func isTypeEnabled(_ type: MeeshyNotificationType) -> Bool {
        switch type {
        case .newMessage, .legacyNewMessage:
            return newMessageEnabled
        case .messageReply, .reply:
            return replyEnabled
        case .messageEdited, .messageDeleted, .messagePinned, .messageForwarded:
            return newMessageEnabled
        case .missedCall, .legacyCallMissed, .incomingCall, .callEnded, .callDeclined, .legacyCallIncoming:
            return missedCallEnabled
        case .userMentioned, .mention, .legacyMention:
            return mentionEnabled
        case .messageReaction, .reaction, .legacyMessageReaction:
            return reactionEnabled
        case .contactRequest, .friendRequest, .legacyFriendRequest:
            return contactRequestEnabled
        case .contactAccepted, .friendAccepted, .legacyFriendAccepted:
            return contactRequestEnabled
        case .newConversation, .addedToConversation, .removedFromConversation:
            return conversationEnabled
        case .communityInvite, .legacyGroupInvite:
            return groupInviteEnabled
        case .memberJoined:
            return memberJoinedEnabled
        case .memberLeft, .memberRemoved, .memberPromoted, .memberDemoted, .memberRoleChanged,
             .communityJoined, .communityLeft, .legacyGroupJoined, .legacyGroupLeft:
            return memberLeftEnabled
        case .postLike, .legacyPostLike:
            return postLikeEnabled
        case .postComment, .legacyPostComment:
            return postCommentEnabled
        case .postRepost:
            return postRepostEnabled
        case .storyReaction, .statusReaction, .legacyStoryReply:
            return storyReactionEnabled
        case .commentReply:
            return commentReplyEnabled
        case .commentLike:
            return commentLikeEnabled
        case .securityAlert, .loginNewDevice, .legacySystemAlert, .passwordChanged,
             .twoFactorEnabled, .twoFactorDisabled, .system, .maintenance, .updateAvailable:
            return systemEnabled
        case .translationCompleted, .translationReady, .legacyTranslationReady,
             .transcriptionCompleted, .voiceCloneReady:
            return true  // power-user features: no toggle yet, always allow
        case .achievementUnlocked, .legacyAchievementUnlocked, .streakMilestone, .badgeEarned,
             .legacyStatusUpdate, .legacyAffiliateSignup:
            return true
        @unknown default:
            return true
        }
    }

    /// True when `now` falls inside the configured DND window. The window wraps
    /// midnight correctly (22:00 → 08:00 is two disjoint intervals per day).
    /// Returns false if `dndEnabled` is off or the day is not in `dndDays` (or
    /// `dndDays` is empty, meaning "every day").
    func isInDoNotDisturbWindow(now: Date = Date()) -> Bool {
        guard dndEnabled else { return false }

        let calendar = Calendar.current
        let weekday = calendar.component(.weekday, from: now)
        if !dndDays.isEmpty,
           let today = DndDay.fromCalendarWeekday(weekday),
           !dndDays.contains(today) {
            return false
        }

        guard let start = parseTime(dndStartTime, on: now, calendar: calendar),
              let end = parseTime(dndEndTime, on: now, calendar: calendar) else {
            return false
        }

        if start <= end {
            return now >= start && now < end
        } else {
            // Window crosses midnight. Split into [start..endOfDay) ∪ [startOfDay..end).
            return now >= start || now < end
        }
    }

    private func parseTime(_ hhmm: String, on reference: Date, calendar: Calendar) -> Date? {
        let components = hhmm.split(separator: ":")
        guard components.count == 2,
              let hour = Int(components[0]),
              let minute = Int(components[1]) else { return nil }
        return calendar.date(
            bySettingHour: hour, minute: minute, second: 0, of: reference
        )
    }
}
