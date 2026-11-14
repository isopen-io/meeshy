package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * #18556 — la ligne d'un éphémère qui vient de mourir reste à l'écran le temps de sa combustion, allumée, puis part ;
 * ce qui n'était pas montré, ce qui est masqué par l'utilisateur et ce qui n'est pas éphémère partent sans feu.
 */
class EphemeralBurnHoldTest {

    private data class Row(val id: String, val at: Int, val ephemeral: Boolean = false, val litAt: Long? = null)

    private val rules = EphemeralBurnHold.Rules<Row>(
        key = { it.id },
        burns = { it.ephemeral },
        ignite = { row, now -> row.copy(litAt = now) },
        order = compareBy { it.at },
    )

    private val a = Row("a", 1)
    private val e = Row("e", 2, ephemeral = true)
    private val c = Row("c", 3)

    @Test
    fun `un ephemere montre qui disparait reste a sa place, allume, le temps de la combustion`() {
        val first = EphemeralBurnHold<Row>().next(listOf(a, e, c), nowMillis = 0L, rules = rules)
        val gone = first.hold.next(listOf(a, c), nowMillis = 500L, rules = rules)

        assertThat(gone.shown).containsExactly(a, e.copy(litAt = 500L), c).inOrder()
        assertThat(gone.hold.nextWakeMillis).isEqualTo(500L + EphemeralBurnLaw.FULL_MILLIS)
    }

    @Test
    fun `la combustion achevee, la ligne part`() {
        val first = EphemeralBurnHold<Row>().next(listOf(a, e, c), nowMillis = 0L, rules = rules)
        val burning = first.hold.next(listOf(a, c), nowMillis = 500L, rules = rules).hold
        val after = burning.expire(500L + EphemeralBurnLaw.FULL_MILLIS).next(listOf(a, c), nowMillis = 1_700L, rules = rules)

        assertThat(after.shown).containsExactly(a, c).inOrder()
        assertThat(after.hold.nextWakeMillis).isNull()
    }

    @Test
    fun `une emission de plus pendant le feu ne le rallume pas`() {
        val first = EphemeralBurnHold<Row>().next(listOf(a, e, c), nowMillis = 0L, rules = rules)
        val burning = first.hold.next(listOf(a, c), nowMillis = 500L, rules = rules).hold
        val again = burning.next(listOf(a, c), nowMillis = 900L, rules = rules)

        assertThat(again.shown).containsExactly(a, e.copy(litAt = 500L), c).inOrder()
        assertThat(again.hold.nextWakeMillis).isEqualTo(500L + EphemeralBurnLaw.FULL_MILLIS)
    }

    @Test
    fun `un message ordinaire qui disparait part sans feu`() {
        val first = EphemeralBurnHold<Row>().next(listOf(a, e, c), nowMillis = 0L, rules = rules)
        val gone = first.hold.next(listOf(e, c), nowMillis = 500L, rules = rules)

        assertThat(gone.shown).containsExactly(e, c).inOrder()
        assertThat(gone.hold.burning).isEmpty()
    }

    @Test
    fun `un ephemere jamais montre part sans feu - on n'assiste pas a une destruction passee`() {
        val first = EphemeralBurnHold<Row>().next(listOf(a, c), nowMillis = 0L, rules = rules)

        assertThat(first.shown).containsExactly(a, c).inOrder()
        assertThat(first.hold.burning).isEmpty()
    }

    @Test
    fun `un ephemere masque par l'utilisateur part sans feu`() {
        val first = EphemeralBurnHold<Row>().next(listOf(a, e, c), nowMillis = 0L, rules = rules)
        val hidden = first.hold.next(listOf(a, c), nowMillis = 500L, rules = rules, concealed = setOf("e"))

        assertThat(hidden.shown).containsExactly(a, c).inOrder()
    }

    @Test
    fun `un changement de fenetre n'est pas une mort`() {
        val first = EphemeralBurnHold<Row>().next(listOf(a, e, c), nowMillis = 0L, rules = rules)
        val moved = first.hold.reset().next(listOf(a), nowMillis = 500L, rules = rules)

        assertThat(moved.shown).containsExactly(a)
    }
}
