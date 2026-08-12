package me.meeshy.sdk.reaction

import android.content.Context
import android.content.SharedPreferences
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Persists how often the user reacts with each emoji so the quick-reaction
 * strip can surface their favourites first — port of `EmojiUsageTracker`'s
 * `UserDefaults` backing (MessageOverlayMenu.swift).
 *
 * The ordering itself lives in the pure `EmojiUsageRanker`; this store only
 * owns the count table and exposes it as an observable [StateFlow] so the UI
 * re-ranks the strip the instant a reaction is sent.
 */
interface EmojiUsageStore {
    val usage: StateFlow<Map<String, Int>>
    fun record(emoji: String)
}

/** Volatile store — for tests and previews. */
class InMemoryEmojiUsageStore(
    initial: Map<String, Int> = emptyMap(),
) : EmojiUsageStore {
    private val _usage = MutableStateFlow(initial)
    override val usage: StateFlow<Map<String, Int>> = _usage.asStateFlow()

    override fun record(emoji: String) {
        _usage.value = _usage.value + (emoji to ((_usage.value[emoji] ?: 0) + 1))
    }
}

/** [EmojiUsageStore] backed by SharedPreferences (mirrors iOS UserDefaults). */
class SharedPrefsEmojiUsageStore(context: Context) : EmojiUsageStore {

    private val prefs: SharedPreferences =
        context.applicationContext.getSharedPreferences(FILE_NAME, Context.MODE_PRIVATE)

    private val _usage = MutableStateFlow(readAll())
    override val usage: StateFlow<Map<String, Int>> = _usage.asStateFlow()

    override fun record(emoji: String) {
        val next = (prefs.getInt(emoji, 0) + 1)
        prefs.edit().putInt(emoji, next).apply()
        _usage.value = _usage.value + (emoji to next)
    }

    private fun readAll(): Map<String, Int> =
        prefs.all.entries
            .mapNotNull { (key, value) -> (value as? Int)?.let { key to it } }
            .toMap()

    companion object {
        private const val FILE_NAME = "meeshy_emoji_usage"
    }
}
