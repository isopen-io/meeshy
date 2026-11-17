package me.meeshy.core.e2ee.wire

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * #18971 (ANDX-06), #18972 (AND-09), #18973 (ANDX-07) — une page du rattrapage se décode ENVELOPPE PAR ENVELOPPE : une
 * enveloppe mal formée, ou dont l'émetteur est hors format, est écartée seule (sans accusé), et les autres s'ouvrent.
 */
class E2eeEnvelopePageTest {
    private val alice = "64f0c0ffee0000000000aaaa"

    private fun envelope(id: String, sender: String = "\"$alice\"", device: String = "1") =
        """{"id":"$id","messageId":"m-$id","conversationId":"64f0c0ffee000000000c0001","recipientRegistrationId":7,""" +
            """"senderUserId":$sender,"senderDeviceId":$device,"type":2,"body":"AAAA","createdAt":"2026-11-17T00:00:00.000Z"}"""

    private fun page(vararg envelopes: String, cursor: String = "\"e9\""): E2eeEnvelopePage =
        E2eeEnvelopePage.decodeServed(E2eeJson.parseToJsonElement("""{"envelopes":[${envelopes.joinToString(",")}],"nextCursor":$cursor}"""))

    @Test
    fun aMalformedEnvelope_isSetAsideAlone_andTheOthersAreRead() {
        val decoded = page(envelope("e1"), """{"id":"e2","messageId":"m2"}""", envelope("e3"))

        assertThat(decoded.envelopes.map { it.id }).containsExactly("e1", "e3").inOrder()
        assertThat(decoded.discarded).isEqualTo(1)
        assertThat(decoded.nextCursor).isEqualTo("e9")
    }

    @Test
    fun aSenderOutOfFormat_isSetAside_myIdInCapitalsAndADeviceOutOfBoundsIncluded() {
        val decoded = page(
            envelope("e1"),
            envelope("e2", sender = "\"${alice.uppercase()}\""),
            envelope("e3", device = "128"),
            envelope("e4", device = "0"),
            envelope("e5", device = "\"x\""),
        )

        assertThat(decoded.envelopes.map { it.id }).containsExactly("e1")
        assertThat(decoded.discarded).isEqualTo(4)
    }

    @Test
    fun aPageWhoseEveryEnvelopeIsSetAside_isNotTheEndOfTheCatchUp() {
        val decoded = page(envelope("e1", device = "999"))

        assertThat(decoded.envelopes).isEmpty()
        assertThat(decoded.discarded).isEqualTo(1)
        assertThat(decoded.nextCursor).isEqualTo("e9")
    }

    @Test
    fun theLastPage_hasNoCursor() {
        assertThat(page(cursor = "null").nextCursor).isNull()
    }
}
