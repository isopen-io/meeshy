package me.meeshy.sdk.model.composer.timeline.engine

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryClipTransition
import me.meeshy.sdk.model.StoryMediaObject
import me.meeshy.sdk.model.StoryTransitionKind
import org.junit.Test

/** Fondus enchaînés et dissolve entre clips vidéo de l'aperçu. */
class TimelineVideoCompositingTest {

    private fun video(id: String, start: Double, duration: Double, background: Boolean = false) =
        StoryMediaObject(id = id, mediaType = "video", startTime = start, duration = duration, isBackground = background)

    private fun transition(kind: StoryTransitionKind, from: String = "a", to: String = "b", duration: Float = 1f) =
        StoryClipTransition(id = "t", fromClipId = from, toClipId = to, kind = kind, duration = duration)

    @Test
    fun `seuls les clips video de premier plan sont composes`() {
        val media = listOf(video("a", 0.0, 2.0), video("bg", 0.0, 5.0, background = true), StoryMediaObject(id = "i", mediaType = "image"))
        assertThat(TimelineVideoCompositing.foregroundVideoClips(media).map { it.id }).containsExactly("a")
    }

    @Test
    fun `les segments decoupent la slide aux bornes des clips`() {
        val segments = TimelineVideoCompositing.segments(listOf(video("a", 1.0, 3.0), video("b", 2.0, 4.0)), slideDuration = 8f)
        assertThat(segments.map { it.startSeconds to it.endSeconds }).containsExactly(0.0 to 1.0, 1.0 to 2.0, 2.0 to 4.0, 4.0 to 6.0, 6.0 to 8.0).inOrder()
        assertThat(segments.map { it.activeClipIds }).containsExactly(emptyList<String>(), listOf("a"), listOf("a", "b"), listOf("b"), emptyList<String>()).inOrder()
    }

    @Test
    fun `un crossfade sortant descend de 1 a 0 sur ses dernieres secondes`() {
        val config = TimelineVideoCompositing.layerConfig(0.0, 4.0, 0f, 0f, transition(StoryTransitionKind.CROSSFADE), null)
        assertThat(config.opacityAt(2.0)).isEqualTo(1f)
        assertThat(config.opacityAt(3.5)).isWithin(1e-4f).of(0.5f)
        assertThat(config.opacityAt(4.0)).isEqualTo(0f)
        assertThat(config.usesDissolveFilter).isFalse()
    }

    @Test
    fun `un crossfade entrant monte de 0 a 1 des le debut du clip`() {
        val config = TimelineVideoCompositing.layerConfig(4.0, 8.0, 0f, 0f, null, transition(StoryTransitionKind.CROSSFADE, duration = 2f))
        assertThat(config.opacityAt(4.0)).isEqualTo(0f)
        assertThat(config.opacityAt(5.0)).isWithin(1e-4f).of(0.5f)
        assertThat(config.opacityAt(7.0)).isEqualTo(1f)
    }

    @Test
    fun `un dissolve ne pose aucune rampe et demande le compositeur dedie`() {
        val dissolve = transition(StoryTransitionKind.DISSOLVE)
        val config = TimelineVideoCompositing.layerConfig(0.0, 4.0, 0f, 0f, dissolve, null)
        assertThat(config.opacityRamps).isEmpty()
        assertThat(config.usesDissolveFilter).isTrue()
        assertThat(TimelineVideoCompositing.needsDissolveCompositor(listOf(dissolve))).isTrue()
    }

    @Test
    fun `les fondus d'entree et de sortie du clip sont des rampes`() {
        val config = TimelineVideoCompositing.layerConfig(0.0, 10.0, fadeIn = 1f, fadeOut = 2f, outgoing = null, incoming = null)
        assertThat(config.opacityAt(0.5)).isWithin(1e-4f).of(0.5f)
        assertThat(config.opacityAt(5.0)).isEqualTo(1f)
        assertThat(config.opacityAt(9.0)).isWithin(1e-4f).of(0.5f)
    }

    @Test
    fun `sans rampe le clip est opaque`() {
        assertThat(TimelineVideoCompositing.layerConfig(0.0, 1.0, 0f, 0f, null, null).opacityAt(0.3)).isEqualTo(1f)
    }

    @Test
    fun `chaque couche retrouve la transition qui part et celle qui arrive`() {
        val clips = listOf(video("a", 0.0, 4.0), video("b", 3.0, 4.0))
        val segment = TimelineVideoCompositing.segments(clips, 7f).first { it.activeClipIds.size == 2 }
        val layers = TimelineVideoCompositing.segmentLayers(segment, clips, listOf(transition(StoryTransitionKind.CROSSFADE)), 7f)
        assertThat(layers.getValue("a").opacityAt(3.5)).isWithin(1e-4f).of(0.5f)
        assertThat(layers.getValue("b").opacityAt(3.5)).isWithin(1e-4f).of(0.5f)
    }
}
