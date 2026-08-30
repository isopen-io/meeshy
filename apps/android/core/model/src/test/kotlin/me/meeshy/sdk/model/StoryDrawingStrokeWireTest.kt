package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

/**
 * Le modèle de trait est la SEULE source du dessin, partagée par le champ de fil
 * [StoryEffects.drawingStrokes] (écrit à plat en v1, lu du `payload.strokes` v3) et
 * par le réducteur d'édition `StoryDrawingBoard`. iOS le décode d'un fil strict
 * (`StoryDrawingStroke.CodingKeys` requiert `tool`/`smoothing`), donc les chaînes
 * de fil doivent être EXACTEMENT `pen`/`marker`/`eraser` et `raw`/`curve`/`line` :
 * ce test échoue si une valeur d'enum dérivait de ces littéraux, ce qu'aucune
 * assertion de projection ne verrait (elle compare Kotlin à Kotlin).
 */
class StoryDrawingStrokeWireTest {

    private val json = Json { ignoreUnknownKeys = true; isLenient = true; explicitNulls = false }

    @Test
    fun `les outils portent les chaines de fil exactes de la passerelle`() {
        assertThat(json.encodeToString(StrokeTool.serializer(), StrokeTool.PEN)).isEqualTo("\"pen\"")
        assertThat(json.encodeToString(StrokeTool.serializer(), StrokeTool.MARKER)).isEqualTo("\"marker\"")
        assertThat(json.encodeToString(StrokeTool.serializer(), StrokeTool.ERASER)).isEqualTo("\"eraser\"")
    }

    @Test
    fun `les lissages portent les chaines de fil exactes de la passerelle`() {
        assertThat(json.encodeToString(StrokeSmoothing.serializer(), StrokeSmoothing.RAW)).isEqualTo("\"raw\"")
        assertThat(json.encodeToString(StrokeSmoothing.serializer(), StrokeSmoothing.CURVE)).isEqualTo("\"curve\"")
        assertThat(json.encodeToString(StrokeSmoothing.serializer(), StrokeSmoothing.LINE)).isEqualTo("\"line\"")
    }

    @Test
    fun `un trait complet fait l'aller-retour sur le fil sans perte`() {
        val stroke = StoryDrawingStroke(
            id = "stroke-1",
            points = listOf(
                StoryDrawingStrokePoint(x = 0.12, y = 0.24, pressure = 0.4),
                StoryDrawingStrokePoint(x = 0.31, y = 0.52, pressure = 0.95),
            ),
            colorHex = "FF3B30",
            width = 12.0,
            tool = StrokeTool.MARKER,
            smoothing = StrokeSmoothing.CURVE,
            createdAt = 776000000.0,
            captureVersion = 1,
        )

        val decoded = json.decodeFromString(
            StoryDrawingStroke.serializer(),
            json.encodeToString(StoryDrawingStroke.serializer(), stroke),
        )

        assertThat(decoded).isEqualTo(stroke)
    }

    /**
     * `createdAt` voyage comme un NOMBRE (epoch secondes), pas comme un objet ou une
     * chaîne : c'est ce que porte la fixture partagée et ce qu'iOS relit en `Date`
     * via sa stratégie `secondsSince1970`. Un `captureVersion` absent retombe sur 0.
     */
    @Test
    fun `un trait minimal decode avec les defauts et lit createdAt comme un nombre`() {
        val decoded = json.decodeFromString(
            StoryDrawingStroke.serializer(),
            """{ "id": "s1", "colorHex": "00FF00", "width": 4, "createdAt": 776000000 }""",
        )

        assertThat(decoded.points).isEmpty()
        assertThat(decoded.tool).isEqualTo(StrokeTool.PEN)
        assertThat(decoded.smoothing).isEqualTo(StrokeSmoothing.RAW)
        assertThat(decoded.captureVersion).isEqualTo(0)
        assertThat(decoded.createdAt).isEqualTo(776000000.0)
    }
}
