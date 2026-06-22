package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Verifies the quick-reaction usage ordering mirrors iOS
 * `EmojiUsageTracker.topEmojis` / `sortedEmojis` semantics exactly — including
 * the deterministic total order that keeps the strip stable across renders.
 */
class EmojiUsageRankerTest {

    private val defaults = listOf("❤️", "😂", "🔥", "👏", "😮", "😢")

    @Test
    fun `no usage returns the defaults in canonical order`() {
        val result = EmojiUsageRanker.topEmojis(emptyMap(), defaults, count = 4)
        assertThat(result).containsExactly("❤️", "😂", "🔥", "👏").inOrder()
    }

    @Test
    fun `most-used emojis lead, padded with remaining defaults`() {
        val usage = mapOf("😢" to 5, "🔥" to 2)
        val result = EmojiUsageRanker.topEmojis(usage, defaults, count = 4)
        assertThat(result).containsExactly("😢", "🔥", "❤️", "😂").inOrder()
    }

    @Test
    fun `equal usage breaks ties by canonical rank then emoji`() {
        // Both used once: 👏 (rank 3) precedes 😮 (rank 4); an untracked-rank
        // emoji would fall to the emoji-string tie-break.
        val usage = mapOf("😮" to 1, "👏" to 1)
        val result = EmojiUsageRanker.topEmojis(usage, defaults, count = 6)
        assertThat(result.indexOf("👏")).isLessThan(result.indexOf("😮"))
    }

    @Test
    fun `tracked emoji outside defaults appears before unused defaults`() {
        val usage = mapOf("🎉" to 3)
        val result = EmojiUsageRanker.topEmojis(usage, defaults, count = 3)
        assertThat(result).containsExactly("🎉", "❤️", "😂").inOrder()
    }

    @Test
    fun `result never exceeds count and de-duplicates`() {
        val usage = mapOf("❤️" to 9, "😂" to 4)
        val result = EmojiUsageRanker.topEmojis(usage, defaults, count = 3)
        assertThat(result).hasSize(3)
        assertThat(result.toSet()).hasSize(3)
        assertThat(result.first()).isEqualTo("❤️")
    }

    @Test
    fun `zero or negative count yields empty`() {
        assertThat(EmojiUsageRanker.topEmojis(mapOf("❤️" to 1), defaults, count = 0)).isEmpty()
        assertThat(EmojiUsageRanker.topEmojis(emptyMap(), defaults, count = -1)).isEmpty()
    }

    @Test
    fun `ordering is stable across repeated calls for equal scores`() {
        val usage = mapOf("❤️" to 1, "😂" to 1, "🔥" to 1, "👏" to 1)
        val first = EmojiUsageRanker.topEmojis(usage, defaults, count = 6)
        val second = EmojiUsageRanker.topEmojis(usage, defaults, count = 6)
        assertThat(first).isEqualTo(second)
    }

    @Test
    fun `sortedByUsage keeps input order when no usage recorded`() {
        assertThat(EmojiUsageRanker.sortedByUsage(defaults, emptyMap()))
            .isEqualTo(defaults)
    }

    @Test
    fun `sortedByUsage promotes used emojis with stable tie-break`() {
        val usage = mapOf("😮" to 3, "😂" to 3)
        val result = EmojiUsageRanker.sortedByUsage(defaults, usage)
        // 😂 (original index 1) precedes 😮 (index 4) on the count tie.
        assertThat(result.indexOf("😂")).isLessThan(result.indexOf("😮"))
        assertThat(result.first()).isAnyOf("😂", "😮")
    }

    @Test
    fun `record increments usage immutably`() {
        val once = EmojiUsageRanker.record(emptyMap(), "🔥")
        val twice = EmojiUsageRanker.record(once, "🔥")
        assertThat(once["🔥"]).isEqualTo(1)
        assertThat(twice["🔥"]).isEqualTo(2)
    }
}
