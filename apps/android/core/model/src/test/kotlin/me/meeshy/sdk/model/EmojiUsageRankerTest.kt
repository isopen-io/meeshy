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

    @Test
    fun `equal usage and no canonical rank falls back to the emoji string`() {
        val usage = mapOf("b" to 2, "a" to 2, "c" to 2)
        val result = EmojiUsageRanker.topEmojis(usage, defaults = emptyList(), count = 3)
        assertThat(result).containsExactly("a", "b", "c").inOrder()
    }

    @Test
    fun `canonical rank beats the emoji string when usage ties`() {
        val usage = mapOf("a" to 1, "z" to 1)
        val result = EmojiUsageRanker.topEmojis(usage, defaults = listOf("z", "a"), count = 2)
        assertThat(result).containsExactly("z", "a").inOrder()
    }

    @Test
    fun `usage count beats canonical rank`() {
        val usage = mapOf("z" to 1, "a" to 5)
        val result = EmojiUsageRanker.topEmojis(usage, defaults = listOf("z", "a"), count = 2)
        assertThat(result).containsExactly("a", "z").inOrder()
    }

    @Test
    fun `the order does not depend on how the usage table was built`() {
        val forward = linkedMapOf("🔥" to 2, "😂" to 2, "🎉" to 2, "🍕" to 2)
        val backward = linkedMapOf("🍕" to 2, "🎉" to 2, "😂" to 2, "🔥" to 2)
        assertThat(EmojiUsageRanker.topEmojis(forward, defaults, count = 4))
            .isEqualTo(EmojiUsageRanker.topEmojis(backward, defaults, count = 4))
    }

    @Test
    fun `the history keeps the twenty latest`() {
        assertThat(EmojiUsageRanker.HISTORY_CAPACITY).isEqualTo(20)
        val history = (1..25).fold(emptyList<String>()) { acc, n -> EmojiUsageRanker.recordRecent(acc, "e$n") }
        assertThat(history).hasSize(20)
        assertThat(history.first()).isEqualTo("e25")
        assertThat(history.last()).isEqualTo("e6")
    }

    @Test
    fun `a reused emoji jumps to the front without a duplicate`() {
        val history = listOf("a", "b", "c")
        assertThat(EmojiUsageRanker.recordRecent(history, "c")).containsExactly("c", "a", "b").inOrder()
        assertThat(EmojiUsageRanker.recordRecent(history, "a")).containsExactly("a", "b", "c").inOrder()
    }

    @Test
    fun `several emojis recorded at once keep the last used as the most recent`() {
        val result = EmojiUsageRanker.recordRecent(listOf("x"), listOf("a", "b", "a", "c"))
        assertThat(result).containsExactly("c", "a", "b", "x").inOrder()
    }

    @Test
    fun `recording nothing leaves the history untouched`() {
        val history = listOf("a", "b")
        assertThat(EmojiUsageRanker.recordRecent(history, emptyList())).isEqualTo(history)
    }

    @Test
    fun `recording is immutable`() {
        val history = listOf("a")
        EmojiUsageRanker.recordRecent(history, "b")
        assertThat(history).containsExactly("a")
    }

    @Test
    fun `empty history falls back to the fifteen default quick reactions`() {
        val result = EmojiUsageRanker.topEmojis(emptyMap(), EmojiCatalog.defaultQuickReactions, count = 15)
        assertThat(result).containsExactlyElementsIn(EmojiCatalog.defaultQuickReactions).inOrder()
    }

    @Test
    fun `a used emoji leads and the fifteen defaults pad the rest`() {
        val result = EmojiUsageRanker.topEmojis(mapOf("🦄" to 3), EmojiCatalog.defaultQuickReactions, count = 15)
        assertThat(result).hasSize(15)
        assertThat(result.first()).isEqualTo("🦄")
        assertThat(result.drop(1)).containsExactlyElementsIn(EmojiCatalog.defaultQuickReactions.take(14)).inOrder()
    }
}
