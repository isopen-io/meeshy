package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ClientAttachmentKind
import me.meeshy.ui.component.bubble.BubbleAudio
import me.meeshy.ui.component.bubble.BubbleContent
import me.meeshy.ui.component.bubble.BubbleFile
import me.meeshy.ui.component.bubble.BubbleImage
import me.meeshy.ui.component.bubble.BubbleLocation
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZoneOffset
import org.junit.Test

/**
 * Behavioural spec for [toClientStatMessage] — the reduction of an on-screen bubble
 * into the stats fallback's message shape. Covers the sender-key rules, the
 * attachment tally (video folds into image), and the instant→local-day resolution.
 */
class ClientStatMessageMappingTest {

    private val utc = ZoneOffset.UTC

    private fun bubble(
        text: String = "hi",
        isOutgoing: Boolean = false,
        senderName: String? = "Ada",
        createdAtIso: String? = "2026-08-20T10:00:00Z",
        images: List<BubbleImage> = emptyList(),
        audios: List<BubbleAudio> = emptyList(),
        files: List<BubbleFile> = emptyList(),
        locations: List<BubbleLocation> = emptyList(),
    ) = BubbleContent(
        messageId = "m1",
        text = text,
        isOutgoing = isOutgoing,
        isTranslated = false,
        originalText = null,
        senderName = senderName,
        showSenderName = true,
        isEdited = false,
        isDeleted = false,
        createdAtIso = createdAtIso,
        images = images,
        audios = audios,
        files = files,
        locations = locations,
    )

    private fun image() = BubbleImage(attachmentId = "a", url = "u")
    private fun audio() = BubbleAudio(attachmentId = "a")
    private fun file() = BubbleFile(attachmentId = "a", name = "f")
    private fun location() = BubbleLocation(attachmentId = "a")

    @Test
    fun `an outgoing message keys the sender as me and carries the text`() {
        val m = bubble(text = "hello world", isOutgoing = true, senderName = null).toClientStatMessage(utc)

        assertThat(m.senderId).isEqualTo(OUTGOING_SENDER_KEY)
        assertThat(m.content).isEqualTo("hello world")
    }

    @Test
    fun `an incoming message keys the sender by display name`() {
        val m = bubble(isOutgoing = false, senderName = "Ada").toClientStatMessage(utc)

        assertThat(m.senderId).isEqualTo("Ada")
        assertThat(m.senderName).isEqualTo("Ada")
    }

    @Test
    fun `an incoming message with no name falls back to the unknown key`() {
        val m = bubble(isOutgoing = false, senderName = null).toClientStatMessage(utc)

        assertThat(m.senderId).isEqualTo(UNKNOWN_SENDER_KEY)
    }

    @Test
    fun `attachments map to their kinds and a video-thumbnail image counts as image`() {
        val m = bubble(
            images = listOf(image(), image()),
            audios = listOf(audio()),
            files = listOf(file()),
            locations = listOf(location()),
        ).toClientStatMessage(utc)

        assertThat(m.attachmentKinds).containsExactly(
            ClientAttachmentKind.IMAGE,
            ClientAttachmentKind.IMAGE,
            ClientAttachmentKind.AUDIO,
            ClientAttachmentKind.FILE,
            ClientAttachmentKind.LOCATION,
        )
    }

    @Test
    fun `the day is the message instant resolved in the given zone`() {
        // 23:30 UTC on the 20th is the 21st in a +02:00 zone.
        val m = bubble(createdAtIso = "2026-08-20T23:30:00Z")
            .toClientStatMessage(ZoneId.ofOffset("", ZoneOffset.ofHours(2)))

        assertThat(m.day).isEqualTo(LocalDate.of(2026, 8, 21))
    }

    @Test
    fun `an absent timestamp falls back to today in the zone`() {
        val m = bubble(createdAtIso = null).toClientStatMessage(utc)

        assertThat(m.day).isEqualTo(LocalDate.now(utc))
    }
}
