package me.meeshy.sdk.game

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import org.junit.Test

class GameMomentPresenceTest {

    @Test
    fun `nothing occupies the screen until the host publishes it`() {
        assertThat(GameMomentPresence().isPresented.value).isFalse()
    }

    @Test
    fun `the host publishes the celebration and withdraws it`() = runTest {
        val presence = GameMomentPresence()

        presence.isPresented.test {
            assertThat(awaitItem()).isFalse()
            presence.update(true)
            assertThat(awaitItem()).isTrue()
            presence.update(false)
            assertThat(awaitItem()).isFalse()
        }
    }

    @Test
    fun `publishing the same value twice emits nothing new`() = runTest {
        val presence = GameMomentPresence()

        presence.isPresented.test {
            assertThat(awaitItem()).isFalse()
            presence.update(false)
            presence.update(true)
            assertThat(awaitItem()).isTrue()
            presence.update(true)
            expectNoEvents()
        }
    }
}
