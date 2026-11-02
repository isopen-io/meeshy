package me.meeshy.app.chat.export

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ContentExitLaw
import me.meeshy.app.chat.ForwardUiState
import me.meeshy.sdk.model.MessageExitOffer
import me.meeshy.sdk.model.share.ShareAction
import me.meeshy.sdk.model.share.ShareLimitsReport
import me.meeshy.sdk.model.share.SharePlan
import me.meeshy.sdk.model.share.ShareTitle
import me.meeshy.ui.component.bubble.BubbleContent
import me.meeshy.ui.component.bubble.BubbleImage
import org.junit.Test

/** #14331 — « Imager la discussion » : la discussion qui MÈNE au message choisi devient une carte, sous les gardes d'« Imager ». */
class CardDiscussionTest {

    private val now = 1_800_000_000_000L
    private val viewer = CardViewer(id = "me", displayName = "Moi", username = "moi")

    private fun message(
        id: String,
        text: String = "texte $id",
        sender: String = "Awa",
        outgoing: Boolean = false,
        images: List<BubbleImage> = emptyList(),
        isViewOnce: Boolean = false,
        exitOffer: MessageExitOffer = MessageExitOffer.Unrestricted,
    ) = BubbleContent(
        messageId = id, text = text, isOutgoing = outgoing, isTranslated = false, originalText = null,
        senderName = sender, showSenderName = true, isEdited = false, isDeleted = false,
        createdAtIso = "2026-10-27T10:00:${id.takeLast(2).padStart(2, '0')}.000Z",
        images = images, isViewOnce = isViewOnce, exitOffer = exitOffer,
    )

    private fun photo(id: String) = BubbleImage(attachmentId = id, url = "https://cdn.test/$id.jpg", width = 800, height = 600)

    private val quoting = MessageExitOffer(ContentExitLaw.Ordinary, holdsBlur = false, isEncrypted = false, quotesProtectedContent = true)

    @Test
    fun `the window ends at the chosen message and keeps at most twelve exportable messages`() {
        val thread = (1..20).map { message("m%02d".format(it)) }

        val window = CardDiscussion.window(thread, endingAt = "m15", nowMillis = now)

        assertThat(window.map { it.messageId }).containsExactlyElementsIn((4..15).map { "m%02d".format(it) }).inOrder()
    }

    @Test
    fun `a protected message stays out of the window, and an unknown message offers nothing`() {
        val thread = listOf(message("m01"), message("m02", isViewOnce = true), message("m03"))

        assertThat(CardDiscussion.window(thread, "m03", now).map { it.messageId }).containsExactly("m01", "m03").inOrder()
        assertThat(CardDiscussion.offers(thread, "absent", now)).isFalse()
    }

    @Test
    fun `a reply quoting protected content inside the window closes the whole discussion`() {
        val inside = listOf(message("m01"), message("m02", exitOffer = quoting), message("m03"))
        assertThat(CardDiscussion.offers(inside, "m03", now)).isFalse()

        val after = listOf(message("m01"), message("m02"), message("m03", exitOffer = quoting))
        assertThat(CardDiscussion.window(after, "m02", now).map { it.messageId }).containsExactly("m01", "m02").inOrder()
    }

    @Test
    fun `the card writes one line per message under the conversation title, a media-only message by its symbol`() {
        val window = listOf(
            message("m01", text = "Salut", sender = "Awa"),
            message("m02", text = "Coucou", sender = "Ignoré", outgoing = true),
            message("m03", text = " ", images = listOf(photo("p1"))),
        )

        val subject = requireNotNull(CardDiscussion.subject(window, viewer, title = "Famille", defaultTitle = "Discussion"))

        assertThat(subject.quoted).isNull()
        assertThat(subject.reply.author).isEqualTo("Famille")
        assertThat(subject.reply.text).isEqualTo("Awa : Salut\nMoi : Coucou\nAwa : 📷")
        assertThat(subject.media.map { it.id }).containsExactly("p1")
        assertThat(CardDiscussion.subject(window, viewer, title = " ", defaultTitle = "Discussion")?.reply?.author).isEqualTo("Discussion")
    }

    @Test
    fun `the card keeps the four most recent media`() {
        val window = (1..6).map { message("m%02d".format(it), images = listOf(photo("p$it"))) }

        val subject = requireNotNull(CardDiscussion.subject(window, viewer, title = null, defaultTitle = "Discussion"))

        assertThat(subject.media.map { it.id }).containsExactly("p3", "p4", "p5", "p6").inOrder()
    }

    private fun plan(vararg actions: ShareAction) = SharePlan(
        title = ShareTitle.FORWARD, kept = listOf("m03"), withdrawn = emptyList(), blocked = null, actions = actions.toList(),
        withheld = emptyList(), grouping = null, caption = null, flameMaxDurationSeconds = null, blurInherited = false,
        encryption = null, limits = ShareLimitsReport(0, 0, 0, 0, 0), canSend = true,
    )

    @Test
    fun `forwarding offers the discussion only when the plan offers imager and the discussion has something to paint`() {
        val thread = listOf(message("m01"), message("m02"), message("m03"))
        val forward = ForwardUiState(sourceMessageId = "m03", plan = plan(ShareAction.SEND, ShareAction.IMAGER))

        assertThat(CardDiscussion.offeredEnd(forward, thread, now)).isEqualTo("m03")
        assertThat(CardDiscussion.offeredEnd(forward.copy(plan = plan(ShareAction.SEND)), thread, now)).isNull()
        assertThat(CardDiscussion.offeredEnd(forward, listOf(message("m03", isViewOnce = true)), now)).isNull()
    }
}
