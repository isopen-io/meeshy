package me.meeshy.app.auth

import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.auth.AuthRepository
import me.meeshy.sdk.net.NetworkResult
import org.junit.After
import org.junit.Before
import org.junit.Test

/** Un lien magique déjà en route ne repart pas sur un second « Go » ni un second renvoi. */
@OptIn(ExperimentalCoroutinesApi::class)
class MagicLinkViewModelSendTest {

    private val dispatcher = StandardTestDispatcher()

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun `a resend pressed twice before the server answers sends one request`() = runTest(dispatcher) {
        val repository = mockk<AuthRepository>()
        coEvery { repository.requestMagicLink(any()) } returns NetworkResult.Success(60)
        val vm = MagicLinkViewModel(repository)
        vm.setEmail("ada@example.com")
        vm.send()
        runCurrent()

        vm.send()
        vm.send()
        runCurrent()

        coVerify(exactly = 2) { repository.requestMagicLink("ada@example.com") }
    }
}
