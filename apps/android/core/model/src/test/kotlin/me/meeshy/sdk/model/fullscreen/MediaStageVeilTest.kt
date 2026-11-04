package me.meeshy.sdk.model.fullscreen

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.fullscreen.MediaStageVeil.Overlays
import org.junit.Test

class MediaStageVeilTest {
    @Test fun `le chrome se peint en cadre sans ouverture`() {
        assertThat(MediaStageVeil.showsChrome(StagePresentation.Carded, Overlays.Closed)).isTrue()
        assertThat(MediaStageVeil.showsChrome(StagePresentation.Full(false), Overlays.Closed)).isFalse()
    }

    @Test fun `une ouverture voile le chrome`() {
        assertThat(MediaStageVeil.showsChrome(StagePresentation.Carded, Overlays(reactionRow = true))).isFalse()
        assertThat(MediaStageVeil.showsChrome(StagePresentation.Carded, Overlays(replyBar = true))).isFalse()
    }

    @Test fun `la geometrie ne bouge jamais sous une ouverture`() {
        listOf(StagePresentation.Carded, StagePresentation.Full(true)).forEach { p ->
            val closed = MediaStageVeil.geometryPresentation(p, Overlays.Closed)
            assertThat(MediaStageVeil.geometryPresentation(p, Overlays(reactionRow = true, replyBar = true))).isEqualTo(closed)
            assertThat(closed.isFull).isTrue()
        }
        assertThat(MediaStageVeil.geometryPresentation(StagePresentation.Full(true), Overlays.Closed).pausedOnEntry).isTrue()
    }

    @Test fun `plein ecran sans chrome sauf sous TalkBack`() {
        assertThat(MediaStageVeil.entryPresentation(screenReaderRunning = false)).isEqualTo(StagePresentation.Full(false))
        assertThat(MediaStageVeil.entryPresentation(screenReaderRunning = true)).isEqualTo(StagePresentation.Carded)
    }

    @Test fun `la pastille en pause se tait sous le voile`() {
        assertThat(MediaStageVeil.showsPausedBadge(true, Overlays.Closed)).isTrue()
        assertThat(MediaStageVeil.showsPausedBadge(true, Overlays(replyBar = true))).isFalse()
    }

    @Test fun `la rangee d emojis se pose sur la gouttiere seule`() {
        val c = MediaStageFraming.Corridors(40f, 56f, 80f, 48f, 20f, 12f)
        assertThat(MediaStageVeil.rowBottomInset(c)).isEqualTo(12f)
        assertThat(MediaStageVeil.rowBottomInset(c.copy(rail = 0f, transport = 0f))).isEqualTo(12f)
    }
}
