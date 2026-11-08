package me.meeshy.app.auth

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class SessionRefusalViewModelTest {
    @Before fun setUp() = Dispatchers.setMain(UnconfinedTestDispatcher())

    @After fun tearDown() = Dispatchers.resetMain()

    private class Rig(accountSession: Boolean = true) {
        val closed = MutableStateFlow(false)
        val age = MutableStateFlow(false)
        var closedAcks = 0
        var ageAcks = 0
        val vm = SessionRefusalViewModel(closed, age, { closedAcks++; closed.value = false }, { ageAcks++; age.value = false }, { accountSession })
    }

    @Test
    fun `aucun ecran tant qu aucun refus n est signale`() = runTest {
        val rig = Rig()
        assertThat(rig.vm.screen.value).isNull()
    }

    @Test
    fun `le compte supprime leve l ecran session fermee et son acquittement le retire`() = runTest {
        val rig = Rig()
        val job = backgroundScope.launch(Dispatchers.Unconfined) { rig.vm.screen.collect {} }
        rig.closed.value = true
        assertThat(rig.vm.screen.value).isEqualTo(SessionRefusalScreen.SESSION_CLOSED)
        rig.vm.acknowledgeClosed()
        assertThat(rig.vm.screen.value).isNull()
    }

    @Test
    fun `la session fermee prime sur le refus d age`() = runTest {
        val rig = Rig()
        val job = backgroundScope.launch(Dispatchers.Unconfined) { rig.vm.screen.collect {} }
        rig.age.value = true
        rig.closed.value = true
        assertThat(rig.vm.screen.value).isEqualTo(SessionRefusalScreen.SESSION_CLOSED)
    }

    @Test
    fun `l acquittement du refus d age ferme la session de compte encore ouverte`() = runTest {
        val rig = Rig(accountSession = true)
        rig.age.value = true
        assertThat(rig.vm.acknowledgeAge()).isTrue()
        assertThat(rig.ageAcks).isEqualTo(1)
    }

    @Test
    fun `l acquittement du refus d age sans session ne ferme rien`() = runTest {
        val rig = Rig(accountSession = false)
        assertThat(rig.vm.acknowledgeAge()).isFalse()
    }
}
