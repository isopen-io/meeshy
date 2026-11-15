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

    @Test
    fun `a minted cid is exactly the gateway cid shape`() {
        val cid = OutboxIds.cid()

        assertThat(cid).matches("^cid_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")
        assertThat(OutboxIds.isValidCid(cid)).isTrue()
    }

    @Test
    fun `a minted cmid is exactly the gateway cmid shape`() {
        val cmid = OutboxIds.cmid()

        assertThat(cmid).matches("^cmid_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
        assertThat(OutboxIds.isValidCmid(cmid)).isTrue()
    }

    @Test
    fun `isValidCid refuses anything but a lowercase v4 cid`() {
        assertThat(OutboxIds.isValidCid("cid_550e8400-e29b-41d4-a716-446655440000")).isTrue()
        assertThat(OutboxIds.isValidCid("cid_550E8400-E29B-41D4-A716-446655440000")).isFalse()
        assertThat(OutboxIds.isValidCid("cid_550e8400-e29b-11d4-a716-446655440000")).isFalse()
        assertThat(OutboxIds.isValidCid("cmid_550e8400-e29b-41d4-a716-446655440000")).isFalse()
        assertThat(OutboxIds.isValidCid("507f1f77bcf86cd799439011")).isFalse()
        assertThat(OutboxIds.isValidCid("")).isFalse()
        assertThat(OutboxIds.isValidCid(null)).isFalse()
    }

    @Test
    fun `isValidCmid refuses anything but a lowercase cmid`() {
        assertThat(OutboxIds.isValidCmid("cmid_550e8400-e29b-41d4-a716-446655440000")).isTrue()
        assertThat(OutboxIds.isValidCmid("cmid_550E8400-E29B-41D4-A716-446655440000")).isFalse()
        assertThat(OutboxIds.isValidCmid("cmid_1")).isFalse()
        assertThat(OutboxIds.isValidCmid("cid_550e8400-e29b-41d4-a716-446655440000")).isFalse()
        assertThat(OutboxIds.isValidCmid("")).isFalse()
        assertThat(OutboxIds.isValidCmid(null)).isFalse()
    }

    @Test
    fun `a cid and a cmid are local ids, a server object id is not`() {
        assertThat(OutboxIds.isLocalId(OutboxIds.cid())).isTrue()
        assertThat(OutboxIds.isLocalId(OutboxIds.cmid())).isTrue()
        assertThat(OutboxIds.isLocalId("pending_550e8400-e29b-41d4-a716-446655440000")).isTrue()
        assertThat(OutboxIds.isLocalId("507f1f77bcf86cd799439011")).isFalse()
    }
}
