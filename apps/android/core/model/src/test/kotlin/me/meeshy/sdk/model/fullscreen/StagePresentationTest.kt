package me.meeshy.sdk.model.fullscreen

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StagePresentationTest {
    private val full = StagePresentation.Full(pausedOnEntry = false)

    @Test fun `un tap bascule entre cadre et plein cadre`() {
        assertThat(StagePresentation.Carded.after(StageEntry.Tap)).isEqualTo(full)
        assertThat(full.after(StageEntry.Tap)).isEqualTo(StagePresentation.Carded)
    }

    @Test fun `un appui long entre en plein cadre en pause et y reste`() {
        assertThat(StagePresentation.Carded.after(StageEntry.LongPress)).isEqualTo(StagePresentation.Full(true))
        assertThat(full.after(StageEntry.LongPress)).isEqualTo(StagePresentation.Full(true))
    }

    @Test fun `un glissement vers le haut entre en lecture et ne ressort pas`() {
        assertThat(StagePresentation.Carded.after(StageEntry.SwipeUp)).isEqualTo(full)
        assertThat(StagePresentation.Full(true).after(StageEntry.SwipeUp)).isEqualTo(StagePresentation.Full(true))
    }

    @Test fun `seul l appui long commande la lecture`() {
        assertThat(StagePresentation.transportIntent(StageEntry.Tap, StagePresentation.Carded)).isEqualTo(StageTransportIntent.None)
        assertThat(StagePresentation.transportIntent(StageEntry.SwipeUp, StagePresentation.Carded)).isEqualTo(StageTransportIntent.None)
        assertThat(StagePresentation.transportIntent(StageEntry.LongPress, StagePresentation.Carded)).isEqualTo(StageTransportIntent.Pause)
        assertThat(StagePresentation.transportIntent(StageEntry.LongPress, full)).isEqualTo(StageTransportIntent.TogglePlayback)
    }

    @Test fun `le plateau n existe qu en cadre et le cadrage suit`() {
        assertThat(StagePresentation.Carded.showsPlateau).isTrue()
        assertThat(full.showsPlateau).isFalse()
        assertThat(full.framing).isEqualTo(MediaStageFraming.Presentation.Full)
        assertThat(StagePresentation.Carded.framing).isEqualTo(MediaStageFraming.Presentation.Carded)
    }

    @Test fun `la pastille en pause exige une entree en pause sur un media lisible a l arret`() {
        assertThat(MediaStagePause.showsBadge(StagePresentation.Full(true), isPlayable = true, isPlaying = false)).isTrue()
        assertThat(MediaStagePause.showsBadge(StagePresentation.Full(true), isPlayable = true, isPlaying = true)).isFalse()
        assertThat(MediaStagePause.showsBadge(full, isPlayable = true, isPlaying = false)).isFalse()
    }

    @Test fun `un glissement vertical suit puis ferme ou entre en plein cadre`() {
        val g = MediaStageGestures
        assertThat(g.resolveDrag(100f, 20f, StagePresentation.Carded, 80f)).isEqualTo(g.DragOutcome.Ignored)
        assertThat(g.resolveDrag(0f, -100f, StagePresentation.Carded, 80f)).isEqualTo(g.DragOutcome.EntersFull)
        assertThat(g.resolveDrag(0f, -100f, full, 80f)).isEqualTo(g.DragOutcome.Follows)
        assertThat(g.resolveDrag(0f, 100f, full, 80f)).isEqualTo(g.DragOutcome.Dismisses)
        assertThat(g.longPressArmed(isActive = true, isTransformed = true)).isFalse()
    }
}
