package me.meeshy.sdk.model

import kotlinx.serialization.Serializable

/**
 * Wire payload of `user:preferences-updated` — **conversation scope**. Copied key
 * by key from the gateway's `ConversationPreferencesPayload`
 * (`packages/shared/types/socketio-events.ts`), which
 * `toPreferencesPayload()` (`services/gateway/src/services/conversationPreferencesSync.ts`)
 * fills from the `UserConversationPreferences` row — twin of iOS
 * `UserPreferencesConversationUpdatedSocketEvent.Preferences`
 * (`packages/MeeshySDK/Sources/MeeshySDK/Sockets/MessageSocketManager.swift`).
 *
 * The gateway never omits a key on this scope (« payload complet »), so the
 * defaults below exist only so a single field added server-side cannot make the
 * WHOLE event undecodable — the shape that made an Android decoder throw away a
 * row it could otherwise have rendered (cycle 118, `lastMessageTranslations`).
 *
 * Three keys are carried on the wire and deliberately NOT folded into the cached
 * [ApiConversationPreferences] by [applyRemote]:
 *
 * - [orderInCategory] — Android has no drag-reorder surface, and
 *   `ConversationSections.of` buckets on `isPinned` + `categoryId` only. Storing
 *   it would be an inert field, and relaying `user:preferences-reordered` into it
 *   an inert listener.
 * - [readingMode] and [clearHistoryBefore] — no Android reader either; both are
 *   already dropped at REST decode for the same reason.
 *
 * They stay declared HERE because the type's job is to describe what the emitter
 * sends, not what this client happens to consume: a key absent from the type is a
 * key nobody can discover the next time a reader for it appears.
 */
@Serializable
data class ConversationPreferencesWirePayload(
    val isPinned: Boolean = false,
    val isMuted: Boolean = false,
    val mentionsOnly: Boolean = false,
    val isArchived: Boolean = false,
    val tags: List<String> = emptyList(),
    val categoryId: String? = null,
    val orderInCategory: Int? = null,
    val customName: String? = null,
    val reaction: String? = null,
    val readingMode: String = "auto",
    val deletedForUserAt: String? = null,
    val clearHistoryBefore: String? = null,
)

/**
 * Wire payload of `user:preferences-updated` — **conversation scope**, the
 * gateway's `UserPreferencesConversationUpdatedEventData`.
 *
 * The row is per USER, not per device: every writer of `UserConversationPreferences`
 * goes through `writeConversationPreferences`, which bumps [version] and broadcasts
 * this snapshot to the user's personal room — so pinning, muting, archiving or
 * recategorising a conversation on the web or on the iPhone reaches the Android
 * device through this event, and through nothing else.
 *
 * [version] is the arbiter (see [applyRemote]); [reset] marks a DELETE, whose
 * [preferences] is `null` — the client restores its own defaults.
 *
 * The event NAME is shared with two other scopes (category `{ userId, category }`
 * and community `{ userId, communityId, … }`); the decode site discriminates on
 * the presence of `conversationId`, exactly as iOS does.
 */
@Serializable
data class UserPreferencesConversationUpdatedSocketData(
    val userId: String,
    val conversationId: String,
    val version: Int,
    val reset: Boolean = false,
    val preferences: ConversationPreferencesWirePayload? = null,
)

/**
 * Fold a conversation-scope `user:preferences-updated` broadcast onto the locally
 * cached row, or return `null` when the event must be **dropped** — the port of
 * web `applyRemotePreferences` (`apps/web/stores/conversation-preferences-store.ts`)
 * and iOS `ConversationStore.applyRemote`.
 *
 * Two reasons to drop, and `null` says both because both mean "write nothing":
 *
 * - **`version <= local`.** The row is per user, so `writeConversationPreferences`
 *   broadcasts to every device INCLUDING the one that just wrote. A broadcast that
 *   does not exceed the local counter describes a past, and applying it would rewind
 *   a more recent action. An absent local snapshot counts as version 0, which is why
 *   the gateway starts its first upsert at 1.
 * - **`reset == false` with no snapshot.** It teaches nothing, and advancing the
 *   counter on it would make the NEXT broadcast — the one carrying the state — fall.
 *   This follows the web rule rather than iOS's, which advances the version on that
 *   shape; the gateway emits it on no path today, so the two clients differ only on
 *   a payload nobody sends (measured, see the cycle 130 report).
 *
 * `reset` restores the defaults while KEEPING [ApiConversationPreferences.version]
 * at the event's value: the gateway resets in place precisely to keep the counter
 * monotone, and a reset that rewound it locally would let the next stale broadcast in.
 */
fun ApiConversationPreferences?.applyRemote(
    event: UserPreferencesConversationUpdatedSocketData,
): ApiConversationPreferences? {
    val local = this ?: ApiConversationPreferences()
    if (event.version <= local.version) return null
    if (event.reset) return ApiConversationPreferences(version = event.version)
    return event.preferences?.let { payload ->
        ApiConversationPreferences(
            isPinned = payload.isPinned,
            isMuted = payload.isMuted,
            isArchived = payload.isArchived,
            deletedForUserAt = payload.deletedForUserAt,
            customName = payload.customName,
            categoryId = payload.categoryId,
            mentionsOnly = payload.mentionsOnly,
            reaction = payload.reaction,
            tags = payload.tags,
            version = event.version,
        )
    }
}
