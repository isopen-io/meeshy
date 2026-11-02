package me.meeshy.sdk.sticker

import android.content.Context
import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import java.io.File
import java.security.MessageDigest
import java.util.UUID
import javax.inject.Singleton
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.withContext
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.sticker.StickerLibraryEntry
import me.meeshy.sdk.model.sticker.StickerLibraryIndex
import me.meeshy.sdk.session.PerAccountCache

/** Un sticker de « Mes stickers » : son identifiant et le fichier qui porte ses octets. */
public data class StickerLibraryItem(val id: String, val file: File)

/**
 * « Mes stickers » — la bibliothèque LOCALE de ce que l'auteur a collé ou détouré, miroir de `StickerLibraryStore` (iOS).
 * Un dossier par compte (nom haché, jamais l'identifiant en clair), un index caché qui porte la récence, un budget de
 * 64 Mo au-delà duquel les plus anciens partent ([StickerLibraryIndex]). Sans compte, rien ne se garde. [clear] efface le
 * dossier du compte courant (déconnexion, suppression de compte) sans toucher celui d'un autre.
 */
public class StickerLibraryStore(
    private val root: File,
    private val budgetBytes: Long = StickerLibraryIndex.DEFAULT_BUDGET_BYTES,
    private val newId: () -> String = { UUID.randomUUID().toString() },
) : PerAccountCache {
    private val lock = Any()
    private var directory: File? = null
    private var index = StickerLibraryIndex()
    private val _items = MutableStateFlow<List<StickerLibraryItem>>(emptyList())

    /** Du plus récent au plus ancien. */
    public val items: StateFlow<List<StickerLibraryItem>> = _items.asStateFlow()

    public fun adopt(accountId: String?): Unit = synchronized(lock) {
        val next = accountId?.takeIf { it.isNotBlank() }?.let { File(root, hashed(it)) }
        if (next == directory) return@synchronized
        directory = next
        index = next?.let(::readIndex) ?: StickerLibraryIndex()
        publish()
    }

    /** Garde [bytes] en tête de la bibliothèque ; `null` sans compte ou si l'écriture échoue. */
    public suspend fun save(bytes: ByteArray): StickerLibraryItem? = withContext(Dispatchers.IO) {
        synchronized(lock) {
            val dir = directory ?: return@synchronized null
            val id = newId().takeIf(StickerLibraryIndex::isFileSafe) ?: return@synchronized null
            val written = runCatching { dir.mkdirs(); File(dir, id).writeBytes(bytes) }.isSuccess
            if (!written) return@synchronized null
            val (next, evicted) = index.saving(id, bytes.size.toLong(), budgetBytes)
            evicted.forEach { File(dir, it).delete() }
            index = next
            writeIndex(dir)
            publish()
            StickerLibraryItem(id, File(dir, id))
        }
    }

    /** Le fichier d'un sticker gardé, `null` s'il n'est pas (ou plus) dans la bibliothèque du compte. */
    public fun file(id: String): File? = synchronized(lock) {
        val dir = directory ?: return@synchronized null
        File(dir, id).takeIf { id in index.ids && it.exists() }
    }

    override suspend fun clear(): Unit = withContext(Dispatchers.IO) {
        synchronized(lock) {
            directory?.deleteRecursively()
            index = StickerLibraryIndex()
            publish()
        }
    }

    private fun publish() {
        val dir = directory
        _items.value = if (dir == null) emptyList() else index.ids.map { StickerLibraryItem(it, File(dir, it)) }
    }

    private fun readIndex(dir: File): StickerLibraryIndex {
        val file = File(dir, INDEX_FILE)
        if (!file.exists()) return StickerLibraryIndex()
        val entries = runCatching { json.decodeFromString(entriesSerializer, file.readText()) }.getOrNull()
            ?: return StickerLibraryIndex()
        return StickerLibraryIndex(entries.filter { StickerLibraryIndex.isFileSafe(it.id) && File(dir, it.id).exists() })
    }

    private fun writeIndex(dir: File) {
        val temp = File(dir, "$INDEX_FILE.tmp")
        runCatching {
            temp.writeText(json.encodeToString(entriesSerializer, index.entries))
            temp.renameTo(File(dir, INDEX_FILE))
        }
    }

    private fun hashed(accountId: String): String =
        MessageDigest.getInstance("SHA-256").digest(accountId.toByteArray()).joinToString("") { "%02x".format(it) }

    public companion object {
        /** L'index caché (point initial) : jamais candidat à l'éviction, jamais un sticker. */
        public const val INDEX_FILE: String = ".sticker-index.json"
        private const val DIRECTORY: String = "sticker-library"
        private val json = Json { ignoreUnknownKeys = true }
        private val entriesSerializer = ListSerializer(StickerLibraryEntry.serializer())

        public fun directory(filesDir: File): File = File(filesDir, DIRECTORY)
    }
}

@Module
@InstallIn(SingletonComponent::class)
public abstract class StickerLibraryModule {
    @Binds
    @IntoSet
    public abstract fun bindStickerLibraryAccountCache(impl: StickerLibraryStore): PerAccountCache

    public companion object {
        @Provides
        @Singleton
        public fun provideStickerLibraryStore(@ApplicationContext context: Context): StickerLibraryStore =
            StickerLibraryStore(StickerLibraryStore.directory(context.filesDir))
    }
}
