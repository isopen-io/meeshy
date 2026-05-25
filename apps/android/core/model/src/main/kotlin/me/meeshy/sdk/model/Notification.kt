package me.meeshy.sdk.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class RegisterDeviceTokenRequest(
    val token: String,
    val platform: String = "ios",
    val type: String = "apns",
    val apnsEnvironment: String? = null,
)

@Serializable
data class UnregisterDeviceTokenRequest(
    val token: String,
)

@Serializable
data class RegisterDeviceTokenResponse(
    val id: String? = null,
    val type: String? = null,
    val platform: String? = null,
    val deviceName: String? = null,
    val isNew: Boolean? = null,
    val message: String? = null,
)

/** Lightweight notification preferences — port of NotificationPreferences (NotificationModels.swift). */
@Serializable
data class NotificationPreferences(
    val pushEnabled: Boolean = true,
    val messageNotifications: Boolean = true,
    val socialNotifications: Boolean = true,
    val soundEnabled: Boolean = true,
)

/** Notification type — raw values match backend strings — port of MeeshyNotificationType (NotificationModels.swift). */
@Serializable
enum class MeeshyNotificationType {
    @SerialName("new_message") NEW_MESSAGE,
    @SerialName("message_reply") MESSAGE_REPLY,
    @SerialName("message_edited") MESSAGE_EDITED,
    @SerialName("message_deleted") MESSAGE_DELETED,
    @SerialName("message_pinned") MESSAGE_PINNED,
    @SerialName("message_forwarded") MESSAGE_FORWARDED,
    @SerialName("new_conversation") NEW_CONVERSATION,
    @SerialName("new_conversation_direct") NEW_CONVERSATION_DIRECT,
    @SerialName("new_conversation_group") NEW_CONVERSATION_GROUP,
    @SerialName("added_to_conversation") ADDED_TO_CONVERSATION,
    @SerialName("removed_from_conversation") REMOVED_FROM_CONVERSATION,
    @SerialName("contact_request") CONTACT_REQUEST,
    @SerialName("contact_accepted") CONTACT_ACCEPTED,
    @SerialName("friend_request") FRIEND_REQUEST,
    @SerialName("friend_accepted") FRIEND_ACCEPTED,
    @SerialName("user_mentioned") USER_MENTIONED,
    @SerialName("mention") MENTION,
    @SerialName("message_reaction") MESSAGE_REACTION,
    @SerialName("reaction") REACTION,
    @SerialName("reply") REPLY,
    @SerialName("post_like") POST_LIKE,
    @SerialName("post_comment") POST_COMMENT,
    @SerialName("post_repost") POST_REPOST,
    @SerialName("story_reaction") STORY_REACTION,
    @SerialName("status_reaction") STATUS_REACTION,
    @SerialName("comment_like") COMMENT_LIKE,
    @SerialName("comment_reply") COMMENT_REPLY,
    @SerialName("comment_reaction") COMMENT_REACTION,
    @SerialName("story_new_comment") STORY_NEW_COMMENT,
    @SerialName("friend_story_comment") FRIEND_STORY_COMMENT,
    @SerialName("story_thread_reply") STORY_THREAD_REPLY,
    @SerialName("friend_new_story") FRIEND_NEW_STORY,
    @SerialName("friend_new_post") FRIEND_NEW_POST,
    @SerialName("friend_new_mood") FRIEND_NEW_MOOD,
    @SerialName("missed_call") MISSED_CALL,
    @SerialName("incoming_call") INCOMING_CALL,
    @SerialName("call_ended") CALL_ENDED,
    @SerialName("call_declined") CALL_DECLINED,
    @SerialName("translation_completed") TRANSLATION_COMPLETED,
    @SerialName("translation_ready") TRANSLATION_READY,
    @SerialName("transcription_completed") TRANSCRIPTION_COMPLETED,
    @SerialName("voice_clone_ready") VOICE_CLONE_READY,
    @SerialName("security_alert") SECURITY_ALERT,
    @SerialName("login_new_device") LOGIN_NEW_DEVICE,
    @SerialName("password_changed") PASSWORD_CHANGED,
    @SerialName("two_factor_enabled") TWO_FACTOR_ENABLED,
    @SerialName("two_factor_disabled") TWO_FACTOR_DISABLED,
    @SerialName("community_invite") COMMUNITY_INVITE,
    @SerialName("community_joined") COMMUNITY_JOINED,
    @SerialName("community_left") COMMUNITY_LEFT,
    @SerialName("member_joined") MEMBER_JOINED,
    @SerialName("member_left") MEMBER_LEFT,
    @SerialName("member_removed") MEMBER_REMOVED,
    @SerialName("member_promoted") MEMBER_PROMOTED,
    @SerialName("member_demoted") MEMBER_DEMOTED,
    @SerialName("member_role_changed") MEMBER_ROLE_CHANGED,
    @SerialName("system") SYSTEM,
    @SerialName("maintenance") MAINTENANCE,
    @SerialName("update_available") UPDATE_AVAILABLE,
    @SerialName("achievement_unlocked") ACHIEVEMENT_UNLOCKED,
    @SerialName("streak_milestone") STREAK_MILESTONE,
    @SerialName("badge_earned") BADGE_EARNED,

