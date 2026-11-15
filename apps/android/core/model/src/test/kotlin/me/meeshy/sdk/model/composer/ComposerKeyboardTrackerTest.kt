package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ComposerKeyboardTrackerTest {
    private fun rise(now: Long = 1_000L, duration: Long? = 300L, perFrame: Boolean = true) =
        ComposerKeyboardTracker.onInset(null, 280f, duration, now, perFrame)!!

    @Test fun `une nouvelle hauteur annonce un mouvement`() {
        val t = rise()
        assertThat(t.heightDp).isEqualTo(280f)
        assertThat(t.durationMs).isEqualTo(300L)
    }

    @Test fun `sans duree annoncee la duree de repli est 250 ms`() {
        assertThat(rise(duration = null).durationMs).isEqualTo(250L)
        assertThat(rise(duration = 0L).durationMs).isEqualTo(250L)
        assertThat(ComposerKeyboardTransition.FALLBACK_DURATION_MS).isEqualTo(250L)
    }

    @Test fun `le mouvement est vivant pendant sa duree plus une passe de marge`() {
        val t = rise(now = 1_000L, duration = 250L)
        assertThat(t.isLive(1_000L + 250L + 100L)).isTrue()
        assertThat(t.isLive(1_000L + 250L + 101L)).isFalse()
    }

    @Test fun `la meme hauteur ne relance pas le mouvement`() {
        val t = rise()
        val again = ComposerKeyboardTracker.onInset(t, 280f, 300L, 1_200L, true)
        assertThat(again).isSameInstanceAs(t)
    }

    @Test fun `une hauteur negative est ignoree`() {
        val t = rise()
        assertThat(ComposerKeyboardTracker.onInset(t, -1f, 300L, 1_200L, true)).isSameInstanceAs(t)
    }

    @Test fun `fin de mouvement la hauteur stable est rendue`() {
        val t = rise(now = 0L, duration = 250L)
        assertThat(ComposerKeyboardTracker.isMoving(t, 100L)).isTrue()
        assertThat(ComposerKeyboardTracker.settledHeight(t, 100L)).isNull()
        assertThat(ComposerKeyboardTracker.isMoving(t, 500L)).isFalse()
        assertThat(ComposerKeyboardTracker.settledHeight(t, 500L)).isEqualTo(280f)
    }

    @Test fun `un clavier masque ne laisse aucune hauteur a memoriser`() {
        val hidden = ComposerKeyboardTracker.onInset(rise(), 0f, 250L, 2_000L, true)
        assertThat(ComposerKeyboardTracker.settledHeight(hidden, 3_000L)).isNull()
    }
}
