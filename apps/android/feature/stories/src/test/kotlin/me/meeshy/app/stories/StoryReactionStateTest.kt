package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural spec for the pure [StoryReactionState] reducer that backs the
 * story viewer's quick-reaction strip. It models an OPTIMISTIC local tap plus
 * an idempotent reconciliation with the realtime `story:reacted`/`story:unreacted`
 * deltas, so a user's own optimistic +1 is never double-counted when the socket
 * echoes it back (parity with iOS `applyStoryReactionDelta`, but optimistic).
 */
class StoryReactionStateTest {

    @Test
    fun `local reaction increments the count and records the emoji as mine`() {
        val next = StoryReactionState(count = 3).reactedLocally("🔥")

        assertThat(next.count).isEqualTo(4)
        assertThat(next.mine).containsExactly("🔥")
        assertThat(next.hasReacted).isTrue()
    }

    @Test
    fun `reacting again with the same emoji is idempotent`() {
        val once = StoryReactionState(count = 0).reactedLocally("❤️")
        val twice = once.reactedLocally("❤️")

        assertThat(twice).isEqualTo(once)
        assertThat(twice.count).isEqualTo(1)
        assertThat(twice.mine).containsExactly("❤️")
    }

    @Test
    fun `reacting with a different emoji adds a second distinct reaction`() {
        val next = StoryReactionState(count = 1, mine = setOf("❤️")).reactedLocally("😂")

        assertThat(next.count).isEqualTo(2)
        assertThat(next.mine).containsExactly("❤️", "😂")
    }

    @Test
    fun `someone else's reaction delta increments the count without touching mine`() {
        val next = StoryReactionState(count = 5, mine = setOf("❤️"))
            .applyDelta("🔥", delta = 1, isOwn = false)

        assertThat(next.count).isEqualTo(6)
        assertThat(next.mine).containsExactly("❤️")
    }

    @Test
    fun `my own add echo is idempotent against the optimistic count`() {
        val optimistic = StoryReactionState(count = 0).reactedLocally("🔥")
        val afterEcho = optimistic.applyDelta("🔥", delta = 1, isOwn = true)

        assertThat(afterEcho).isEqualTo(optimistic)
        assertThat(afterEcho.count).isEqualTo(1)
        assertThat(afterEcho.mine).containsExactly("🔥")
    }

    @Test
    fun `my own add echo for an un-optimistic emoji still counts once`() {
        // e.g. reacted from another device: not yet in `mine`, so the echo applies.
        val next = StoryReactionState(count = 2).applyDelta("👏", delta = 1, isOwn = true)

        assertThat(next.count).isEqualTo(3)
        assertThat(next.mine).containsExactly("👏")
    }

    @Test
    fun `a removal delta decrements the count and drops my emoji`() {
        val next = StoryReactionState(count = 4, mine = setOf("❤️", "🔥"))
            .applyDelta("🔥", delta = -1, isOwn = true)

        assertThat(next.count).isEqualTo(3)
        assertThat(next.mine).containsExactly("❤️")
    }

    @Test
    fun `someone else's removal decrements the count but keeps my reactions`() {
        val next = StoryReactionState(count = 4, mine = setOf("❤️"))
            .applyDelta("😂", delta = -1, isOwn = false)

        assertThat(next.count).isEqualTo(3)
        assertThat(next.mine).containsExactly("❤️")
    }

    @Test
    fun `the count never goes below zero`() {
        val next = StoryReactionState(count = 0, mine = emptySet())
            .applyDelta("❤️", delta = -1, isOwn = false)

        assertThat(next.count).isEqualTo(0)
        assertThat(next.mine).isEmpty()
    }

    @Test
    fun `a zero delta is inert`() {
        val state = StoryReactionState(count = 7, mine = setOf("❤️"))

        assertThat(state.applyDelta("🔥", delta = 0, isOwn = true)).isEqualTo(state)
        assertThat(state.applyDelta("🔥", delta = 0, isOwn = false)).isEqualTo(state)
    }

    @Test
    fun `an empty state has not reacted`() {
        assertThat(StoryReactionState().hasReacted).isFalse()
        assertThat(StoryReactionState().count).isEqualTo(0)
    }
}
