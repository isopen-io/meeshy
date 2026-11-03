package me.meeshy.app.stories

import androidx.compose.runtime.Immutable
import me.meeshy.sdk.model.MyStoryCardKind
import me.meeshy.sdk.model.MyStoryCardModel
import me.meeshy.sdk.model.MyStoryCardRules
import me.meeshy.sdk.model.MyStoryDateLabel
import me.meeshy.sdk.model.MyStoryGlyph
import me.meeshy.sdk.model.MyStorySelectionIndicator
import me.meeshy.sdk.model.MyStoryThumbnailSource
import java.util.Locale

/** Un glyphe de la bande sous la vignette ; le compteur n'existe que s'il est positif (jamais de « 0 » décoratif). */
@Immutable
internal data class MyStoryGlyphSlot(val glyph: MyStoryGlyph, val count: Int?)

/**
 * Tout ce que la carte de « Mes stories » rend, décidé hors composition : le mapping modèle vers rendu
 * (port de `MyStoryCardPresentation`), stable et comparable pour que la grille ne recompose que la carte
 * qui change.
 */
@Immutable
internal data class MyStoryCardPresentation(
    val id: String,
    val kind: MyStoryCardKind,
    val dateText: String,
    val isVeiled: Boolean,
    val selection: MyStorySelectionIndicator,
    val glyphs: List<MyStoryGlyphSlot>,
    val title: String?,
    val thumbnail: MyStoryThumbnailSource,
) {
    companion object {
        fun of(
            card: MyStoryCardModel,
            nowMillis: Long,
            locale: Locale,
            isSelecting: Boolean,
            isSelected: Boolean,
        ): MyStoryCardPresentation = MyStoryCardPresentation(
            id = card.id,
            kind = card.kind,
            dateText = MyStoryDateFormatter.format(MyStoryDateLabel.resolve(card.dateEpochMillis, nowMillis), locale),
            isVeiled = card.isExpired(nowMillis),
            selection = MyStoryCardRules.selectionIndicator(isSelecting, isSelected),
            glyphs = card.glyphs.map { MyStoryGlyphSlot(it, card.counts[it]?.takeIf { count -> count > 0 }) },
            title = card.title?.takeIf { it.isNotBlank() },
            thumbnail = card.thumbnailSource,
        )
    }
}
