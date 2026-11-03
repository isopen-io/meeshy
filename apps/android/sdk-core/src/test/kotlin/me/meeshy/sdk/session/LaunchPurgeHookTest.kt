package me.meeshy.sdk.session

import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.net.TokenStore
import org.junit.Test

class LaunchPurgeHookTest {

    private class CountingTeardown : SessionTeardown {
        var wipes = 0
        override suspend fun wipe() {
            wipes++
        }
    }

    private fun hook(signedIn: Boolean, teardown: SessionTeardown): LaunchPurgeHook {
        val tokens = mockk<TokenStore> { every { isAuthenticated } returns signedIn }
        return LaunchPurgeHook(tokens, teardown)
    }

    @Test
    fun `un demarrage deja deconnecte purge l'appareil`() = runTest {
        val teardown = CountingTeardown()

        hook(signedIn = false, teardown).onAppCreate()

        assertThat(teardown.wipes).isEqualTo(1)
    }

    @Test
    fun `un demarrage a froid sur session valide ne purge pas`() = runTest {
        val teardown = CountingTeardown()

        hook(signedIn = true, teardown).onAppCreate()

        assertThat(teardown.wipes).isEqualTo(0)
    }

    @Test
    fun `une session restauree pendant la purge de lancement n'est pas videe`() = runTest {
        val teardown = CountingTeardown()
        val tokens = mockk<TokenStore> { every { isAuthenticated } returnsMany listOf(false, true) }

        LaunchPurgeHook(tokens, teardown).onAppCreate()

        assertThat(teardown.wipes).isEqualTo(0)
    }
}
