package me.meeshy.sdk.cache.purge

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import kotlinx.coroutines.flow.first
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.mediacache.CacheAttributionDeriver
import me.meeshy.sdk.model.mediacache.CacheDomain
import me.meeshy.sdk.model.mediacache.CacheMediaIndex
import me.meeshy.sdk.session.PerAccountCache

/**
 * Registre d'attribution des médias du fil (publications et réels), tenu tant que le fil n'est pas persisté en entier :
 * les messages et les stories se dérivent de Room, pas le fil. Il s'écrit à la lecture ([recordFeed]), sans migration
 * Room (DataStore), et se vide à la déconnexion ([clear], via [PerAccountCache]).
 *
 * Borné : par domaine et par nature, les [CAP] URLs les plus récentes. Un fichier que plus rien ne revendique tombe dans
 * les médias orphelins ; il n'est donc jamais perdu pour la purge.
 */
public class MediaAttributionLedger(private val dataStore: DataStore<Preferences>) : PerAccountCache {

    @Serializable
    private data class Entry(
        val images: List<String> = emptyList(),
        val videos: List<String> = emptyList(),
        val audio: List<String> = emptyList(),
    )

    @Serializable
    private data class Document(val domains: Map<String, Entry> = emptyMap())

    /** Retient les médias des publications [posts] sous Publications ou Réels selon leur type. */
    public suspend fun recordFeed(posts: List<ApiPost>) {
        if (posts.isEmpty()) return
        CacheAttributionDeriver.indexFeed(posts).forEach { (domain, index) -> record(domain, index) }
    }

    public suspend fun record(domain: CacheDomain, index: CacheMediaIndex) {
        if (index.isEmpty) return
        dataStore.edit { prefs ->
            val document = decode(prefs[KEY])
            val current = document.domains[domain.name] ?: Entry()
            val merged = Entry(
                images = merge(current.images, index.images),
                videos = merge(current.videos, index.videos),
                audio = merge(current.audio, index.audio),
            )
            prefs[KEY] = json.encodeToString(Document.serializer(), Document(document.domains + (domain.name to merged)))
        }
    }

    public suspend fun index(domain: CacheDomain): CacheMediaIndex {
        val entry = decode(dataStore.data.first()[KEY]).domains[domain.name] ?: return CacheMediaIndex()
        return CacheMediaIndex(entry.images.toSet(), entry.videos.toSet(), entry.audio.toSet())
    }

    /** Oublie [urls] (fichiers purgés) de tous les domaines. */
    public suspend fun forget(urls: Set<String>) {
        if (urls.isEmpty()) return
        dataStore.edit { prefs ->
            val document = decode(prefs[KEY])
            if (document.domains.isEmpty()) return@edit
            val pruned = document.domains.mapValues { (_, e) ->
                Entry(e.images - urls, e.videos - urls, e.audio - urls)
            }
            prefs[KEY] = json.encodeToString(Document.serializer(), Document(pruned))
        }
    }

    override suspend fun clear() {
        dataStore.edit { it.remove(KEY) }
    }

    private fun merge(existing: List<String>, added: Set<String>): List<String> =
        ((existing - added) + added).takeLast(CAP)

    private fun decode(raw: String?): Document =
        raw?.let { runCatching { json.decodeFromString(Document.serializer(), it) }.getOrNull() } ?: Document()

    private companion object {
        const val CAP = 4_000
        val KEY = stringPreferencesKey("media_attribution_ledger")
        val json = Json { ignoreUnknownKeys = true }
    }
}
