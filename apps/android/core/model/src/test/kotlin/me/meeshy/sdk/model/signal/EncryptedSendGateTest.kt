package me.meeshy.sdk.model.signal

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** La loi fail-closed : un échec Signal ne laisse JAMAIS une conversation chiffrée partir en clair. */
class EncryptedSendGateTest {

    @Test
    fun `no Signal failure ever lets an encrypted conversation proceed`() {
        SignalFailure.entries.forEach { failure ->
            val decision = EncryptedSendGate.afterSignalFailure(conversationEncrypted = true, failure = failure)

            assertThat(decision).isEqualTo(EncryptedSendDecision.Blocked(failure))
        }
    }

    @Test
    fun `a clear conversation is not held up by a Signal failure`() {
        SignalFailure.entries.forEach { failure ->
            val decision = EncryptedSendGate.afterSignalFailure(conversationEncrypted = false, failure = failure)

            assertThat(decision).isEqualTo(EncryptedSendDecision.Proceed)
        }
    }

    @Test
    fun `the gateway refusal to fake a session is a server unavailability`() {
        assertThat(SignalFailure.from(503, "E2EE_UNAVAILABLE")).isEqualTo(SignalFailure.SERVER_UNAVAILABLE)
        assertThat(SignalFailure.from(503, null)).isEqualTo(SignalFailure.SERVER_UNAVAILABLE)
        assertThat(SignalFailure.from(null, "E2EE_UNAVAILABLE")).isEqualTo(SignalFailure.SERVER_UNAVAILABLE)
    }

    @Test
    fun `each documented refusal maps to its own cause`() {
        assertThat(SignalFailure.from(404, null)).isEqualTo(SignalFailure.KEYS_NOT_PUBLISHED)
        assertThat(SignalFailure.from(403, null)).isEqualTo(SignalFailure.NOT_AUTHORIZED)
        assertThat(SignalFailure.from(429, null)).isEqualTo(SignalFailure.RATE_LIMITED)
        assertThat(SignalFailure.from(null, "NETWORK")).isEqualTo(SignalFailure.TRANSPORT)
    }

    @Test
    fun `an unrecognised refusal is unknown and still blocks an encrypted conversation`() {
        val failure = SignalFailure.from(500, null)

        assertThat(failure).isEqualTo(SignalFailure.UNKNOWN)
        assertThat(SignalFailure.from(null, "PARSE")).isEqualTo(SignalFailure.UNKNOWN)
        assertThat(EncryptedSendGate.afterSignalFailure(true, failure))
            .isEqualTo(EncryptedSendDecision.Blocked(SignalFailure.UNKNOWN))
    }
}
