package me.meeshy.ui.component.video

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.playback.PipAspect
import org.junit.Test

class VideoPictureInPictureCoordinatorTest {
    private val entries = mutableListOf<PipAspect>()
    private var videoCall = false

    private fun coordinator(supports: Boolean = true, accepts: Boolean = true) = VideoPictureInPictureCoordinator(
        deviceSupportsPip = supports,
        videoCallInProgress = { videoCall },
        enter = { aspect -> entries += aspect; accepts },
    )

    private class Surface(override var isPlaying: Boolean = true, override var aspect: PipAspect = PipAspect(16, 9)) :
        VideoPictureInPictureSurface

    @Test
    fun `quitter l'app pendant la lecture d'une surface inscrite ouvre la fenetre au rapport de la video`() {
        val pip = coordinator()
        pip.register(Surface(aspect = PipAspect(720, 1280)))

        assertThat(pip.onUserLeaveHint()).isTrue()
        assertThat(entries).containsExactly(PipAspect(720, 1280))
    }

    @Test
    fun `sans surface inscrite, surface en pause ou retiree, quitter l'app n'ouvre rien`() {
        val empty = coordinator()
        assertThat(empty.onUserLeaveHint()).isFalse()

        val paused = coordinator().apply { register(Surface(isPlaying = false)) }
        assertThat(paused.onUserLeaveHint()).isFalse()

        val removed = coordinator()
        val unregister = removed.register(Surface())
        unregister()
        assertThat(removed.onUserLeaveHint()).isFalse()
        assertThat(entries).isEmpty()
    }

    @Test
    fun `la derniere surface inscrite est celle qui part en fenetre, la precedente reprend a son retrait`() {
        val pip = coordinator()
        pip.register(Surface(aspect = PipAspect(9, 16)))
        val top = pip.register(Surface(aspect = PipAspect(16, 9)))

        pip.requestEnter()
        top()
        pip.requestEnter()

        assertThat(entries).containsExactly(PipAspect(16, 9), PipAspect(9, 16)).inOrder()
    }

    @Test
    fun `un appel video en cours garde la fenetre - ni depart ni bouton ne l'ouvrent`() {
        val pip = coordinator().apply { register(Surface()) }
        videoCall = true

        assertThat(pip.offersButton()).isFalse()
        assertThat(pip.onUserLeaveHint()).isFalse()
        assertThat(pip.requestEnter()).isFalse()
        assertThat(entries).isEmpty()
    }

    @Test
    fun `le bouton ouvre la fenetre meme en pause, jamais sur un appareil sans PiP`() {
        val pip = coordinator().apply { register(Surface(isPlaying = false)) }
        assertThat(pip.offersButton()).isTrue()
        assertThat(pip.requestEnter()).isTrue()

        val unsupported = coordinator(supports = false).apply { register(Surface()) }
        assertThat(unsupported.offersButton()).isFalse()
        assertThat(unsupported.requestEnter()).isFalse()
        assertThat(entries).hasSize(1)
    }

    @Test
    fun `une activite lancee par l'app elle-meme n'ouvre pas la fenetre, le depart suivant si`() {
        val pip = coordinator().apply { register(Surface()) }

        pip.holdForInAppLaunch()
        assertThat(pip.onUserLeaveHint()).isFalse()
        assertThat(pip.onUserLeaveHint()).isTrue()

        pip.holdForInAppLaunch()
        pip.onActivityResumed()
        assertThat(pip.onUserLeaveHint()).isTrue()
    }

    @Test
    fun `la fenetre n'est a la video que si c'est elle qui l'a ouverte`() {
        val pip = coordinator().apply { register(Surface()) }

        assertThat(pip.onPictureInPictureModeChanged(true)).isFalse()
        assertThat(pip.inPip.value).isFalse()
        pip.onPictureInPictureModeChanged(false)

        pip.onUserLeaveHint()
        assertThat(pip.onPictureInPictureModeChanged(true)).isTrue()
        assertThat(pip.inPip.value).isTrue()

        assertThat(pip.onPictureInPictureModeChanged(false)).isFalse()
        assertThat(pip.inPip.value).isFalse()
    }

    @Test
    fun `une entree refusee par le systeme ne revendique pas la fenetre suivante`() {
        val pip = coordinator(accepts = false).apply { register(Surface()) }

        assertThat(pip.onUserLeaveHint()).isFalse()
        assertThat(pip.onPictureInPictureModeChanged(true)).isFalse()
    }

    @Test
    fun `fermer la fenetre (activite stoppee) le signale, l'agrandir (activite reprise) non`() {
        val closed = coordinator().apply { register(Surface()) }
        closed.onUserLeaveHint()
        closed.onPictureInPictureModeChanged(true)
        closed.onPictureInPictureModeChanged(false)
        closed.onActivityStopped()
        assertThat(closed.closures.value).isEqualTo(1)

        val expanded = coordinator().apply { register(Surface()) }
        expanded.onUserLeaveHint()
        expanded.onPictureInPictureModeChanged(true)
        expanded.onPictureInPictureModeChanged(false)
        expanded.onActivityResumed()
        expanded.onActivityStopped()
        assertThat(expanded.closures.value).isEqualTo(0)
    }

    @Test
    fun `quitter l'app sans fenetre ouverte ne signale aucune fermeture`() {
        val pip = coordinator().apply { register(Surface(isPlaying = false)) }
        pip.onUserLeaveHint()
        pip.onActivityStopped()

        assertThat(pip.closures.value).isEqualTo(0)
    }
}
