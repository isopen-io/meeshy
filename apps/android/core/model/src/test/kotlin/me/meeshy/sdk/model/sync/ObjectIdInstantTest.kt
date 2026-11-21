package me.meeshy.sdk.model.sync

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ObjectIdInstantTest {

    @Test
    fun `an ObjectId proves the second its gateway created it`() {
        assertThat(ObjectIdInstant.isoOrNull("6ae6ff90a1b2c3d4e5f60718")).isEqualTo("2026-11-01T09:00:00Z")
        assertThat(ObjectIdInstant.epochMillisOrNull("6AE6FF90A1B2C3D4E5F60718")).isEqualTo(1_793_523_600_000L)
    }

    @Test
    fun `what is not an ObjectId proves no instant`() {
        listOf("m1", "cid_1778000000000_ab", "", "6ae6ff90a1b2c3d4e5f6071", "6ae6ff90a1b2c3d4e5f607189", "zzzzzzzzzzzzzzzzzzzzzzzz")
            .forEach { assertThat(ObjectIdInstant.epochMillisOrNull(it)).isNull() }
    }
}
