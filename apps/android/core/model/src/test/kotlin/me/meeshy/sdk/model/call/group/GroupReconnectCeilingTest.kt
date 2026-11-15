package me.meeshy.sdk.model.call.group

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class GroupReconnectCeilingTest {

    @Test
    fun `a group call that loses its link leaves instead of ending the call for everyone`() {
        assertThat(GroupReconnectCeiling.teardownSignal(isGroupCall = true)).isEqualTo(CallTeardownSignal.Leave)
    }

    @Test
    fun `a direct call keeps ending at the ceiling`() {
        assertThat(GroupReconnectCeiling.teardownSignal(isGroupCall = false)).isEqualTo(CallTeardownSignal.End)
    }
}
