package me.meeshy.sdk.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import me.meeshy.sdk.lang.resolveLastMessagePreview

/** Conversation — port of APIConversation (ConversationModels.swift). */
@Serializable
data class ApiConversation(
    val id: String,
    val identifier: String? = null,
    val type: String = "direct",
    val title: String? = null,
    val description: String? = null,
    val avatar: String? = null,
    val avatarThumbHash: String? = null,
    val banner: String? = null,
    val participants: List<ApiParticipant> = emptyList(),
    val lastMessage: ApiConversationLastMessage? = null,
    /**
     * The Prisme pair of the row's last-message line, shipped at the CONVERSATION root
     * by `GET /conversations` (`conversationMinimalSchema`, `packages/shared/types/
     * api-schemas.ts`) — not inside [lastMessage].
     *
     * [lastMessageTranslations] is `{ language: truncated preview }`, already restricted
     * server-side to the READER's prism; `null` when nothing useful remains, which the
     * resolver reads as "show the original".
     *
     * Both were absent from this class, so kotlinx-serialization discarded them at
     * decode AND at re-encode into the Room cache: the row rendered
     * `lastMessage.content` — the sender's language — for every reader, on every cold
     * start, while web and iOS resolved the same payload into the reader's language.
     * See [me.meeshy.sdk.lang.resolveLastMessagePreview].
     */
    val lastMessageTranslations: Map<String, String>? = null,
    val lastMessageOriginalLanguage: String? = null,
    val unreadCount: Int = 0,
    val createdAt: String? = null,
    val updatedAt: String? = null,
    val defaultWriteRole: String? = null,
    val isAnnouncementChannel: Boolean = false,
    val slowModeSeconds: Int? = null,
    /** The conversation's encryption posture (`"e2ee"` / `"server"` / `"hybrid"`),
     * or `null` when it is not encrypted. Drives the top-of-history E2EE notice. */
    val encryptionMode: String? = null,
    val autoTranslateEnabled: Boolean? = null,
    val isActive: Boolean? = null,
    val preferences: ApiConversationPreferences? = null,
    val userPreferences: List<ApiConversationPreferences> = emptyList(),
    /**
     * The reader's own [MemberRole], computed server-side
     * (`currentUserRoleMap`, `services/gateway/src/routes/conversations/core-list.ts`)
     * and shipped at the conversation root by `conversationMinimalSchema`
     * (`packages/shared/types/api-schemas.ts`) — authoritative, unlike scanning
     * [participants], which `GET /conversations` truncates to 5 with no `orderBy`.
     * `null` when the caller isn't a member, or on a legacy cached row written
     * before this field existed. See [currentUserRole] (the resolving property).
     */
    val currentUserRole: String? = null,
    /**
     * The server-computed member count (`memberCount`/`memberCountCapped`,
     * capped at 199 for non platform-admins) — authoritative, unlike
     * `participants.size`, which `GET /conversations` truncates to 5. `null`
     * on a legacy cached row written before this field existed. See
     * [memberCount] (the resolving property).
     */
    @SerialName("memberCount")
    val serverMemberCount: Int? = null,
) {
    /** Prefers the server-computed count over [participants], which is truncated to 5. */
    val memberCount: Int get() = serverMemberCount ?: participants.size

    /**
     * The effective per-user preferences. The gateway sends the signed-in user's
     * row as `userPreferences[0]`; [preferences] is only ever set locally by an
     * optimistic mutation, so an in-flight override wins over the server value.
     */
    val resolvedPreferences: ApiConversationPreferences?
        get() = preferences ?: userPreferences.firstOrNull()
}

/**
 * The row's last-message text after the Prisme Linguistique, or `null` when there is no
 * last-message text to show.
 *
 * Delegates to [resolveLastMessagePreview] — the shared rule — rather than restating it:
 * this conversation's job is only to say WHERE each of the three inputs lives on the
 * Android payload (the raw preview inside [ApiConversation.lastMessage], the pair at the
 * root), which is exactly what the web twin does
 * (`apps/web/components/conversations/conversation-item/ConversationItem.tsx`).
 *
 * Returns the raw preview unchanged whenever no preferred language is served, so a caller
 * can substitute the result for `lastMessage.content` unconditionally.
 */
