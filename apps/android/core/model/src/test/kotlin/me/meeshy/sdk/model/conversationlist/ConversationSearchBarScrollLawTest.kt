package me.meeshy.sdk.model.conversationlist

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ConversationSearchBarScrollLawTest {

    private fun settle(state: ConversationSearchBarScrollLaw.State, vararg depths: Float) =
        depths.fold(state) { acc, depth -> ConversationSearchBarScrollLaw.next(acc, depth) }

    @Test
    fun `la barre reste visible dans la zone haute de 30 dp`() {
        val next = settle(ConversationSearchBarScrollLaw.State.Initial, 10f, 30f)

        assertThat(next.hidden).isFalse()
        assertThat(next.anchor).isEqualTo(30f)
    }

    @Test
    fun `la barre se masque quand la profondeur augmente de 12 dp ou plus`() {
        val next = settle(ConversationSearchBarScrollLaw.State.Initial, 30f, 43f)

        assertThat(next.hidden).isTrue()
        assertThat(next.anchor).isEqualTo(43f)
    }

    @Test
    fun `une descente de moins de 12 dp ne masque pas la barre`() {
        val next = settle(ConversationSearchBarScrollLaw.State.Initial, 30f, 41f)

        assertThat(next.hidden).isFalse()
        assertThat(next.anchor).isEqualTo(30f)
    }

    @Test
    fun `masquee la barre revient quand la profondeur diminue de 12 dp ou plus`() {
        val next = settle(ConversationSearchBarScrollLaw.State.Initial, 30f, 100f, 88f)

        assertThat(next.hidden).isFalse()
        assertThat(next.anchor).isEqualTo(88f)
    }

    @Test
    fun `un rebond de moins de 12 dp ne fait pas clignoter la barre masquee`() {
        val next = settle(ConversationSearchBarScrollLaw.State.Initial, 30f, 100f, 95f, 99f, 90f)

        assertThat(next.hidden).isTrue()
        assertThat(next.anchor).isEqualTo(100f)
    }

    @Test
    fun `masquee la barre revient toujours en zone haute`() {
        val next = settle(ConversationSearchBarScrollLaw.State.Initial, 30f, 400f, 20f)

        assertThat(next.hidden).isFalse()
        assertThat(next.anchor).isEqualTo(20f)
    }

    @Test
    fun `la profondeur est l'oppose du decalage de defilement`() {
        val next = ConversationSearchBarScrollLaw.nextForOffset(
            ConversationSearchBarScrollLaw.State.Initial,
            offset = -31f,
        )
        val hidden = ConversationSearchBarScrollLaw.nextForOffset(next, offset = -60f)

        assertThat(hidden.hidden).isTrue()
    }

    @Test
    fun `jamais masquee pendant la saisie`() {
        val hiddenState = ConversationSearchBarScrollLaw.State(hidden = true, anchor = 100f)

        assertThat(ConversationSearchBarScrollLaw.isVisible(hiddenState, isTyping = true)).isTrue()
        assertThat(ConversationSearchBarScrollLaw.isVisible(hiddenState, isTyping = false)).isFalse()
    }

    @Test
    fun `pendant la saisie la loi n'avance pas`() {
        val state = ConversationSearchBarScrollLaw.State(hidden = false, anchor = 31f)

        val next = ConversationSearchBarScrollLaw.advance(state, depth = 200f, isTyping = true)

        assertThat(next).isEqualTo(state)
    }

    @Test
    fun `le focus est perdu seulement a la transition visible vers masquee`() {
        val shown = ConversationSearchBarScrollLaw.State(hidden = false, anchor = 31f)
        val hidden = ConversationSearchBarScrollLaw.State(hidden = true, anchor = 50f)

        assertThat(ConversationSearchBarScrollLaw.dropsFocus(shown, hidden)).isTrue()
        assertThat(ConversationSearchBarScrollLaw.dropsFocus(hidden, hidden)).isFalse()
        assertThat(ConversationSearchBarScrollLaw.dropsFocus(hidden, shown)).isFalse()
    }
}
