package me.meeshy.sdk.outbox

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class OutboxIdsTest {

    @Test
    fun `a freshly minted cmid is recognised as a cmid`() {
        assertThat(OutboxIds.isCmid(OutboxIds.cmid())).isTrue()
    }

    @Test
    fun `a client message id is not a cmid`() {
        assertThat(OutboxIds.isCmid(OutboxIds.cid())).isFalse()
    }

    @Test
    fun `a server-style object id is not a cmid`() {
        assertThat(OutboxIds.isCmid("507f1f77bcf86cd799439011")).isFalse()
    }

    @Test
    fun `an empty id is not a cmid`() {
        assertThat(OutboxIds.isCmid("")).isFalse()
    }
}
