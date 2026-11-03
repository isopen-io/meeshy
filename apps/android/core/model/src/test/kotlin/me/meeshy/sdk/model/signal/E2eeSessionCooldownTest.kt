package me.meeshy.sdk.model.signal

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class E2eeSessionCooldownTest {
    private val failedAt = 1_000_000L

    private fun within(elapsedMillis: Long, failed: Long? = failedAt) =
        E2eeSessionCooldown.isWithinFailureCooldown(failed, failedAt + elapsedMillis)

    @Test
    fun `sans echec connu le pair n'est jamais en attente`() {
        assertThat(within(0, failed = null)).isFalse()
    }

    @Test
    fun `599 secondes apres l'echec l'etablissement est encore refuse`() {
        assertThat(within(599_000)).isTrue()
    }

    @Test
    fun `600 secondes apres l'echec l'etablissement est retente`() {
        assertThat(within(600_000)).isFalse()
    }

    @Test
    fun `a l'instant de l'echec le pair est en attente`() {
        assertThat(within(0)).isTrue()
    }
}
