package me.meeshy.sdk.outbox

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class OutboxDependenciesTest {

    @Test
    fun `a gone prerequisite is satisfied`() {
        assertThat(OutboxDependencies.verdict(null)).isEqualTo(DependencyVerdict.SATISFIED)
    }

    @Test
    fun `a pending prerequisite blocks the dependent`() {
        assertThat(OutboxDependencies.verdict(OutboxState.PENDING))
            .isEqualTo(DependencyVerdict.BLOCKED)
    }

    @Test
    fun `an inflight prerequisite blocks the dependent`() {
        assertThat(OutboxDependencies.verdict(OutboxState.INFLIGHT))
            .isEqualTo(DependencyVerdict.BLOCKED)
    }

    @Test
    fun `an exhausted prerequisite fails the dependent`() {
        assertThat(OutboxDependencies.verdict(OutboxState.EXHAUSTED))
            .isEqualTo(DependencyVerdict.FAILED)
    }

    @Test
    fun `no prerequisites is satisfied`() {
        assertThat(OutboxDependencies.verdictAll(emptyList())).isEqualTo(DependencyVerdict.SATISFIED)
    }

    @Test
    fun `all-gone prerequisites are satisfied`() {
        assertThat(OutboxDependencies.verdictAll(listOf(null, null)))
            .isEqualTo(DependencyVerdict.SATISFIED)
    }

    @Test
    fun `a single still-queued prerequisite blocks the whole set`() {
        assertThat(OutboxDependencies.verdictAll(listOf(null, OutboxState.PENDING)))
            .isEqualTo(DependencyVerdict.BLOCKED)
    }

    @Test
    fun `an exhausted prerequisite fails the set even while another is still pending`() {
        assertThat(OutboxDependencies.verdictAll(listOf(OutboxState.PENDING, OutboxState.EXHAUSTED)))
            .isEqualTo(DependencyVerdict.FAILED)
    }

    @Test
    fun `every prerequisite gone or satisfied leaves the set satisfied`() {
        assertThat(OutboxDependencies.verdictAll(listOf(null)))
            .isEqualTo(DependencyVerdict.SATISFIED)
    }
}
