package me.meeshy.sdk.model.sync

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class SyncEngineStateTest {
    @Test
    fun `deux declenchements a moins de 3 s sont absorbes`() {
        val state = SyncEngineState().startedAt(10_000L)
        assertThat(state.absorbs(now = 12_999L, catchUp = false)).isTrue()
        assertThat(state.absorbs(now = 13_000L, catchUp = false)).isFalse()
    }

    @Test
    fun `un rattrapage en attente n est pas absorbe par l anti-rafale`() {
        val state = SyncEngineState().startedAt(10_000L)
        assertThat(state.absorbs(now = 10_100L, catchUp = true)).isFalse()
    }

    @Test
    fun `un echec libere l anti-rafale`() {
        val state = SyncEngineState().startedAt(10_000L).failed()
        assertThat(state.absorbs(now = 10_100L, catchUp = false)).isFalse()
    }

    @Test
    fun `le rattrapage demande reste pose jusqu a sa consommation`() {
        val (due, after) = SyncEngineState().requestingReconnectCatchUp().takingReconnectCatchUp()
        assertThat(due).isTrue()
        assertThat(after.reconnectCatchUpPending).isFalse()
    }
}
