package me.meeshy.sdk.model.sticker

import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray

/**
 * La loi des FAVORIS et des RÉCENTS de la feuille de stickers — miroir de `StickerUsageStore` d'iOS,
 * sans stockage : les listes, leurs bornes, leurs clés par compte et leur (dé)codage.
 *
 * - Les récents sont BORNÉS à [RECENTS_LIMIT] ; poser une décoration déjà récente la REMONTE.
 * - Les favoris ne sont pas bornés ; le dernier épinglé passe en TÊTE.
 * - Les listes appartiennent à un compte ([key]) ; celles d'avant ce découpage, sous la clé globale,
 *   reviennent au premier compte qui se présente ([adoptedValue]).
 * - Une entrée dont la cible a disparu du catalogue est ignorée à l'affichage ([visible]) sans être purgée.
 */
object StickerUsageLaw {
    const val RECENTS_LIMIT: Int = 50
    const val RECENTS_BASE: String = "meeshy.sticker.recents"
    const val FAVORITES_BASE: String = "meeshy.sticker.favorites"

    private val json = Json { ignoreUnknownKeys = true }
    private val listSerializer = ListSerializer(StickerUsageEntry.serializer())

    fun recordUse(recents: List<StickerUsageEntry>, entry: StickerUsageEntry): List<StickerUsageEntry> =
        (listOf(entry) + recents.filter { it != entry }).take(RECENTS_LIMIT)

    fun toggleFavorite(favorites: List<StickerUsageEntry>, entry: StickerUsageEntry): List<StickerUsageEntry> =
        if (entry in favorites) favorites.filter { it != entry } else listOf(entry) + favorites

    /** `base@compte`, ou `base` sans compte — chaque compte a ses listes. */
    fun key(base: String, account: String?): String =
        if (account.isNullOrEmpty()) base else "$base@$account"

    /**
     * Ce qu'il faut écrire sous la clé du compte : la valeur déjà là, sinon l'ancienne valeur globale
     * (migration). `null` = rien à écrire.
     */
    fun adoptedValue(scoped: String?, legacy: String?): String? = scoped ?: legacy

    /** Les entrées dont la cible existe encore, ordre conservé. */
    fun visible(entries: List<StickerUsageEntry>, isKnown: (StickerUsageEntry) -> Boolean): List<StickerUsageEntry> =
        entries.filter(isKnown)

    fun encode(entries: List<StickerUsageEntry>): String = json.encodeToString(listSerializer, entries)

    /**
     * Une lecture qui échoue rend `[]`; une entrée illisible (genre inconnu d'une version plus récente)
     * tombe seule sans emporter la liste.
     */
    fun decode(stored: String?): List<StickerUsageEntry> {
        if (stored.isNullOrBlank()) return emptyList()
        val array = runCatching { json.parseToJsonElement(stored) as? JsonArray }.getOrNull() ?: return emptyList()
        return array.mapNotNull { element ->
            runCatching { json.decodeFromJsonElement(StickerUsageEntry.serializer(), element) }.getOrNull()
        }
    }
}
