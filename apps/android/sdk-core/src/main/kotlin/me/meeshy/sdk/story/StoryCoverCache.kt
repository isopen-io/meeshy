package me.meeshy.sdk.story

import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import me.meeshy.sdk.session.PerAccountCache
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton

/** Le magasin des couvertures composites locales, clé `story-cover:<id>` ([StoryCoverCacheKey]). */
public interface StoryCoverStore {
    /** Chemin du fichier d'une couverture déjà rendue pour [id], ou `null`. Une sonde disque : jamais depuis la composition. */
    public fun localPath(id: String): String?

    /** Écrit [bytes] (un JPEG) comme couverture de [id] ; faux si l'écriture a échoué (jamais bloquant). */
    public suspend fun store(id: String, bytes: ByteArray): Boolean

    /** Retire la couverture de [id] (brouillon abandonné, story supprimée). */
    public suspend fun remove(id: String)

    public companion object {
        /** Un magasin vide, pour les hôtes qui n'ont pas de disque (tests, aperçus). */
        public val Empty: StoryCoverStore = object : StoryCoverStore {
            override fun localPath(id: String): String? = null
            override suspend fun store(id: String, bytes: ByteArray): Boolean = false
            override suspend fun remove(id: String) = Unit
        }
    }
}

/**
 * Le cache disque des couvertures : un fichier par clé sous [directory], écrit par fichier temporaire puis renommage
 * (un processus tué ne laisse jamais une image tronquée). Effacé à la déconnexion : la couverture d'un compte ne
 * survit pas à son compte.
 */
@Singleton
public class StoryCoverCache internal constructor(
    private val directory: File,
    private val ioDispatcher: CoroutineDispatcher,
) : StoryCoverStore, PerAccountCache {

    @Inject
    public constructor(@ApplicationContext context: Context) : this(File(context.cacheDir, DIRECTORY), Dispatchers.IO)

    override fun localPath(id: String): String? = fileFor(id).takeIf { it.isFile && it.length() > 0L }?.absolutePath

    override suspend fun store(id: String, bytes: ByteArray): Boolean = withContext(ioDispatcher) {
        runCatching {
            directory.mkdirs()
            val target = fileFor(id)
            val temp = File(directory, target.name + TEMP_SUFFIX)
            temp.writeBytes(bytes)
            if (!temp.renameTo(target)) {
                target.delete()
                check(temp.renameTo(target))
            }
        }.isSuccess
    }

    override suspend fun remove(id: String) {
        withContext(ioDispatcher) { fileFor(id).delete() }
    }

    override suspend fun clear() {
        withContext(ioDispatcher) { directory.listFiles()?.forEach { it.delete() } }
    }

    private fun fileFor(id: String): File =
        File(directory, StoryCoverCacheKey.key(id).replace(UNSAFE_NAME_CHARS, "_") + FILE_SUFFIX)

    internal companion object {
        const val DIRECTORY = "story-covers"
        private const val FILE_SUFFIX = ".jpg"
        private const val TEMP_SUFFIX = ".tmp"
        private val UNSAFE_NAME_CHARS = Regex("[^A-Za-z0-9._-]")

        internal fun forTest(directory: File, dispatcher: CoroutineDispatcher): StoryCoverCache =
            StoryCoverCache(directory, dispatcher)
    }
}
