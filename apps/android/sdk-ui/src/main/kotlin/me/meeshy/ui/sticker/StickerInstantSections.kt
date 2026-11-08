package me.meeshy.ui.sticker

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyGridScope
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.sp
import me.meeshy.sdk.model.sticker.MeeInstantCatalog
import me.meeshy.sdk.model.sticker.MeeInstantKind
import me.meeshy.sdk.model.sticker.MeeSlot
import me.meeshy.sdk.model.sticker.StickerSheetChoice
import me.meeshy.ui.R
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Les Instants dans « Personnalisés » (#14345, iOS `StickerPickerView.meeInstantSections`) : Messages, Moments, Lieux,
 * Météo. Chaque case montre ce qui partira — le film fixe et les mots [typed] posés dessus — et son choix porte ces
 * emplacements au format du fil.
 */
internal fun LazyGridScope.meeInstantSections(typed: Map<MeeSlot, String>) {
    item(key = "instants:header", span = { GridItemSpan(maxLineSpan) }, contentType = "header") {
        Column {
            StickerPageHeader(stringResource(R.string.sticker_sheet_instants_title))
            Text(stringResource(R.string.sticker_sheet_instants_hint), color = MeeshyTheme.tokens.textMuted, fontSize = 12.sp)
        }
    }
    MeeInstantCatalog.sections.forEach { section ->
        item(key = "instants:${section.kind.raw}", span = { GridItemSpan(maxLineSpan) }, contentType = "header") {
            StickerPageHeader(instantKindTitle(section.kind))
        }
        items(section.instants.size, key = { "instant:${section.instants[it].id}" }, contentType = { "instant" }) { index ->
            val instant = section.instants[index]
            Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                StickerChoiceCell(StickerSheetChoice.Instant(instant.id, instant.wireSlots(typed)), instant.title, StickerArtCellSize) {
                    MeeInstantArtwork(instant, typed, side = StickerArtSize, animates = false)
                }
            }
        }
    }
}

@Composable
private fun instantKindTitle(kind: MeeInstantKind): String = stringResource(
    when (kind) {
        MeeInstantKind.MESSAGE -> R.string.sticker_sheet_instants_message
        MeeInstantKind.MOMENT -> R.string.sticker_sheet_instants_moment
        MeeInstantKind.LIEU -> R.string.sticker_sheet_instants_lieu
        MeeInstantKind.METEO -> R.string.sticker_sheet_instants_meteo
    },
)
