package me.meeshy.sdk.model.imageedit

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ImageAdjustmentsTest {
    @Test
    fun `onze curseurs`() {
        assertThat(AdjustmentKind.entries).hasSize(11)
    }

    @Test
    fun `les valeurs par defaut sont neutres`() {
        val a = ImageAdjustments()
        assertThat(a.isNeutral).isTrue()
        assertThat(a.activeCount).isEqualTo(0)
        AdjustmentKind.entries.forEach { assertThat(a[it]).isEqualTo(it.neutral) }
    }

    @Test
    fun `le neutre est dans la plage de chaque curseur`() {
        AdjustmentKind.entries.forEach { assertThat(it.neutral).isIn(com.google.common.collect.Range.closed(it.min, it.max)) }
    }

    @Test
    fun `une valeur hors plage est bornee`() {
        assertThat(ImageAdjustments().with(AdjustmentKind.EXPOSURE, 9f).exposure).isEqualTo(2f)
        assertThat(ImageAdjustments().with(AdjustmentKind.CONTRAST, 0f).contrast).isEqualTo(0.5f)
    }

    @Test
    fun `une valeur non finie est ignoree`() {
        assertThat(ImageAdjustments().with(AdjustmentKind.BLUR, Float.NaN).isNeutral).isTrue()
    }

    @Test
    fun `seules les valeurs actives voyagent`() {
        val a = ImageAdjustments().with(AdjustmentKind.GRAIN, 0.5f).with(AdjustmentKind.SATURATION, 1f)
        assertThat(a.activeValues).containsExactly("grain", 0.5f)
        assertThat(a.activeCount).isEqualTo(1)
    }

    @Test
    fun `fromValues ignore l'inconnu et borne`() {
        val a = ImageAdjustments.fromValues(mapOf("blur" to 400.0, "nope" to 1.0, "vibrance" to 0.3))
        assertThat(a.blur).isEqualTo(1f)
        assertThat(a.vibrance).isWithin(1e-6f).of(0.3f)
    }

    @Test
    fun `Simple offre luminosite contraste saturation`() {
        assertThat(AdjustmentKind.rail(ImageEditorMode.SIMPLE)).containsExactly(
            AdjustmentKind.BRIGHTNESS, AdjustmentKind.CONTRAST, AdjustmentKind.SATURATION,
        ).inOrder()
        assertThat(AdjustmentKind.rail(ImageEditorMode.PRO)).hasSize(11)
    }
}
