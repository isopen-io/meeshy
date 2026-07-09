package me.meeshy.sdk.chat

import android.content.Context
import android.content.SharedPreferences
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.StarredMessage
import me.meeshy.sdk.model.StarredMessages

/**
 * Persistent, observable store of starred (bookmarked) messages — the Android
 * building block behind iOS `StarredMessagesStore`. Starring is **local-only**
 * (the gateway exposes no message-star endpoint), so this survives process death
 * via durable storage and never touches the network.
 *
 * The pure membership/ordering logic lives in [StarredMessages]; this seam owns
 * only durability and exposes the set as a synchronous [StateFlow] so a
 * conversation re-renders the instant a message is starred (cache-first — the
 * value hydrates in the constructor, no suspend read on the hot path). Mirrors
 * [LocallyHiddenMessagesStore].
 */
interface StarredMessagesStore {
    val starred: StateFlow<StarredMessages>

    /** Star [snapshot] if absent, unstar it (by id) if already starred. */
    fun toggle(snapshot: StarredMessage)

    /** Unstar [messageId] (no-op when it is not starred). */
    fun unstar(messageId: String)

    /** Drop every star belonging to [conversationId] (no-op when none match). */
    fun removeConversation(conversationId: String)
}

/** Volatile [StarredMessagesStore] — for tests and previews. */
class InMemoryStarredMessagesStore(
    initial: StarredMessages = StarredMessages(),
) : StarredMessagesStore {
    private val _starred = MutableStateFlow(initial)
    override val starred: StateFlow<StarredMessages> = _starred.asStateFlow()

    override fun toggle(snapshot: StarredMessage) = mutate { it.toggle(snapshot) }
    override fun unstar(messageId: String) = mutate { it.unstar(messageId) }
    override fun removeConversation(conversationId: String) = mutate { it.removeConversation(conversationId) }

    private fun mutate(op: (StarredMessages) -> StarredMessages) {
        val next = op(_starred.value)
        if (next !== _starred.value) _starred.value = next
    }
}

/**
 * [StarredMessagesStore] backed by SharedPreferences (mirrors iOS UserDefaults).
 * The snapshot list is JSON-encoded under a single key; a corrupt/legacy blob
 * decodes to an empty set instead of crashing. A mutation that leaves the value
 * unchanged (idempotent star, unstar of an absent id, …) skips the write on the
 * referential check [StarredMessages] provides.
 */
class SharedPrefsStarredMessagesStore(
    context: Context,
    private val json: Json,
) : StarredMessagesStore {

    private val prefs: SharedPreferences =
        context.applicationContext.getSharedPreferences(FILE_NAME, Context.MODE_PRIVATE)

    private val _starred = MutableStateFlow(StarredMessages(decode(prefs.getString(KEY_ITEMS, null))))
    override val starred: StateFlow<StarredMessages> = _starred.asStateFlow()

    override fun toggle(snapshot: StarredMessage) = mutate { it.toggle(snapshot) }
    override fun unstar(messageId: String) = mutate { it.unstar(messageId) }
    override fun removeConversation(conversationId: String) = mutate { it.removeConversation(conversationId) }

    private fun mutate(op: (StarredMessages) -> StarredMessages) {
        val next = op(_starred.value)
        if (next === _starred.value) return
        prefs.edit().putString(KEY_ITEMS, json.encodeToString(SERIALIZER, next.items)).apply()
        _starred.value = next
    }

    private fun decode(raw: String?): List<StarredMessage> =
        raw?.let { runCatching { json.decodeFromString(SERIALIZER, it) }.getOrNull() } ?: emptyList()

    private companion object {
        private const val FILE_NAME = "meeshy_starred_messages"
        private const val KEY_ITEMS = "items"
        private val SERIALIZER = ListSerializer(StarredMessage.serializer())
    }
}
