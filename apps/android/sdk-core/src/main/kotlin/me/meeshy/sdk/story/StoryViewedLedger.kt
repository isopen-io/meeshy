package me.meeshy.sdk.story

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.StoryViewedEntries
import me.meeshy.sdk.session.PerAccountCache

/**
 * Registre durable des stories VUES par le compte sur cet appareil (iOS `StoryViewedLedger`, #9804).
 *
 * Source DISTINCTE de l'instantané du plateau : aucun réécrivain du cache des stories (revalidation, démarrage à
 * froid, tirer pour rafraîchir) ne peut l'effacer. Tant que le serveur n'a pas reçu la vue (hors ligne, outbox en
 * attente) — ou ne la recevra jamais (mes propres stories) — il reporte l'état « vu » sur tout plateau reconstruit
 * ([me.meeshy.sdk.model.StoryViewedLaw.reinject]). Un registre par compte : vidé à la déconnexion ([PerAccountCache]).
 */
public interface StoryViewedLedger : PerAccountCache {
    /** Inscrit la vue de [storyId] à l'instant [atMillis] (la plus récente gagne) ; la vue est sur disque au retour. */
    public suspend fun record(storyId: String, atMillis: Long)

    /** `storyId → instant de la vue`, en direct : le plateau se recompose quand une vue est inscrite. */
    public fun observe(): Flow<Map<String, Long>>

    public suspend fun viewed(): Map<String, Long>
}

/** [StoryViewedLedger] volatil — tests et aperçus. */
public class InMemoryStoryViewedLedger(initial: Map<String, Long> = emptyMap()) : StoryViewedLedger {
    private val entries = MutableStateFlow(StoryViewedEntries(initial))

    override suspend fun record(storyId: String, atMillis: Long) {
        entries.value = entries.value.recording(storyId, atMillis)
    }

    override fun observe(): Flow<Map<String, Long>> = entries.map { it.viewedAt }.distinctUntilChanged()

    override suspend fun viewed(): Map<String, Long> = entries.value.viewedAt

    override suspend fun clear() {
        entries.value = StoryViewedEntries()
    }
}

/**
 * [StoryViewedLedger] sur un [DataStore] Preferences. Une valeur illisible vaut un registre vide (jamais un plantage
 * du plateau) ; chaque écriture élague ce que la rétention ([StoryViewedEntries.RETENTION_MILLIS]) a rendu inutile.
 */
public class DataStoreStoryViewedLedger(
    private val dataStore: DataStore<Preferences>,
    private val json: Json,
    private val nowMillis: () -> Long = System::currentTimeMillis,
) : StoryViewedLedger {

    override suspend fun record(storyId: String, atMillis: Long) {
        dataStore.edit { prefs ->
            val floor = nowMillis() - StoryViewedEntries.RETENTION_MILLIS
            val updated = decode(prefs[KEY]).recording(storyId, atMillis).pruned(floor)
            prefs[KEY] = json.encodeToString(StoryViewedEntries.serializer(), updated)
        }
    }

    override fun observe(): Flow<Map<String, Long>> =
        dataStore.data.map { decode(it[KEY]).viewedAt }.distinctUntilChanged()

    override suspend fun viewed(): Map<String, Long> = decode(dataStore.data.first()[KEY]).viewedAt

    override suspend fun clear() {
        dataStore.edit { it.remove(KEY) }
    }

    private fun decode(raw: String?): StoryViewedEntries =
        raw?.let { runCatching { json.decodeFromString(StoryViewedEntries.serializer(), it) }.getOrNull() }
            ?: StoryViewedEntries()

    private companion object {
        val KEY = stringPreferencesKey("story_viewed_ledger")
    }
}
