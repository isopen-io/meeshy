package me.meeshy.sdk.chat

import android.content.Context
import android.content.SharedPreferences
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Immutable set of message ids the user has hidden via "Delete for me" — the
 * WhatsApp-style local-only deletion that never reaches the server (port of
 * iOS `LocallyHiddenMessagesStore`). The store below owns persistence; this
 * value object owns the pure set logic so it stays fully JVM-testable.
 *
 * [hide] is idempotent and returns the **same instance** when nothing changes,
 * so the persistence layer can skip a redundant write on a referential check
 * (mirrors iOS's `guard inserted else return`).
 */
data class LocallyHiddenMessages(val ids: Set<String> = emptySet()) {

    fun isHidden(id: String): Boolean = id in ids

    /** Filter an ordered id list down to those still visible to the user. */
    fun visible(ordered: List<String>): List<String> = ordered.filter { it !in ids }

    fun hide(id: String): LocallyHiddenMessages =
        if (id.isBlank() || id in ids) this else LocallyHiddenMessages(ids + id)
}

/**
 * Persistent, observable store of locally-hidden message ids. The pure set
 * logic lives in [LocallyHiddenMessages]; this only owns durability and exposes
 * the set as a [StateFlow] so the conversation re-filters the instant a message
 * is hidden. Mirrors [me.meeshy.sdk.reaction.EmojiUsageStore].
 */
interface LocallyHiddenMessagesStore {
    val hidden: StateFlow<LocallyHiddenMessages>
    fun hide(messageId: String)
}

/** Volatile store — for tests and previews. */
class InMemoryLocallyHiddenMessagesStore(
    initial: LocallyHiddenMessages = LocallyHiddenMessages(),
) : LocallyHiddenMessagesStore {
    private val _hidden = MutableStateFlow(initial)
    override val hidden: StateFlow<LocallyHiddenMessages> = _hidden.asStateFlow()

    override fun hide(messageId: String) {
        val next = _hidden.value.hide(messageId)
        if (next !== _hidden.value) _hidden.value = next
    }
}

/** [LocallyHiddenMessagesStore] backed by SharedPreferences (mirrors iOS UserDefaults). */
class SharedPrefsLocallyHiddenMessagesStore(context: Context) : LocallyHiddenMessagesStore {

    private val prefs: SharedPreferences =
        context.applicationContext.getSharedPreferences(FILE_NAME, Context.MODE_PRIVATE)

    private val _hidden = MutableStateFlow(
        LocallyHiddenMessages(prefs.getStringSet(KEY_IDS, emptySet())?.toSet() ?: emptySet()),
    )
    override val hidden: StateFlow<LocallyHiddenMessages> = _hidden.asStateFlow()

    override fun hide(messageId: String) {
        val next = _hidden.value.hide(messageId)
        if (next === _hidden.value) return
        prefs.edit().putStringSet(KEY_IDS, next.ids).apply()
        _hidden.value = next
    }

    companion object {
        private const val FILE_NAME = "meeshy_locally_hidden_messages"
        private const val KEY_IDS = "ids"
    }
}
