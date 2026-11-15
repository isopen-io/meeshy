package me.meeshy.sdk.model.sticker

/**
 * Le catalogue des 164 films de Mee et Meo, GÉNÉRÉ (`MeeStickerCatalogData`) depuis l'index que le web écrit
 * pour iOS. Contrat du message : `templateId = "mee.<id>"`, l'emoji de repli ; un `templateId` inconnu (version
 * plus récente du web) retombe sur le repli sans lever d'erreur.
 */
object MeeStickerCatalog {
    const val TEMPLATE_PREFIX: String = "mee."
    const val ASSET_DIRECTORY: String = "mee_stickers"
    const val FILM_EXTENSION: String = "lottie"

    /** L'ordre des intentions dans la feuille — `MEE_INTENTS` du web. */
    val intentOrder: List<MeeIntent> get() = MeeStickerCatalogData.INTENT_ORDER

    val all: List<MeeSticker> get() = MeeStickerCatalogData.ALL

    private val byId: Map<String, MeeSticker> by lazy { all.associateBy { it.id } }

    /** Une section de la feuille : une intention et ses stickers (Mee, puis Meo, puis les duos). */
    data class Section(val intent: MeeIntent, val stickers: List<MeeSticker>)

    fun stickers(of: MeeCharacter): List<MeeSticker> = all.filter { it.character == of }

    /** L'onglet « Mee & Meo » : une section par intention, aucune section vide. */
    val sections: List<Section> by lazy {
        intentOrder.mapNotNull { intent ->
            val stickers = MeeCharacter.entries.flatMap { cast -> all.filter { it.character == cast && it.intent == intent } }
            stickers.takeIf { it.isNotEmpty() }?.let { Section(intent, it) }
        }
    }

    /** La planche d'un pack intégré : les mêmes sections, réduites à SA distribution. */
    fun sections(cast: MeeCharacter): List<Section> = intentOrder.mapNotNull { intent ->
        all.filter { it.character == cast && it.intent == intent }.takeIf { it.isNotEmpty() }?.let { Section(intent, it) }
    }

    fun templateId(id: String): String = TEMPLATE_PREFIX + id

    fun assetFileName(id: String): String = "$TEMPLATE_PREFIX$id.$FILM_EXTENSION"

    fun assetPath(id: String): String = "$ASSET_DIRECTORY/${assetFileName(id)}"

    /** Le sticker qu'un `templateId` désigne — `null` s'il ne vient pas de ce catalogue. */
    fun sticker(forTemplateId: String?): MeeSticker? {
        if (forTemplateId == null || !forTemplateId.startsWith(TEMPLATE_PREFIX)) return null
        return byId[forTemplateId.removePrefix(TEMPLATE_PREFIX)]
    }

    fun stickerById(id: String): MeeSticker? = byId[id]

    /** La distribution d'un pack intégré (`mee`, `meo`, `mee-et-meo`), `null` pour un pack de tiers — iOS `cast(forPackSlug:)`. */
    fun cast(forPackSlug: String): MeeCharacter? = when (forPackSlug) {
        "mee" -> MeeCharacter.MEE
        "meo" -> MeeCharacter.MEO
        "mee-et-meo" -> MeeCharacter.DUO
        else -> null
    }

    /** Le nom d'un pack intégré avant que la passerelle ait répondu (`builtinPackTitle`, iOS) — un nom propre, non traduit. */
    fun builtinPackTitle(slug: String): String? = when (cast(slug)) {
        MeeCharacter.MEE -> "Mee"
        MeeCharacter.MEO -> "Meo"
        MeeCharacter.DUO -> "Mee & Meo"
        null -> null
    }
}
