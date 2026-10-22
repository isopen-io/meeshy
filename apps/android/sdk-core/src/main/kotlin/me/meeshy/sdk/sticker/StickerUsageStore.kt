package me.meeshy.sdk.sticker

import android.content.Context
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import me.meeshy.sdk.model.sticker.StickerUsageEntry
import me.meeshy.sdk.model.sticker.StickerUsageLaw

/** Où les listes se posent : des chaînes sous des clés, rien d'autre (SharedPreferences en production, une carte en test). */
public interface StickerUsageStorage {
    public fun read(key: String): String?
    public fun write(key: String, value: String)
    public fun remove(key: String)
}

public class InMemoryStickerUsageStorage(initial: Map<String, String> = emptyMap()) : StickerUsageStorage {
    private val values = initial.toMutableMap()
    override fun read(key: String): String? = values[key]
    override fun write(key: String, value: String) { values[key] = value }
    override fun remove(key: String) { values.remove(key) }
}

public class SharedPrefsStickerUsageStorage(context: Context) : StickerUsageStorage {
    private val prefs = context.applicationContext.getSharedPreferences("meeshy_sticker_usage", Context.MODE_PRIVATE)
    override fun read(key: String): String? = prefs.getString(key, null)
    // commit() : l'écriture est SYNCHRONE, la dernière pose survit à un processus tué juste après.
    override fun write(key: String, value: String) { prefs.edit().putString(key, value).commit() }
    override fun remove(key: String) { prefs.edit().remove(key).commit() }
}

/**
 * Le magasin des FAVORIS et des RÉCENTS de la feuille de stickers — miroir de `StickerUsageStore` d'iOS.
 * Toutes les règles sont dans [StickerUsageLaw] ; ici : la durabilité, le compte actif et les flux observables.
 *
 * Les listes appartiennent au compte : [adopt] recharge celles du compte qui se présente, et les listes d'avant
 * (clés globales) reviennent au PREMIER compte, puis quittent les clés globales pour qu'aucun autre n'en hérite.
 */
public class StickerUsageStore(private val storage: StickerUsageStorage) {
    private var account: String? = null
    private val lock = Any()

    private val _recents = MutableStateFlow(load(StickerUsageLaw.RECENTS_BASE))
    private val _favorites = MutableStateFlow(load(StickerUsageLaw.FAVORITES_BASE))

    public val recents: StateFlow<List<StickerUsageEntry>> = _recents.asStateFlow()
    public val favorites: StateFlow<List<StickerUsageEntry>> = _favorites.asStateFlow()

    public fun isFavorite(entry: StickerUsageEntry): Boolean = entry in _favorites.value

    /** L'auteur vient de POSER cette décoration : tête des récents, sans doublon, queue coupée à 50. */
    public fun noteUse(entry: StickerUsageEntry): Unit = synchronized(lock) {
        val next = StickerUsageLaw.recordUse(_recents.value, entry)
        storage.write(StickerUsageLaw.key(StickerUsageLaw.RECENTS_BASE, account), StickerUsageLaw.encode(next))
        _recents.value = next
    }

    /** Épingle ou dépingle ; le nouvel épinglé passe en tête. */
    public fun toggleFavorite(entry: StickerUsageEntry): Unit = synchronized(lock) {
        val next = StickerUsageLaw.toggleFavorite(_favorites.value, entry)
        storage.write(StickerUsageLaw.key(StickerUsageLaw.FAVORITES_BASE, account), StickerUsageLaw.encode(next))
        _favorites.value = next
    }

    /** Sert les listes du compte [id] (migration des clés globales au premier compte). */
    public fun adopt(id: String?) {
        synchronized(lock) {
            if (id == account) return@synchronized
            account = id
            if (!id.isNullOrEmpty()) {
                listOf(StickerUsageLaw.RECENTS_BASE, StickerUsageLaw.FAVORITES_BASE).forEach { base ->
                    val scopedKey = StickerUsageLaw.key(base, id)
                    StickerUsageLaw.adoptedValue(storage.read(scopedKey), storage.read(base))
                        ?.let { storage.write(scopedKey, it) }
                    storage.remove(base)
                }
            }
            _recents.value = load(StickerUsageLaw.RECENTS_BASE)
            _favorites.value = load(StickerUsageLaw.FAVORITES_BASE)
        }
    }

    private fun load(base: String): List<StickerUsageEntry> =
        StickerUsageLaw.decode(storage.read(StickerUsageLaw.key(base, account)))
}
