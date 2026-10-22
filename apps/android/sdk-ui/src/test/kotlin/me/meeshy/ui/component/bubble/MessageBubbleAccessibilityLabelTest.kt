package me.meeshy.ui.component.bubble

import com.google.common.truth.Truth.assertThat
import java.util.Locale
import org.junit.Test

/**
 * Behavioural cover for the pure [MessageBubbleAccessibilityLabel] composer — the Android port
 * of iOS `MessageAccessibilityLabelComposer.compose`. Every arm of the frozen reading order
 * (sender → reply → text → images → audios → location/files → time → delivery → edited → pinned
 * → ephemeral → reactions) is exercised, plus the deleted short-circuit and the boundary
 * (empty) collections.
 */
class MessageBubbleAccessibilityLabelTest {

    private fun strings() = BubbleAccessibilityStrings(
        unknownSender = "unknown sender",
        deleted = "message deleted",
        replyToAuthor = "reply to %s",
        replyToExcerpt = "reply to %1\$s: %2\$s",
        replyToYou = "yourself",
        images = "%d images",
        videos = "%d videos",
        audios = "%d audios",
        location = "shared location",
        file = "file %s",
        contactCard = "contact %s",
        contactCardAccount = "on Meeshy %s",
        viewOnceSealed = "view-once, tap to open",
        viewOnce = "view once",
        blurred = "blurred",
        edited = "edited",
        pinned = "pinned",
        ephemeral = "ephemeral",
        reactions = "reactions: %s",
        delivery = BubbleDeliveryA11yStrings(
            sending = "sending",
            slow = "slow sending",
            queued = "queued",
            sent = "sent",
            delivered = "delivered",
            read = "read",
            failed = "failed",
        ),
    )

    private fun content(
        text: String = "",
        isOutgoing: Boolean = false,
        senderName: String? = null,
        isEdited: Boolean = false,
        isDeleted: Boolean = false,
        deliveryStatus: DeliveryStatus = DeliveryStatus.Sent,
        reactions: List<ReactionEntry> = emptyList(),
        replyToId: String? = null,
        replyToText: String? = null,
        replyToSenderName: String? = null,
        replyToDeleted: Boolean = false,
        images: List<BubbleImage> = emptyList(),
        files: List<BubbleFile> = emptyList(),
        locations: List<BubbleLocation> = emptyList(),
        audios: List<BubbleAudio> = emptyList(),
        expiresAtIso: String? = null,
        pinnedAtIso: String? = null,
        videoCount: Int = 0,
        contactCards: List<BubbleContactCard> = emptyList(),
        isBlurred: Boolean = false,
        isViewOnce: Boolean = false,
        viewOnceCount: Int = 0,
        replyToIsMe: Boolean = false,
        isSlowSend: Boolean = false,
    ) = BubbleContent(
        messageId = "m1",
        text = text,
        isOutgoing = isOutgoing,
        isTranslated = false,
        originalText = null,
        senderName = senderName,
        showSenderName = senderName != null,
        isEdited = isEdited,
        isDeleted = isDeleted,
        createdAtIso = "2026-08-21T10:00:00Z",
        deliveryStatus = deliveryStatus,
        reactions = reactions,
        replyToId = replyToId,
        replyToText = replyToText,
        replyToSenderName = replyToSenderName,
        replyToDeleted = replyToDeleted,
        images = images,
        files = files,
        locations = locations,
        audios = audios,
        expiresAtIso = expiresAtIso,
        pinnedAtIso = pinnedAtIso,
        videoCount = videoCount,
        contactCards = contactCards,
        isBlurred = isBlurred,
        isViewOnce = isViewOnce,
        viewOnceCount = viewOnceCount,
        replyToIsMe = replyToIsMe,
        isSlowSend = isSlowSend,
    )

    private fun compose(content: BubbleContent, timeText: String? = null) =
        MessageBubbleAccessibilityLabel.compose(content, strings(), Locale.ENGLISH, timeText)

    private fun image(id: String) = BubbleImage(attachmentId = id, url = "https://x/$id")
    private fun audio(id: String) = BubbleAudio(attachmentId = id)

    @Test
    fun `received text message names the sender before the text`() {
        val label = compose(content(text = "Hello", senderName = "Alice"))
        assertThat(label).isEqualTo("Alice, Hello")
    }

    @Test
    fun `a received message with no sender name reads the unknown-sender placeholder`() {
        val label = compose(content(text = "Hi", senderName = null))
        assertThat(label).isEqualTo("unknown sender, Hi")
    }

    @Test
    fun `a received message with a blank sender name reads the unknown-sender placeholder`() {
        val label = compose(content(text = "Hi", senderName = "   "))
        assertThat(label).isEqualTo("unknown sender, Hi")
    }

    @Test
    fun `an outgoing message never announces a sender`() {
        val label = compose(content(text = "Hello", isOutgoing = true, senderName = "Me"))
        assertThat(label).isEqualTo("Hello, sent")
    }

