package me.meeshy.app.conversations

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ConversationSearchBarVisibilityTest {

    private val threshold = 8

    @Test
    fun `scrollDirectionDown is true when the offset grows past the threshold within the same first item`() {
        val previous = ConversationScrollPosition(index = 0, offset = 10)
        val current = ConversationScrollPosition(index = 0, offset = 40)

        assertThat(
            ConversationSearchBarVisibility.scrollDirectionDown(previous, current, threshold),
        ).isTrue()
    }

    @Test
    fun `scrollDirectionDown is false when the offset shrinks past the threshold within the same first item`() {
        val previous = ConversationScrollPosition(index = 0, offset = 40)
        val current = ConversationScrollPosition(index = 0, offset = 10)

        assertThat(
            ConversationSearchBarVisibility.scrollDirectionDown(previous, current, threshold),
        ).isFalse()
    }

    @Test
    fun `scrollDirectionDown is true when the first visible item index advances`() {
        val previous = ConversationScrollPosition(index = 2, offset = 200)
        val current = ConversationScrollPosition(index = 5, offset = 0)

        assertThat(
            ConversationSearchBarVisibility.scrollDirectionDown(previous, current, threshold),
        ).isTrue()
    }

    @Test
    fun `scrollDirectionDown is false when the first visible item index retreats`() {
        val previous = ConversationScrollPosition(index = 5, offset = 0)
        val current = ConversationScrollPosition(index = 2, offset = 200)

        assertThat(
            ConversationSearchBarVisibility.scrollDirectionDown(previous, current, threshold),
        ).isFalse()
    }

    @Test
    fun `scrollDirectionDown is null when nothing moved`() {
        val position = ConversationScrollPosition(index = 1, offset = 30)

        assertThat(
            ConversationSearchBarVisibility.scrollDirectionDown(position, position, threshold),
        ).isNull()
    }

    @Test
    fun `scrollDirectionDown is null when the delta is below the threshold, in either direction`() {
        val previous = ConversationScrollPosition(index = 0, offset = 30)
        val movedDown = ConversationScrollPosition(index = 0, offset = 33)
        val movedUp = ConversationScrollPosition(index = 0, offset = 27)

        assertThat(
            ConversationSearchBarVisibility.scrollDirectionDown(previous, movedDown, threshold),
        ).isNull()
        assertThat(
            ConversationSearchBarVisibility.scrollDirectionDown(previous, movedUp, threshold),
        ).isNull()
    }

    @Test
    fun `scrollDirectionDown resolves exactly at the threshold, in either direction`() {
        val previous = ConversationScrollPosition(index = 0, offset = 30)
        val movedDown = ConversationScrollPosition(index = 0, offset = 38)
        val movedUp = ConversationScrollPosition(index = 0, offset = 22)

        assertThat(
            ConversationSearchBarVisibility.scrollDirectionDown(previous, movedDown, threshold),
        ).isTrue()
        assertThat(
            ConversationSearchBarVisibility.scrollDirectionDown(previous, movedUp, threshold),
        ).isFalse()
    }

    @Test
    fun `isVisible hides only while scrolling down with no active search`() {
        assertThat(ConversationSearchBarVisibility.isVisible(isSearchActive = false, isScrollingDown = true)).isFalse()
        assertThat(ConversationSearchBarVisibility.isVisible(isSearchActive = false, isScrollingDown = false)).isTrue()
    }

    @Test
    fun `an active search query always keeps the bar visible, even while scrolling down`() {
        assertThat(ConversationSearchBarVisibility.isVisible(isSearchActive = true, isScrollingDown = true)).isTrue()
        assertThat(ConversationSearchBarVisibility.isVisible(isSearchActive = true, isScrollingDown = false)).isTrue()
    }
}
