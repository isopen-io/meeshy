package me.meeshy.sdk.model.sync

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class SyncCheckpointTest {

    @Test
    fun `un point de reprise neuf n a aucune horloge`() {
        assertThat(SyncCheckpoint.EMPTY).isEqualTo(SyncCheckpoint(null, null, null))
    }

    @Test
    fun `une synchro sans elagage ni reconciliation n avance que lastSync`() {
        val before = SyncCheckpoint(lastSync = 1, lastCleanup = 2, lastFullReconcile = 3)
        assertThat(before.advanced(now = 10, pruned = false, fullReconcile = false))
            .isEqualTo(SyncCheckpoint(10, 2, 3))
    }

    @Test
    fun `un balayage complet avec elagage avance les trois horloges`() {
        assertThat(SyncCheckpoint.EMPTY.advanced(now = 10, pruned = true, fullReconcile = true))
            .isEqualTo(SyncCheckpoint(10, 10, 10))
    }

    @Test
    fun `le rattrapage de reconnexion ne se consomme qu une fois`() {
        val (due, after) = SyncEngineState(reconnectCatchUpPending = true).takingReconnectCatchUp()
        assertThat(due).isTrue()
        assertThat(after.takingReconnectCatchUp().first).isFalse()
    }
}
