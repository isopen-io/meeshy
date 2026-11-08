package me.meeshy.sdk.model.mood

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StatusReactionDeltaTest {
    @Test
    fun `un compteur ne devient jamais negatif`() {
        assertThat(StatusReactionDelta.apply(mapOf("🔥" to 1), "🔥", -3, "a", "me")).isEmpty()
        assertThat(StatusReactionDelta.apply(null, "🔥", -1, "a", "me")).isNull()
    }

    @Test
    fun `mes propres reactions sont ignorees`() {
        val summary = mapOf("🔥" to 2)
        assertThat(StatusReactionDelta.apply(summary, "🔥", 1, "me", "me")).isSameInstanceAs(summary)
        assertThat(StatusReactionDelta.apply(summary, "🔥", -1, "me", "me")).isSameInstanceAs(summary)
    }

    @Test
    fun `la reaction d un autre incremente et un emoji epuise quitte le resume`() {
        assertThat(StatusReactionDelta.apply(mapOf("🔥" to 1), "🔥", 1, "a", "me")).containsExactly("🔥", 2)
        assertThat(StatusReactionDelta.apply(mapOf("🔥" to 1, "❤️" to 1), "🔥", -1, "a", "me")).containsExactly("❤️", 1)
        assertThat(StatusReactionDelta.apply(null, "🔥", 1, "a", null)).containsExactly("🔥", 1)
    }
}
