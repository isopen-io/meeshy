package me.meeshy.ui.component.sticker

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import me.meeshy.sdk.model.sticker.StickerSlotFiller
import me.meeshy.sdk.model.sticker.StickerTemplateCatalog
import me.meeshy.ui.R
import me.meeshy.ui.sticker.template.StickerTemplateMetrics
import me.meeshy.ui.sticker.template.StickerTemplateRegistry

/**
 * Le gabarit dessiné par le registre — un seul peintre pour la vignette, la bulle et le PNG envoyé (miroir de
 * `StickerTemplateRenderer`, iOS). La rastérisation tourne hors du fil principal ; tant qu'elle n'est pas prête la boîte
 * garde déjà sa taille mesurée (la cellule ne saute pas). Un gabarit que le registre ne sait pas dessiner — inconnu, ou
 * d'une version future — se rend par son emoji de repli, sans plantage. [dieCut] ajoute le contour blanc découpé : la
 * feuille et la bulle, jamais la scène d'une story.
 */
@Composable
public fun StickerTemplateRenderer(
    templateId: String,
    slots: Map<String, String>,
    metrics: StickerTemplateMetrics,
    modifier: Modifier = Modifier,
    dieCut: Boolean = false,
    contentDescription: String? = null,
) {
    val density = LocalDensity.current.density
    val example = stringResource(R.string.sticker_text_example)
    val filled = remember(slots, templateId, example) {
        val needsWords = StickerTemplateCatalog.template(templateId)?.takesProse == true
        if (needsWords && slots[StickerSlotFiller.TEXT].isNullOrBlank()) slots + (StickerSlotFiller.TEXT to example) else slots
    }
    val drawable = StickerTemplateRegistry.knows(templateId)
    val image: ImageBitmap? by produceState<ImageBitmap?>(null, templateId, filled, metrics, density, dieCut) {
        value = withContext(Dispatchers.Default) {
            val render = if (dieCut) {
                StickerTemplateRegistry.dieCutImage(templateId, filled, metrics, density)
            } else {
                StickerTemplateRegistry.image(templateId, filled, metrics, density)
            }
            render?.bitmap?.asImageBitmap()
        }
    }
    val described = if (contentDescription != null) modifier.semantics { this.contentDescription = contentDescription } else modifier
    if (!drawable) {
        Box(described, contentAlignment = Alignment.Center) {
            Text(text = StickerTemplateCatalog.fallbackEmoji(templateId).orEmpty(), maxLines = 1)
        }
        return
    }
    val measured = remember(templateId, filled, metrics) { StickerTemplateRegistry.measuredSize(templateId, filled, metrics) }
    val boxed = measured?.let { described.size(it.width.dp, it.height.dp) } ?: described
    Box(boxed, contentAlignment = Alignment.Center) {
        image?.let { Image(bitmap = it, contentDescription = null) }
    }
}
