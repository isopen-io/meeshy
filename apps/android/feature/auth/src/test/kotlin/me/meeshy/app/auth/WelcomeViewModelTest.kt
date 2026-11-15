package me.meeshy.app.auth

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.auth.InMemoryWelcomeStore
import me.meeshy.sdk.auth.LoginHandoffs
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class WelcomeViewModelTest {
    @Before fun setUp() = Dispatchers.setMain(UnconfinedTestDispatcher())

    @After fun tearDown() = Dispatchers.resetMain()

    private class Rig {
        val store = InMemoryWelcomeStore()
        val handoffs = LoginHandoffs()
        val vm = WelcomeViewModel(store, handoffs)
    }

    private suspend fun Rig.settled() = store.isSettled.first()

    @Test
    fun `se connecter solde l'accueil`() = runTest {
        val rig = Rig()
        rig.vm.onEvent(WelcomeUiEvent.SignInTapped)
        assertThat(rig.settled()).isTrue()
    }

    @Test
    fun `une inscription reussie solde l'accueil et referme le formulaire`() = runTest {
        val rig = Rig()
        rig.vm.onEvent(WelcomeUiEvent.CreateAccountTapped)
        rig.vm.onEvent(WelcomeUiEvent.AccountCreated)
        assertThat(rig.settled()).isTrue()
        assertThat(rig.vm.state.value.isSigningUp).isFalse()
    }

    @Test
    fun `fermer l'inscription sans compte ne solde pas l'accueil`() = runTest {
        val rig = Rig()
        val job = backgroundScope.launch(Dispatchers.Unconfined) { rig.vm.state.collect {} }
        rig.vm.onEvent(WelcomeUiEvent.CreateAccountTapped)
        assertThat(rig.vm.state.value.isSigningUp).isTrue()
        rig.vm.onEvent(WelcomeUiEvent.SignupClosed)
        assertThat(rig.vm.state.value.isSigningUp).isFalse()
        assertThat(rig.settled()).isFalse()
        job.cancel()
    }

    @Test
    fun `basculer vers la connexion solde l'accueil et transmet l'e-mail tape`() = runTest {
        val rig = Rig()
        rig.vm.onEvent(WelcomeUiEvent.SwitchToLogin("ana@example.com"))
        assertThat(rig.settled()).isTrue()
        assertThat(rig.handoffs.signupEmail.take()).isEqualTo("ana@example.com")
        assertThat(rig.handoffs.signupEmail.take()).isNull()
    }
}
