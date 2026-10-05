import SwiftUI
import MeeshySDK

// MARK: - Notification Category Filter

/// LES CATÉGORIES DE LA CLOCHE — et leur jumelle web
/// (`apps/web/src/lib/notifications/categories.ts`).
///
/// **Une catégorie est un FILTRE SERVEUR, jamais un tri local d'une page
/// (#8958).** La cloche chargeait trente lignes « toutes catégories » puis les
/// filtrait en mémoire, et ne paginait que sous « Toutes » : une catégorie dont
/// les lignes étaient plus anciennes que ces trente-là s'affichait VIDE alors
/// que la passerelle en avait. `serverQuery` rend désormais ce que
/// `GET /notifications` doit filtrer (`types=`, `unreadOnly=`), et chaque
/// catégorie a sa propre liste paginée.
///
/// **Une notification CONSOMMÉE quitte la cloche (#8958).** Un message, une
/// réaction, une mention ou un commentaire déjà ouverts n'ont plus rien à
/// dire : `consumedOnRead` nomme ces familles, la passerelle retire leurs
/// lignes lues (`hideReadTypes=`), et `accepts` rejoue la même règle sur une
/// ligne lue pendant que l'écran est ouvert. Une demande d'ami, un appel
/// manqué, une alerte de sécurité ou un palier restent : ils se relisent.
enum NotificationCategory: String, CaseIterable {
    case all
    case unread
    case messages
    case reactions
    case mentions
    case social
    case engagement
    case contacts
    case groups
    case calls
    case translations
    case system

    var label: String {
        switch self {
        case .all: return String(localized: "notifications.category.all", defaultValue: "Toutes", bundle: .module)
        case .unread: return String(localized: "notifications.category.unread", defaultValue: "Non lues", bundle: .module)
        case .messages: return String(localized: "notifications.category.messages", defaultValue: "Messages", bundle: .module)
        case .reactions: return String(localized: "notifications.category.reactions", defaultValue: "Reactions", bundle: .module)
        case .mentions: return String(localized: "notifications.category.mentions", defaultValue: "Mentions", bundle: .module)
        case .social: return String(localized: "notifications.category.social", defaultValue: "Social", bundle: .module)
        case .engagement: return String(localized: "notifications.category.engagement", defaultValue: "Engagements", bundle: .module)
        case .contacts: return String(localized: "notifications.category.contacts", defaultValue: "Contacts", bundle: .module)
        case .groups: return String(localized: "notifications.category.groups", defaultValue: "Groupes", bundle: .module)
        case .calls: return String(localized: "notifications.category.calls", defaultValue: "Appels", bundle: .module)
        case .translations: return String(localized: "notifications.category.translations", defaultValue: "Traductions", bundle: .module)
        case .system: return String(localized: "notifications.category.system", defaultValue: "Systeme", bundle: .module)
        }
    }

    var icon: String {
        switch self {
        case .all: return "bell.fill"
        case .unread: return "circle.fill"
        case .messages: return "bubble.left.fill"
        case .reactions: return "heart.fill"
        case .mentions: return "at"
        case .social: return "hand.thumbsup.fill"
        case .engagement: return "trophy.fill"
        case .contacts: return "person.badge.plus"
        case .groups: return "person.3.fill"
        case .calls: return "phone.fill"
        case .translations: return "globe"
        case .system: return "gear"
        }
    }

    // Categorical filter palette: each notification category keeps a distinct
    // hue so the filter chips read as a colour-coded set, not brand chrome.
    // Treated as one ladder (arbitrated separately) — do not migrate piecemeal.
    // `engagement` porte l'ambre des paliers (`MeeshyNotificationType.accentHex`).
    var color: String {
        switch self {
        case .all: return MeeshyColors.brandPrimaryHex
        case .unread: return MeeshyColors.tileCoralHex
        case .messages: return MeeshyColors.tileBlueHex
        case .reactions: return MeeshyColors.tileCoralHex
        case .mentions: return MeeshyColors.tileAmethystHex
        case .social: return MeeshyColors.tileSaffronHex
        case .engagement: return MeeshyColors.warningHex
        case .contacts: return MeeshyColors.tileTealHex
        case .groups: return MeeshyColors.tileSaffronHex
        case .calls: return "E91E63"
        case .translations: return MeeshyColors.tileCyanHex
        case .system: return MeeshyColors.brandPrimaryHex
        }
    }

