package me.meeshy.sdk.search

import android.content.Context
import android.content.SharedPreferences
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.search.RecentSearches

/**
 * Historique persistant des recherches recentes (parite iOS UserDefaults
 * `globalSearch.recentSearches`). Les REGLES (plafond, dedup, ordre) vivent dans
 * [RecentSearches] (core:model, pur) — le store ne fait que persister et exposer.
 */
public interface RecentSearchesStore {
    public val searches: StateFlow<List<String>>
    public fun record(query: String)
    public fun remove(query: String)
    public fun clear()
}

/** Volatile — tests et previews. */
public class InMemoryRecentSearchesStore(
    initial: List<String> = emptyList(),
) : RecentSearchesStore {
    private val _searches = MutableStateFlow(initial)
    override val searches: StateFlow<List<String>> = _searches.asStateFlow()

    override fun record(query: String) {
        _searches.value = RecentSearches.add(_searches.value, query)
    }

    override fun remove(query: String) {
        _searches.value = RecentSearches.remove(_searches.value, query)
    }

    override fun clear() {
        _searches.value = emptyList()
    }
}

/** [RecentSearchesStore] adosse a SharedPreferences, liste JSON ordonnee. */
public class SharedPrefsRecentSearchesStore(
    context: Context,
    private val json: Json,
) : RecentSearchesStore {

    private val prefs: SharedPreferences =
        context.applicationContext.getSharedPreferences(FILE_NAME, Context.MODE_PRIVATE)

    private val _searches = MutableStateFlow(read())
    override val searches: StateFlow<List<String>> = _searches.asStateFlow()

    override fun record(query: String) {
        write(RecentSearches.add(_searches.value, query))
    }

    override fun remove(query: String) {
        write(RecentSearches.remove(_searches.value, query))
    }

    override fun clear() {
        write(emptyList())
    }

    private fun write(next: List<String>) {
        prefs.edit()
            .putString(KEY, json.encodeToString(ListSerializer(String.serializer()), next))
            .apply()
        _searches.value = next
    }

    private fun read(): List<String> {
        val raw = prefs.getString(KEY, null) ?: return emptyList()
        return runCatching { json.decodeFromString(ListSerializer(String.serializer()), raw) }
            .getOrDefault(emptyList())
    }

    private companion object {
        const val FILE_NAME = "meeshy_recent_searches"
        const val KEY = "recentSearches"
    }
}
