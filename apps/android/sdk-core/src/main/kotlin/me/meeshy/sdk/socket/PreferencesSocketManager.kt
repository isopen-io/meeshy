package me.meeshy.sdk.socket

import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.UserPreferencesConversationUpdatedSocketData
import org.json.JSONObject
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Bridges `user:preferences-updated` — **conversation scope** — to a decoded
 * [UserPreferencesConversationUpdatedSocketData] stream, the Android twin of iOS
 * `MessageSocketManager.userPreferencesConversationUpdated`
 * (`packages/MeeshySDK/Sources/MeeshySDK/Sockets/MessageSocketManager.swift`) and
 * of web `use-socket-cache-sync` → `applyRemotePreferences`.
 *
 * `UserConversationPreferences` is a per-USER row, so pin / mute / archive /
 * mentions-only / rename / favourite / tags / category set on ANY of the user's
 * devices reaches the others only through this broadcast. Android had no listener
 * at all until this manager, which is why those gestures never crossed to a phone
 * until an unrelated full reload (issue #4127, measured in cycle 129).
 *
 * ## One event name, three scopes
 *
 * The gateway emits a union under this single name — conversation
 * (`{ userId, conversationId, version, reset, preferences }`), category
 * (`{ userId, category }`) and community (`{ userId, communityId, … }`). A strict
 * decoder fed the wrong arm throws, so the presence of `conversationId`
 * discriminates BEFORE decoding, exactly as the iOS decode site does — and it
 * discriminates rather than logs, because a decode failure recorded on every
 * broadcast of a sibling scope would read like a defect instead of the deliberate
 * silence it is.
 *
 * The other two arms are outside THIS lot, and they are not equal:
 *
 * - **community** (`{ userId, communityId, ... }`) has no Android reader at all —
 *   measured, zero occurrence of `UserCommunityPreferences` anywhere under
 *   `apps/android`. Nothing is cached, so nothing can go stale.
 * - **category** (`{ userId, category }`) DOES have one, and it is a real gap
 *   rather than an absent feature: `NotificationPreferencesStore` and
 *   `PrivacyPreferencesStore` are DataStore-backed and documented as the UI source
 *   of truth, written locally and PATCHed to `me/preferences/{notification,privacy}`
 *   through the outbox. A block changed on the web or on the iPhone therefore
 *   leaves this device's store stale — the same defect this class fixes for
 *   conversations, one arm over. Left out deliberately: it invalidates a different
 *   store on a different lane, and folding it in would widen the lot past what its
 *   witnesses cover. Tracked as issue #4133.
 *
 * ## What is NOT listened to, and why
 *
 * `user:preferences-reordered` and `user:preferences-community-reordered` carry
 * `orderInCategory` only. `ConversationSections.of` buckets on `isPinned` +
 * `categoryId`, Android exposes no drag-reorder gesture, and
 * [me.meeshy.sdk.model.ApiConversationPreferences] holds no order column — a
 * listener for them would decode a payload no surface can read. Deliberately left
 * out until Android grows the gesture that gives it an effect.
 */
@Singleton
class PreferencesSocketManager @Inject constructor(
    private val socketManager: SocketManager,
    private val json: Json,
) {
    private val _conversationPreferencesUpdated =
        MutableSharedFlow<UserPreferencesConversationUpdatedSocketData>(replay = 0, extraBufferCapacity = 64)

    /** Conversation-scope preference snapshots, versioned, in broadcast order. */
    val conversationPreferencesUpdated: SharedFlow<UserPreferencesConversationUpdatedSocketData> =
        _conversationPreferencesUpdated.asSharedFlow()

    fun attach() {
        socketManager.on(EVENT) { args ->
            val raw = args.firstOrNull() as? JSONObject ?: return@on
            if (raw.optString(CONVERSATION_SCOPE_KEY).isEmpty()) return@on
            runCatching { json.decodeFromString<UserPreferencesConversationUpdatedSocketData>(raw.toString()) }
                .onSuccess { _conversationPreferencesUpdated.tryEmit(it) }
                .onFailure { Timber.e(it, "Socket decode error [$EVENT]") }
        }
    }

    private companion object {
        const val EVENT = "user:preferences-updated"
        const val CONVERSATION_SCOPE_KEY = "conversationId"
    }
}
