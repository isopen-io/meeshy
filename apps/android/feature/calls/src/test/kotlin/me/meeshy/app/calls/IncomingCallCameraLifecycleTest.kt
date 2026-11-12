package me.meeshy.app.calls

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.LifecycleRegistry
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.google.common.truth.Truth.assertThat
import io.mockk.mockk
import me.meeshy.sdk.model.call.CallState
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * P17.4 et P17.5 : ma caméra d'avant le décroché ne tourne que si l'écran entrant est VU. L'écran passe en arrière-plan
 * pendant la sonnerie ⇒ elle s'éteint (aucune capture invisible, Android coupe de toute façon la caméra d'une app de
 * fond) ; il revient ⇒ elle se rallume, si Caméra est toujours choisie.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w360dp-h740dp")
class IncomingCallCameraLifecycleTest {
    @get:Rule val rule = createComposeRule()

    private class ScreenOwner : LifecycleOwner {
        val registry = LifecycleRegistry(this)
        override val lifecycle: Lifecycle get() = registry
    }

    private val incoming = CallConfig(peerId = "u1", peerName = "Awa", isVideo = true, isOutgoing = false, callId = "c1")

    private fun incomingScreen(owner: ScreenOwner, chosen: MutableList<Boolean>) = rule.setContent {
        CompositionLocalProvider(LocalLifecycleOwner provides owner) {
            MeeshyTheme {
                IncomingCallScreen(
                    state = CallPresenter.present(CallState.Ringing(false), incoming, CallMedia()),
                    peer = CallPeerVisual.EMPTY,
                    reduceMotion = true,
                    onAccept = {},
                    onDecline = {},
                    preAnswer = IncomingPreAnswerHost(
                        selfTrack = null,
                        eglContext = mockk(relaxed = true),
                        selfUserId = "me",
                        onCameraChosen = { chosen += it },
                        onAnswerMuted = {},
                    ),
                )
            }
        }
    }

    @Test
    fun `ma camera d'apercu s'eteint quand l'ecran passe en arriere-plan et se rallume a son retour`() {
        val owner = ScreenOwner().apply { registry.currentState = Lifecycle.State.RESUMED }
        val chosen = mutableListOf<Boolean>()
        incomingScreen(owner, chosen)
        rule.runOnIdle { assertThat(chosen).containsExactly(true) }

        rule.runOnIdle { owner.registry.currentState = Lifecycle.State.CREATED }
        rule.runOnIdle { assertThat(chosen).containsExactly(true, false).inOrder() }

        rule.runOnIdle { owner.registry.currentState = Lifecycle.State.RESUMED }
        rule.runOnIdle { assertThat(chosen).containsExactly(true, false, true).inOrder() }
    }
}
