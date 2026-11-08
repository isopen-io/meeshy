package me.meeshy.sdk.model.send

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.QuotedAttachmentSend
import org.junit.Test

class MessageRelationTest {

    @Test
    fun `une relation n'expose que sa propre face`() {
        val reply = MessageRelation.Reply("m1", QuotedAttachmentSend("a1"))
        assertThat(reply.replyToId).isEqualTo("m1")
        assertThat(reply.attachmentReplyTo?.attachmentId).isEqualTo("a1")
        assertThat(reply.storyReplyToId).isNull()
        assertThat(reply.forwardedFromId).isNull()

        val forward = MessageRelation.Forward("m2", "c9")
        assertThat(forward.forwardedFromId).isEqualTo("m2")
        assertThat(forward.forwardedFromConversationId).isEqualTo("c9")
        assertThat(forward.replyToId).isNull()
        assertThat(forward.attachmentReplyTo).isNull()

        assertThat(MessageRelation.StoryReply("s1").storyReplyToId).isEqualTo("s1")
        assertThat(MessageRelation.None.replyToId).isNull()
    }

    @Test
    fun `les anciens parametres se resolvent avec la preseance story puis reponse puis transfert`() {
        val all = MessageRelation.legacy("r", "s", "f", "c", "a")
        assertThat(all).isEqualTo(MessageRelation.StoryReply("s"))

        val replyWins = MessageRelation.legacy("r", null, "f", "c", "a")
        assertThat(replyWins).isEqualTo(MessageRelation.Reply("r", QuotedAttachmentSend("a")))

        assertThat(MessageRelation.legacy(null, null, "f", "c", null)).isEqualTo(MessageRelation.Forward("f", "c"))
        assertThat(MessageRelation.legacy(null, null, null, null, "a")).isEqualTo(MessageRelation.None)
    }

    @Test
    fun `une ancre vide ou absente cite le message entier`() {
        assertThat(MessageRelation.legacy("r", null, null, null, "").attachmentReplyTo).isNull()
        assertThat(MessageRelation.legacy("r", null, null, null, null).attachmentReplyTo).isNull()
        assertThat(QuotedAttachmentSend.anchor("")).isNull()
    }

    @Test
    fun `un identifiant vide vaut absent`() {
        assertThat(MessageRelation.legacy("", "", "", null, null)).isEqualTo(MessageRelation.None)
    }
}
