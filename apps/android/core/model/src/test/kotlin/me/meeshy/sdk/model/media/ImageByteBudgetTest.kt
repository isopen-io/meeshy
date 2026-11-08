package me.meeshy.sdk.model.media

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ImageUploadTarget
import org.junit.Test

class ImageByteBudgetTest {

    @Test
    fun `les budgets sont 500 Ko pour l'avatar et 800 Ko pour la banniere`() {
        assertThat(ImageByteBudget.forTarget(ImageUploadTarget.AVATAR).maxBytes).isEqualTo(500L * 1024)
        assertThat(ImageByteBudget.forTarget(ImageUploadTarget.BANNER).maxBytes).isEqualTo(800L * 1024)
    }

    @Test
    fun `le plafond de dimension suit le contexte 512 avatar 1600 banniere`() {
        assertThat(ImageByteBudget.AVATAR.context.maxDimensionPx).isEqualTo(512)
        assertThat(ImageByteBudget.BANNER.context.maxDimensionPx).isEqualTo(1600)
    }

    @Test
    fun `au plus huit passes`() {
        assertThat(ImageByteBudgetLadder.steps.size).isAtMost(8)
        assertThat(ImageByteBudgetLadder.steps).isNotEmpty()
    }

    @Test
    fun `la qualite decroit et ne remonte jamais`() {
        val qualities = ImageByteBudgetLadder.steps.map { it.quality }
        assertThat(qualities).isInOrder(Comparator.reverseOrder<Int>())
        assertThat(qualities.first()).isEqualTo(ImageByteBudgetLadder.START_QUALITY)
    }

    @Test
    fun `une fois le plancher de qualite atteint l'echelle reduit la dimension`() {
        val steps = ImageByteBudgetLadder.steps
        val floorIndex = steps.indexOfFirst { it.quality == ImageByteBudgetLadder.FLOOR_QUALITY }
        assertThat(floorIndex).isAtLeast(1)
        assertThat(steps.take(floorIndex).all { it.dimensionFactor == 1.0 }).isTrue()
        val after = steps.drop(floorIndex + 1)
        assertThat(after).isNotEmpty()
        assertThat(after.map { it.dimensionFactor }).isInOrder(Comparator.reverseOrder<Double>())
        assertThat(after.all { it.dimensionFactor < 1.0 && it.quality == ImageByteBudgetLadder.FLOOR_QUALITY }).isTrue()
    }

    @Test
    fun `la taille egale au budget passe, un octet de plus non`() {
        assertThat(ImageByteBudget.AVATAR.admits(500L * 1024)).isTrue()
        assertThat(ImageByteBudget.AVATAR.admits(500L * 1024 + 1)).isFalse()
    }

    @Test
    fun `la dimension cible applique le facteur sans descendre sous un pixel`() {
        assertThat(ImageByteBudgetLadder.scaled(512, 0.5)).isEqualTo(256)
        assertThat(ImageByteBudgetLadder.scaled(1, 0.1)).isEqualTo(1)
    }

    @Test
    fun `une image de plus de 12 megapixels est sous-echantillonnee avant decodage`() {
        // 8000x6000 = 48 MP, cible 512 : le pas dépasse déjà le pas dicté par la cible.
        val sample = ImageDecodeSampling.sampleSize(8000, 6000, targetLongestPx = 512)
        assertThat(sample).isAtLeast(2)
        assertThat((8000L / sample) * (6000L / sample)).isAtMost(ImageDecodeSampling.MAX_DECODE_PIXELS)
    }

    @Test
    fun `une source modeste n'est pas sous-echantillonnee`() {
        assertThat(ImageDecodeSampling.sampleSize(800, 600, targetLongestPx = 800)).isEqualTo(1)
    }

    @Test
    fun `le pas est une puissance de deux qui garde au moins la cible`() {
        val sample = ImageDecodeSampling.sampleSize(4000, 3000, targetLongestPx = 512)
        assertThat(sample).isEqualTo(4)
        assertThat(4000 / sample).isAtLeast(512)
    }

    @Test
    fun `un grand panorama sous la cible de dimension mais au dessus de 12 megapixels reste borne`() {
        val sample = ImageDecodeSampling.sampleSize(20000, 1000, targetLongestPx = 20000)
        assertThat((20000L / sample) * (1000L / sample)).isAtMost(ImageDecodeSampling.MAX_DECODE_PIXELS)
    }
}
