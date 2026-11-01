package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.app.feed.CommentNotice
import me.meeshy.app.feed.PostCommentsUiState
import org.junit.Test

class StoryCommentRailFeedbackTest {

    @Test
    fun liveCount_aSentCommentRaisesAZeroServedCount_soTheCommentsButtonAppears() {
        val count = StoryCommentCount.live(served = 0, threadCount = 1)
        assertThat(count).isEqualTo(1)
        assertThat(StoryRailPlan.resolve(isOwnStory = false, hasTranslatableContent = false, canReply = true, canCompose = false, commentCount = count).showsComments)
            .isTrue()
    }

    @Test
    fun liveCount_neverFallsBelowTheServedCount() {
        assertThat(StoryCommentCount.live(served = 12, threadCount = 3)).isEqualTo(12)
    }

    @Test
    fun justSent_onlyWhenAnInFlightSendEndsWithoutFailure() {
        assertThat(StoryCommentSent.justSent(wasSubmitting = true, state = PostCommentsUiState())).isTrue()
        assertThat(StoryCommentSent.justSent(wasSubmitting = false, state = PostCommentsUiState())).isFalse()
        assertThat(StoryCommentSent.justSent(wasSubmitting = true, state = PostCommentsUiState(isSubmitting = true))).isFalse()
        assertThat(StoryCommentSent.justSent(wasSubmitting = true, state = PostCommentsUiState(notice = CommentNotice.SEND_FAILED))).isFalse()
    }
}
