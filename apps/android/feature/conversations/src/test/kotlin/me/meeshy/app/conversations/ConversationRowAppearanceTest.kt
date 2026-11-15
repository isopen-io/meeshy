package me.meeshy.app.conversations

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiConversationPreferences
import org.junit.Test

/** Parité iOS `LentilleConversationRow` : sourdine atténuée, émoji favori après le nom. */
class ConversationRowAppearanceTest {

    @Test
    fun `a muted conversation row is dimmed to the Lentille muted opacity`() {
        assertThat(ConversationRowAppearance.rowOpacity(isMuted = true)).isEqualTo(0.55f)
    }

    @Test
    fun `a conversation that is not muted keeps full opacity`() {
        assertThat(ConversationRowAppearance.rowOpacity(isMuted = false)).isEqualTo(1f)
    }

    @Test
    fun `the favorite emoji is shown after the name`() {
        assertThat(ConversationRowAppearance.favoriteEmoji(ApiConversationPreferences(reaction = "⭐"))).isEqualTo("⭐")
    }

    @Test
    fun `a cleared favorite (empty string) shows nothing`() {
        assertThat(ConversationRowAppearance.favoriteEmoji(ApiConversationPreferences(reaction = ""))).isNull()
        assertThat(ConversationRowAppearance.favoriteEmoji(null)).isNull()
    }

    @Test
    fun `a muted row held for a drag composes both opacities`() {
        assertThat(ConversationRowAppearance.rowOpacity(isMuted = true, isDragging = true)).isWithin(1e-6f).of(0.44f)
        assertThat(ConversationRowAppearance.rowOpacity(isMuted = false, isDragging = true)).isWithin(1e-6f).of(0.8f)
        assertThat(ConversationRowAppearance.rowOpacity(isMuted = false, isDragging = false)).isEqualTo(1f)
    }

    @Test
    fun `a dragged row grows by two percent`() {
        assertThat(ConversationRowAppearance.dragScale(isDragging = true)).isEqualTo(1.02f)
        assertThat(ConversationRowAppearance.dragScale(isDragging = false)).isEqualTo(1f)
    }

    @Test
    fun `at most three tag dots are drawn, in order`() {
        assertThat(ConversationRowAppearance.tagDots(listOf("a", "b", "c", "d"))).containsExactly("a", "b", "c").inOrder()
        assertThat(ConversationRowAppearance.tagDots(listOf("a"))).containsExactly("a")
    }
}
