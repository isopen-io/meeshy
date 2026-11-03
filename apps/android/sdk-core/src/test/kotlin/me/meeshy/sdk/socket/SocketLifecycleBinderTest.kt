package me.meeshy.sdk.socket

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.call.CallActivityGate
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class SocketLifecycleBinderTest {

    private class FakeTarget : SocketLifecycleTarget {
        override var isConnected = true
        val calls = mutableListOf<String>()
        override fun suspendForBackground() { calls += "suspend" }
        override fun resumeFromBackground() { calls += "resume" }
        override fun reconnectAfterNetworkRestored() { calls += "reconnectNow" }
        override fun replanReconnect() { calls += "replan" }
    }

    private class Rig(scope: TestScope) {
        val target = FakeTarget()
        val gate = CallActivityGate()
        val binder = SocketLifecycleBinder(target, ActiveCallGuard(gate), scope.backgroundScope, 5_000L)
    }

    @Test
    fun `ON_STOP suspend la socket apres le court delai`() = runTest {
        val rig = Rig(this)

        rig.binder.onProcessStop()
        advanceTimeBy(4_999)
        assertThat(rig.target.calls).isEmpty()
        advanceTimeBy(2)
        assertThat(rig.target.calls).containsExactly("suspend")
    }

    @Test
    fun `un retour au premier plan dans le delai annule la suspension`() = runTest {
        val rig = Rig(this)

        rig.binder.onProcessStop()
        advanceTimeBy(2_000)
        rig.binder.onProcessStart()
        advanceTimeBy(10_000)

        assertThat(rig.target.calls).containsExactly("resume")
    }

    @Test
    fun `ON_START rouvre aussitot apres une suspension`() = runTest {
        val rig = Rig(this)
        rig.binder.onProcessStop()
        advanceTimeBy(6_000)

        rig.binder.onProcessStart()

        assertThat(rig.target.calls).containsExactly("suspend", "resume").inOrder()
    }

    @Test
    fun `pendant un appel la socket n'est jamais suspendue`() = runTest {
        val rig = Rig(this)
        rig.gate.setActive(true)

        rig.binder.onProcessStop()
        advanceTimeBy(10_000)

        assertThat(rig.target.calls).isEmpty()
    }

    @Test
    fun `pendant un appel le premier plan ne recree pas une socket vivante`() = runTest {
        val rig = Rig(this)
        rig.gate.setActive(true)

        rig.binder.onProcessStart()

        assertThat(rig.target.calls).isEmpty()
    }

    @Test
    fun `pendant un appel une socket deja tombee replanifie l'echelle`() = runTest {
        val rig = Rig(this)
        rig.target.isConnected = false
        rig.gate.setActive(true)

        rig.binder.onProcessStart()

        assertThat(rig.target.calls).containsExactly("replan")
    }

    @Test
    fun `le retour du reseau relance une socket coupee`() = runTest {
        val rig = Rig(this)
        val online = MutableStateFlow(true)
        rig.binder.bindNetwork(online)
        rig.target.isConnected = false
        advanceTimeBy(1)

        online.value = false
        advanceTimeBy(1)
        online.value = true
        advanceTimeBy(1)

        assertThat(rig.target.calls).containsExactly("reconnectNow")
    }

    @Test
    fun `le retour du reseau ne touche pas une socket vivante ni la premiere lecture`() = runTest {
        val rig = Rig(this)
        val online = MutableStateFlow(false)
        rig.binder.bindNetwork(online)
        advanceTimeBy(1)

        online.value = true
        advanceTimeBy(1)

        assertThat(rig.target.calls).isEmpty()
    }

    @Test
    fun `en arriere-plan hors appel le retour du reseau ne rouvre rien`() = runTest {
        val rig = Rig(this)
        val online = MutableStateFlow(false)
        rig.binder.bindNetwork(online)
        rig.target.isConnected = false
        rig.binder.onProcessStop()
        advanceTimeBy(6_000)

        online.value = true
        advanceTimeBy(1)

        assertThat(rig.target.calls).containsExactly("suspend")
    }
}
