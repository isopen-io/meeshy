package me.meeshy.app.chat.export

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.card.PostCommentCardPart
import me.meeshy.sdk.model.card.PostCommentCardSubject
import me.meeshy.sdk.model.card.PostCommentCardThreadLine
import org.junit.Test

/**
 * #14537 — le fil d'une carte de commentaire se lit comme sur iOS (`MessageCardThread`) : une réponse RETIRÉE de 44 sous sa
 * racine, au plus trois niveaux, précédée de la séparation de la liaison du template, sa longueur décroissant par niveau.
 */
class CardThreadTest {

    private val measure: CardMeasure = { text, font -> text.length * font.size * 0.5 }
    private val font = CardFont(CardFace.system(400), 20.0)

    private val thread = listOf(
        CardThreadLine("Bob : Magnifique", 0),
        CardThreadLine("Cleo : Tu étais où ?", 1),
        CardThreadLine("Dan : Au port", 5),
    )

    private fun card(link: CardLinkId = CardLinkId.FILET, lines: List<CardThreadLine> = thread, aspect: CardAspect = CardAspect.AUTO) =
        CardLayoutEngine.layout(
            CardInput(
                quoted = CardPart("Awa", "Coucher de soleil"),
                reply = CardPart("Fil de commentaires", lines.joinToString("\n") { it.text }, thread = lines),
                template = CardTemplates.defaultId.with(link = link),
                handle = "moi",
                aspect = aspect,
            ),
            measure,
        )

    private fun CardLayout.texts() = ops.filterIsInstance<CardOp.Text>()

    @Test
    fun `each entry is wrapped in the room its level leaves, a separation row before every reply, three levels at most`() {
        val rows = CardThread.rows(thread, width = 888.0, font = font, measure = measure)

        assertThat(rows).containsExactly(
            CardThread.Row("Bob : Magnifique", 0, separator = false),
            CardThread.Row("", 1, separator = true),
            CardThread.Row("Cleo : Tu étais où ?", 1, separator = false),
            CardThread.Row("", 3, separator = true),
            CardThread.Row("Dan : Au port", 3, separator = false),
        ).inOrder()
        assertThat(CardThread.rows(listOf(CardThreadLine("x".repeat(30), 3)), width = 300.0, font = font, measure = measure).drop(1).map { it.text })
            .containsExactly("x".repeat(24), "x".repeat(6)).inOrder()
    }

    @Test
    fun `a level shifts by 44 and its separation shortens by 44, never under 44`() {
        assertThat(listOf(0, 1, 2, 3, 9).map(CardThread::shift)).containsExactly(0.0, 44.0, 88.0, 132.0, 132.0).inOrder()
        assertThat(listOf(1, 2, 3, 5).map(CardThread::separatorWidth)).containsExactly(160.0, 116.0, 72.0, 44.0).inOrder()
    }

    @Test
    fun `the card paints each entry at its level, the separation of its link in between`() {
        val layout = card(CardLinkId.FILET)
        val root = layout.texts().single { it.text == "Bob : Magnifique" }
        val reply = layout.texts().single { it.text == "Cleo : Tu étais où ?" }
        val deep = layout.texts().single { it.text == "Dan : Au port" }
        val separators = layout.ops.filterIsInstance<CardOp.Separator>().filter { it.y > root.y }

        assertThat(reply.x).isEqualTo(root.x + 44)
        assertThat(deep.x).isEqualTo(root.x + 132)
        assertThat(separators.map { it.x1 to it.x2 }).containsExactly(root.x + 44 to root.x + 204, root.x + 132 to root.x + 204).inOrder()
        assertThat(separators.first().y).isGreaterThan(root.y)
        assertThat(separators.first().y).isLessThan(reply.y)
        assertThat(separators.map { it.lineWidth }.distinct()).containsExactly(4.0)
        assertThat(layout.texts().none { it.text.contains("Magnifique") && it.text.contains("Cleo") }).isTrue()
    }

    @Test
    fun `the orbit separates with a dotted line, the arrow with its glyph, silence with nothing`() {
        val orbit = card(CardLinkId.ORBITE).ops.filterIsInstance<CardOp.Separator>().filter { it.radius == 0.0 }
        val arrow = card(CardLinkId.FLECHE)
        val root = arrow.texts().single { it.text == "Bob : Magnifique" }
        val silence = card(CardLinkId.SILENCE)

        assertThat(orbit.map { it.dash }).containsExactly(listOf(2.0, 14.0), listOf(2.0, 14.0))
        assertThat(arrow.texts().filter { it.text == "↳" && it.x == root.x + 44 }).hasSize(1)
        assertThat(silence.ops.filterIsInstance<CardOp.Separator>()).isEmpty()
        assertThat(silence.texts().single { it.text == "Cleo : Tu étais où ?" }.x).isEqualTo(silence.texts().single { it.text == "Bob : Magnifique" }.x + 44)
    }

    @Test
    fun `a right to left thread shifts toward the left`() {
        val lines = listOf(CardThreadLine("أحمد : جميل", 0), CardThreadLine("ليلى : أين كنت؟", 1))
        val layout = card(lines = lines)

        assertThat(layout.texts().single { it.text == "ليلى : أين كنت؟" }.x).isEqualTo(layout.texts().single { it.text == "أحمد : جميل" }.x - 44)
    }

    @Test
    fun `a long thread cut on a fixed card never ends on a separation`() {
        val long = (0 until 40).map { CardThreadLine("Entrée numéro $it du fil, assez longue pour occuper une ligne entière", if (it % 2 == 0) 0 else 1) }
        val layout = card(lines = long, aspect = CardAspect.SQUARE)
        val texts = layout.texts()
        val separators = layout.ops.filterIsInstance<CardOp.Separator>().filter { it.lineWidth == 4.0 }

        assertThat(layout.truncated).isTrue()
        assertThat(separators).isNotEmpty()
        assertThat(separators.maxOf { it.y }).isLessThan(texts.maxOf { it.y })
        assertThat(texts.maxBy { it.y }.text).endsWith("…")
    }

    @Test
    fun `the composed comment card hands its thread to the card, through the format and its handles`() {
        val composed = PostCommentCardSubject(
            quoted = PostCommentCardPart("Awa", "Coucher de soleil", "awa"),
            reply = PostCommentCardPart("Fil de commentaires", "Bob : Magnifique\nCleo : Tu étais où ?", null),
            thread = listOf(PostCommentCardThreadLine("Bob : Magnifique", 0), PostCommentCardThreadLine("Cleo : Tu étais où ?", 1)),
            sentAtMillis = 2_000L,
            quotedAtMillis = 1_000L,
            media = emptyList(),
        )
        val expected = listOf(CardThreadLine("Bob : Magnifique", 0), CardThreadLine("Cleo : Tu étais où ?", 1))
        val subject = CardSubjects.of(composed)
        val input = CardInput.of(
            subject, CardFormat.initial.copy(useHandles = true), handle = "moi", conversationTitle = null, anonymousLabel = "Anonyme",
            formatDate = { "D" },
        )

        assertThat(subject.reply.thread).isEqualTo(expected)
        assertThat(input.reply.thread).isEqualTo(expected)
    }
}
