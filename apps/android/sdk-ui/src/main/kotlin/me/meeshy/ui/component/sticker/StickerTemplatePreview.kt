package me.meeshy.ui.component.sticker

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import me.meeshy.ui.sticker.template.StickerTemplateMetrics

/** Le côté de la vignette d'un gabarit dans la feuille, en dp — le même que la cellule d'iOS. */
public val StickerTemplatePreviewSide: Dp = 104.dp

/**
 * La vignette d'un gabarit : elle passe par le MÊME moteur que la scène (le registre), avec les mesures d'une cellule
 * de [side] dp et le contour blanc découpé. Seules les mesures changent.
 */
@Composable
public fun StickerTemplatePreview(
    templateId: String,
    slots: Map<String, String>,
    modifier: Modifier = Modifier,
    side: Dp = StickerTemplatePreviewSide,
    contentDescription: String? = null,
) {
    val metrics = remember(side) { StickerTemplateMetrics.preview(side.value) }
    Box(modifier.size(side), contentAlignment = Alignment.Center) {
        StickerTemplateRenderer(templateId, slots, metrics, dieCut = true, contentDescription = contentDescription)
    }
}
