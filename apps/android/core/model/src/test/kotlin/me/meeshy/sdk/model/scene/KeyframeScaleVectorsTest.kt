package me.meeshy.sdk.model.scene

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import kotlinx.serialization.Serializable
import kotlinx.serialization.SerialName
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.StoryKeyframe
import me.meeshy.sdk.model.StoryMediaObject
import me.meeshy.sdk.model.StoryTextObject
import org.junit.Test

/**
 * L'échelle d'une image clé MULTIPLIE celle de l'objet (#14316). iOS et le web rejouent le MÊME fichier,
 * `packages/shared/fixtures/keyframe-scale.vectors.json` : une story animée sur une plateforme se lit à la même taille
 * sur les autres, ou un des trois témoins rougit.
 */
class KeyframeScaleVectorsTest {

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
    fun `the shared file is read and covers an interpolated factor`() {
        assertThat(vectors.size).isAtLeast(9)
        assertThat(vectors.any { it.keyframes.size >= 2 }).isTrue()
    }

    @Test
    fun `the keyframe resolver renders object scale times the keyframe factor`() {
        vectors.forEach { vector ->
            val resolved = StoryKeyframeResolver.resolve(
                keyframes = vector.keyframes,
                currentTime = vector.at.toFloat(),
                startTime = vector.startTime.toFloat(),
                baseScale = vector.objectScale,
            )
            assertWithMessage(vector.label).that(resolved?.scale ?: vector.objectScale).isWithin(1e-6).of(vector.renderedScale)
        }
    }

    @Test
    fun `the scene pose of a text and of a media renders the same scale`() {
        vectors.forEach { vector ->
            val text = MeeshySceneObject.Text(
                StoryTextObject(id = "t", text = "x", scale = vector.objectScale, startTime = vector.startTime, keyframes = vector.keyframes),
            )
            val media = MeeshySceneObject.Media(
                StoryMediaObject(id = "m", scale = vector.objectScale, startTime = vector.startTime, keyframes = vector.keyframes),
            )
            assertWithMessage("texte — ${vector.label}").that(ScenePoseResolver.resolve(text, vector.at).scale)
                .isWithin(1e-6).of(vector.renderedScale)
            assertWithMessage("média — ${vector.label}").that(ScenePoseResolver.resolve(media, vector.at).scale)
                .isWithin(1e-6).of(vector.renderedScale)
        }
    }
}
