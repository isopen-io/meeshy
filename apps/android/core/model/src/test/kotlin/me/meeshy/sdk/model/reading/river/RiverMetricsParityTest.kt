package me.meeshy.sdk.model.reading.river

import com.google.common.truth.Truth.assertThat
import java.io.File
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.double
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Test

/**
 * Parité de `RiverMetrics` avec son domicile de vérité, `packages/shared/design/lentille-tokens.json`
 * → `river`. « On répare le token, jamais le test. » Miroir de `RiverMetricsTests.swift`.
 */
class RiverMetricsParityTest {

    private val tokens: JsonObject by lazy {
        val path = "packages/shared/design/lentille-tokens.json"
        generateSequence(File("").absoluteFile) { it.parentFile }
            .map { File(it, path) }
            .first { it.isFile }
            .let { Json.parseToJsonElement(it.readText()).jsonObject.getValue("river").jsonObject }
    }

    private fun number(vararg path: String): Double =
        path.dropLast(1).fold(tokens) { node, key -> node.getValue(key).jsonObject }.getValue(path.last()).jsonPrimitive.double

    @Test
    fun `le trait de branche`() {
        assertThat(RiverMetrics.Line.WIDTH).isEqualTo(number("line", "width"))
    }

    @Test
    fun `le couloir, ses bornes de pince et sa gouttiere`() {
        assertThat(RiverMetrics.Lane.WIDTH_REFERENCE).isEqualTo(number("lane", "widthReference"))
        assertThat(RiverMetrics.Lane.WIDTH_MIN).isEqualTo(number("lane", "widthMin"))
        assertThat(RiverMetrics.Lane.WIDTH_MAX).isEqualTo(number("lane", "widthMax"))
        assertThat(RiverMetrics.Lane.GUTTER).isEqualTo(number("lane", "gutter"))
        assertThat(RiverMetrics.Lane.WIDTH_MIN).isLessThan(RiverMetrics.Lane.WIDTH_REFERENCE)
        assertThat(RiverMetrics.Lane.WIDTH_MAX).isGreaterThan(RiverMetrics.Lane.WIDTH_REFERENCE)
    }

    @Test
    fun `la bulle, avec le pourcentage rendu en fraction`() {
        assertThat(RiverMetrics.Bubble.DETOUR_RADIUS).isEqualTo(number("bubble", "detourRadius"))
        assertThat(RiverMetrics.Bubble.BASE_GAP).isEqualTo(number("bubble", "baseGap"))
        assertThat(RiverMetrics.Bubble.CONTENT_PADDING).isEqualTo(number("bubble", "contentPadding"))
        assertThat(RiverMetrics.Bubble.FLAT_BORDER_WIDTH).isEqualTo(number("bubble", "flatBorderWidth"))
        val percent = tokens.getValue("bubble").jsonObject.getValue("identityNameMaxWidth").jsonPrimitive.content
        assertThat(percent).endsWith("%")
        assertThat(RiverMetrics.Bubble.IDENTITY_NAME_MAX_WIDTH).isWithin(1e-4).of(percent.removeSuffix("%").toDouble() / 100)
        assertThat(RiverMetrics.Bubble.CONTENT_PADDING).isNotEqualTo(RiverMetrics.Bubble.BASE_GAP)
    }

    @Test
    fun `le connecteur et sa formule de courbure`() {
        assertThat(RiverMetrics.Connector.STROKE_WIDTH).isEqualTo(number("connector", "strokeWidth"))
        assertThat(RiverMetrics.Connector.MIN_BOW).isEqualTo(number("connector", "minBow"))
        assertThat(RiverMetrics.Connector.BOW_RATIO).isEqualTo(number("connector", "bowRatio"))
        assertThat(RiverMetrics.Connector.bow(0.0)).isEqualTo(34.0)
        assertThat(RiverMetrics.Connector.bow(10.0)).isEqualTo(34.0)
        assertThat(RiverMetrics.Connector.bow(100.0)).isEqualTo(50.0)
        assertThat(RiverMetrics.Connector.bow(-100.0)).isEqualTo(50.0)
    }

    @Test
    fun `le rang et l en-tete de couloir`() {
        assertThat(RiverMetrics.Row.GAP).isEqualTo(number("row", "gap"))
        assertThat(RiverMetrics.Row.CONTINUATION_SEAM).isEqualTo(number("row", "continuationSeam"))
        assertThat(RiverMetrics.Row.CONTINUATION_DASH_LENGTH).isEqualTo(number("row", "continuationDashLength"))
        assertThat(RiverMetrics.Row.CONTINUATION_DASH_GAP).isEqualTo(number("row", "continuationDashGap"))
        assertThat(RiverMetrics.LaneHeader.HEIGHT).isEqualTo(number("laneHeader", "height"))
    }
}
