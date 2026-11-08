package me.meeshy.sdk.model.feed

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** #16676 — le fil ne bouge pas au-dessus du post en lecture, et ce qui arrive en tête attend le lecteur. */
class FeedHeadHoldTest {

    private val shown = listOf("c", "b", "a")

    private fun holdingOver(displayed: List<String>) = FeedHeadHold().steered(holding = true, displayedIds = displayed)

    private fun FeedHeadHold.over(candidate: List<String>) = split(candidate) { it }

    @Test
    fun `sans retenue la liste candidate s'affiche entiere`() {
        val split = FeedHeadHold().over(listOf("new", "c", "b"))

        assertThat(split.displayed).containsExactly("new", "c", "b").inOrder()
        assertThat(split.held).isEmpty()
    }

    @Test
    fun `un post arrive en tete pendant la retenue reste hors de la liste et se compte`() {
        val split = holdingOver(shown).over(listOf("n2", "n1") + shown)

        assertThat(split.displayed).containsExactly("c", "b", "a").inOrder()
        assertThat(split.held).containsExactly("n2", "n1").inOrder()
    }

    @Test
    fun `lever la retenue rend les posts retenus a la tete dans l'ordre`() {
        val held = holdingOver(shown).over(listOf("n1") + shown).next

        val released = held.steered(holding = false, displayedIds = shown).over(listOf("n1") + shown)

        assertThat(released.displayed).containsExactly("n1", "c", "b", "a").inOrder()
        assertThat(released.held).isEmpty()
    }

    @Test
    fun `un post retenu puis supprime ne se compte plus`() {
        val hold = holdingOver(shown).over(listOf("n2", "n1") + shown).next

        val split = hold.over(listOf("n1") + shown)

        assertThat(split.held).containsExactly("n1")
        assertThat(split.displayed).containsExactly("c", "b", "a").inOrder()
    }

    @Test
    fun `une liste encore vide ne se retient jamais, le premier chargement s'affiche`() {
        val hold = FeedHeadHold().steered(holding = true, displayedIds = emptyList())

        assertThat(hold.isHolding).isFalse()
        assertThat(hold.over(shown).displayed).containsExactly("c", "b", "a").inOrder()
    }

    @Test
    fun `une retenue deja posee garde son ancre quand la liste affichee change`() {
        val hold = holdingOver(shown)

        val again = hold.steered(holding = true, displayedIds = listOf("n1") + shown)

        assertThat(again).isEqualTo(hold)
        assertThat(again.over(listOf("n1") + shown).held).containsExactly("n1")
    }

    @Test
    fun `une page chargee en queue pendant la retenue s'affiche et rejoint l'ancre`() {
        val split = holdingOver(shown).over(shown + listOf("z", "y"))

        assertThat(split.displayed).containsExactly("c", "b", "a", "z", "y").inOrder()
        assertThat(split.held).isEmpty()

        val afterAnchorsGone = split.next.over(listOf("n1", "z", "y"))
        assertThat(afterAnchorsGone.held).containsExactly("n1")
        assertThat(afterAnchorsGone.displayed).containsExactly("z", "y").inOrder()
    }

    @Test
    fun `quand plus aucun post affiche ne subsiste rien n'est retenu`() {
        val split = holdingOver(shown).over(listOf("n2", "n1"))

        assertThat(split.displayed).containsExactly("n2", "n1").inOrder()
        assertThat(split.held).isEmpty()
    }

    @Test
    fun `l'etat suivant est le meme objet quand rien de nouveau ne s'affiche`() {
        val hold = holdingOver(shown)

        assertThat(hold.over(listOf("n1") + shown).next).isSameInstanceAs(hold)
        assertThat(FeedHeadHold().over(shown).next).isEqualTo(FeedHeadHold())
    }

    @Test
    fun `le fil retient hors de l'ecran ou quand le lecteur a quitte le haut`() {
        assertThat(FeedHeadHold.holds(displayed = false, firstVisibleItemIndex = 0, headItems = 2)).isTrue()
        assertThat(FeedHeadHold.holds(displayed = true, firstVisibleItemIndex = 1, headItems = 2)).isFalse()
        assertThat(FeedHeadHold.holds(displayed = true, firstVisibleItemIndex = 2, headItems = 2)).isTrue()
        assertThat(FeedHeadHold.holds(displayed = true, firstVisibleItemIndex = 3, headItems = 4)).isFalse()
    }

    @Test
    fun `la banniere n'annonce jamais moins de posts que la retenue n'en garde`() {
        assertThat(FeedHeadHold.bannerCount(arrivals = 1, held = 3)).isEqualTo(3)
        assertThat(FeedHeadHold.bannerCount(arrivals = 2, held = 0)).isEqualTo(2)
    }
}
