package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.StoryKeyframe
import me.meeshy.sdk.model.StoryTextObject
import org.junit.Test

/**
 * Le lecteur Android peint l'échelle d'une image clé comme un FACTEUR de celle de l'objet (#14316), sur le fichier que
 * iOS et le web rejouent : `packages/shared/fixtures/keyframe-scale.vectors.json`.
 */
class StoryKeyframeScaleVectorsTest {

    @Serializable
    private data class Vector(
        @SerialName("_label") val label: String,
        val objectScale: Double,
        val startTime: Double,
        val at: Double,
        val keyframes: List<StoryKeyframe>,
        val renderedScale: Double,
    )

    @Serializable
    private data class Vectors(val vectors: List<Vector>)

    private val vectors: List<Vector> = Json { ignoreUnknownKeys = true }
        .decodeFromString(Vectors.serializer(), fixture()).vectors

    private fun fixture(): String {
        var dir: File? = File(".").absoluteFile
        while (dir != null) {
            val candidate = File(dir, "packages/shared/fixtures/keyframe-scale.vectors.json")
            if (candidate.isFile) return candidate.readText()
            dir = dir.parentFile
        }
        throw AssertionError("Fixture partagée introuvable : packages/shared/fixtures/keyframe-scale.vectors.json")
    }

    @Test
    fun `the shared file is read`() {
        assertThat(vectors.size).isAtLeast(9)
    }

    @Test
    fun `a reader text renders object scale times the keyframe factor`() {
        vectors.forEach { vector ->
            val wire = StoryTextObject(id = "t", text = "x", scale = vector.objectScale, startTime = vector.startTime, keyframes = vector.keyframes)
            val painted = StoryTextObjectProjection.project(wire, listOf("fr")).animated(vector.at.toFloat())
            assertWithMessage(vector.label).that(painted.scale).isWithin(1e-6).of(vector.renderedScale)
        }
    }

    @Test
    fun `a reader foreground media renders object scale times the keyframe factor`() {
        vectors.forEach { vector ->
            val media = StoryForegroundMediaView(
                id = "m", url = "u", isVideo = false, x = 0.5, y = 0.5, scale = vector.objectScale, aspectRatio = 1.0,
                startTime = vector.startTime, keyframes = vector.keyframes,
            )
            assertWithMessage(vector.label).that(media.animated(vector.at.toFloat()).scale).isWithin(1e-6).of(vector.renderedScale)
        }
    }
}