fun ApiConversation.resolvedLastMessagePreview(preferredLanguages: List<String>): String? =
    resolveLastMessagePreview(
        preview = lastMessage?.content,
        translations = lastMessageTranslations,
        originalLanguage = lastMessageOriginalLanguage,
        preferredLanguages = preferredLanguages,
    )

/**
 * The signed-in user's own [MemberRole] within this conversation — looked up
 * from [ApiConversation.participants] by [currentUserId], defaulting to
 * [MemberRole.MEMBER] (matching [MemberRole.from]) when the id is absent or
 * not found in the roster. Gates creator-only affordances (e.g. deleting the
 * conversation for every participant) without a separate member-list fetch.
 */
fun ApiConversation.currentUserRole(currentUserId: String?): MemberRole =
    MemberRole.from(participants.firstOrNull { it.userId == currentUserId }?.role)

@Serializable
data class ApiParticipant(
    val id: String,
    val userId: String? = null,
    val displayName: String? = null,
    val username: String? = null,
    val avatar: String? = null,
    val role: String? = null,
    val joinedAt: String? = null,
)

/**
 * Wire-preview of a conversation's last message.
 *
 * The three "kind" fields — [isBlurred], [isViewOnce] and [expiresAt] — mirror the
 * iOS `MeeshyConversation.lastMessage*` triplet (source of truth:
 * `packages/MeeshySDK/Sources/MeeshySDK/Models/CoreModels.swift`). The gateway
 * already spreads them onto the `lastMessage` payload (see
 * `services/gateway/src/routes/conversations/core.ts`), so this widening is purely
 * additive on the wire. They feed the pure classifier
 * `MessageSummaryKind.of(...)` which drives the row's kind-aware preview
 * (expired / hidden / view-once / ephemeral-active / standard).
 */
@Serializable
data class ApiConversationLastMessage(
    val id: String? = null,
    val content: String? = null,
    val senderId: String? = null,
    val senderName: String? = null,
    val messageType: String? = null,
    val originalLanguage: String? = null,
    val createdAt: String? = null,
    val isBlurred: Boolean = false,
    val isViewOnce: Boolean = false,
    val expiresAt: String? = null,
)

/** User-scoped conversation preferences. */
@Serializable
data class ApiConversationPreferences(
    val isPinned: Boolean = false,
    val isMuted: Boolean = false,
    val isArchived: Boolean = false,
    val deletedForUserAt: String? = null,
    val customName: String? = null,
    val categoryId: String? = null,
    val mentionsOnly: Boolean = false,
    val reaction: String? = null,
    val tags: List<String> = emptyList(),
    /**
     * Optimistic-vs-socket arbiter for `user:preferences-updated`
     * ([applyRemote]) — the port of iOS `ConversationUserState.version` and of
     * web's `UserConversationPreferences.version`.
     *
     * `GET /conversations` does NOT serve it (`conversationUserPreferencesSelect`,
     * `services/gateway/src/routes/conversations/core.ts`), so a row hydrated from
     * REST lands here at the `0` default — the same baseline the two other clients
     * use for an absent snapshot, and the reason the gateway starts its first
     * upsert at version 1 rather than the schema default 0.
     */
    val version: Int = 0,
)

@Serializable
data class CreateConversationRequest(
    val type: String,
    val title: String? = null,
    val participantIds: List<String>,
)

/**
 * Total unread-message count across a conversation list — the single source of
 * truth for both the in-app dashboard preview (`DashboardScreen.dashboardUnreadTotal`)
 * and the home-screen widget's unread badge, so the two surfaces can never drift.
 */
fun List<ApiConversation>.totalUnreadCount(): Int = sumOf { it.unreadCount }
