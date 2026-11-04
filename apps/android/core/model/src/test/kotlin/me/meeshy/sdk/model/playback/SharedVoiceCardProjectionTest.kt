package me.meeshy.sdk.model.playback

import com.google.common.truth.Truth.assertThat
import java.time.ZoneId
import java.util.Locale
import me.meeshy.sdk.model.QueuedAudio
import org.junit.Test

class SharedVoiceCardProjectionTest {

    private fun audio(
        id: String = "a1",
        avatar: String? = "https://cdn.meeshy.me/nour.jpg",
        isProtected: Boolean = false,
        durationMs: Long = 42_000,
    ) = QueuedAudio(
        attachmentId = id,
        messageId = "m-$id",
        conversationId = "c1",
        fileUrl = "https://cdn.meeshy.me/$id.m4a",
        durationMs = durationMs,
        senderName = "Nour",
        senderAvatarUrl = avatar,
        receivedAtEpochMs = 1_760_434_200_000L,
        isProtected = isProtected,
    )

    private fun playback(
        id: String? = "a1",
        positionMs: Long = 5_000,
        durationMs: Long = 40_000,
        isPlaying: Boolean = true,
        isLoading: Boolean = false,
    ) = AudioPlaybackState(
        attachmentId = id,
        isPlaying = isPlaying,
        isLoading = isLoading,
        currentTimeMs = positionMs,
        durationMs = durationMs,
    )

    private fun project(
        audio: QueuedAudio? = audio(),
        playback: AudioPlaybackState = playback(),
        conversationArtworkUrl: String? = "https://cdn.meeshy.me/famille.jpg",
        hasNext: Boolean = true,
        hasPrevious: Boolean = false,
        callActive: Boolean = false,
    ) = SharedVoiceCardProjection.of(
        audio = audio,
        conversationName = "Famille",
        conversationArtworkUrl = conversationArtworkUrl,
        playback = playback,
        hasNext = hasNext,
        hasPrevious = hasPrevious,
        callActive = callActive,
        locale = Locale.FRANCE,
        zone = ZoneId.of("UTC"),
    )

    @Test
    fun `nothing in the queue means no card`() {
        assertThat(project(audio = null)).isNull()
    }

    @Test
    fun `an active call retires the card`() {
        assertThat(project(callActive = true)).isNull()
    }

    @Test
    fun `the card describes the sender, the conversation and the send date`() {
        val shared = project()!!

        assertThat(shared.card.attachmentId).isEqualTo("a1")
        assertThat(shared.card.sender).isEqualTo("Nour")
        assertThat(shared.card.conversation).isEqualTo("Famille")
        assertThat(shared.card.sentAtLabel).contains("2025")
        assertThat(shared.card.conversationId).isEqualTo("c1")
        assertThat(shared.card.messageId).isEqualTo("m-a1")
    }

    @Test
    fun `the send date comes from the caller label when it supplies one`() {
        val asked = mutableListOf<Long>()
        val shared = SharedVoiceCardProjection.of(
            audio = audio(),
            conversationName = "Famille",
            conversationArtworkUrl = null,
            playback = playback(),
            hasNext = false,
            hasPrevious = false,
            callActive = false,
            locale = Locale.FRANCE,
            zone = ZoneId.of("UTC"),
            sentAtLabel = { epochMs -> asked += epochMs; "hier" },
        )!!

        assertThat(shared.card.sentAtLabel).isEqualTo("hier")
        assertThat(asked).containsExactly(1_760_434_200_000L)
    }

    @Test
    fun `the artwork is the sender avatar before the conversation one`() {
        assertThat(project()!!.card.artworkUrl).isEqualTo("https://cdn.meeshy.me/nour.jpg")
        assertThat(project(audio = audio(avatar = null))!!.card.artworkUrl).isEqualTo("https://cdn.meeshy.me/famille.jpg")
        assertThat(project(audio = audio(avatar = null), conversationArtworkUrl = null)!!.card.artworkUrl).isNull()
    }

    @Test
    fun `the engine duration wins over the queued one once known`() {
        assertThat(project()!!.card.durationMs).isEqualTo(40_000)
        assertThat(project(playback = playback(durationMs = 0))!!.card.durationMs).isEqualTo(42_000)
    }

    @Test
    fun `the transport follows the engine`() {
        val shared = project(playback = playback(positionMs = 7_000, isPlaying = true))!!

        assertThat(shared.transport).isEqualTo(VoicePlaybackTransportState(positionMs = 7_000, isPlaying = true, isBuffering = false))
    }

    @Test
    fun `a loading engine is buffering`() {
        val shared = project(playback = playback(isPlaying = false, isLoading = true))!!

        assertThat(shared.transport.isBuffering).isTrue()
    }

    @Test
    fun `a card whose track is not yet the engine one stays buffering at the start`() {
        val shared = project(playback = playback(id = "other", positionMs = 30_000))!!

        assertThat(shared.transport).isEqualTo(VoicePlaybackTransportState(positionMs = 0, isPlaying = false, isBuffering = true))
        assertThat(shared.card.durationMs).isEqualTo(42_000)
    }

    @Test
    fun `the queue controls follow the queue`() {
        assertThat(project(hasNext = true, hasPrevious = true)!!.controls)
            .isEqualTo(VoicePlaybackQueueControls(hasNext = true, hasPrevious = true))
    }

    @Test
    fun `a protected voice is flagged protected`() {
        assertThat(project(audio = audio(isProtected = true))!!.card.isProtected).isTrue()
    }

    @Test
    fun `a position that follows playback needs no new publication`() {
        val last = project(playback = playback(positionMs = 10_000))!!
        val next = project(playback = playback(positionMs = 12_000))!!

        assertThat(SharedVoiceCardProjection.needsRepublish(last, publishedAtMs = 0, next, nowMs = 2_000)).isFalse()
    }

    @Test
    fun `a seek needs a new publication`() {
        val last = project(playback = playback(positionMs = 10_000))!!
        val next = project(playback = playback(positionMs = 25_000))!!

        assertThat(SharedVoiceCardProjection.needsRepublish(last, publishedAtMs = 0, next, nowMs = 1_000)).isTrue()
    }

    @Test
    fun `a pause, a buffering, a new track or new controls need a new publication`() {
        val last = project()!!

        assertThat(SharedVoiceCardProjection.needsRepublish(last, 0, project(playback = playback(isPlaying = false))!!, 0)).isTrue()
        assertThat(SharedVoiceCardProjection.needsRepublish(last, 0, project(playback = playback(isPlaying = false, isLoading = true))!!, 0)).isTrue()
        assertThat(SharedVoiceCardProjection.needsRepublish(last, 0, project(audio = audio(id = "a2"), playback = playback(id = "a2"))!!, 0)).isTrue()
        assertThat(SharedVoiceCardProjection.needsRepublish(last, 0, project(hasNext = false)!!, 0)).isTrue()
    }

    @Test
    fun `an identical state needs no publication`() {
        val last = project()!!

        assertThat(SharedVoiceCardProjection.needsRepublish(last, 0, project()!!, 0)).isFalse()
    }
}
