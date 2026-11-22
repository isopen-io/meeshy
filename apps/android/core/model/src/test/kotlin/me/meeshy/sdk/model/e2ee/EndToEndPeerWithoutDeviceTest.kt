package me.meeshy.sdk.model.e2ee

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.CreateConversationRequest
import me.meeshy.sdk.model.readableDirectConversationRequest
import org.junit.Test

/**
 * #20076 (jumelle de #20074, iOS) — un tête-à-tête chiffré de bout en bout dont le pair n'a aucun appareil chiffré : le
 * texte part dans le tête-à-tête LISIBLE de la paire, jamais en clair dans le fil chiffré (#12949).
 */
class EndToEndPeerWithoutDeviceTest {

    private val wire = Json { explicitNulls = false }

    @Test
    fun `the readable direct is the opened one only when it is another, readable conversation`() {
        assertThat(ReadableDirectOpening.destination(opened = "c2", from = "c1", openedIsEndToEnd = false)).isEqualTo("c2")
        assertThat(ReadableDirectOpening.destination(opened = "c1", from = "c1", openedIsEndToEnd = false)).isNull()
        assertThat(ReadableDirectOpening.destination(opened = "c2", from = "c1", openedIsEndToEnd = true)).isNull()
        assertThat(ReadableDirectOpening.destination(opened = "", from = "c1", openedIsEndToEnd = false)).isNull()
        assertThat(ReadableDirectOpening.destination(opened = null, from = "c1", openedIsEndToEnd = false)).isNull()
    }

    @Test
    fun `the banner shows in an end-to-end direct whose peer is known without device, and only there`() {
        assertThat(EndToEndPeerWithoutDeviceBannerRule.shows(sealsEndToEnd = true, isDirect = true, peerLacksDevice = true)).isTrue()
        assertThat(EndToEndPeerWithoutDeviceBannerRule.shows(sealsEndToEnd = false, isDirect = true, peerLacksDevice = true)).isFalse()
        assertThat(EndToEndPeerWithoutDeviceBannerRule.shows(sealsEndToEnd = true, isDirect = false, peerLacksDevice = true)).isFalse()
        assertThat(EndToEndPeerWithoutDeviceBannerRule.shows(sealsEndToEnd = true, isDirect = true, peerLacksDevice = false)).isFalse()
    }

    @Test
    fun `a sentence addresses the first word of the shown name`() {
        assertThat(PeerFirstName.of("  Alice Martin ")).isEqualTo("Alice")
        assertThat(PeerFirstName.of("bob")).isEqualTo("bob")
        assertThat(PeerFirstName.of("   ")).isEmpty()
        assertThat(PeerFirstName.of(null)).isEmpty()
    }

    @Test
    fun `the refusal names the peer when it is named, or when nobody is`() {
        assertThat(EndToEndParticipantWithoutDevice.namedFirstName("u2", "Alice Martin", listOf("u2"))).isEqualTo("Alice")
        assertThat(EndToEndParticipantWithoutDevice.namedFirstName("u2", "Alice Martin", emptyList())).isEqualTo("Alice")
        assertThat(EndToEndParticipantWithoutDevice.namedFirstName("u2", "Alice Martin", listOf("u1"))).isEmpty()
        assertThat(EndToEndParticipantWithoutDevice.namedFirstName(null, "Alice", listOf("u1"))).isEmpty()
        assertThat(EndToEndParticipantWithoutDevice.namedFirstName("u2", null, listOf("u2"))).isEmpty()
    }

    @Test
    fun `the refusal is told by its code`() {
        assertThat(EndToEndParticipantWithoutDevice.matches("E2EE_PARTICIPANT_WITHOUT_DEVICE")).isTrue()
        assertThat(EndToEndParticipantWithoutDevice.matches("E2EE_DIRECT_NOT_A_PAIR")).isFalse()
        assertThat(EndToEndParticipantWithoutDevice.matches(null)).isFalse()
    }

    @Test
    fun `the readable direct request asks the gateway for the pair's readable conversation`() {
        val encoded = wire.encodeToString(readableDirectConversationRequest("u2"))

        assertThat(encoded).isEqualTo("""{"type":"direct","participantIds":["u2"],"plaintext":true}""")
    }

    @Test
    fun `an ordinary creation request carries no plaintext key`() {
        val encoded = wire.encodeToString(CreateConversationRequest(type = "direct", participantIds = listOf("u2")))

        assertThat(encoded).doesNotContain("plaintext")
    }
}
