package me.meeshy.app.chat.export

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * #13922 — le média du support ouvre la carte d'un commentaire (iOS `MessageCardHero`) : grand, pleine largeur dans ses
 * marges de 48, AVANT la ligne du support ; sa hauteur suit son rapport, bornée du 16:9 au 4:5 et à 45 % du budget.
 */
class CardHeroTest {

    private val measure: CardMeasure = { text, font -> text.length * font.size * 0.5 }

    private fun hero(aspect: Double?) = CardMedia("p", CardMediaKind.IMAGE, "https://cdn.test/p.jpg", aspect = aspect)

    private fun card(hero: CardMedia?) = CardLayoutEngine.layout(
        CardInput(
            quoted = CardPart("Awa", "Coucher de soleil"), reply = CardPart("Bob", "Magnifique"),
            template = CardTemplates.defaultId, handle = "moi", hero = hero,
        ),
        measure,
    )

    private fun heroOf(layout: CardLayout) = layout.ops.filterIsInstance<CardOp.Picture>().single()

    @Test
    fun `the hero of the support opens the card, full width within its margins, before the quote`() {
        val layout = card(hero(aspect = 1.6))
        val picture = heroOf(layout)
        val quote = layout.ops.filterIsInstance<CardOp.Text>().first { it.text.contains("Coucher") }

        assertThat(picture.media.id).isEqualTo("p")
        assertThat(picture.x).isEqualTo(48.0)
        assertThat(picture.width).isEqualTo(984.0)
        assertThat(picture.height).isEqualTo(615.0)
        assertThat(layout.ops.indexOf(picture)).isLessThan(layout.ops.indexOf(quote))
        assertThat(quote.y).isGreaterThan(picture.y + picture.height + 40)
    }

    @Test
    fun `a tall hero stops at 45 percent of the budget, an unknown one takes 4 by 3, a panorama 16 by 9`() {
        assertThat(heroOf(card(hero(aspect = 0.5))).height).isEqualTo(741.0)
        assertThat(heroOf(card(hero(aspect = null))).height).isEqualTo(738.0)
        assertThat(heroOf(card(hero(aspect = 3.0))).height).isEqualTo(554.0)
    }

    @Test
    fun `the hero makes room for itself, the card grows and the text keeps its size`() {
        val bare = card(hero = null)
        val withHero = card(hero(aspect = 1.6))
        fun replySize(layout: CardLayout) = layout.ops.filterIsInstance<CardOp.Text>().first { it.text == "Magnifique" }.font.size

        assertThat(bare.ops.filterIsInstance<CardOp.Picture>()).isEmpty()
        assertThat(withHero.height).isGreaterThan(bare.height)
        assertThat(withHero.truncated).isFalse()
        assertThat(replySize(withHero)).isEqualTo(replySize(bare))
    }
}
