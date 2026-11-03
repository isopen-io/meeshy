package me.meeshy.sdk.pack

import java.io.File
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.pack.PackFileManifest

/**
 * **Ce que chaque pack a rangé dans le magasin**, gardé HORS du magasin qu'il décrit : le magasin ne sait que des
 * empreintes, l'index sait à qui elles sont. Relire un pack REMPLACE son manifeste ; les fichiers que la nouvelle version
 * n'emploie plus restent connus (sans propriétaire) jusqu'au prochain élagage — un fichier inconnu n'est jamais effacé,
 * donc rien ne doit sortir de l'index sans être passé par l'élagage.
 */
class PackFileIndex(
    private val file: File,
    private val io: CoroutineDispatcher,
) {
    @Serializable
    private data class Stored(
        val manifests: Map<String, PackFileManifest> = emptyMap(),
        val superseded: Set<String> = emptySet(),
    )

    private val lock = Mutex()
    private var cached: Stored? = null
    private val json = Json { ignoreUnknownKeys = true }

    suspend fun record(manifest: PackFileManifest) = update { current ->
        val dropped = current.manifests[manifest.slug]?.allFiles.orEmpty()
        val kept = manifest.allFiles
        Stored(
            manifests = current.manifests + (manifest.slug to manifest),
            superseded = (current.superseded + (dropped - kept)) - kept,
        )
    }

    /** Les manifestes par slug, puis le pseudo-pack [SUPERSEDED_SLUG] des fichiers qu'une nouvelle version n'emploie plus. */
    suspend fun all(): List<PackFileManifest> = lock.withLock {
        val current = load()
        val packs = current.manifests.values.sortedBy { it.slug }
        if (current.superseded.isEmpty()) packs else packs + PackFileManifest(SUPERSEDED_SLUG, current.superseded)
    }

    suspend fun forget(slugs: Set<String>) = update { current ->
        Stored(
            manifests = current.manifests - slugs,
            superseded = if (SUPERSEDED_SLUG in slugs) emptySet() else current.superseded,
        )
    }

    private suspend fun update(change: (Stored) -> Stored) {
        lock.withLock {
            val next = change(load())
            cached = next
            withContext(io) { persist(next) }
        }
    }

    private fun persist(value: Stored) {
        runCatching {
            file.parentFile?.mkdirs()
            val temp = File(file.path + ".part")
            temp.writeText(json.encodeToString(Stored.serializer(), value))
            if (!temp.renameTo(file)) temp.delete()
        }
    }

    private suspend fun load(): Stored = cached ?: withContext(io) {
        runCatching { json.decodeFromString(Stored.serializer(), file.readText()) }.getOrNull() ?: Stored()
    }.also { cached = it }

    companion object {
        /** Le pseudo-pack des fichiers qu'une nouvelle version n'emploie plus : jamais retenu. */
        const val SUPERSEDED_SLUG = "\u0000superseded"
    }
}
