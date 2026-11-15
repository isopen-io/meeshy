package me.meeshy.sdk.sync

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.currentTime
import kotlinx.coroutines.test.runTest
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ReceiptCoalescerTest {

    private class Rig(scope: TestScope, online: Boolean = true, val quota: ReceiptQuota = ReceiptQuota()) {
        var online = online
        val sent = mutableListOf<String>()
        val coalescer = ReceiptCoalescer(
            scope = scope,
            quota = quota,
            isOnline = { this.online },
            nowMillis = { scope.currentTime },
            send = { sent += it },
            windowMillis = 1_000,
        )
    }

    @Test
    fun `une rafale de messages ne part qu'une fois par conversation`() = runTest {
        val rig = Rig(this)
        repeat(5) { rig.coalescer.onIncomingMessage("a") }
        rig.coalescer.onIncomingMessage("b")
        advanceTimeBy(1_001)
        advanceUntilIdle()
        assertThat(rig.sent).containsExactly("a", "b")
    }

    @Test
    fun `un message pendant l'envoi ouvre la fenetre suivante`() = runTest {
        val rig = Rig(this)
        rig.coalescer.onIncomingMessage("a")
        advanceTimeBy(1_001)
        rig.coalescer.onIncomingMessage("a")
        advanceTimeBy(1_001)
        advanceUntilIdle()
        assertThat(rig.sent).containsExactly("a", "a")
    }

    @Test
    fun `hors ligne l'accuse est abandonne sans erreur`() = runTest {
        val rig = Rig(this, online = false)
        rig.coalescer.onIncomingMessage("a")
        advanceTimeBy(1_001)
        advanceUntilIdle()
        assertThat(rig.sent).isEmpty()
    }

    @Test
    fun `le quota de trente requetes par minute est partage et respecte`() = runTest {
        val quota = ReceiptQuota()
        repeat(29) { assertThat(quota.tryAcquire(0)).isTrue() }
        val rig = Rig(this, quota = quota)
        rig.coalescer.onIncomingMessage("a")
        rig.coalescer.onIncomingMessage("b")
        advanceTimeBy(1_001)
        advanceUntilIdle()
        assertThat(rig.sent).hasSize(1)
        advanceTimeBy(60_000)
        assertThat(quota.tryAcquire(currentTime)).isTrue()
    }

    @Test
    fun `cancelAll annule les fenetres armees`() = runTest {
        val rig = Rig(this)
        rig.coalescer.onIncomingMessage("a")
        rig.coalescer.cancelAll()
        advanceTimeBy(2_000)
        advanceUntilIdle()
        assertThat(rig.sent).isEmpty()
    }
}
