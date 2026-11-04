package me.meeshy.sdk.model.conversationlist

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ObsoleteRefusalTest {

    @Test
    fun `a 403 on a direct the law opened is the sender of a request not yet accepted`() {
        assertThat(ObsoleteRefusal.of(isDirect = true, httpStatus = 403)).isEqualTo(ObsoleteRefusal.PENDING_REQUEST)
    }

    @Test
    fun `a 403 on a group is never read as a message request`() {
        assertThat(ObsoleteRefusal.of(isDirect = false, httpStatus = 403)).isEqualTo(ObsoleteRefusal.OTHER)
    }

    @Test
    fun `a direct refused for another reason says the generic failure`() {
        assertThat(ObsoleteRefusal.of(isDirect = true, httpStatus = 500)).isEqualTo(ObsoleteRefusal.OTHER)
        assertThat(ObsoleteRefusal.of(isDirect = true, httpStatus = null)).isEqualTo(ObsoleteRefusal.OTHER)
    }
}
