package me.meeshy.sdk.socket

import android.content.Context
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.UserPresence
import me.meeshy.sdk.model.presence.PresenceMap
import me.meeshy.sdk.model.presence.ServedPresencePage
import me.meeshy.sdk.session.PerAccountCache
import java.io.File
import java.io.IOException
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import javax.inject.Singleton

/**
 * La mémoire disque de la carte de présence (miroir de `presence_map.json` d'iOS). Une écriture porte
 * le compte qui l'a reçue : une lecture pour un AUTRE compte ne rend rien et EFFACE le fichier — ce que
 * le compte précédent a laissé ne survit pas à sa première lecture par un autre. Ni l'âge (la vie du point, 5 min) ni le
 * compte courant ne se décident ici — c'est la loi pure `PresenceRetention`.
 */
interface PresenceMapPersistence {
    suspend fun load(accountId: String): PresenceMap
    suspend fun save(accountId: String, entries: PresenceMap)
    suspend fun clear()

    companion object {
        /** Sans disque : la carte repart vide à chaque démarrage. */
        val None: PresenceMapPersistence = object : PresenceMapPersistence {
            override suspend fun load(accountId: String): PresenceMap = emptyMap()
            override suspend fun save(accountId: String, entries: PresenceMap) = Unit
            override suspend fun clear() = Unit
        }
    }
}

@Serializable
private class PersistedPresenceMap(val accountId: String, val entries: Map<String, UserPresence>)

/**
 * Un fichier privé de l'application (jamais sauvegardé : `allowBackup=false`), écrit hors du fil
 * principal par remplacement atomique. Une lecture illisible rend une carte vide : la présence est un
 * confort de démarrage, jamais une raison de planter.
 */
class FilePresenceMapPersistence(
    private val file: File,
    private val io: CoroutineDispatcher = Dispatchers.IO,
) : PresenceMapPersistence {

    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }

    /** L'écriture en cours, renommée sur [file] quand elle est complète ; une écriture interrompue la laisse. */
    private val pending: File get() = File(file.parentFile, file.name + ".tmp")

    /** Une lecture n'a lieu qu'entre deux écritures : un [pending] présent est le reste d'une écriture interrompue, effacé. */
    override suspend fun load(accountId: String): PresenceMap = withContext(io) {
        attempt {
            pending.delete()
            if (!file.exists()) return@attempt emptyMap()
            val persisted = json.decodeFromString<PersistedPresenceMap>(file.readText())
            if (persisted.accountId == accountId) return@attempt persisted.entries
            forget()
            emptyMap()
        } ?: emptyMap()
    }

    override suspend fun save(accountId: String, entries: PresenceMap) = withContext(io) {
        attempt {
            file.parentFile?.mkdirs()
            pending.writeText(json.encodeToString(PersistedPresenceMap.serializer(), PersistedPresenceMap(accountId, entries)))
            Files.move(pending.toPath(), file.toPath(), StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE)
        }
        Unit
    }

    /** Efface le fichier ET une écriture interrompue : ni l'un ni l'autre ne survit à la fin de session. */
    override suspend fun clear() = withContext(io) {
        attempt { forget() }
        Unit
    }

    private fun forget() {
        file.delete()
        pending.delete()
    }

    private inline fun <T> attempt(block: () -> T): T? =
        try {
            block()
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (_: IOException) {
            null
        } catch (_: IllegalArgumentException) {
            null
        }
}

@Module
@InstallIn(SingletonComponent::class)
internal object PresenceMapPersistenceModule {
    @Provides
    @Singleton
    fun providePresenceMapPersistence(@ApplicationContext context: Context): PresenceMapPersistence =
        FilePresenceMapPersistence(File(context.noBackupFilesDir, "presence/presence_map.json"))

    /** La porte des pages vers LA carte : tout lui est délégué, ses marques comprises — sans elles, rien ne s'ordonne. */
    @Provides
    @Singleton
    fun provideServedPresenceSink(store: dagger.Lazy<PresenceStore>): ServedPresenceSink = object : ServedPresenceSink {
        override fun seed(served: Map<String, UserPresence>) = store.get().seed(served)
        override fun seed(page: ServedPresencePage) = store.get().seed(page)
        override fun seedSweep(pages: List<ServedPresencePage>) = store.get().seedSweep(pages)
        override fun receipt(): Long = store.get().receipt()
    }

    /** La carte et son fichier se vident dans [me.meeshy.sdk.session.SessionTeardown.wipe], attendu par la déconnexion. */
    @Provides
    @IntoSet
    fun providePresenceAccountCache(store: dagger.Lazy<PresenceStore>): PerAccountCache = object : PerAccountCache {
        override suspend fun clear() = store.get().clear()
    }
}
