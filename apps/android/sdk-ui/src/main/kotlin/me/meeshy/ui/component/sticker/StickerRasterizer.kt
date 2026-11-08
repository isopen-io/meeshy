package me.meeshy.ui.component.sticker

import android.graphics.Bitmap
import java.io.ByteArrayOutputStream
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import me.meeshy.ui.sticker.template.StickerTemplateMetrics
import me.meeshy.ui.sticker.template.StickerTemplateRegistry

/**
 * La rastérisation d'un gabarit en PNG, pour l'envoi — le MÊME peintre que la vignette et la bulle (rendu identique), mais
 * jamais sur le fil principal : le dessin tourne sur [dispatcher]. Le PNG envoyé porte le contour blanc découpé ; sa taille
 * est celle du gabarit mesuré × la [density].
 */
public object StickerRasterizer {

    public suspend fun png(
        templateId: String,
        slots: Map<String, String>,
        metrics: StickerTemplateMetrics,
        density: Float,
        dieCut: Boolean = true,
        dispatcher: CoroutineDispatcher = Dispatchers.Default,
    ): ByteArray? = withContext(dispatcher) {
        val render = if (dieCut) {
            StickerTemplateRegistry.dieCutImage(templateId, slots, metrics, density)
        } else {
            StickerTemplateRegistry.image(templateId, slots, metrics, density)
        } ?: return@withContext null
        ByteArrayOutputStream().use { out ->
            if (render.bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)) out.toByteArray() else null
        }
    }
}