    // Legacy uppercase (backward compat)
    @SerialName("NEW_MESSAGE") LEGACY_NEW_MESSAGE,
    @SerialName("MENTION") LEGACY_MENTION,
    @SerialName("MESSAGE_REACTION") LEGACY_MESSAGE_REACTION,
    @SerialName("FRIEND_REQUEST") LEGACY_FRIEND_REQUEST,
    @SerialName("FRIEND_ACCEPTED") LEGACY_FRIEND_ACCEPTED,
    @SerialName("GROUP_INVITE") LEGACY_GROUP_INVITE,
    @SerialName("GROUP_JOINED") LEGACY_GROUP_JOINED,
    @SerialName("GROUP_LEFT") LEGACY_GROUP_LEFT,
    @SerialName("CALL_MISSED") LEGACY_CALL_MISSED,
    @SerialName("CALL_INCOMING") LEGACY_CALL_INCOMING,
    @SerialName("POST_LIKE") LEGACY_POST_LIKE,
    @SerialName("POST_COMMENT") LEGACY_POST_COMMENT,
    @SerialName("STORY_REPLY") LEGACY_STORY_REPLY,
    @SerialName("AFFILIATE_SIGNUP") LEGACY_AFFILIATE_SIGNUP,
    @SerialName("ACHIEVEMENT_UNLOCKED") LEGACY_ACHIEVEMENT_UNLOCKED,
    @SerialName("SYSTEM_ALERT") LEGACY_SYSTEM_ALERT,
    @SerialName("STATUS_UPDATE") LEGACY_STATUS_UPDATE,
    @SerialName("TRANSLATION_READY") LEGACY_TRANSLATION_READY,
}

/** Who triggered a notification — port of NotificationActor (NotificationModels.swift). */
@Serializable
data class NotificationActor(
    val id: String,
    val username: String = "",
    val displayName: String? = null,
    val avatar: String? = null,
)

/** Where a notification happened — port of NotificationContext (NotificationModels.swift). */
@Serializable
data class NotificationContext(
    val conversationId: String? = null,
    val conversationTitle: String? = null,
    val conversationType: String? = null,
    val messageId: String? = null,
    val originalMessageId: String? = null,
    val callSessionId: String? = null,
    val friendRequestId: String? = null,
    val reactionId: String? = null,
    val postId: String? = null,
    val commentId: String? = null,
)

/** Read/lifecycle state of a notification — port of NotificationState (NotificationModels.swift). */
@Serializable
data class NotificationState(
    val isRead: Boolean = false,
    val readAt: String? = null,
    val createdAt: String = "",
    val expiresAt: String? = null,
)

/** Delivery channels used for a notification — port of NotificationDelivery (NotificationModels.swift). */
@Serializable
data class NotificationDelivery(
    val emailSent: Boolean = false,
    val pushSent: Boolean = false,
)

/** Extra metadata attached to a notification — port of NotificationMetadata (NotificationModels.swift). */
@Serializable
data class NotificationMetadata(
    val messagePreview: String? = null,
    val action: String? = null,
    val reactionEmoji: String? = null,
    val callType: String? = null,
    val memberCount: Int? = null,
    val postId: String? = null,
    val commentId: String? = null,
    val commentPreview: String? = null,
    val emoji: String? = null,
    val postType: String? = null,
    val deviceName: String? = null,
    val deviceVendor: String? = null,
    val deviceOS: String? = null,
    val deviceOSVersion: String? = null,
    val deviceType: String? = null,
    val ipAddress: String? = null,
    val country: String? = null,
    val countryName: String? = null,
    val city: String? = null,
    val location: String? = null,
)

/** A notification — port of APINotification (NotificationModels.swift). */
@Serializable
data class ApiNotification(
    val id: String,
    val userId: String = "",
    val type: String = "system",
    val priority: String? = null,
    val content: String? = null,
    val actor: NotificationActor? = null,
    val context: NotificationContext? = null,
    val metadata: NotificationMetadata? = null,
    val state: NotificationState = NotificationState(),
    val delivery: NotificationDelivery? = null,
)

/** Legacy navigation data computed from a notification's context — port of NotificationData (NotificationModels.swift). */
@Serializable
data class NotificationData(
    val conversationId: String? = null,
    val messageId: String? = null,
    val postId: String? = null,
    val achievementId: String? = null,
    val callId: String? = null,
    val friendRequestId: String? = null,
    val preview: String? = null,
)

@Serializable
data class NotificationListResponse(
    val success: Boolean = false,
    val data: List<ApiNotification> = emptyList(),
    val pagination: NotificationPagination? = null,
    val unreadCount: Int? = null,
)

@Serializable
data class NotificationPagination(
    val total: Int = 0,
    val offset: Int = 0,
    val limit: Int = 0,
    val hasMore: Boolean = false,
)

@Serializable
data class UnreadCountResponse(
    val success: Boolean = false,
    val count: Int = 0,
)

@Serializable
data class MarkReadResponse(
    val success: Boolean = false,
    val count: Int? = null,
)
