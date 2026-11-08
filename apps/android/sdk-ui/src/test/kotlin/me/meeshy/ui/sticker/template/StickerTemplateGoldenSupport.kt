package me.meeshy.ui.sticker.template

import android.graphics.Bitmap
import com.google.common.truth.Truth.assertThat

/**
 * Le support partagé des tests d'images par gabarit — pour les lots de familles. Il prouve ce qu'une famille doit à la
 * contrainte « même image pour la vignette, la pose et l'export » : deux dessins du même gabarit, sans passer par le
 * cache, donnent les MÊMES pixels aux MÊMES dimensions, et l'image est à l'échelle de l'écran.
 */
internal object StickerTemplateGoldenSupport {

    fun pixels(bitmap: Bitmap): IntArray = IntArray(bitmap.width * bitmap.height).also {
        bitmap.getPixels(it, 0, bitmap.width, 0, 0, bitmap.width, bitmap.height)
    }

    /** Dessine [templateId] deux fois, directement par son dessinateur, et exige des images identiques. */
    fun assertDrawsIdentically(templateId: String, slots: Map<String, String>, metrics: StickerTemplateMetrics, density: Float) {
        val drawer = StickerTemplateRegistry.drawer(templateId)
        assertThat(drawer).isNotNull()
        val first = drawer!!.draw(slots, metrics, density)
        val second = drawer.draw(slots, metrics, density)
        assertThat(first).isNotNull()
        assertThat(second).isNotNull()
        assertThat(second!!.width).isEqualTo(first!!.width)
        assertThat(second.height).isEqualTo(first.height)
        assertThat(pixels(second)).isEqualTo(pixels(first))
        val size = drawer.measure(slots, metrics)
        assertThat(first.width).isEqualTo(kotlin.math.ceil(size.width * density).toInt())
        assertThat(first.height).isEqualTo(kotlin.math.ceil(size.height * density).toInt())
    }
}
