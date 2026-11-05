package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.PostMentionInput
import me.meeshy.sdk.model.composer.ComposerMoodRules.PublishDecision
import org.junit.Test

class StatusComposerMoodRulesTest {
    @Test
    fun `publishing without an emoji is refused and a bare mood asks for a word`() {
        assertThat(StatusComposerDraft().publishDecision).isEqualTo(PublishDecision.NeedsEmoji)
        assertThat(StatusComposerDraft(selectedEmoji = "🔥").publishDecision).isEqualTo(PublishDecision.AskForWord)
        assertThat(StatusComposerDraft(selectedEmoji = "🔥").withText("yo").publishDecision).isEqualTo(PublishDecision.Publish)
    }

    @Test
    fun `the counter alerts from the 101st character`() {
        assertThat(StatusComposerDraft().withText("a".repeat(100)).isNearLimit).isFalse()
        assertThat(StatusComposerDraft().withText("a".repeat(101)).isNearLimit).isTrue()
        assertThat(StatusComposerDraft().withText("a".repeat(200)).text).hasLength(122)
    }

    @Test
    fun `a named audience and mentions travel in the publish request`() {
        val mention = PostMentionInput(userId = "u9", username = "bob")
        val request = StatusComposerDraft(selectedEmoji = "🔥", mentions = listOf(mention))
            .withRestriction(StatusRestriction.ONLY, listOf("u1", "u1", "u2"))
            .publishRequest()

        assertThat(request?.visibility).isEqualTo("ONLY")
        assertThat(request?.visibilityUserIds).containsExactly("u1", "u2").inOrder()
        assertThat(request?.mentions).containsExactly(mention)
    }

    @Test
    fun `choosing a plain audience drops the named one and an empty list is no audience`() {
        val draft = StatusComposerDraft(selectedEmoji = "🔥").withRestriction(StatusRestriction.EXCEPT, listOf("u1"))

        assertThat(draft.withVisibility(StatusVisibility.FRIENDS).publishRequest()?.visibility).isEqualTo("FRIENDS")
        assertThat(draft.withRestriction(StatusRestriction.EXCEPT, emptyList()).publishRequest()?.visibilityUserIds).isNull()
    }
}
