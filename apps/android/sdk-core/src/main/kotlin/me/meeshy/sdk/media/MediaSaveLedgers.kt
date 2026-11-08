package me.meeshy.sdk.media

import android.content.ContentResolver
import android.content.ContentUris
import android.content.Context
import android.content.SharedPreferences
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import me.meeshy.sdk.model.GalleryEntryName
import me.meeshy.sdk.model.InMemoryMediaSaveLedgerStore
import me.meeshy.sdk.model.MediaSaveLedger
import me.meeshy.sdk.model.MediaSaveLedgerStore
import me.meeshy.sdk.model.MediaStoreNameLookup
import me.meeshy.sdk.model.MediaStorePresence
import me.meeshy.sdk.model.MediaStoreProbe

/**
 * LE registre de déduplication de la galerie, unique par processus (#14642) : l'enregistrement
 * d'une pièce vue, la capture et l'enregistrement automatique le partagent, si bien qu'un même
 * média n'entre qu'une fois dans MediaStore, quel que soit le chemin qui le revoit.
 */
public object MediaSaveLedgers {
    @Volatile
    private var instance: MediaSaveLedger? = null

    public fun shared(context: Context): MediaSaveLedger = instance ?: synchronized(this) {
        instance ?: create(context.applicationContext).also { instance = it }
    }

    private fun create(context: Context): MediaSaveLedger = MediaSaveLedger(
        store = SharedPreferencesMediaSaveLedgerStore(context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)),
        probe = ContentResolverMediaStoreProbe(context.contentResolver),
        lookup = ContentResolverMediaStoreNameLookup(context.contentResolver),
    )

    private const val PREFS = "meeshy_media_save_ledger"
}

/** [MediaSaveLedgerStore] persistant : `empreinte\tURI` par ligne, borné comme son cœur en mémoire. */
public class SharedPreferencesMediaSaveLedgerStore(
    private val prefs: SharedPreferences,
) : MediaSaveLedgerStore {
    private val memory = InMemoryMediaSaveLedgerStore(decode(prefs.getString(KEY, null)))

    override fun uriFor(fingerprint: String): String? = memory.uriFor(fingerprint)

    override fun record(fingerprint: String, uri: String) {
        memory.record(fingerprint, uri)
        persist()
    }

    override fun forget(fingerprint: String) {
        memory.forget(fingerprint)
        persist()
    }

    private fun persist() {
        prefs.edit().putString(KEY, encode(memory.snapshot())).apply()
    }

    private companion object {
        private const val KEY = "signatures.v1"

        fun encode(entries: Map<String, String>): String =
            entries.entries.joinToString("\n") { "${it.key}\t${it.value}" }

        fun decode(raw: String?): Map<String, String> =
            raw.orEmpty().lineSequence()
                .mapNotNull { line ->
                    val tab = line.indexOf('\t')
                    if (tab <= 0 || tab == line.lastIndex) null else line.substring(0, tab) to line.substring(tab + 1)
                }
                .toMap(LinkedHashMap())
    }
}

/** La galerie dit-elle encore connaître cet URI ? Une requête refusée ne prouve aucune absence. */
public class ContentResolverMediaStoreProbe(
    private val resolver: ContentResolver,
) : MediaStoreProbe {
    override fun presence(uri: String): MediaStorePresence = try {
        resolver.query(Uri.parse(uri), arrayOf(MediaStore.MediaColumns._ID), null, null, null)
            ?.use { cursor -> if (cursor.moveToFirst()) MediaStorePresence.PRESENT else MediaStorePresence.ABSENT }
            ?: MediaStorePresence.UNKNOWN
    } catch (_: SecurityException) {
        MediaStorePresence.UNKNOWN
    } catch (_: IllegalArgumentException) {
        MediaStorePresence.ABSENT
    }
}

/**
 * Cherche dans l'album Meeshy une entrée du nom donné (#14651). **Aucune permission n'est demandée pour cela** : dès
 * l'API 29, MediaStore montre sans permission les entrées que l'app a écrites DEPUIS son installation ; celles d'une
 * installation précédente redeviennent étrangères et ne sont visibles que si l'utilisateur a déjà accordé
 * `READ_MEDIA_IMAGES` / `READ_MEDIA_VIDEO` (API 33+) ou `READ_EXTERNAL_STORAGE` (API 29–32) — pour le compositeur.
 * Le reste est attrapé à l'écriture ([me.meeshy.sdk.model.MediaStoreWrite.NameTaken]).
 */
public class ContentResolverMediaStoreNameLookup(
    private val resolver: ContentResolver,
) : MediaStoreNameLookup {
    override fun find(entry: GalleryEntryName): String? {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return null
        val collection = if (entry.relativePath.startsWith("Movies")) {
            MediaStore.Video.Media.EXTERNAL_CONTENT_URI
        } else {
            MediaStore.Images.Media.EXTERNAL_CONTENT_URI
        }
        val selection = "${MediaStore.MediaColumns.DISPLAY_NAME} = ? AND ${MediaStore.MediaColumns.RELATIVE_PATH} = ?"
        val folder = entry.relativePath.trimEnd('/') + "/"
        return try {
            resolver.query(collection, arrayOf(MediaStore.MediaColumns._ID), selection, arrayOf(entry.displayName, folder), null)
                ?.use { cursor -> if (cursor.moveToFirst()) ContentUris.withAppendedId(collection, cursor.getLong(0)).toString() else null }
        } catch (_: SecurityException) {
            null
        } catch (_: IllegalArgumentException) {
            null
        }
    }
}
