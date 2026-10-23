package me.meeshy.sdk.socket

import me.meeshy.sdk.model.socket.SocketEventNames
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.UserPreferencesConversationUpdatedSocketData
import org.json.JSONObject
import kotlinx.coroutines.Dispatchers
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
 * - **category** (`{ userId, category }`) is served by [categoryPreferencesUpdated],
 *   added for issue #4133. `NotificationPreferencesStore` and
 *   `PrivacyPreferencesStore` are DataStore-backed and documented as the UI source of
 *   truth, written locally and PATCHed to `me/preferences/{notification,privacy}`
 *   through the outbox; before that flow, a block changed on the web or on the iPhone
 *   left this device's store stale for good. The broadcast carries only the category
 *   NAME, so the consumer re-reads it — see `PreferencesSyncCoordinator`.
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
    private val router: SocketEventRouter,
) {
    internal constructor(
        socketManager: SocketManager,
        json: Json,
    ) : this(
        socketManager, json,
        SocketEventRouter(SocketEventRegistrar { event, callback -> socketManager.on(event, callback) }, Dispatchers.Default),
    )

    private val _conversationPreferencesUpdated =
        SocketInboundRoute.subject<UserPreferencesConversationUpdatedSocketData>()

    /** Conversation-scope preference snapshots, versioned, in broadcast order. */
    val conversationPreferencesUpdated: SharedFlow<UserPreferencesConversationUpdatedSocketData> =
        _conversationPreferencesUpdated.asSharedFlow()

    private val _categoryPreferencesUpdated =
        SocketInboundRoute.subject<String>()

    /**
     * User-level preference categories that changed elsewhere — the NAME only
     * (`privacy`, `notification`, …), which is all the broadcast carries.
     */
    val categoryPreferencesUpdated: SharedFlow<String> = _categoryPreferencesUpdated.asSharedFlow()

    fun attach() {
        router.install(listOf(SocketInboundRoute.raw(EVENT, handle = ::route)))
    }

    private fun route(raw: JSONObject) {
        if (raw.optString(CONVERSATION_SCOPE_KEY).isNotEmpty()) {
            _conversationPreferencesUpdated.tryEmit(
                json.decodeFromString<UserPreferencesConversationUpdatedSocketData>(raw.toString()),
            )
            return
        }
        // The category arm carries no object worth decoding — just the name. Reading
        // it straight off the payload keeps the community arm (which has neither key)
        // silently ignored, as it has no Android reader to go stale.
        val category = raw.optString(CATEGORY_SCOPE_KEY)
        if (category.isNotEmpty()) _categoryPreferencesUpdated.tryEmit(category)
    }

    private companion object {
        const val EVENT = SocketEventNames.USER_PREFERENCES_UPDATED
        const val CONVERSATION_SCOPE_KEY = "conversationId"
        const val CATEGORY_SCOPE_KEY = "category"
    }
}
