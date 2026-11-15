package me.meeshy.sdk.reaction

import android.content.Context
import android.content.SharedPreferences
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.EmojiUsageRanker

/**
 * The emojis the user picked lately, most recent first, capped at
 * [EmojiUsageRanker.HISTORY_CAPACITY] — the "Utilisés récemment" row of the picker
 * (iOS `RecentEmojiStore`, `com.meeshy.recentEmojis`). Distinct from [EmojiUsageStore],
 * which counts uses to rank the quick-reaction strip: a count says what the user likes,
 * this says what they reached for last.
 *
 * The ordering rule is the pure [EmojiUsageRanker.recordRecent]; the store only owns
 * durability and exposes the list as a [StateFlow] so every open picker re-reads it.
 */
interface RecentEmojiStore {
    val history: StateFlow<List<String>>
    fun record(emoji: String)
}

/** Volatile store — for tests and previews. */
class InMemoryRecentEmojiStore(
    initial: List<String> = emptyList(),
) : RecentEmojiStore {
    private val _history = MutableStateFlow(initial.take(EmojiUsageRanker.HISTORY_CAPACITY))
    override val history: StateFlow<List<String>> = _history.asStateFlow()

    override fun record(emoji: String) {
        _history.value = EmojiUsageRanker.recordRecent(_history.value, emoji)
    }
}

/**
 * [RecentEmojiStore] backed by SharedPreferences. Every picker in the process must read
 * the same list, so go through [shared] — two instances over one file would each keep
 * their own, stale, [history].
 */
class SharedPrefsRecentEmojiStore internal constructor(context: Context) : RecentEmojiStore {

    private val prefs: SharedPreferences =
        context.applicationContext.getSharedPreferences(FILE_NAME, Context.MODE_PRIVATE)

    private val lock = Any()
    private val _history = MutableStateFlow(read())
    override val history: StateFlow<List<String>> = _history.asStateFlow()

    override fun record(emoji: String) {
        synchronized(lock) {
            val next = EmojiUsageRanker.recordRecent(_history.value, emoji)
            if (next == _history.value) return
            prefs.edit().putString(KEY_HISTORY, Json.encodeToString(LIST, next)).apply()
            _history.value = next
        }
    }

    private fun read(): List<String> {
        val stored = prefs.getString(KEY_HISTORY, null) ?: return emptyList()
        return runCatching { Json.decodeFromString(LIST, stored) }
            .getOrDefault(emptyList())
            .take(EmojiUsageRanker.HISTORY_CAPACITY)
    }

    companion object {
        private const val FILE_NAME = "meeshy_recent_emojis"
        private const val KEY_HISTORY = "history"
        private val LIST = ListSerializer(String.serializer())

        @Volatile
        private var instance: SharedPrefsRecentEmojiStore? = null

        /** The process-wide store: the same instance for every picker and every caller. */
        fun shared(context: Context): SharedPrefsRecentEmojiStore =
            instance ?: synchronized(this) {
                instance ?: SharedPrefsRecentEmojiStore(context).also { instance = it }
            }
    }
}
