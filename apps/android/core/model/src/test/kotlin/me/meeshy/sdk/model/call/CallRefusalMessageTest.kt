package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CallRefusalMessageTest {
    @Test
    fun `le code de refus des non contacts a son motif`() {
        assertThat(CallRefusalMessage.reasonForCode("CALLEE_REFUSES_NON_CONTACTS"))
            .isEqualTo(CallRefusalReason.CALLEE_REFUSES_NON_CONTACTS)
    }

    @Test
    fun `tout autre code ou absence de code n a pas de motif`() {
        assertThat(CallRefusalMessage.reasonForCode("CALL_NOT_ALLOWED")).isNull()
        assertThat(CallRefusalMessage.reasonForCode(null)).isNull()
    }
}
