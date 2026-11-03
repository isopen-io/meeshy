package me.meeshy.sdk.model.story

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StoryCommentDraftStoreTest {

    @Test
    fun `each story keeps its own draft`() {
        val drafts = StoryCommentDrafts().saved("s1", "un").saved("s2", "deux")
        assertThat(drafts.draftOf("s1")?.text).isEqualTo("un")
        assertThat(drafts.draftOf("s2")?.text).isEqualTo("deux")
        assertThat(drafts.draftOf("s3")).isNull()
    }

    @Test
    fun `an empty text removes the draft and a draft is deleted after the send`() {
        val drafts = StoryCommentDrafts().saved("s1", "un").saved("s2", "deux")
        assertThat(drafts.saved("s1", "").draftOf("s1")).isNull()
        val afterSend = drafts.sent("s1")
        assertThat(afterSend.draftOf("s1")).isNull()
        assertThat(afterSend.draftOf("s2")?.text).isEqualTo("deux")
    }

    @Test
    fun `saving the same text or clearing nothing keeps the same instance`() {
        val drafts = StoryCommentDrafts().saved("s1", "un")
        assertThat(drafts.saved("s1", "un")).isSameInstanceAs(drafts)
        assertThat(drafts.sent("zz")).isSameInstanceAs(drafts)
        assertThat(drafts.saved(" ", "x")).isSameInstanceAs(drafts)
    }

    @Test
    fun `a refused comment returns to the draft of its story, dated`() {
        val drafts = StoryCommentDrafts().refused("s1", "perdu", atMillis = 42L)
        assertThat(drafts.draftOf("s1")).isEqualTo(StoryCommentDraft("perdu", refusedAt = 42L))
    }

    @Test
    fun `a refused comment never overwrites what was typed since`() {
        val drafts = StoryCommentDrafts().saved("s1", "déjà là").refused("s1", "perdu", atMillis = 7L)
        assertThat(drafts.draftOf("s1")?.text).isEqualTo("perdu\ndéjà là")
        assertThat(drafts.draftOf("s1")?.refusedAt).isEqualTo(7L)
    }

    @Test
    fun `typing after a refusal drops the refusal mark`() {
        val drafts = StoryCommentDrafts().refused("s1", "perdu", 7L).saved("s1", "perdu!")
        assertThat(drafts.draftOf("s1")?.refusedAt).isNull()
    }
}
