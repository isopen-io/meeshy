package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CallFreshnessTest {
    @Test
    fun `un appel fini ne sonne pas`() {
        listOf("ended", "MISSED", "rejected", "failed", "cancelled").forEach {
            assertThat(CallFreshness.of(it)).isEqualTo(CallFreshness.Finished)
        }
    }

    @Test
    fun `un appel actif ou un statut inconnu ou absent sonne`() {
        listOf("initiated", "ringing", "active", "inconnu", null).forEach {
            assertThat(CallFreshness.of(it)).isEqualTo(CallFreshness.Live)
        }
    }
}
