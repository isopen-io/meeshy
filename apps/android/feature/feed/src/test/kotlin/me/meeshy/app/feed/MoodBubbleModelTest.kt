package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StatusEntry
import org.junit.Test

class MoodBubbleModelTest {

    private fun entry(userId: String = "u1", reactions: Map<String, Int>? = null) = StatusEntry(
        id = "s1", userId = userId, username = "amina", moodEmoji = "🔥", content = "En feu", viaUsername = "zoe", reactionSummary = reactions,
    )

    @Test
    fun `l humeur d un ami offre trois gestes, reagir, republier, repondre`() {
        val model = MoodBubbleModel.of(entry(), currentUserId = "me")
        assertThat(model.canReact).isTrue()
        assertThat(model.canRepublish).isTrue()
        assertThat(model.canReply).isTrue()
        assertThat(model.content).isEqualTo("En feu")
        assertThat(model.viaUsername).isEqualTo("zoe")
    }

    @Test
    fun `sa propre humeur n offre aucun geste`() {
        val model = MoodBubbleModel.of(entry(userId = "me"), currentUserId = "me")
        assertThat(model.canReact).isFalse()
        assertThat(model.canRepublish).isFalse()
        assertThat(model.canReply).isFalse()
    }

    @Test
    fun `les reactions posees se lisent par compte decroissant, a egalite par emoji`() {
        val model = MoodBubbleModel.of(entry(reactions = mapOf("😂" to 1, "❤️" to 3, "👍" to 1, "🔥" to 0)), currentUserId = "me")
        assertThat(model.reactions.map { it.emoji to it.count }).containsExactly("❤️" to 3, "👍" to 1, "😂" to 1).inOrder()
    }
}
