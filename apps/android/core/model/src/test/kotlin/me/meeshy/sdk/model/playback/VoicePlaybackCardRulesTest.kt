package me.meeshy.sdk.model.playback

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class VoicePlaybackCardRulesTest {

    private fun card(
        sender: String? = "Nour",
        conversation: String? = "Famille",
        sentAt: String? = "14/10/2025 09:30",
        isProtected: Boolean = false,
    ) = VoicePlaybackCard(
        attachmentId = "a1",
        sender = sender,
        conversation = conversation,
        sentAtLabel = sentAt,
        isProtected = isProtected,
        durationMs = 42_000,
    )

    private fun labels(card: VoicePlaybackCard) =
        VoicePlaybackCardRules.labels(card, voiceMessage = "Message vocal", protectedMessage = "Message protégé")

    @Test
    fun `in a conversation the title is the conversation and the date, the artist the author`() {
        val labels = labels(card())

        assertThat(labels.title).isEqualTo("Famille — 14/10/2025 09:30")
        assertThat(labels.artist).isEqualTo("Nour")
        assertThat(labels.album).isEqualTo("Famille")
    }

    @Test
    fun `without a date the title is the conversation alone`() {
        assertThat(labels(card(sentAt = null)).title).isEqualTo("Famille")
    }

    @Test
    fun `outside a conversation the title is the author`() {
        val labels = labels(card(conversation = null))

        assertThat(labels.title).isEqualTo("Nour")
        assertThat(labels.artist).isNull()
        assertThat(labels.album).isNull()
    }

    @Test
    fun `a protected voice says only its author and that it is protected`() {
        val labels = labels(card(isProtected = true))

        assertThat(labels.title).isEqualTo("Nour")
        assertThat(labels.artist).isEqualTo("Message protégé")
        assertThat(labels.album).isNull()
    }

    @Test
    fun `without any name the title is a voice message`() {
        assertThat(labels(card(sender = "  ", conversation = null, sentAt = null)).title).isEqualTo("Message vocal")
        assertThat(labels(card(sender = null, isProtected = true)).title).isEqualTo("Message vocal")
    }

    @Test
    fun `a playing track is extrapolated from its anchor, a paused or buffering one is not`() {
        val playing = VoicePlaybackTransportState(positionMs = 10_000, isPlaying = true)

        assertThat(VoicePlaybackCardRules.projected(playing, anchorMillis = 1_000, nowMillis = 4_000, durationMs = 42_000))
            .isEqualTo(13_000)
        assertThat(VoicePlaybackCardRules.projected(playing.copy(isPlaying = false), 1_000, 4_000, 42_000)).isEqualTo(10_000)
        assertThat(VoicePlaybackCardRules.projected(playing.copy(isBuffering = true), 1_000, 4_000, 42_000)).isEqualTo(10_000)
    }

    @Test
    fun `the projection never passes the end nor goes before the start`() {
        val nearEnd = VoicePlaybackTransportState(positionMs = 41_000, isPlaying = true)

        assertThat(VoicePlaybackCardRules.projected(nearEnd, 0, 60_000, 42_000)).isEqualTo(42_000)
        assertThat(VoicePlaybackCardRules.skip(5_000, -15_000, 42_000)).isEqualTo(0)
        assertThat(VoicePlaybackCardRules.skip(30_000, 15_000, 42_000)).isEqualTo(42_000)
    }

    @Test
    fun `an unknown duration bounds only from below`() {
        assertThat(VoicePlaybackCardRules.clamp(90_000, durationMs = 0)).isEqualTo(90_000)
        assertThat(VoicePlaybackCardRules.clamp(-5, durationMs = 0)).isEqualTo(0)
    }

    @Test
    fun `artwork is fetched over https only, never with credentials in the address`() {
        assertThat(VoicePlaybackCardRules.isArtworkFetchable("https://cdn.meeshy.me/a.jpg")).isTrue()
        assertThat(VoicePlaybackCardRules.isArtworkFetchable("http://cdn.meeshy.me/a.jpg")).isFalse()
        assertThat(VoicePlaybackCardRules.isArtworkFetchable("https://user:pw@cdn.meeshy.me/a.jpg")).isFalse()
        assertThat(VoicePlaybackCardRules.isArtworkFetchable("file:///sdcard/a.jpg")).isFalse()
        assertThat(VoicePlaybackCardRules.isArtworkFetchable(null)).isFalse()
    }

    @Test
    fun `the send date reads in the viewer zone and locale`() {
        val label = VoicePlaybackCardRules.sentAtLabel("2025-10-14T09:30:00.000Z", java.util.Locale.FRANCE, java.time.ZoneId.of("UTC"))

        assertThat(label).contains("09:30")
        assertThat(label).contains("2025")
        assertThat(VoicePlaybackCardRules.sentAtLabel("pas une date", java.util.Locale.FRANCE, java.time.ZoneId.of("UTC"))).isNull()
        assertThat(VoicePlaybackCardRules.sentAtLabel(null, java.util.Locale.FRANCE, java.time.ZoneId.of("UTC"))).isNull()
    }
}
