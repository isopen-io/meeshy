package me.meeshy.app.chat.export

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CardLayoutTest {

    private val measure: CardMeasure = { text, font -> text.length * font.size * 0.5 }

    private fun input(
        reply: String = "Bonjour",
        quote: String? = null,
        template: CardTemplateId = CardTemplates.defaultId,
        title: String? = null,
        date: String? = null,
        showAuthors: Boolean = true,
        aspect: CardAspect = CardAspect.AUTO,
        placement: CardAuthorPlacement = CardAuthorPlacement.ABOVE,
        tilt: CardTilt = CardTilt.NONE,
        handle: String? = "moi",
    ) = CardInput(
        quoted = quote?.let { CardPart("Koffi", it) },
        reply = CardPart("Awa", reply),
        template = template,
        handle = handle,
        title = title,
        date = date,
        showAuthors = showAuthors,
        aspect = aspect,
        authorPlacement = placement,
        tilt = tilt,
    )

    private fun layout(input: CardInput) = CardLayoutEngine.layout(input, measure)

    private fun link(id: CardLinkId) = CardTemplates.defaultId.with(link = id)

    @Test
    fun `a short message is a 1080 square and floats in the middle`() {
        val card = layout(input())
        assertThat(card.width).isEqualTo(1080.0)
        assertThat(card.height).isEqualTo(1080.0)
        assertThat(card.truncated).isFalse()
        val reply = card.regions.first { it.part == CardPartId.REPLY }
        assertThat(reply.y).isGreaterThan(card.height / 4)
        assertThat(reply.y + reply.height).isLessThan(card.height * 3 / 4)
    }

    @Test
    fun `a fixed format keeps its canvas and landscape is wider`() {
        assertThat(layout(input(aspect = CardAspect.STORY)).height).isEqualTo(1920.0)
        assertThat(layout(input(aspect = CardAspect.PORTRAIT)).height).isEqualTo(1350.0)
        val landscape = layout(input(aspect = CardAspect.LANDSCAPE))
        assertThat(landscape.width).isEqualTo(1920.0)
        assertThat(landscape.height).isEqualTo(1080.0)
    }

    @Test
    fun `the adaptive card grows with its text up to the story height then shrinks the fonts`() {
        val medium = layout(input(reply = "mot ".repeat(120)))
        assertThat(medium.height).isGreaterThan(1080.0)
        val long = layout(input(reply = "mot ".repeat(2000)))
        assertThat(long.height).isEqualTo(1920.0)
        assertThat(long.truncated).isTrue()
    }

    @Test
    fun `a truncated reply ends with an ellipsis and the quote yields first`() {
        val card = layout(input(reply = "mot ".repeat(2000), quote = "cite ".repeat(300)))
        val texts = card.ops.filterIsInstance<CardOp.Text>().map { it.text }
        assertThat(texts.any { it.endsWith("…") }).isTrue()
    }

    @Test
    fun `the regions are the painted parts from top to bottom`() {
        val card = layout(input(quote = "Tu viens ?", title = "Famille", date = "27 octobre 2026"))
        assertThat(card.regions.map { it.part })
            .containsExactly(CardPartId.HEADER, CardPartId.QUOTE, CardPartId.LINK, CardPartId.REPLY).inOrder()
        assertThat(card.regions.map { it.y }).isInOrder()
    }

    @Test
    fun `without a quote there is neither a quote region nor a link`() {
        val card = layout(input())
        assertThat(card.regions.map { it.part }).containsExactly(CardPartId.REPLY)
    }

    @Test
    fun `the link orbit paints a dashed separator with a ring and the quote carries its accent bar`() {
        val card = layout(input(quote = "Tu viens ?", template = link(CardLinkId.ORBITE)))
        val separator = card.ops.filterIsInstance<CardOp.Separator>().single()
        assertThat(separator.radius).isEqualTo(11.0)
        assertThat(separator.dash).containsExactly(2.0, 14.0).inOrder()
        assertThat(card.ops.filterIsInstance<CardOp.Bar>()).hasSize(1)
    }

    @Test
    fun `the bubbles link paints one panel per block and no separator`() {
        val card = layout(input(quote = "Tu viens ?", template = link(CardLinkId.BULLES)))
        assertThat(card.ops.filterIsInstance<CardOp.Panel>()).hasSize(2)
        assertThat(card.ops.filterIsInstance<CardOp.Separator>()).isEmpty()
    }

    @Test
    fun `the silence link paints nothing between the blocks`() {
        val card = layout(input(quote = "Tu viens ?", template = link(CardLinkId.SILENCE)))
        assertThat(card.ops.filterIsInstance<CardOp.Separator>()).isEmpty()
        assertThat(card.ops.filterIsInstance<CardOp.Bar>()).isEmpty()
        assertThat(card.ops.filterIsInstance<CardOp.Dot>()).isEmpty()
    }

    @Test
    fun `the thread link paints a bar and a dot`() {
        val card = layout(input(quote = "Tu viens ?", template = link(CardLinkId.FIL)))
        assertThat(card.ops.filterIsInstance<CardOp.Dot>()).hasSize(1)
        assertThat(card.ops.filterIsInstance<CardOp.Bar>()).hasSize(2)
    }

    @Test
    fun `names above the text come before it and a signature comes after it`() {
        fun order(placement: CardAuthorPlacement) =
            layout(input(placement = placement)).ops.filterIsInstance<CardOp.Text>().map { it.text }
        assertThat(order(CardAuthorPlacement.ABOVE)).containsExactly("Awa", "Bonjour").inOrder()
        assertThat(order(CardAuthorPlacement.AFTER)).containsExactly("Bonjour", "— Awa").inOrder()
    }

    @Test
    fun `hiding the authors removes the name line`() {
        val texts = layout(input(showAuthors = false)).ops.filterIsInstance<CardOp.Text>().map { it.text }
        assertThat(texts).containsExactly("Bonjour")
    }

    @Test
    fun `the title and the date head the card`() {
        val texts = layout(input(title = "Famille", date = "27 octobre")).ops.filterIsInstance<CardOp.Text>().map { it.text }
        assertThat(texts.take(2)).containsExactly("Famille", "27 octobre").inOrder()
    }

    @Test
    fun `a tilted message is one rotated group and the header stays straight`() {
        val card = layout(input(title = "Famille", tilt = CardTilt.LEFT))
        val groups = card.ops.filterIsInstance<CardOp.Group>()
        assertThat(groups).hasSize(1)
        assertThat(groups.single().rotation).isWithin(1e-9).of(Math.toRadians(-4.0))
        assertThat(card.ops.first()).isInstanceOf(CardOp.Text::class.java)
    }

    @Test
    fun `a right to left reply starts at the right edge`() {
        val card = layout(input(reply = "مرحبا بالعالم"))
        val reply = card.ops.filterIsInstance<CardOp.Text>().last()
        assertThat(reply.align).isEqualTo(CardAlignment.RIGHT)
        assertThat(reply.x).isEqualTo(1080.0 - 96.0)
    }

    @Test
    fun `the watermark is Meeshy and the handle of who exports, never an author`() {
        assertThat(layout(input(handle = "@moi")).watermark).isEqualTo("Meeshy @moi")
        assertThat(layout(input(handle = null)).watermark).isEqualTo("Meeshy")
        assertThat(layout(input(handle = "  ")).watermark).isEqualTo("Meeshy")
    }

    @Test
    fun `a thumbnail keeps its separator readable once reduced`() {
        val card = layout(input(quote = "Tu viens ?", template = link(CardLinkId.ORBITE)))
        val reduced = card.legible(atScale = 72.0 / 1080.0)
        val separator = reduced.ops.filterIsInstance<CardOp.Separator>().single()
        assertThat(separator.lineWidth * (72.0 / 1080.0)).isAtLeast(1.5 - 1e-9)
        assertThat(card.legible(atScale = 1.0)).isEqualTo(card)
    }

    @Test
    fun `the input follows the format, anonymity and handles included`() {
        val subject = CardSubject(
            quoted = CardPart("Koffi", "Tu viens ?", handle = "koffi"),
            reply = CardPart("Awa", "Oui", handle = "awa"),
            sentAtMillis = 1_800_000_000_000L,
            quotedAtMillis = 1_799_999_000_000L,
        )
        val format = CardFormat.initial.copy(
            showConversationTitle = true, showDate = true, showTimes = true, useHandles = true, anonymizeQuoted = true,
        )
        val card = CardInput.of(
            subject, format, handle = "moi", conversationTitle = " Famille ", anonymousLabel = "Anonyme",
            formatDate = { "D" }, formatTime = { "T" },
        )
        assertThat(card.quoted?.author).isEqualTo("Anonyme")
        assertThat(card.reply.author).isEqualTo("@awa")
        assertThat(card.title).isEqualTo(" Famille ")
        assertThat(card.date).isEqualTo("D")
        assertThat(card.quotedTime).isEqualTo("T")
        assertThat(card.replyTime).isEqualTo("T")
        val bare = CardInput.of(subject, CardFormat.initial, handle = "moi", conversationTitle = "Famille", anonymousLabel = "Anonyme", formatDate = { "D" })
        assertThat(bare.title).isNull()
        assertThat(bare.date).isNull()
        assertThat(bare.replyTime).isNull()
    }
}
