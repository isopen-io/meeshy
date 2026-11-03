package me.meeshy.sdk.model

import java.io.InputStream
import java.security.MessageDigest
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/** Ce qu'un enregistrement dans la galerie a produit — miroir de `PhotoLibrarySaveOutcome` (iOS, #10370). */
public enum class MediaSaveOutcome {
    SAVED,

    /** Le média y était déjà : rien n'a été écrit. */
    ALREADY_PRESENT,
    FAILED,
    ;

    /** Le média est dans la galerie à l'issue de l'appel, qu'il vienne d'y entrer ou non. */
    public val isInGallery: Boolean get() = this != FAILED
}

/** Ce que la galerie peut dire d'une entrée connue par son URI MediaStore. */
public enum class MediaStorePresence {
    PRESENT,
    ABSENT,

    /** La galerie n'est pas lisible : l'absence n'y prouverait rien. */
    UNKNOWN,
}

/** Le registre persistant `empreinte → URI MediaStore`. */
public interface MediaSaveLedgerStore {
    public fun uriFor(fingerprint: String): String?

    public fun record(fingerprint: String, uri: String)

    public fun forget(fingerprint: String)
}

/** La lecture de la galerie, réduite à la seule question du dédoublonnage. */
public fun interface MediaStoreProbe {
    public fun presence(uri: String): MediaStorePresence
}

/** L'empreinte d'un média : le SHA-256 de ses octets, en hexadécimal minuscule. */
public object MediaFingerprint {
    public fun of(bytes: ByteArray): String = hex(MessageDigest.getInstance(ALGORITHM).digest(bytes))

    public fun of(input: InputStream): String {
        val digest = MessageDigest.getInstance(ALGORITHM)
        val buffer = ByteArray(BUFFER_BYTES)
        while (true) {
            val read = input.read(buffer)
            if (read < 0) break
            digest.update(buffer, 0, read)
        }
        return hex(digest.digest())
    }

    private fun hex(bytes: ByteArray): String = bytes.joinToString("") { "%02x".format(it) }

    private const val ALGORITHM = "SHA-256"
    private const val BUFFER_BYTES = 64 * 1024
}

/**
 * **Un média n'entre qu'une fois dans la galerie** (#14642) — miroir de `PhotoLibraryDeduplicator`
 * (iOS, #10370), partagé par tous les chemins qui écrivent dans MediaStore : l'enregistrement d'une
 * pièce vue, la capture, l'enregistrement automatique des médias reçus.
 *
 * Avant toute écriture, l'empreinte est cherchée dans le registre : l'URI qu'il désigne existe-t-il
 * encore ? Présent, ou invérifiable, le média est DÉJÀ là ; absent (l'utilisateur l'a supprimé), le
 * registre l'oublie et l'écriture repart. Deux demandes simultanées pour la même empreinte ne font
 * qu'une écriture : la seconde attend la première et rend [MediaSaveOutcome.ALREADY_PRESENT].
 */
public class MediaSaveLedger(
    private val store: MediaSaveLedgerStore,
    private val probe: MediaStoreProbe,
    private val lookup: MediaStoreNameLookup = MediaStoreNameLookup { null },
) {
    private val mutex = Mutex()

    /**
     * Écrit le média d'empreinte [fingerprint] par [write] — qui rend l'URI créé, ou `null` en cas
     * d'échec — sauf s'il est déjà dans la galerie.
     */
    public suspend fun saveOnce(fingerprint: String, write: suspend () -> String?): MediaSaveOutcome =
        saveOnce(fingerprint, entry = null) { write()?.let { MediaStoreWrite.Written(it) } ?: MediaStoreWrite.Failed }

    /**
     * Comme [saveOnce], pour un média rangé sous un nom dérivé de son contenu ([entry], #14651) : le registre
     * vide (réinstallation), la galerie est encore interrogée sur ce nom avant d'écrire, et une écriture que
     * MediaStore a dû renommer ([MediaStoreWrite.NameTaken]) dit que le média y était déjà.
     */
    public suspend fun saveOnce(
        fingerprint: String,
        entry: GalleryEntryName?,
        write: suspend () -> MediaStoreWrite,
    ): MediaSaveOutcome = mutex.withLock {
        if (isAlreadyInGallery(fingerprint)) return@withLock MediaSaveOutcome.ALREADY_PRESENT
        val known = entry?.let(::findQuietly)
        if (known != null) {
            store.record(fingerprint, known)
            return@withLock MediaSaveOutcome.ALREADY_PRESENT
        }
        val written = try {
            write()
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (_: Exception) {
            MediaStoreWrite.Failed
        }
        when (written) {
            is MediaStoreWrite.Written -> {
                store.record(fingerprint, written.uri)
                MediaSaveOutcome.SAVED
            }
            MediaStoreWrite.NameTaken -> MediaSaveOutcome.ALREADY_PRESENT
            MediaStoreWrite.Failed -> MediaSaveOutcome.FAILED
        }
    }

    private fun findQuietly(entry: GalleryEntryName): String? = try {
        lookup.find(entry)
    } catch (_: Exception) {
        null
    }

    /** L'empreinte désigne-t-elle une entrée de la galerie ? Sans rien écrire. */
    public fun isAlreadyInGallery(fingerprint: String): Boolean {
        val uri = store.uriFor(fingerprint) ?: return false
        return when (probe.presence(uri)) {
            MediaStorePresence.PRESENT, MediaStorePresence.UNKNOWN -> true
            MediaStorePresence.ABSENT -> {
                store.forget(fingerprint)
                false
            }
        }
    }
}

/** [MediaSaveLedgerStore] volatile, borné — pour les tests et comme cœur des registres persistants. */
public class InMemoryMediaSaveLedgerStore(
    initial: Map<String, String> = emptyMap(),
    private val capacity: Int = DEFAULT_CAPACITY,
) : MediaSaveLedgerStore {
    private val entries = LinkedHashMap(initial)

    override fun uriFor(fingerprint: String): String? = synchronized(entries) { entries[fingerprint] }

    override fun record(fingerprint: String, uri: String) {
        synchronized(entries) {
            entries.remove(fingerprint)
            entries[fingerprint] = uri
            while (entries.size > capacity) entries.remove(entries.keys.first())
        }
    }

    override fun forget(fingerprint: String) {
        synchronized(entries) { entries.remove(fingerprint) }
    }

    public fun snapshot(): Map<String, String> = synchronized(entries) { LinkedHashMap(entries) }

    public companion object {
        public const val DEFAULT_CAPACITY: Int = 5_000
    }
}
