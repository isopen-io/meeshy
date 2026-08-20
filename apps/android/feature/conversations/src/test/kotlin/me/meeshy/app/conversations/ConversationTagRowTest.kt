package me.meeshy.app.conversations

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural coverage for [ConversationTagRow] — the pure width-based tag-fitting
 * used to render conversation-row tag chips with a "+N" overflow badge. Faithful
 * port of iOS `ThemedConversationRow.visibleTagsInfo` +
 * `MeeshyConversationTag.estimatedWidth`.
 */
class ConversationTagRowTest {

    // MARK: - estimatedWidth (iOS: name.count * 7 + 22)

    @Test
    fun `estimatedWidth is character count times seven plus padding`() {
        assertThat(ConversationTagRow.estimatedWidth("Hello")).isEqualTo(5 * 7.0 + 22.0)
    }

    @Test
    fun `estimatedWidth of an empty name is just the padding`() {
        assertThat(ConversationTagRow.estimatedWidth("")).isEqualTo(22.0)
    }

    // MARK: - fit: empty / trivial

    @Test
    fun `fit of no tags shows nothing and leaves no remainder`() {
        assertThat(ConversationTagRow.fit(emptyList(), availableWidth = 500.0))
            .isEqualTo(ConversationTagRow.Fit(visible = emptyList(), remaining = 0))
    }

    @Test
    fun `fit shows every tag when they all fit within the width`() {
        val tags = listOf("Work", "Home")
        val result = ConversationTagRow.fit(tags, availableWidth = 500.0)

        assertThat(result.visible).isEqualTo(tags)
        assertThat(result.remaining).isEqualTo(0)
    }

    // MARK: - fit: force at least one

    @Test
    fun `fit always shows the first tag even when it cannot fit`() {
        // "Important" → 9*7+22 = 85; a width that fits nothing still forces the first.
        val result = ConversationTagRow.fit(listOf("Important", "Urgent"), availableWidth = 10.0)

        assertThat(result.visible).isEqualTo(listOf("Important"))
        assertThat(result.remaining).isEqualTo(1)
    }

    // MARK: - fit: overflow reserves room for the "+N" badge

    @Test
    fun `fit reserves space for the overflow badge so a later tag is hidden`() {
        // Three tags of estimatedWidth 36 each ("ab"=2*7+22). Spacing 6, badge 32.
        // First: 36 + reserve(32+6) = 74 ≤ 80 → shown, total=36.
        // Second: needed=36+36+6=78; one tag would remain so reserve 38 → 78+38=116 > 80 → stop.
        // → only the first is visible, two remain.
        val tags = listOf("ab", "cd", "ef")
        val result = ConversationTagRow.fit(tags, availableWidth = 80.0)

        assertThat(result.visible).isEqualTo(listOf("ab"))
        assertThat(result.remaining).isEqualTo(2)
    }

    @Test
    fun `fit does not reserve badge space for the final tag`() {
        // Two tags of estimatedWidth 36. First: 36 + reserve(38) = 74 ≤ 79 → shown.
        // Second is the last (remainingTagsCount == 0 → no reserve): needed 36+36+6 = 78 ≤ 79 → shown.
        // Were the badge reserved for the final tag too, 78+38 = 116 > 79 would hide it — so 79 is the
        // width that only passes because the last tag is exempt from the reserve.
        val tags = listOf("ab", "cd")
        val result = ConversationTagRow.fit(tags, availableWidth = 79.0)

        assertThat(result.visible).isEqualTo(tags)
        assertThat(result.remaining).isEqualTo(0)
    }

    @Test
    fun `fit stops at the first tag that does not fit and keeps the earlier ones`() {
        // "aa"=36, "bb"=36, "cccccccccc"=10*7+22=92.
        // width 150: first 36+reserve(38)=74 ok; second needed 78, reserve(38)=116 ok (total 78);
        // third is last(no reserve): needed 78+92+6=176 > 150 → stop. visible=2, remaining=1.
        val tags = listOf("aa", "bb", "cccccccccc")
        val result = ConversationTagRow.fit(tags, availableWidth = 150.0)

        assertThat(result.visible).isEqualTo(listOf("aa", "bb"))
        assertThat(result.remaining).isEqualTo(1)
    }

    @Test
    fun `fit exposes the remainder count for a hidden tail`() {
        val result = ConversationTagRow.fit(listOf("a", "b", "c", "d"), availableWidth = 10.0)

        assertThat(result.visible).hasSize(1)
        assertThat(result.remaining).isEqualTo(3)
    }
}
