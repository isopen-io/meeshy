package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.story.StoryViewerParticipationMark
import org.junit.Test

class StoryViewerParticipationTest {

    private fun store() = StoryViewerParticipationStore()

    @Test
    fun `a gesture noted on a story is remembered for that story only`() {
        val store = store()
        store.note(StoryViewerParticipationMark.COMMENTED, "s1")
        assertThat(store.marks.value["s1"]).containsExactly(StoryViewerParticipationMark.COMMENTED)
        assertThat(store.marks.value["s2"]).isNull()
    }

    @Test
    fun `noting the same gesture twice publishes nothing new`() {
        val store = store()
        store.note(StoryViewerParticipationMark.SENT, "s1")
        val first = store.marks.value
        store.note(StoryViewerParticipationMark.SENT, "s1")
        assertThat(store.marks.value).isSameInstanceAs(first)
    }

    @Test
    fun `gestures accumulate on one story and an empty id is ignored`() {
        val store = store()
        store.note(StoryViewerParticipationMark.SENT, "s1")
        store.note(StoryViewerParticipationMark.REPOSTED, "s1")
        store.note(StoryViewerParticipationMark.SENT, "")
        assertThat(store.marks.value.keys).containsExactly("s1")
        assertThat(store.marks.value["s1"]).containsExactly(StoryViewerParticipationMark.SENT, StoryViewerParticipationMark.REPOSTED)
    }

    @Test
    fun `signing out forgets every gesture`() = runTest {
        val store = store()
        store.note(StoryViewerParticipationMark.REPOSTED, "s1")
        store.clear()
        assertThat(store.marks.value).isEmpty()
    }
}