    var matchingTypes: Set<MeeshyNotificationType> {
        switch self {
        case .all, .unread:
            return Set(MeeshyNotificationType.allCases)
        case .messages:
            return [
                .newMessage, .legacyNewMessage, .messageReply, .reply,
                .messageEdited, .messageDeleted, .messagePinned, .messageForwarded
            ]
        case .reactions:
            return [
                .messageReaction, .reaction, .legacyMessageReaction,
                .postLike, .legacyPostLike, .storyReaction, .statusReaction, .commentLike,
                .commentReaction
            ]
        case .mentions:
            return [
                .userMentioned, .mention, .legacyMention
            ]
        case .social:
            return [
                .postComment, .legacyPostComment, .postRepost, .commentReply,
                .legacyStoryReply, .storyNewComment, .friendStoryComment, .storyThreadReply,
                .friendNewStory, .friendNewPost, .friendNewMood
            ]
        case .engagement:
            return [
                .achievementUnlocked, .legacyAchievementUnlocked, .streakMilestone, .levelUp, .badgeEarned
            ]
        case .contacts:
            return [
                .friendRequest, .contactRequest, .legacyFriendRequest,
                .friendAccepted, .contactAccepted, .legacyFriendAccepted,
                .contactJoined, .contactRecentlyActive, .legacyStatusUpdate
            ]
        case .groups:
            return [
                .communityInvite, .communityJoined, .communityLeft,
                .legacyGroupInvite, .legacyGroupJoined, .legacyGroupLeft,
                .memberJoined, .memberLeft, .memberRemoved, .memberPromoted, .memberDemoted, .memberRoleChanged,
                .addedToConversation, .newConversation, .newConversationDirect, .newConversationGroup,
                .removedFromConversation
            ]
        case .calls:
            return [
                .missedCall, .callDeclined, .legacyCallMissed,
                .incomingCall, .incomingCallAlert, .callEnded, .legacyCallIncoming
            ]
        case .translations:
            return [
                .translationCompleted, .translationReady, .legacyTranslationReady,
                .transcriptionCompleted, .voiceCloneReady
            ]
        case .system:
            return [
                .securityAlert, .loginNewDevice, .legacySystemAlert, .passwordChanged, .twoFactorEnabled, .twoFactorDisabled,
                .system, .maintenance, .updateAvailable, .reportResolved,
                .legacyAffiliateSignup
            ]
        }
    }

    /// Les familles dont une ligne LUE quitte la cloche : le contenu a été
    /// ouvert, la notification n'a plus rien à dire.
    static let consumedOnRead: [NotificationCategory] = [.messages, .reactions, .mentions, .social]

    static let consumedOnReadTypes: Set<MeeshyNotificationType> =
        consumedOnRead.reduce(into: Set<MeeshyNotificationType>()) { $0.formUnion($1.matchingTypes) }

    /// Une ligne lue d'une famille consommable — elle ne s'affiche plus.
    static func isConsumed(_ notification: APINotification) -> Bool {
        notification.isRead && consumedOnReadTypes.contains(notification.notificationType)
    }

    func matches(_ notification: APINotification) -> Bool {
        matchingTypes.contains(notification.notificationType)
    }

    /// La loi que la passerelle applique (`serverQuery`), rejouée sur une
    /// ligne reçue par le socket ou modifiée par un geste optimiste.
    func accepts(_ notification: APINotification) -> Bool {
        guard !Self.isConsumed(notification) else { return false }
        switch self {
        case .all: return true
        case .unread: return !notification.isRead
        default: return matches(notification)
        }
    }

    /// Les paramètres de `GET /notifications` qui rendent CETTE catégorie.
    /// Les types partent TRIÉS : une même catégorie formule toujours la même
    /// requête.
    var serverQuery: NotificationListQuery {
        switch self {
        case .all:
            return NotificationListQuery(unreadOnly: false, types: [], hideReadTypes: Self.rawTypes(Self.consumedOnReadTypes))
        case .unread:
            return NotificationListQuery(unreadOnly: true, types: [], hideReadTypes: [])
        default:
            return NotificationListQuery(
                unreadOnly: false,
                types: Self.rawTypes(matchingTypes),
                hideReadTypes: Self.rawTypes(matchingTypes.intersection(Self.consumedOnReadTypes))
            )
        }
    }

    private static func rawTypes(_ types: Set<MeeshyNotificationType>) -> [String] {
        types.map(\.rawValue).sorted()
    }
}

/// Ce qu'une catégorie demande à la passerelle.
struct NotificationListQuery: Equatable {
    let unreadOnly: Bool
    let types: [String]
    let hideReadTypes: [String]
}
