package me.meeshy.sdk.model.share

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.ApiMessageSender
import me.meeshy.sdk.model.MessageSticker
import org.junit.Test

class ShareContentSummaryTest {
    private fun attachment(id: String, mime: String, place: Boolean = false) = ApiMessageAttachment(
        id = id,
        mimeType = mime,
        latitude = if (place) 1.0 else null,
        longitude = if (place) 2.0 else null,
    )

    private fun message(
        id: String,
        content: String = "",
        attachments: List<ApiMessageAttachment> = emptyList(),
        sticker: MessageSticker? = null,
        viewOnce: Boolean? = null,
        sender: String? = "Ana",
    ) = ApiMessage(
        id = id,
        conversationId = "c1",
        content = content,
        attachments = attachments,
        sticker = sticker,
        isViewOnce = viewOnce,
        sender = sender?.let { ApiMessageSender(displayName = it) },
    )

    private fun messages(vararg items: ApiMessage) = ShareSubject.Messages(items.toList(), "c1")

    private fun plan(subject: ShareSubject, removed: Set<String> = emptySet()) = SharePlanner.plan(subject.entry(removed))

    @Test
    fun `a message previews its text first`() {
        assertThat(ShareContentSummary.preview(message("1", "salut", listOf(attachment("a", "image/png")))))
            .isEqualTo(ShareMessagePreview.Text("salut"))
    }

    @Test
    fun `a message without text previews its sticker before its attachment`() {
        val sticker = MessageSticker(emoji = "😀")
        assertThat(ShareContentSummary.preview(message("1", sticker = sticker, attachments = listOf(attachment("a", "image/png")))))
            .isEqualTo(ShareMessagePreview.Sticker)
    }

    @Test
    fun `a message of attachments previews the kind of the first and the count`() {
        val three = message("1", attachments = List(3) { attachment("a$it", "image/jpeg") })
        assertThat(ShareContentSummary.preview(three)).isEqualTo(ShareMessagePreview.Media(SharePieceKind.IMAGE, 3))
        val one = message("2", attachments = listOf(attachment("v", "video/mp4")))
        assertThat(ShareContentSummary.preview(one)).isEqualTo(ShareMessagePreview.Media(SharePieceKind.VIDEO, 1))
        val doc = message("3", attachments = listOf(attachment("d", "application/pdf")))
        assertThat(ShareContentSummary.preview(doc)).isEqualTo(ShareMessagePreview.Media(SharePieceKind.FILE, 1))
        val sound = message("4", attachments = listOf(attachment("s", "audio/mpeg")))
        assertThat(ShareContentSummary.preview(sound)).isEqualTo(ShareMessagePreview.Media(SharePieceKind.AUDIO, 1))
    }

    @Test
    fun `an empty message previews the media placeholder`() {
        assertThat(ShareContentSummary.preview(message("1"))).isEqualTo(ShareMessagePreview.Placeholder)
    }

    @Test
    fun `several messages say how many leave out of how many`() {
        val subject = messages(message("1", "a"), message("2", "b"), message("3", "c"))
        val header = ShareContentSummary.header(subject, plan(subject, setOf("2")))
        assertThat(header.title).isEqualTo(ShareContentTitle.MessagesKept(kept = 2, total = 3))
    }

    @Test
    fun `a single message has the plain title`() {
        val subject = messages(message("1", "a"))
        assertThat(ShareContentSummary.header(subject, plan(subject)).title).isEqualTo(ShareContentTitle.Plain)
    }

    @Test
    fun `a piece says which one out of how many and offers the whole message without a place`() {
        val msg = message("1", attachments = listOf(attachment("a", "image/png"), attachment("p", "x/y", place = true), attachment("b", "image/png")))
        val subject = ShareSubject.Piece(msg, "b", "c1")
        val header = ShareContentSummary.header(subject, plan(subject))
        assertThat(header.title).isEqualTo(ShareContentTitle.PieceOf(index = 2, count = 2))
        assertThat(header.offersWholeMessage).isTrue()
    }

    @Test
    fun `received files count in the title and overflow offers removing the last ones`() {
        val media = List(103) { ShareMedia(id = "m$it", mimeType = "image/jpeg", bytes = 10L) }
        val subject = ShareSubject.Incoming(null, media)
        val header = ShareContentSummary.header(subject, plan(subject))
        assertThat(header.title).isEqualTo(ShareContentTitle.IncomingCount(103))
        assertThat(header.removeLastCount).isEqualTo(3)
        assertThat(header.offersWholeMessage).isFalse()
    }

