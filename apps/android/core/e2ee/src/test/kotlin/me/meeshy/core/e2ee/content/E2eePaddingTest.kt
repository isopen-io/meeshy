package me.meeshy.core.e2ee.content

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** Les paliers de `E2EESignalTests.swift` : une enveloppe Android a la taille d'une enveloppe iOS. */
class E2eePaddingTest {

    @Test
    fun eachPlaintextGrowsToTheFirstTierThatHoldsIt() {
        assertThat(E2eePadding.padded(ByteArray(1)).size).isEqualTo(256)
        assertThat(E2eePadding.padded(ByteArray(256)).size).isEqualTo(256)
        assertThat(E2eePadding.padded(ByteArray(257)).size).isEqualTo(1024)
        assertThat(E2eePadding.padded(ByteArray(3000)).size).isEqualTo(4096)
        assertThat(E2eePadding.padded(ByteArray(5000)).size).isEqualTo(16384)
    }

    @Test
    fun aLongPlaintextStillGrowsToACoarseStep() {
        assertThat(E2eePadding.padded(ByteArray(16385), recipients = 2).size).isEqualTo(32768)
        assertThat(E2eePadding.padded(ByteArray(20000), recipients = 2).size).isEqualTo(32768)
        assertThat(E2eePadding.padded(ByteArray(33000), recipients = 2).size).isEqualTo(49152)
    }

    @Test
    fun theTierIsBoundedByTheEnvelopeBudget() {
        val twoDevices = E2eePadding.ceiling(2)
        assertThat(twoDevices).isEqualTo(63_488)
        assertThat(E2eePadding.padded(ByteArray(50000), recipients = 2).size).isEqualTo(twoDevices)
        assertThat(E2eePadding.ceiling(32)).isEqualTo(16 * 1024 - E2eePadding.CIPHER_OVERHEAD)
        assertThat(E2eePadding.padded(ByteArray(5000), recipients = 32).size).isEqualTo(E2eePadding.ceiling(32))
        assertThat(E2eePadding.padded(ByteArray(70000), recipients = 2).size).isEqualTo(70000)
    }

    @Test
    fun aPaddedMessageStillDecodes_andIsClassedAMessage() {
        val content = E2eeContent.compose("court", "fr", null, "c1", "cid", 1L)
        val padded = E2eePadding.padded(content.encoded())
        assertThat(padded.size).isEqualTo(256)
        assertThat(E2eeContent.decoded(padded)).isEqualTo(content)
        assertThat(E2eePayloadKind.of(padded)).isEqualTo(E2eePayloadKind.MESSAGE)
    }

    @Test
    fun aSignal_isRecognisedByItsSKey_evenPadded() {
        val signal = """{"authorDeviceId":1,"authorUserId":"alice","conversationId":"c1","kind":"typing","active":true,"s":1,"sentAt":1}"""
        assertThat(E2eePayloadKind.of(E2eePadding.padded(signal.toByteArray()))).isEqualTo(E2eePayloadKind.SIGNAL)
        assertThat(E2eePayloadKind.of("not json".toByteArray())).isEqualTo(E2eePayloadKind.MESSAGE)
    }
}
