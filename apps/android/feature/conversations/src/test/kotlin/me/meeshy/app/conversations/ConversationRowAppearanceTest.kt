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
}
