package me.meeshy.sdk.story

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ApiRepostOf
import org.junit.Test

class StoryCommentsClosedMappingTest {

    @Test
    fun `a story keeps its own closure apart from the one it inherits`() {
        val own = ApiPost(id = "s1", type = "STORY", commentsDisabled = true).toStoryItem()
        assertThat(own.commentsDisabled).isTrue()
        assertThat(own.sourceCommentsDisabled).isFalse()
        assertThat(own.commentsClosed).isTrue()

        val inherited = ApiPost(id = "s2", type = "STORY", repostOf = ApiRepostOf(id = "src", commentsDisabled = true)).toStoryItem()
        assertThat(inherited.commentsDisabled).isFalse()
        assertThat(inherited.commentsClosed).isTrue()
    }

    @Test
    fun `an open story stays open`() {
        assertThat(ApiPost(id = "s3", type = "STORY").toStoryItem().commentsClosed).isFalse()
    }
}
