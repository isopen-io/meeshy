package me.meeshy.sdk.model.fullscreen

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class AudioFullscreenDismissDragTest {

    @Test
    fun `un flick rapide d au moins 40 px ferme`() {
        assertThat(AudioFullscreenDismissDrag.dismisses(40f, 1_500f, 2000f)).isTrue()
    }

    @Test
    fun `un flick trop court ou trop lent ne ferme pas`() {
        assertThat(AudioFullscreenDismissDrag.dismisses(39f, 3_000f, 2000f)).isFalse()
        assertThat(AudioFullscreenDismissDrag.dismisses(300f, 1_499f, 2000f)).isFalse()
    }

    @Test
    fun `un geste doux ferme apres la moitie de la hauteur`() {
        assertThat(AudioFullscreenDismissDrag.dismisses(1000f, 0f, 2000f)).isTrue()
        assertThat(AudioFullscreenDismissDrag.dismisses(999f, 0f, 2000f)).isFalse()
    }

    @Test
    fun `une hauteur inconnue ne ferme que par flick`() {
        assertThat(AudioFullscreenDismissDrag.dismisses(5000f, 0f, 0f)).isFalse()
    }

    @Test
    fun `seule une pente nettement verticale vers le bas arme`() {
        assertThat(AudioFullscreenDismissDrag.arms(100f, 200f)).isTrue()
        assertThat(AudioFullscreenDismissDrag.arms(100f, 150f)).isFalse()
        assertThat(AudioFullscreenDismissDrag.arms(0f, -500f)).isFalse()
        assertThat(AudioFullscreenDismissDrag.arms(500f, 100f)).isFalse()
    }

    @Test
    fun `la transcription defilee garde le doigt`() {
        assertThat(AudioFullscreenDismissDrag.canBegin(0f, 800f, startsInScrolledTranscript = true)).isFalse()
        assertThat(AudioFullscreenDismissDrag.canBegin(0f, 800f, startsInScrolledTranscript = false)).isTrue()
    }

    @Test
    fun `le pager horizontal l emporte sur un balayage en biais`() {
        assertThat(AudioFullscreenDismissDrag.canBegin(900f, 800f, false)).isFalse()
    }

    @Test
    fun `l ecran suit le doigt a 60 pour cent et jamais vers le haut`() {
        assertThat(AudioFullscreenDismissDrag.offset(100f)).isWithin(1e-4f).of(60f)
        assertThat(AudioFullscreenDismissDrag.offset(-30f)).isEqualTo(0f)
    }
}
