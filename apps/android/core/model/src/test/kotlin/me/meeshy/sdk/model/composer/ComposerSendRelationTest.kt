package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.QuotedAttachmentSend
import me.meeshy.sdk.model.send.MessageRelation
import me.meeshy.sdk.model.story.OutgoingStoryReplyRoute
import org.junit.Test

class ComposerSendRelationTest {
    @Test
    fun `une reponse a une story l'emporte sur une reponse a un message`() {
        val relation = ComposerSendRelation.of(OutgoingStoryReplyRoute("s1"), replyToId = "m1")
        assertThat(relation).isEqualTo(MessageRelation.StoryReply("s1"))
    }

    @Test
    fun `une reponse a un message garde l'ancre de la piece citee`() {
        val anchor = QuotedAttachmentSend("a1")
        val relation = ComposerSendRelation.of(OutgoingStoryReplyRoute(null), replyToId = "m1", citing = anchor)
        assertThat(relation).isEqualTo(MessageRelation.Reply("m1", anchor))
    }

    @Test
    fun `sans route ni reponse la relation est vide`() {
        assertThat(ComposerSendRelation.of(OutgoingStoryReplyRoute(null), replyToId = null)).isEqualTo(MessageRelation.None)
        assertThat(ComposerSendRelation.of(OutgoingStoryReplyRoute(""), replyToId = "")).isEqualTo(MessageRelation.None)
    }
}
