package me.meeshy.sdk.model.sticker

/**
 * Quel cadre à mots la pastille du compositeur porte — miroir de `ComposerTextStickerChoice` (iOS, #5326, #6537).
 * « Dynamique » veut dire : celui dont l'auteur se sert. Trois rangs : les RÉCENTS (l'usage), puis les FAVORIS
 * (l'intention), puis le PREMIER du catalogue. Le filtre n'est pas décoratif : un cadre sans emplacement de texte
 * partirait sans les mots tapés, donc seuls les gabarits à prose sont éligibles — et un gabarit retiré par une mise à
 * jour s'écarte du même geste.
 */
object TextStickerChoice {

    /** Les gabarits éligibles du catalogue de la famille texte : ceux qui ont un emplacement de texte. */
    val eligible: List<StickerTemplate> get() = StickerTemplateCatalog.templates(StickerTemplateFamily.TEXT).filter { it.takesProse }

    fun resolve(
        recents: List<StickerUsageEntry>,
        favorites: List<StickerUsageEntry>,
        catalog: List<StickerTemplate> = eligible,
    ): StickerTemplate? {
        val frames = catalog.filter { it.takesProse }
        return firstEligible(recents, frames) ?: firstEligible(favorites, frames) ?: frames.firstOrNull()
    }

    /**
     * L'ordre dans lequel la pastille fait défiler les cadres : le cadre de l'auteur d'abord, puis le reste du
     * catalogue, sans doublon — dix cadres au plus (récents > favoris > premier du catalogue).
     */
    fun rotation(
        recents: List<StickerUsageEntry>,
        favorites: List<StickerUsageEntry>,
        catalog: List<StickerTemplate> = eligible,
    ): List<StickerTemplate> {
        val head = resolve(recents, favorites, catalog) ?: return emptyList()
        return listOf(head) + catalog.filter { it.takesProse && it.id != head.id }.distinctBy { it.id }
    }

    private fun firstEligible(entries: List<StickerUsageEntry>, catalog: List<StickerTemplate>): StickerTemplate? =
        entries.asSequence()
            .filter { it.kind == StickerUsageEntry.Kind.TEMPLATE }
            .firstNotNullOfOrNull { entry -> catalog.firstOrNull { it.id == entry.value } }
}
