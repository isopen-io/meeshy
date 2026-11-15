package me.meeshy.sdk.model.reading.focal

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import org.junit.Test

/** Aucun détail du message magnifié ne recouvre de texte, ni le sien ni celui de ses voisines. */
class FocalElectionClearanceTest {

    private val pad = FocalMetrics.Row.PADDING_VERTICAL
    private val margin = FocalScrollPerspective.ELECTED_CARD_MARGIN
    private val heights = listOf(44.0, 60.0, 140.0, 420.0)
    private val scales = listOf(
        1.0,
        FocalScrollPerspective.electedScale(false, 390.0),
        1 + FocalMetrics.Focus.LOUPE_GAIN,
    )

    private data class Layout(
        val card: FocalScrollPerspective.Span,
        val identity: FocalScrollPerspective.Span,
        val own: FocalScrollPerspective.Span,
        val strip: FocalScrollPerspective.Span,
        val previousTextBottom: Double,
        val nextTextTop: Double,
    )

    private fun layout(head: Boolean, nextHead: Boolean = false, height: Double, scale: Double): Layout {
        val clearance = FocalScrollPerspective.electionClearance(head, height, scale)
        val above = FocalScrollPerspective.electionShift(-1_000.0, 0.0, clearance)
        val below = FocalScrollPerspective.electionShift(1_000.0, 0.0, clearance)
        val g = FocalScrollPerspective.electedGeometry(head, height, scale)
        val nextTop = pad + if (nextHead) FocalMetrics.Row.GROUP_TOP_PADDING else 0.0
        return Layout(g.card, g.identityChip, g.content, g.strip, -pad + above, height + nextTop + below)
    }

    @Test
    fun `l identite et la bande vivent dans le cadre a une marge reguliere`() {
        for (head in listOf(true, false)) {
            val l = layout(head, height = 60.0, scale = 1.0)
            assertThat(l.identity.top - l.card.top).isWithin(1e-3).of(margin)
            assertThat(l.card.bottom - l.strip.bottom).isWithin(1e-3).of(margin)
        }
        assertThat(margin).isAtLeast(10.0)
        assertThat(margin).isEqualTo(FocalMetrics.Row.PADDING_HORIZONTAL - FocalScrollPerspective.FOCUS_CARD_HORIZONTAL_INSET)
    }

    @Test
    fun `la pastille d identite ne mord jamais le texte de son propre message`() {
        for (head in listOf(true, false)) for (scale in scales) {
            val l = layout(head, height = 60.0, scale = scale)
            assertThat(l.identity.bottom).isAtMost(l.own.top + 1e-3)
        }
    }

    @Test
    fun `la bande basse ne mord jamais la derniere ligne de son propre message`() {
        for (head in listOf(true, false)) for (scale in scales) {
            val l = layout(head, height = 60.0, scale = scale)
            assertThat(l.strip.top).isGreaterThan(l.own.bottom)
        }
    }

    @Test
    fun `le cadre ne recouvre jamais le message precedent`() {
        for (head in listOf(true, false)) for (height in heights) for (scale in scales) {
            val l = layout(head, height = height, scale = scale)
            assertWithMessage("tete=$head h=$height loupe=$scale").that(l.previousTextBottom).isLessThan(l.card.top)
        }
    }

    @Test
    fun `le cadre ne recouvre jamais le message suivant`() {
        for (head in listOf(true, false)) for (nextHead in listOf(true, false))
            for (height in heights) for (scale in scales) {
                val l = layout(head, nextHead, height, scale)
                assertWithMessage("tete=$head suivante=$nextHead h=$height loupe=$scale")
                    .that(l.card.bottom).isLessThan(l.nextTextTop)
            }
    }

    @Test
    fun `seules les voisines bougent et aucune rangee n est magnifiee sans passage`() {
        val clearance = FocalScrollPerspective.electionClearance(false, 60.0, 1.2)
        assertThat(FocalScrollPerspective.electionShift(10.0, 10.0, clearance)).isEqualTo(0.0)
        assertThat(FocalScrollPerspective.electionShift(0.0, 10.0, clearance)).isLessThan(0.0)
        assertThat(FocalScrollPerspective.electionShift(20.0, 10.0, clearance)).isGreaterThan(0.0)
        assertThat(FocalScrollPerspective.electionShift(20.0, null, clearance)).isEqualTo(0.0)
    }

    @Test
    fun `le passage grandit avec la hauteur du message magnifie vers le dessous seulement`() {
        val short = FocalScrollPerspective.electionClearance(false, 60.0, 1.2)
        val tall = FocalScrollPerspective.electionClearance(false, 300.0, 1.2)
        assertThat(tall.above).isWithin(1e-3).of(short.above)
        assertThat(tall.below).isGreaterThan(short.below)
    }
}
