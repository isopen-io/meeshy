package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.reading.focal.LongMessageExpansionLaw
import org.junit.Test

class LongMessageExpansionStateTest {

    private fun state(expandedId: String? = null, holdUntilMs: Long = 0L) =
        LongMessageExpansionState(expandedId, holdUntilMs)

    @Test
    fun `deplier un message le rend seul deplie et ancre son bord haut`() {
        val toggle = state().toggled("a", nowMs = 1_000L)

        assertThat(toggle.state.expandedId).isEqualTo("a")
        assertThat(toggle.isExpanding).isTrue()
        assertThat(toggle.anchor).isEqualTo(LongMessageExpansionLaw.Anchor.Top)
    }

    @Test
    fun `deplier un autre message replie le precedent un seul reste deplie`() {
        val toggle = state(expandedId = "a").toggled("b", nowMs = 1_000L)

        assertThat(toggle.state.expandedId).isEqualTo("b")
        assertThat(toggle.state.isExpanded("a")).isFalse()
        assertThat(toggle.isExpanding).isTrue()
    }

    @Test
    fun `retoucher le deplie le replie et ancre son bord bas`() {
        val toggle = state(expandedId = "a").toggled("a", nowMs = 1_000L)

        assertThat(toggle.state.expandedId).isNull()
        assertThat(toggle.isExpanding).isFalse()
        assertThat(toggle.anchor).isEqualTo(LongMessageExpansionLaw.Anchor.Bottom)
    }

    @Test
    fun `chaque bascule arme la fenetre de maintien de 0,65 s`() {
        val toggle = state().toggled("a", nowMs = 1_000L)

        assertThat(toggle.state.holdUntilMs).isEqualTo(1_000L + 650L)
    }

    @Test
    fun `les autres rangees s'attenuent a 0,62 tant que le deplie est visible`() {
        val expanded = state(expandedId = "a")

        assertThat(expanded.alphaFor("b", expandedRowOnScreen = true, nowMs = 5_000L)).isEqualTo(0.62f)
        assertThat(expanded.alphaFor("a", expandedRowOnScreen = true, nowMs = 5_000L)).isEqualTo(1f)
    }

    @Test
    fun `le deplie sorti de l'ecran rend leur opacite aux autres rangees`() {
        val expanded = state(expandedId = "a")

        assertThat(expanded.alphaFor("b", expandedRowOnScreen = false, nowMs = 5_000L)).isEqualTo(1f)
    }

    @Test
    fun `apres le repli l'attenuation tient jusqu'a la fin de la fenetre puis se leve`() {
        val collapsed = state(expandedId = "a").toggled("a", nowMs = 1_000L).state

        assertThat(collapsed.alphaFor("b", expandedRowOnScreen = false, nowMs = 1_300L)).isEqualTo(0.62f)
        assertThat(collapsed.alphaFor("b", expandedRowOnScreen = false, nowMs = 1_650L)).isEqualTo(1f)
    }

    @Test
    fun `sans message deplie ni fenetre aucune rangee n'est attenuee`() {
        assertThat(state().alphaFor("b", expandedRowOnScreen = false, nowMs = 10L)).isEqualTo(1f)
    }

    @Test
    fun `le repli ancre le bord bas et la compensation reste bornee`() {
        val toggle = state(expandedId = "a").toggled("a", nowMs = 0L)

        val delta = ChatScrollGeometry.anchoredScrollDelta(
            edgeBefore = 800f,
            edgeAfter = 2_000f,
            orientation = ChatListOrientation.BottomUp,
            maxDelta = 900f,
        )

        assertThat(toggle.anchor).isEqualTo(LongMessageExpansionLaw.Anchor.Bottom)
        assertThat(delta).isEqualTo(-900f)
    }
}
