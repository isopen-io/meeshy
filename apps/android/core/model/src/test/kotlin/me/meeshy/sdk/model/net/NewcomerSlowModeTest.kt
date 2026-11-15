package me.meeshy.sdk.model.net

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class NewcomerSlowModeTest {

    private fun refusal(header: String? = null, envelope: Double? = null, status: Int = 429, code: String? = NewcomerSlowMode.CODE) =
        NewcomerSlowMode.from(status, code, header, envelope)

    @Test
    fun `l'en-tete Retry-After fait foi sur l'enveloppe`() {
        assertThat(refusal(header = "12", envelope = 30.0)?.retryAfterSeconds).isEqualTo(12)
    }

    @Test
    fun `sans en-tete l'enveloppe donne le delai, arrondi au-dessus`() {
        assertThat(refusal(envelope = 29.2)?.retryAfterSeconds).isEqualTo(30)
    }

    @Test
    fun `jamais moins d'une seconde`() {
        assertThat(refusal(header = "0")?.retryAfterSeconds).isEqualTo(1)
        assertThat(refusal(header = "-4")?.retryAfterSeconds).isEqualTo(1)
        assertThat(refusal(envelope = 0.2)?.retryAfterSeconds).isEqualTo(1)
        assertThat(refusal()?.retryAfterSeconds).isEqualTo(1)
    }

    @Test
    fun `une date HTTP ou un delai infini tombent sur l'enveloppe puis sur une seconde`() {
        assertThat(refusal(header = "Wed, 21 Oct 2026 07:28:00 GMT", envelope = 8.0)?.retryAfterSeconds).isEqualTo(8)
        assertThat(refusal(envelope = Double.POSITIVE_INFINITY)?.retryAfterSeconds).isEqualTo(1)
    }

    @Test
    fun `le delai est borne a un jour`() {
        assertThat(refusal(header = "999999")?.retryAfterSeconds).isEqualTo(86_400)
    }

    @Test
    fun `un autre code ou un autre statut n'est pas le mode lent`() {
        assertThat(refusal(code = "RATE_LIMITED")).isNull()
        assertThat(refusal(code = null)).isNull()
        assertThat(refusal(status = 400)).isNull()
    }

    @Test
    fun `le mode lent ne se rejoue jamais en silence`() {
        assertThat(RetryDecision.NEVER_REPLAYED_429_CODES).contains(NewcomerSlowMode.CODE)
    }
}
