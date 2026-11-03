package me.meeshy.sdk.model.sticker

/**
 * Une ligne de la feuille Mee & Meo (iOS `MeeStickerCatalog.Row`) : un titre d'intention, ou une rangée de [columns] cases au
 * plus. Chaque ligne est un enfant direct de la liste paresseuse, d'une hauteur connue : seules celles qui entrent à l'écran
 * se créent.
 */
sealed interface MeeStickerRow {
    val key: String

    data class Title(val intent: MeeIntent) : MeeStickerRow {
        override val key: String get() = "title.${intent.raw}"
    }

    data class Stickers(val stickers: List<MeeSticker>) : MeeStickerRow {
        override val key: String get() = "row.${stickers.firstOrNull()?.id.orEmpty()}"
    }
}

object MeeStickerSections {
    /** La planche entière, intention par intention (Mee, puis Meo, puis les duos). */
    fun rows(columns: Int = MeeStickerMotionPolicy.COLUMNS): List<MeeStickerRow> = flatten(MeeStickerCatalog.sections, columns)

    /** La planche d'un pack intégré : sa distribution seule, sans titre orphelin. */
    fun rows(columns: Int = MeeStickerMotionPolicy.COLUMNS, cast: MeeCharacter): List<MeeStickerRow> =
        flatten(MeeStickerCatalog.sections(cast), columns)

    /** Les mêmes rangées pour une liste à plat (récents, favoris). */
    fun rows(stickers: List<MeeSticker>, columns: Int = MeeStickerMotionPolicy.COLUMNS): List<MeeStickerRow.Stickers> =
        stickers.chunked(columns.coerceAtLeast(1)).map { MeeStickerRow.Stickers(it) }

    private fun flatten(sections: List<MeeStickerCatalog.Section>, columns: Int): List<MeeStickerRow> =
        sections.flatMap { section -> listOf<MeeStickerRow>(MeeStickerRow.Title(section.intent)) + rows(section.stickers, columns) }
}
