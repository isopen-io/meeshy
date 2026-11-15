package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class FeedHeaderActionsTest {

    @Test
    fun `feedHeaderActions returns exactly Reels then Nearby, in order`() {
        assertThat(feedHeaderActions()).containsExactly(
            FeedHeaderAction.REELS,
            FeedHeaderAction.NEARBY,
        ).inOrder()
    }
}
