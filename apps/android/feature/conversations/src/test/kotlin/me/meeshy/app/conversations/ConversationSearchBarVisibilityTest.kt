package me.meeshy.app.conversations

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.conversationlist.ConversationSearchBarScrollLaw
import org.junit.Test

class ConversationSearchBarVisibilityTest {

    private val hidden = ConversationSearchBarScrollLaw.State(hidden = true, anchor = 100f)
    private val shown = ConversationSearchBarScrollLaw.State(hidden = false, anchor = 0f)

    @Test
    fun `la barre est masquee quand la loi la masque et qu'on ne saisit pas`() {
        assertThat(ConversationSearchBarVisibility.isVisible(hidden, isFocused = false, query = "")).isFalse()
        assertThat(ConversationSearchBarVisibility.isVisible(shown, isFocused = false, query = "")).isTrue()
    }

    @Test
    fun `un texte non vide garde la barre visible`() {
        assertThat(ConversationSearchBarVisibility.isVisible(hidden, isFocused = false, query = "abc")).isTrue()
    }

    @Test
    fun `le focus garde la barre visible`() {
        assertThat(ConversationSearchBarVisibility.isVisible(hidden, isFocused = true, query = "")).isTrue()
    }

    @Test
    fun `des espaces seuls ne comptent pas comme une saisie`() {
        assertThat(ConversationSearchBarVisibility.isTyping(isFocused = false, query = "   ")).isFalse()
    }
}
