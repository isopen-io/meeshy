package me.meeshy.sdk.model.sticker

/** Un emplacement qu'un Instant écrit — les clés du champ `slots` du message, celles du web (`MeeSlot`). */
enum class MeeSlot(val raw: String) {
    MESSAGE("message"),
    PLACE("place"),
    TIME("time"),
    WEATHER("weather");

    companion object {
        fun of(raw: String): MeeSlot? = entries.firstOrNull { it.raw == raw }

        /** Les emplacements d'un message reçu ; une clé qu'aucun Instant n'écrit tombe. */
        fun slots(raw: Map<String, String>): Map<MeeSlot, String> =
            raw.mapNotNull { (key, value) -> of(key)?.let { it to value } }.toMap()
    }
}

/** La famille d'un Instant — la section de « Personnalisés », dans l'ordre du web. */
enum class MeeInstantKind(val raw: String) { MESSAGE("message"), MOMENT("moment"), LIEU("lieu"), METEO("meteo") }

/** Le bandeau (`kit.band`) : `main` est la ligne forte, `sub` la ligne douce ; couleurs en 0xRRGGBB. */
data class MeeInstantBand(val main: MeeSlot, val sub: MeeSlot?, val fill: Int, val ink: Int, val stroke: Int)

enum class MeeTextAnchor { START, MIDDLE, END }

/** Une taille de police à partir d'une longueur saisie (sondée sur le web). */
data class MeeTextSize(val from: Int, val size: Float)

/**
 * Un texte libre posé sur un support du film (pancarte, bulle, cœur) : position et rotation (radians) dans la
 * boîte de vue, graisse, couleur 0xRRGGBB, taille selon la longueur saisie, et longueur de coupe (`null` : jamais).
 */
data class MeeInstantText(
    val slot: MeeSlot,
    val x: Float,
    val y: Float,
    val rotation: Float,
    val scale: Float,
    val anchor: MeeTextAnchor,
    val weight: Int,
    val fill: Int,
    val opacity: Float,
    val sizes: List<MeeTextSize>,
    val max: Int?,
) {
    fun size(forLength: Int): Float = sizes.lastOrNull { it.from <= forLength }?.size ?: sizes.firstOrNull()?.size ?: DEFAULT_SIZE

    private companion object {
        const val DEFAULT_SIZE = 12f
    }
}

/**
 * Un Instant : un Mee ou un Meo qui écrit, au moment de l'envoi, un message, l'heure, le lieu ou la météo.
 * Contrat du message : `templateId = "mee.<id>"`, les emplacements saisis, l'emoji de repli.
 */
data class MeeInstant(
    val id: String,
    val kind: MeeInstantKind,
    val title: String,
    val emoji: String,
    val animated: Boolean,
    val slots: List<MeeSlot>,
    val defaults: Map<MeeSlot, String>,
    val band: MeeInstantBand?,
    val texts: List<MeeInstantText>,
) {
    val templateId: String get() = MeeStickerCatalog.templateId(id)
    val assetFileName: String get() = MeeStickerCatalog.assetFileName(id)

    /** Ce qui PART au fil : les emplacements déclarés, non vides, sans leurs espaces — la règle du web (`meeSlotsFor`). */
    fun sentSlots(typed: Map<MeeSlot, String>): Map<MeeSlot, String> =
        slots.mapNotNull { slot -> typed[slot]?.trim()?.takeIf { it.isNotEmpty() }?.let { slot to it } }.toMap()

    /** Ce qui S'AFFICHE : la valeur saisie, sinon la valeur par défaut. */
    fun shown(slot: MeeSlot, typed: Map<MeeSlot, String>): String? = sentSlots(typed)[slot] ?: defaults[slot]

    /** Les emplacements au format du fil (`slots` du message), clés brutes. */
    fun wireSlots(typed: Map<MeeSlot, String>): Map<String, String> =
        sentSlots(typed).mapKeys { it.key.raw }
}
