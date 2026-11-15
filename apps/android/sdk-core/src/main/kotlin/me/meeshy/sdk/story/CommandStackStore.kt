package me.meeshy.sdk.story

import android.content.Context
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import me.meeshy.sdk.model.timeline.CommandStackSnapshot
import java.io.File
import javax.inject.Singleton

/**
 * Persistance de la pile Annuler/Rétablir d'un brouillon de story — l'équivalent Android de
 * `{draft}.commands.json` : l'historique survit à la fermeture du composeur et au redémarrage du
 * processus. Le stockage est isolé ICI ; les lois (`CommandStack`, codec) restent dans `:core:model`.
 */
public interface CommandStackStore {
    /** L'instantané du brouillon [draftId], ou `null` (absent ou document illisible). */
    public suspend fun load(draftId: String): CommandStackSnapshot?

    public suspend fun save(draftId: String, snapshot: CommandStackSnapshot)

    /** Supprime l'historique du brouillon (sans effet s'il n'existe pas). */
    public suspend fun clear(draftId: String)
}

/** [CommandStackStore] volatile, pour les tests et les aperçus. */
public class InMemoryCommandStackStore : CommandStackStore {
    private val snapshots = HashMap<String, CommandStackSnapshot>()

    override suspend fun load(draftId: String): CommandStackSnapshot? = synchronized(snapshots) { snapshots[draftId] }

    override suspend fun save(draftId: String, snapshot: CommandStackSnapshot) {
        synchronized(snapshots) { snapshots[draftId] = snapshot }
    }

    override suspend fun clear(draftId: String) {
        synchronized(snapshots) { snapshots.remove(draftId) }
    }
}

/**
 * [CommandStackStore] durable : un fichier JSON par brouillon sous [directory]. L'écriture passe par
 * un fichier temporaire puis un renommage, pour qu'un processus tué en pleine écriture ne laisse
 * jamais un historique tronqué. Un document illisible se lit comme « aucun historique ».
 */
public class FileCommandStackStore(
    private val directory: File,
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO,
) : CommandStackStore {

    override suspend fun load(draftId: String): CommandStackSnapshot? = withContext(ioDispatcher) {
        val file = fileFor(draftId)
        if (!file.isFile) return@withContext null
        runCatching { file.readText() }.getOrNull()?.let(CommandStackSnapshot::fromJsonOrNull)
    }

    override suspend fun save(draftId: String, snapshot: CommandStackSnapshot) {
        withContext(ioDispatcher) {
            directory.mkdirs()
            val target = fileFor(draftId)
            val temp = File(directory, target.name + TEMP_SUFFIX)
            temp.writeText(snapshot.toJson())
            if (!temp.renameTo(target)) {
                target.delete()
                temp.renameTo(target)
            }
        }
    }

    override suspend fun clear(draftId: String) {
        withContext(ioDispatcher) { fileFor(draftId).delete() }
    }

    private fun fileFor(draftId: String): File =
        File(directory, draftId.replace(UNSAFE_NAME_CHARS, "_") + FILE_SUFFIX)

    private companion object {
        private const val FILE_SUFFIX = ".commands.json"
        private const val TEMP_SUFFIX = ".tmp"
        private val UNSAFE_NAME_CHARS = Regex("[^A-Za-z0-9_-]")
    }
}

@Module
@InstallIn(SingletonComponent::class)
public object CommandStackStoreModule {

    @Provides
    @Singleton
    public fun commandStackStore(@ApplicationContext context: Context): CommandStackStore =
        FileCommandStackStore(File(context.filesDir, "story-commands"))
}
