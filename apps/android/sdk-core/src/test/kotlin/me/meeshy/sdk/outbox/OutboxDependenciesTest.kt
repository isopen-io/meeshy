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
}
