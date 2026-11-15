package me.meeshy.sdk.model.scene.export

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryEffects
import me.meeshy.sdk.model.StoryKeyframe
import me.meeshy.sdk.model.StorySticker
import me.meeshy.sdk.model.StoryTextObject
import org.junit.Test

class StoryExportOverlayFramesTest {

    @Test fun `une slide sans objet temporise se peint une seule fois`() {
        val frames = StoryExportOverlayFrames.of(StoryEffects(textObjects = listOf(StoryTextObject(id = "t", text = "x"))), 6_000)
        assertThat(frames).containsExactly(StoryExportOverlayFrame(0, 6_000))
    }

    @Test fun `chaque objet entre et sort a sa fenetre de temps`() {
        val effects = StoryEffects(
            textObjects = listOf(StoryTextObject(id = "t", text = "x", startTime = 2.0, duration = 3.0)),
            stickerObjects = listOf(StorySticker(id = "s", emoji = "🎉", startTime = 4.0)),
        )
        assertThat(StoryExportOverlayFrames.of(effects, 8_000).map { it.startMillis }).containsExactly(0L, 2_000L, 4_000L, 5_000L).inOrder()
        assertThat(StoryExportOverlayFrames.of(effects, 8_000).last().endMillis).isEqualTo(8_000)
    }

    @Test fun `un fondu se peint image par image au pas du mouvement`() {
        val effects = StoryEffects(textObjects = listOf(StoryTextObject(id = "t", text = "x", startTime = 1.0, duration = 3.0, fadeIn = 0.5)))
        val starts = StoryExportOverlayFrames.of(effects, 6_000).map { it.startMillis }
        assertThat(starts).containsAtLeast(1_000L, 1_125L, 1_250L, 1_375L, 1_500L, 4_000L).inOrder()
        assertThat(starts).doesNotContain(2_000L)
    }

    @Test fun `un sticker anime et des images cles se peignent tout au long de leur mouvement`() {
        val animated = StoryEffects(stickerObjects = listOf(StorySticker(id = "s", emoji = "🎉", animation = "pulse", duration = 1.0)))
        assertThat(StoryExportOverlayFrames.of(animated, 2_000).map { it.startMillis })
            .containsExactly(0L, 125L, 250L, 375L, 500L, 625L, 750L, 875L, 1_000L).inOrder()

        val keyed = StoryEffects(
            textObjects = listOf(StoryTextObject(id = "t", text = "x", startTime = 1.0, keyframes = listOf(StoryKeyframe(time = 0f, x = 0.2), StoryKeyframe(time = 0.25f, x = 0.8)))),
        )
        assertThat(StoryExportOverlayFrames.of(keyed, 3_000).map { it.startMillis }).containsExactly(0L, 1_000L, 1_125L, 1_250L).inOrder()
    }

    @Test fun `le nombre d images peintes reste borne sur une longue slide animee`() {
        val effects = StoryEffects(stickerObjects = listOf(StorySticker(id = "s", emoji = "🎉", animation = "spin")))
        val frames = StoryExportOverlayFrames.of(effects, 600_000)
        assertThat(frames.size).isAtMost(StoryExportOverlayFrames.MAX_FRAMES_PER_SLIDE)
        assertThat(frames.first().startMillis).isEqualTo(0)
        assertThat(frames.last().endMillis).isEqualTo(600_000)
        assertThat(frames.zipWithNext().all { (a, b) -> a.endMillis == b.startMillis }).isTrue()
    }

    @Test fun `les images d un plan se placent sur la timeline commune et se retrouvent a l instant`() {
        val track = StoryExportOverlayTrack(listOf(StoryExportOverlayFrame(0, 4_000), StoryExportOverlayFrame(4_000, 6_000), StoryExportOverlayFrame(6_000, 9_000)))
        assertThat(track.indexAt(0)).isEqualTo(0)
        assertThat(track.indexAt(3_999)).isEqualTo(0)
        assertThat(track.indexAt(4_000)).isEqualTo(1)
        assertThat(track.indexAt(8_500)).isEqualTo(2)
        assertThat(track.indexAt(12_000)).isEqualTo(2)
        assertThat(StoryExportOverlayTrack(emptyList()).indexAt(10)).isEqualTo(-1)
    }
}