    @Test
    fun `a blank text arm is skipped entirely`() {
        val label = compose(content(text = "   ", senderName = "Alice", images = listOf(image("a"))))
        assertThat(label).isEqualTo("Alice, 1 images")
    }

    @Test
    fun `a reply with an excerpt reads author and trimmed excerpt`() {
        val label = compose(
            content(
                text = "ok",
                senderName = "Alice",
                replyToId = "r1",
                replyToText = "  earlier note  ",
                replyToSenderName = "Bob",
            ),
        )
        assertThat(label).isEqualTo("Alice, reply to Bob: earlier note, ok")
    }

    @Test
    fun `a reply with a blank excerpt falls back to the author-only phrasing`() {
        val label = compose(
            content(
                text = "ok",
                senderName = "Alice",
                replyToId = "r1",
                replyToText = "   ",
                replyToSenderName = "Bob",
            ),
        )
        assertThat(label).isEqualTo("Alice, reply to Bob, ok")
    }

    @Test
    fun `a reply with no author name uses the unknown-sender placeholder as author`() {
        val label = compose(
            content(
                text = "ok",
                senderName = "Alice",
                replyToId = "r1",
                replyToText = "quoted",
                replyToSenderName = null,
            ),
        )
        assertThat(label).isEqualTo("Alice, reply to unknown sender: quoted, ok")
    }

    @Test
    fun `a deleted reply target with no text still announces the reply as author-only`() {
        val label = compose(
            content(
                text = "ok",
                senderName = "Alice",
                replyToDeleted = true,
                replyToSenderName = "Bob",
            ),
        )
        assertThat(label).isEqualTo("Alice, reply to Bob, ok")
    }

    @Test
    fun `images and audios are counted after the text`() {
        val label = compose(
            content(
                text = "look",
                senderName = "Alice",
                images = listOf(image("a"), image("b")),
                audios = listOf(audio("c")),
            ),
        )
        assertThat(label).isEqualTo("Alice, look, 2 images, 1 audios")
    }

    @Test
    fun `a shared location then a named file are read in order`() {
        val label = compose(
            content(
                senderName = "Alice",
                locations = listOf(BubbleLocation(attachmentId = "l1", latitude = 1.0, longitude = 2.0)),
                files = listOf(BubbleFile(attachmentId = "f1", name = "report.pdf")),
            ),
        )
        assertThat(label).isEqualTo("Alice, shared location, file report.pdf")
    }

    @Test
    fun `a file with no name still renders the file arm with an empty name`() {
        val label = compose(
            content(senderName = "Alice", files = listOf(BubbleFile(attachmentId = "f1", name = null))),
        )
        assertThat(label).isEqualTo("Alice, file ")
    }

    @Test
    fun `the time text is appended after the attachments when supplied`() {
        val label = compose(content(text = "hi", senderName = "Alice"), timeText = "10:00")
        assertThat(label).isEqualTo("Alice, hi, 10:00")
    }

    @Test
    fun `a blank time text is not appended`() {
        val label = compose(content(text = "hi", senderName = "Alice"), timeText = "  ")
        assertThat(label).isEqualTo("Alice, hi")
    }

    @Test
    fun `an outgoing message announces its delivery status after the time`() {
        val label = compose(
            content(text = "yo", isOutgoing = true, deliveryStatus = DeliveryStatus.Read),
            timeText = "10:00",
        )
        assertThat(label).isEqualTo("yo, 10:00, read")
    }

    @Test
    fun `each delivery status maps to its own phrasing`() {
        fun deliveryLabel(status: DeliveryStatus) =
            compose(content(text = "x", isOutgoing = true, deliveryStatus = status))
        assertThat(deliveryLabel(DeliveryStatus.Pending)).isEqualTo("x, sending")
        assertThat(deliveryLabel(DeliveryStatus.QueuedOffline)).isEqualTo("x, queued")
        assertThat(deliveryLabel(DeliveryStatus.Sent)).isEqualTo("x, sent")
        assertThat(deliveryLabel(DeliveryStatus.Delivered)).isEqualTo("x, delivered")
        assertThat(deliveryLabel(DeliveryStatus.Read)).isEqualTo("x, read")
        assertThat(deliveryLabel(DeliveryStatus.Failed)).isEqualTo("x, failed")
    }

    @Test
    fun `edited pinned and ephemeral flags are announced in that order`() {
        val label = compose(
            content(
                text = "edit me",
                senderName = "Alice",
                isEdited = true,
                pinnedAtIso = "2026-08-21T09:00:00Z",
                expiresAtIso = "2026-08-21T11:00:00Z",
            ),
        )
        assertThat(label).isEqualTo("Alice, edit me, edited, pinned, ephemeral")
    }

