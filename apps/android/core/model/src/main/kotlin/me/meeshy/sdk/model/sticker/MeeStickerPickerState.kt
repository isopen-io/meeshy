package me.meeshy.sdk.model.sticker

/** Les trois onglets de pack intégrés : Mee, Meo, Mee & Meo. */
enum class MeeStickerTab(val cast: MeeCharacter?) {
    MEE(MeeCharacter.MEE),
    MEO(MeeCharacter.MEO),
    DUO(MeeCharacter.DUO),
    ;

    companion object {
        val default: MeeStickerTab = MEE
    }
}

/**
 * Ce que le sélecteur montre des Mee : les rangées de l'onglet, le résultat d'une recherche et le titre que TalkBack dit.
 * Pur : la recherche filtre sur le titre et l'intention, l'état vide d'une recherche est un fait explicite à dessiner.
 */
data class MeeStickerPickerState(
    val tab: MeeStickerTab = MeeStickerTab.default,
    val query: String = "",
) {
    val searching: Boolean get() = query.isNotBlank()

    val results: List<MeeSticker> by lazy {
        val needle = query.trim().lowercase()
        if (needle.isEmpty()) emptyList() else MeeStickerCatalog.all.filter { matches(it, needle) }
    }

    /** Vrai quand on cherche et que rien ne répond : l'écran dessine alors l'état vide, jamais un blanc. */
    val searchIsEmpty: Boolean get() = searching && results.isEmpty()

    val rows: List<MeeStickerRow> by lazy {
        if (searching) MeeStickerSections.rows(results) else tab.cast?.let { MeeStickerSections.rows(cast = it) }.orEmpty()
    }

    fun select(tab: MeeStickerTab): MeeStickerPickerState = copy(tab = tab)

    fun search(query: String): MeeStickerPickerState = copy(query = query)

    companion object {
        /** Le titre annoncé pour un sticker : toujours non vide, le titre du catalogue ou à défaut son identifiant. */
        fun accessibilityTitle(sticker: MeeSticker): String = sticker.title.ifBlank { sticker.id }

        private fun matches(sticker: MeeSticker, needle: String): Boolean =
            sticker.title.lowercase().contains(needle) || sticker.intent.raw.contains(needle) || sticker.id.lowercase().contains(needle)
    }
}
