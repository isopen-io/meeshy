package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class SendAttemptTest {

    @Test
    fun `la premiere tentative est ordinale puis les suivantes sont numerotees`() {
        assertThat(SendAttemptOrdinal.of(1)).isEqualTo(SendAttemptOrdinal.First)
        assertThat(SendAttemptOrdinal.of(2)).isEqualTo(SendAttemptOrdinal.Nth(2))
        assertThat(SendAttemptOrdinal.of(7)).isEqualTo(SendAttemptOrdinal.Nth(7))
    }

    @Test
    fun `un numero invalide se lit comme la premiere tentative`() {
        assertThat(SendAttemptOrdinal.of(0)).isEqualTo(SendAttemptOrdinal.First)
    }

    @Test
    fun `le compte transmis au pluriel n est jamais negatif`() {
        assertThat(SendAttemptCount.quantity(3)).isEqualTo(3)
        assertThat(SendAttemptCount.quantity(-2)).isEqualTo(0)
    }

    @Test
    fun `les mots ecrits en base sont ceux d iOS`() {
        assertThat(SendTransport.entries.map { it.wire })
            .containsExactly("socket-first", "rest", "socket-fallback", "outbox").inOrder()
        assertThat(SendOutcome.entries.map { it.wire }).containsExactly("success", "failure").inOrder()
    }

    @Test
    fun `un transport inconnu se lit null sans planter`() {
        assertThat(SendTransport.fromWire("rest")).isEqualTo(SendTransport.REST)
        assertThat(SendTransport.fromWire("carrier-pigeon")).isNull()
        assertThat(SendTransport.fromWire(null)).isNull()
    }

    @Test
    fun `seule l issue success est un succes`() {
        fun attempt(outcome: String) = SendAttempt("c1", 1, "rest", 10, 20, outcome, null)
        assertThat(attempt("success").isSuccess).isTrue()
        assertThat(attempt("failure").isSuccess).isFalse()
        assertThat(attempt("whatever").isSuccess).isFalse()
    }
}
