package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ReelChromeLawsTest {
    @Test
    fun `un appui long entre en mode immersif`() {
        assertThat(ReelChromeState().enterImmersive().immersive).isTrue()
    }

    @Test
    fun `le premier toucher en mode immersif restaure le chrome sans basculer la lecture`() {
        val result = ReelChromeState(immersive = true).onContentTap(hasPlayableMedia = true)
        assertThat(result.outcome).isEqualTo(ReelContentTap.Outcome.RESTORE_CHROME)
        assertThat(result.state.immersive).isFalse()
    }

    @Test
    fun `le toucher suivant bascule la lecture`() {
        val first = ReelChromeState(immersive = true).onContentTap(true)
        assertThat(first.state.onContentTap(true).outcome).isEqualTo(ReelContentTap.Outcome.TOGGLE_PLAYBACK)
    }

    @Test
    fun `un reel sans media jouable ne bascule rien`() {
        assertThat(ReelChromeState().onContentTap(false).outcome).isEqualTo(ReelContentTap.Outcome.NONE)
    }

    @Test
    fun `changer de reel reinitialise le mode`() {
        assertThat(ReelChromeState(immersive = true).onPageChanged().immersive).isFalse()
    }

    @Test
    fun `la zone du bord fait 18 dp`() {
        assertThat(ReelEdgeSwipeBack.isInZone(0f)).isTrue()
        assertThat(ReelEdgeSwipeBack.isInZone(18f)).isTrue()
        assertThat(ReelEdgeSwipeBack.isInZone(18.1f)).isFalse()
        assertThat(ReelEdgeSwipeBack.isInZone(-1f)).isFalse()
    }

    @Test
    fun `le seuil de fermeture est strictement au dela de 70 dp`() {
        assertThat(ReelEdgeSwipeBack.shouldClose(70f, isRtl = false)).isFalse()
        assertThat(ReelEdgeSwipeBack.shouldClose(70.5f, isRtl = false)).isTrue()
    }

    @Test
    fun `le contenu suit le doigt vers l interieur seulement`() {
        assertThat(ReelEdgeSwipeBack.follow(40f, isRtl = false)).isEqualTo(40f)
        assertThat(ReelEdgeSwipeBack.follow(-40f, isRtl = false)).isEqualTo(0f)
    }

    @Test
    fun `en RTL le sens du glissement est inverse`() {
        assertThat(ReelEdgeSwipeBack.shouldClose(-80f, isRtl = true)).isTrue()
        assertThat(ReelEdgeSwipeBack.shouldClose(80f, isRtl = true)).isFalse()
        assertThat(ReelEdgeSwipeBack.follow(-30f, isRtl = true)).isEqualTo(30f)
        assertThat(ReelEdgeSwipeBack.follow(30f, isRtl = true)).isEqualTo(0f)
    }

    @Test
    fun `la position du doigt devient un instant de recherche borne`() {
        assertThat(ReelScrubGeometry.seekMs(50f, 100f, 10_000L)).isEqualTo(5_000L)
        assertThat(ReelScrubGeometry.seekMs(-20f, 100f, 10_000L)).isEqualTo(0L)
        assertThat(ReelScrubGeometry.seekMs(500f, 100f, 10_000L)).isEqualTo(10_000L)
    }

    @Test
    fun `une duree inconnue ne cherche nulle part`() {
        assertThat(ReelScrubGeometry.seekMs(50f, 100f, 0L)).isNull()
        assertThat(ReelScrubGeometry.seekMs(50f, 0f, 10_000L)).isEqualTo(0L)
    }

    @Test
    fun `la zone utile de la barre fait 44 dp`() {
        assertThat(ReelScrubGeometry.HIT_HEIGHT_DP).isEqualTo(44f)
    }

    private fun gate() = ReelAutostartGate(isActive = true, revealCompleted = true)

    @Test
    fun `une page elue revelee et libre joue`() {
        assertThat(gate().shouldPlay).isTrue()
    }

    @Test
    fun `une revelation inachevee retient la lecture`() {
        assertThat(gate().copy(revealCompleted = false).shouldPlay).isFalse()
    }

    @Test
    fun `un appel actif bloque puis la fin de l appel reprend`() {
        val inCall = gate().withCall(true)
        assertThat(inCall.shouldPlay).isFalse()
        assertThat(inCall.withCall(false).shouldPlay).isTrue()
    }

    @Test
    fun `la perte de focus pause et son retour reprend`() {
        val lost = gate().withFocusLost(true)
        assertThat(lost.shouldPlay).isFalse()
        assertThat(lost.withFocusLost(false).shouldPlay).isTrue()
    }

    @Test
    fun `la pause de l utilisateur survit au retour du focus`() {
        val paused = gate().withUserPaused(true).withFocusLost(true).withFocusLost(false)
        assertThat(paused.shouldPlay).isFalse()
    }

    @Test
    fun `une page non elue ne joue pas`() {
        assertThat(gate().copy(isActive = false).shouldPlay).isFalse()
    }

    @Test
    fun `le poster passe par le shimmer puis le poster puis la video`() {
        assertThat(ReelPosterPhase.of(hasPoster = true, posterLoaded = false, firstFrameShown = false)).isEqualTo(ReelPosterPhase.SHIMMER)
        assertThat(ReelPosterPhase.of(true, true, false)).isEqualTo(ReelPosterPhase.POSTER)
        assertThat(ReelPosterPhase.of(true, true, true)).isEqualTo(ReelPosterPhase.VIDEO)
        assertThat(ReelPosterPhase.of(false, false, false)).isEqualTo(ReelPosterPhase.SHIMMER)
        assertThat(ReelPosterPhase.of(false, false, true)).isEqualTo(ReelPosterPhase.VIDEO)
    }
}
