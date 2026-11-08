package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CallErrorDispositionTest {
    private fun resolve(
        code: String? = null,
        errorCallId: String? = "c1",
        currentCallId: String? = "c1",
        transient: Boolean = false,
        accessory: Boolean = false,
        active: Boolean = true,
    ) = CallErrorDisposition.resolve(code, errorCallId, currentCallId, transient, accessory, active)

    @Test
    fun `an error of another call is ignored`() {
        assertThat(resolve(errorCallId = "other")).isEqualTo(CallErrorDisposition.Ignore)
    }

    @Test
    fun `a non fatal relay code is ignored`() {
        listOf("INVALID_SIGNAL", "RATE_LIMIT_EXCEEDED", "TARGET_NOT_FOUND").forEach {
            assertThat(resolve(code = it)).isEqualTo(CallErrorDisposition.Ignore)
        }
    }

    @Test
    fun `CALL_ENDED reconciles to the end of the named call, else the current one`() {
        assertThat(resolve(code = "CALL_ENDED")).isEqualTo(CallErrorDisposition.ReconcileEnd("c1"))
        assertThat(resolve(code = "CALL_ENDED", errorCallId = null)).isEqualTo(CallErrorDisposition.ReconcileEnd("c1"))
        assertThat(resolve(code = "CALL_ENDED", errorCallId = null, currentCallId = null)).isEqualTo(CallErrorDisposition.Ignore)
    }

    @Test
    fun `a refused TURN refresh never hangs the call up`() {
        assertThat(resolve(code = "NOT_A_PARTICIPANT", accessory = true)).isEqualTo(CallErrorDisposition.Ignore)
    }

    @Test
    fun `a transient error during a resume is ignored`() {
        assertThat(resolve(code = "NOT_A_PARTICIPANT", transient = true)).isEqualTo(CallErrorDisposition.Ignore)
    }

    @Test
    fun `any other error is surfaced and ends an active call only`() {
        assertThat(resolve(code = "BUSY")).isEqualTo(CallErrorDisposition.Surface(endsCall = true))
        assertThat(resolve(code = "BUSY", active = false)).isEqualTo(CallErrorDisposition.Surface(endsCall = false))
    }

    @Test
    fun `an error without a call id concerns the current call`() {
        assertThat(resolve(code = "BUSY", errorCallId = null)).isEqualTo(CallErrorDisposition.Surface(endsCall = true))
    }
}
