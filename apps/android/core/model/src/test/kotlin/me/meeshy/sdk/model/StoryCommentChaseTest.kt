package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import org.junit.Test

class StoryCommentChaseTest {

    private val pages = mapOf(
        null to storyPage(storyComment("a"), next = "p2"),
        "p2" to storyPage(storyComment("b"), next = "p3"),
        "p3" to storyPage(storyComment("target"), next = "p4"),
        "p4" to storyPage(storyComment("d")),
    )

    @Test
    fun `la cible est trouvee a la page trois et la chasse s'arrete la`() = runTest {
        val asked = mutableListOf<String?>()
        val outcome = StoryCommentChase.roots(StoryCommentsState(), setOf("target")) { cursor ->
            asked += cursor
            pages[cursor]
        }
        assertThat(outcome).isInstanceOf(StoryCommentChaseOutcome.Found::class.java)
        assertThat(asked).containsExactly(null, "p2", "p3").inOrder()
        assertThat(outcome.state.roots.map { it.id }).containsExactly("a", "b", "target").inOrder()
    }

    @Test
    fun `une cible deja chargee ne demande rien`() = runTest {
        val loaded = StoryCommentsReducer.rootsPage(StoryCommentsState(), storyPage(storyComment("target")))
        val outcome = StoryCommentChase.roots(loaded, setOf("target")) { error("aucun appel attendu") }
        assertThat(outcome).isInstanceOf(StoryCommentChaseOutcome.Found::class.java)
    }

    @Test
    fun `une cible introuvable s'arrete a la derniere page`() = runTest {
        val outcome = StoryCommentChase.roots(StoryCommentsState(), setOf("ghost")) { pages[it] }
        assertThat(outcome).isInstanceOf(StoryCommentChaseOutcome.NotFound::class.java)
        assertThat(outcome.state.roots).hasSize(4)
    }

    @Test
    fun `la chasse est bornee`() = runTest {
        var calls = 0
        val outcome = StoryCommentChase.roots(StoryCommentsState(), setOf("ghost"), maxPages = 2) { cursor ->
            calls++
            storyPage(storyComment("x$calls"), next = "n$calls")
        }
        assertThat(outcome).isInstanceOf(StoryCommentChaseOutcome.NotFound::class.java)
        assertThat(calls).isEqualTo(2)
    }

    @Test
    fun `un reseau en panne rend la main avec ce qui est charge`() = runTest {
        val outcome = StoryCommentChase.roots(StoryCommentsState(), setOf("target")) { cursor ->
            if (cursor == null) pages[null] else null
        }
        assertThat(outcome).isInstanceOf(StoryCommentChaseOutcome.Failed::class.java)
        assertThat(outcome.state.roots.map { it.id }).containsExactly("a")
    }

    @Test
    fun `une reponse ciblee deplie son parent puis chasse ses pages`() = runTest {
        val start = StoryCommentsReducer.rootsPage(StoryCommentsState(), storyPage(storyComment("r", replyCount = 40)))
        val replyPages = mapOf(
            null to storyPage(storyComment("x1", "r"), next = "q2"),
            "q2" to storyPage(storyComment("goal", "r"), next = "q3"),
        )
        val outcome = StoryCommentChase.reply(start, "r", "goal") { replyPages[it] }
        assertThat(outcome).isInstanceOf(StoryCommentChaseOutcome.Found::class.java)
        assertThat(outcome.state.thread.isExpanded("r")).isTrue()
        assertThat(outcome.state.repliesOf("r").map { it.id }).containsExactly("x1", "goal").inOrder()
        assertThat(outcome.state.thread.hasMoreReplies("r")).isTrue()
    }

    @Test
    fun `une reponse introuvable laisse le parent deplie`() = runTest {
        val start = StoryCommentsReducer.rootsPage(StoryCommentsState(), storyPage(storyComment("r", replyCount = 1)))
        val outcome = StoryCommentChase.reply(start, "r", "ghost") { storyPage(storyComment("x1", "r")) }
        assertThat(outcome).isInstanceOf(StoryCommentChaseOutcome.NotFound::class.java)
        assertThat(outcome.state.thread.isExpanded("r")).isTrue()
    }
}
