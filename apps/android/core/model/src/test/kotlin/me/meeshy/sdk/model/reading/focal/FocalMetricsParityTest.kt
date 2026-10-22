package me.meeshy.sdk.model.reading.focal

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.double
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Test

class FocalMetricsParityTest {

    private val shared = Json.parseToJsonElement(
        FocalFixtures.file("long-message/focal-metrics.json").readText(),
    ).jsonObject

    private fun number(key: String): Double = shared[key]!!.jsonPrimitive.double

    @Test
    fun `le verre et la loupe portent les valeurs partagées`() {
        assertThat(FocalMetrics.Glass.RADIUS.toDouble()).isEqualTo(number("glassRadius"))
        assertThat(FocalMetrics.Glass.HORIZONTAL_INSET.toDouble()).isEqualTo(number("glassHorizontalInset"))
        assertThat(FocalMetrics.Glass.VERTICAL_INSET.toDouble()).isEqualTo(number("glassVerticalInset"))
        assertThat(FocalMetrics.Glass.LOUPE_MARGIN_VERTICAL.toDouble()).isEqualTo(number("loupeMarginVertical"))
        assertThat(FocalMetrics.Glass.LOUPE_MARGIN_HORIZONTAL.toDouble()).isEqualTo(number("loupeMarginHorizontal"))
        assertThat(FocalMetrics.Focus.LOUPE_GAIN.toDouble()).isWithin(1e-6).of(number("loupeGain"))
        assertThat(FocalMetrics.Glass.NEIGHBOR_OPACITY.toDouble()).isWithin(1e-6).of(number("neighborOpacity"))
    }

    @Test
    fun `les durées partagées en millisecondes égalent les secondes locales`() {
        assertThat(FocalMetrics.Scene.ENTER_DURATION_SECONDS * 1000).isWithin(1e-9).of(number("enterDurationMs"))
        assertThat(FocalMetrics.Scene.FLATTEN_DURATION_SECONDS * 1000).isWithin(1e-9).of(number("flattenDurationMs"))
        assertThat(FocalMetrics.Focus.EXPAND_DURATION_SECONDS * 1000).isWithin(1e-9).of(number("expandDurationMs"))
    }

    @Test
    fun `la courbe de dépliage est celle du fichier partagé`() {
        val curve = shared["expandCurve"]!!.jsonArray.map { it.jsonPrimitive.double }
        assertThat(FocalMetrics.Focus.EXPAND_CURVE).isEqualTo(curve)
    }

    @Test
    fun `l'interligne s'arrondit au demi-point`() {
        assertThat(FocalMetrics.Text.lineSpacing(17f)).isEqualTo(7f)
        assertThat(FocalMetrics.Text.lineSpacing(18f)).isEqualTo(7.5f)
        assertThat(FocalMetrics.Text.lineSpacing(15f)).isEqualTo(6.5f)
    }

    @Test
    fun `le relevé du bandeau de focus lève le contenu hors du premier du groupe`() {
        assertThat(FocalMetrics.FocusStrip.contentLift(isFirstInGroup = true)).isEqualTo(0.0)
        assertThat(FocalMetrics.FocusStrip.contentLift(isFirstInGroup = false)).isEqualTo(37.0)
    }
}