    @Test
    fun `reactions are summarised as emoji and count at the very end`() {
        val label = compose(
            content(
                text = "party",
                senderName = "Alice",
                reactions = listOf(ReactionEntry("👍", 2), ReactionEntry("🎉", 1)),
            ),
        )
        assertThat(label).isEqualTo("Alice, party, reactions: 👍 2, 🎉 1")
    }

    @Test
    fun `a deleted message short-circuits to the deleted phrasing after the sender`() {
        val label = compose(
            content(
                text = "was here",
                senderName = "Alice",
                isDeleted = true,
                images = listOf(image("a")),
                reactions = listOf(ReactionEntry("👍", 1)),
            ),
        )
        assertThat(label).isEqualTo("Alice, message deleted")
    }

    @Test
    fun `a bare outgoing text message reads text then sent status only`() {
        val label = compose(content(text = "hey", isOutgoing = true))
        assertThat(label).isEqualTo("hey, sent")
    }

    @Test
    fun `images and videos are counted separately in that order`() {
        val label = compose(
            content(senderName = "A", images = listOf(image("a"), image("b")), videoCount = 1, audios = listOf(audio("x"))),
        )
        assertThat(label).isEqualTo("A, 2 images, 1 videos, 1 audios")
    }

    @Test
    fun `a blurred message never reads its text but keeps its media and says blurred`() {
        val label = compose(content(text = "secret", senderName = "A", isBlurred = true, images = listOf(image("a"))))
        assertThat(label).isEqualTo("A, 1 images, blurred")
        assertThat(label).doesNotContain("secret")
    }

    @Test
    fun `a sealed view-once message says only its chip then the time`() {
        val label = compose(
            content(text = "secret", senderName = "A", isViewOnce = true, images = listOf(image("a"))),
            timeText = "10:00",
        )
        assertThat(label).isEqualTo("A, view-once, tap to open, 10:00")
    }

    @Test
    fun `a sealed view-once message still announces its ephemeral countdown`() {
        val label = compose(content(senderName = "A", isViewOnce = true, expiresAtIso = "2026-08-21T11:00:00Z"))
        assertThat(label).isEqualTo("A, view-once, tap to open, ephemeral")
    }

    @Test
    fun `an opened view-once message reads normally then says view once`() {
        val label = compose(content(text = "hi", senderName = "A", isViewOnce = true, viewOnceCount = 1))
        assertThat(label).isEqualTo("A, hi, view once")
    }

    @Test
    fun `a contact card is read by its name and account and never as a file`() {
        val card = BubbleContactCard(attachmentId = "c", name = "Bob", accountUsername = "bob")
        val vcf = BubbleFile(attachmentId = "c", name = "Bob.vcf", isContactCard = true)
        val label = compose(content(senderName = "A", contactCards = listOf(card), files = listOf(vcf)))
        assertThat(label).isEqualTo("A, contact Bob, on Meeshy @bob")
    }

    @Test
    fun `a contact card without an account reads only its name`() {
        val card = BubbleContactCard(attachmentId = "c", name = "Bob")
        assertThat(compose(content(senderName = "A", contactCards = listOf(card)))).isEqualTo("A, contact Bob")
    }

    @Test
    fun `video files are not read as files`() {
        val video = BubbleFile(attachmentId = "v", name = "clip.mp4", isVideo = true)
        val doc = BubbleFile(attachmentId = "d", name = "a.pdf")
        val label = compose(content(senderName = "A", videoCount = 1, files = listOf(video, doc)))
        assertThat(label).isEqualTo("A, 1 videos, file a.pdf")
    }

    @Test
    fun `a reply to your own message names yourself`() {
        val label = compose(content(senderName = "A", replyToId = "r", replyToText = "yo", replyToIsMe = true))
        assertThat(label).isEqualTo("A, reply to yourself: yo")
    }

    @Test
    fun `a slow pending outgoing message says slow sending`() {
        val label = compose(content(isOutgoing = true, deliveryStatus = DeliveryStatus.Pending, isSlowSend = true))
        assertThat(label).isEqualTo("slow sending")
    }

    @Test
    fun `a pending outgoing message that is not slow says sending`() {
        val label = compose(content(isOutgoing = true, deliveryStatus = DeliveryStatus.Pending))
        assertThat(label).isEqualTo("sending")
    }

    @Test
    fun `the whole frozen order holds from sender to reactions`() {
        val label = compose(
            content(
                text = "t", senderName = "A", replyToId = "r", replyToText = "q",
                images = listOf(image("a")), videoCount = 1, audios = listOf(audio("x")),
                locations = listOf(BubbleLocation(attachmentId = "l")),
                isEdited = true, pinnedAtIso = "x", expiresAtIso = "y",
                reactions = listOf(ReactionEntry("\uD83D\uDC4D", 2)),
            ),
            timeText = "10:00",
        )
        assertThat(label).isEqualTo(
            "A, reply to unknown sender: q, t, 1 images, 1 videos, 1 audios, shared location, 10:00, edited, pinned, ephemeral, reactions: \uD83D\uDC4D 2",
        )
    }
}
