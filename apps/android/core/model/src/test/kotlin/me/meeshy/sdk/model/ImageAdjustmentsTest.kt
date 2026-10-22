package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

class ImageAdjustmentsTest {
    private val json = Json { ignoreUnknownKeys = true; explicitNulls = false }

    @Test
    fun `des reglages neufs sont neutres`() {
        assertThat(ImageAdjustments().isNeutral).isTrue()
        assertThat(ImageAdjustments().activeCount).isEqualTo(0)
        assertThat(ImageAdjustments().activeValues).isEmpty()
        AdjustmentKind.entries.forEach { assertThat(ImageAdjustments()[it]).isEqualTo(it.neutral) }
    }

    @Test
    fun `contraste et saturation sont neutres a un, les autres a zero`() {
        assertThat(AdjustmentKind.CONTRAST.neutral).isEqualTo(1f)
        assertThat(AdjustmentKind.SATURATION.neutral).isEqualTo(1f)
        assertThat(AdjustmentKind.EXPOSURE.neutral).isEqualTo(0f)
    }

    @Test
    fun `une valeur hors curseur est ramenee a ses bornes`() {
        val reglages = ImageAdjustments().with(AdjustmentKind.BLUR, 400f).with(AdjustmentKind.EXPOSURE, -9f)
        assertThat(reglages[AdjustmentKind.BLUR]).isEqualTo(1f)
        assertThat(reglages[AdjustmentKind.EXPOSURE]).isEqualTo(-2f)
    }

    @Test
    fun `chaque curseur contient son neutre`() {
        AdjustmentKind.entries.forEach { assertThat(it.range.contains(it.neutral)).isTrue() }
    }

    @Test
    fun `remettre un reglage au neutre le retire`() {
        val reglages = ImageAdjustments().with(AdjustmentKind.SATURATION, 1.5f).with(AdjustmentKind.SATURATION, 1f)
        assertThat(reglages.isNeutral).isTrue()
    }

    @Test
    fun `seules les valeurs actives voyagent et reviennent identiques`() {
        val reglages = ImageAdjustments().with(AdjustmentKind.EXPOSURE, 0.5f).with(AdjustmentKind.VIGNETTE, 1f)
        val wire = json.encodeToString(ImageAdjustments.serializer(), reglages)
        assertThat(wire).isEqualTo("""{"exposure":0.5,"vignette":1.0}""")
        assertThat(json.decodeFromString(ImageAdjustments.serializer(), wire)).isEqualTo(reglages)
    }

    @Test
    fun `une lecture tolerante ignore l inconnu l illisible et borne le reste`() {
        val lu = json.decodeFromString(
            ImageAdjustments.serializer(),
            """{"blur":400,"contrast":"beaucoup","futur":3,"temperature":0.25}""",
        )
        assertThat(lu[AdjustmentKind.BLUR]).isEqualTo(1f)
        assertThat(lu[AdjustmentKind.CONTRAST]).isEqualTo(1f)
        assertThat(lu[AdjustmentKind.TEMPERATURE]).isEqualTo(0.25f)
    }

    @Test
    fun `une video ne paie ni nettete ni flou ni effets`() {
        val reglages = ImageAdjustments().with(AdjustmentKind.BLUR, 0.5f).with(AdjustmentKind.GRAIN, 0.5f)
            .with(AdjustmentKind.EXPOSURE, 1f)
        val servi = reglages.served(isVideo = true)
        assertThat(servi[AdjustmentKind.BLUR]).isEqualTo(0f)
        assertThat(servi[AdjustmentKind.GRAIN]).isEqualTo(0f)
        assertThat(servi[AdjustmentKind.EXPOSURE]).isEqualTo(1f)
        assertThat(reglages.served(isVideo = false)).isEqualTo(reglages)
    }

    @Test
    fun `un media sans reglage se decode et se republie sans la cle`() {
        val media = json.decodeFromString(StoryMediaObject.serializer(), """{"id":"m"}""")
        assertThat(media.adjustments).isNull()
        assertThat(json.encodeToString(StoryMediaObject.serializer(), media)).doesNotContain("adjustments")
        val regle = json.decodeFromString(StoryMediaObject.serializer(), """{"id":"m","adjustments":{"contrast":1.2}}""")
        assertThat(regle.adjustments!![AdjustmentKind.CONTRAST]).isEqualTo(1.2f)
        assertThat(json.encodeToString(StoryMediaObject.serializer(), regle)).contains("\"adjustments\":{\"contrast\":1.2}")
    }
}
