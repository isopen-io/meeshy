package me.meeshy.app.navigation

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.rootnav.RootIntent
import org.junit.Test

class RootIntentRouterHubTest {

    @Test
    fun `un push retenu avant la session est rejoue une seule fois puis efface`() = runTest {
        val router = RootIntentRouter()
        router.holdPush(RootIntent.OpenConversation("c1", "m1"))
        router.intents.test {
            assertThat(router.replayPendingPush(isAuthenticated = false)).isFalse()
            assertThat(router.replayPendingPush(isAuthenticated = true)).isTrue()
            assertThat(awaitItem()).isEqualTo(RootIntent.OpenConversation("c1", "m1"))
            assertThat(router.replayPendingPush(isAuthenticated = true)).isFalse()
            expectNoEvents()
        }
    }

    @Test
    fun `une intention soumise est diffusee telle quelle`() = runTest {
        val router = RootIntentRouter()
        router.intents.test {
            router.submit(RootIntent.OpenStoryComposer)
            assertThat(awaitItem()).isEqualTo(RootIntent.OpenStoryComposer)
        }
    }

    @Test
    fun `le contexte de reponse est consomme a l'arrivee puis remis a nul`() {
        val router = RootIntentRouter()
        router.routeContext.arm(reply = "m1", mode = "en")
        assertThat(router.routeContext.consumeOnArrival()).isEqualTo("m1" to "en")
        assertThat(router.routeContext.consumeOnArrival()).isEqualTo(null to null)
    }
}