    @Test
    fun `overflow of a non incoming subject never offers removal`() {
        val subject = messages(message("1", "a"))
        assertThat(ShareContentSummary.header(subject, plan(subject)).removeLastCount).isNull()
    }

    @Test
    fun `a withdrawn message stays visible with its reason and cannot be removed`() {
        val subject = messages(message("1", "a"), message("2", "secret", viewOnce = true), message("3", "c"))
        val rows = ShareContentSummary.messageRows(subject, emptySet(), plan(subject))
        assertThat(rows.map { it.id }).containsExactly("1", "2", "3").inOrder()
        assertThat(rows[1].withdrawn).isEqualTo(ShareWithdrawReason.VIEW_ONCE)
        assertThat(rows[1].removable).isFalse()
        assertThat(rows[0].removable).isTrue()
        assertThat(rows[0].senderName).isEqualTo("Ana")
    }

    @Test
    fun `a removed message leaves the rows and the last kept message cannot be removed`() {
        val subject = messages(message("1", "a"), message("2", "b"))
        val removed = setOf("1")
        val rows = ShareContentSummary.messageRows(subject, removed, plan(subject, removed))
        assertThat(rows.map { it.id }).containsExactly("2")
        assertThat(rows.single().removable).isFalse()
    }

    @Test
    fun `the withdrawn note names the reason and how many others leave`() {
        val subject = messages(message("1", "a"), message("2", "secret", viewOnce = true), message("3", "c"))
        val note = ShareContentSummary.withdrawnNote(plan(subject))
        assertThat(note).isEqualTo(ShareWithdrawnNote(ShareWithdrawReason.VIEW_ONCE, othersLeaving = 2))
    }

    @Test
    fun `there is no withdrawn note when nothing is withdrawn or nothing leaves`() {
        val ok = messages(message("1", "a"), message("2", "b"))
        assertThat(ShareContentSummary.withdrawnNote(plan(ok))).isNull()
        val none = messages(message("1", "secret", viewOnce = true))
        assertThat(ShareContentSummary.withdrawnNote(plan(none))).isNull()
    }

    @Test
    fun `a text shared as a web address is a link card that can be copied`() {
        val subject = ShareSubject.Incoming("https://meeshy.me/join?x=1", emptyList())
        val card = ShareContentSummary.infoCards(subject).single()
        assertThat(card.kind).isEqualTo(ShareInfoKind.LINK)
        assertThat(card.title).isEqualTo("meeshy.me")
        assertThat(card.subtitle).isEqualTo("https://meeshy.me/join?x=1")
        assertThat(card.copyableLink).isEqualTo("https://meeshy.me/join?x=1")
    }

    @Test
    fun `plain text and received captions are text cards without a link`() {
        val text = ShareContentSummary.infoCards(ShareSubject.Text("bonjour")).single()
        assertThat(text.kind).isEqualTo(ShareInfoKind.TEXT)
        assertThat(text.title).isEqualTo("bonjour")
        assertThat(text.copyableLink).isNull()
        val withFiles = ShareContentSummary.infoCards(ShareSubject.Incoming("regarde", listOf(ShareMedia("m", "image/png"))))
        assertThat(withFiles.single().kind).isEqualTo(ShareInfoKind.TEXT)
    }

    @Test
    fun `a link subject titles with its host and a card with its own title`() {
        val link = ShareContentSummary.infoCards(ShareSubject.Link("https://example.org/a")).single()
        assertThat(link.title).isEqualTo("example.org")
        val card = ShareContentSummary.infoCards(
            ShareSubject.Card(ShareCard(ShareCardKind.STORY, "s1", "Story de X", "https://meeshy.me/s/1", "txt", imageUrl = "u")),
        ).single()
        assertThat(card.kind).isEqualTo(ShareInfoKind.CARD)
        assertThat(card.title).isEqualTo("Story de X")
        assertThat(card.imageUrl).isEqualTo("u")
        assertThat(card.copyableLink).isEqualTo("https://meeshy.me/s/1")
    }

    @Test
    fun `messages and pieces have no info card`() {
        assertThat(ShareContentSummary.infoCards(messages(message("1", "a")))).isEmpty()
    }

    @Test
    fun `incoming media has no info card when there is no text`() {
        assertThat(ShareContentSummary.infoCards(ShareSubject.Incoming(null, listOf(ShareMedia("m", "image/png"))))).isEmpty()
    }
}
