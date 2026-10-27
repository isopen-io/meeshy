package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CallPictureInPicturePolicyTest {
    private fun may(
        video: Boolean = true,
        established: Boolean = true,
        shown: Boolean = true,
        supported: Boolean = true,
    ) = CallPictureInPicturePolicy.mayEnter(video, established, shown, supported)

    @Test
    fun `un appel video etabli dont l'ecran est ouvert peut se reduire`() {
        assertThat(may()).isTrue()
    }

    @Test
    fun `un appel audio ne se reduit pas`() {
        assertThat(may(video = false)).isFalse()
    }

    @Test
    fun `un appel qui sonne encore ne se reduit pas`() {
        assertThat(may(established = false)).isFalse()
    }

    @Test
    fun `quand l'ecran d'appel n'est pas celui qu'on quitte, la fenetre flottante montrerait autre chose`() {
        assertThat(may(shown = false)).isFalse()
    }

    @Test
    fun `un appareil sans PiP ne l'offre pas`() {
        assertThat(may(supported = false)).isFalse()
        assertThat(CallPictureInPicturePolicy.offersAction(true, true, deviceSupportsPip = false)).isFalse()
    }

    @Test
    fun `l'action de la pilule suit les memes conditions hors ecran`() {
        assertThat(CallPictureInPicturePolicy.offersAction(true, true, true)).isTrue()
        assertThat(CallPictureInPicturePolicy.offersAction(false, true, true)).isFalse()
        assertThat(CallPictureInPicturePolicy.offersAction(true, false, true)).isFalse()
    }

    @Test
    fun `la fenetre est en portrait`() {
        assertThat(CallPictureInPicturePolicy.ASPECT_HEIGHT).isGreaterThan(CallPictureInPicturePolicy.ASPECT_WIDTH)
    }
}
