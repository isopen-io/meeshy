package me.meeshy.sdk.media

import android.content.ContentResolver
import android.content.Context
import android.content.SharedPreferences
import android.net.Uri
import android.provider.MediaStore
import me.meeshy.sdk.model.InMemoryMediaSaveLedgerStore
import me.meeshy.sdk.model.MediaSaveLedger
import me.meeshy.sdk.model.MediaSaveLedgerStore
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
