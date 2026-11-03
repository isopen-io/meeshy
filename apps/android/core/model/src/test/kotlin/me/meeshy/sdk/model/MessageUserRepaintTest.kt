package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.UserUpdatedEvent.OptionalMediaChange
import org.junit.Test

class MessageUserRepaintTest {
    private val rename = UserUpdatedEvent(
        userId = "u1", username = "bob2", firstName = "Bob", lastName = "Two", hasNameGroup = true,
        avatar = OptionalMediaChange.Replaced("new.png"),
    )

    private fun sender(userId: String = "u1") = ApiMessageSender(
        userId = userId, displayName = "Bob", username = "bob", avatar = "old.png",
        profileDecor = ServedProfileDecor(avatarRing = ServedProfileDecorItem(pack = "p", item = "i")),
    )

    private fun message(
        sender: ApiMessageSender? = sender(),
        replyTo: ApiMessageReplyPreview? = null,
        forwardedFrom: ApiForwardedFrom? = null,
    ) = ApiMessage(id = "m", conversationId = "c", sender = sender, replyTo = replyTo, forwardedFrom = forwardedFrom)

    @Test
    fun `the sender of a message is repainted and keeps its ring`() {
        val repainted = rename.repainted(message())!!
        assertThat(repainted.sender!!.name).isEqualTo("Bob Two")
        assertThat(repainted.sender!!.resolvedAvatar).isEqualTo("new.png")
        assertThat(repainted.sender!!.profileDecor).isEqualTo(sender().profileDecor)
    }

    @Test
    fun `a quote and a forward reference that engrave the id follow the renamed peer`() {
        val quote = ApiMessageReplyPreview(id = "q", content = "hi", senderDisplayName = "Bob", sender = sender())
        val forward = ApiForwardedFrom(id = "f", sender = sender())
        val repainted = rename.repainted(message(sender = sender("u2"), replyTo = quote, forwardedFrom = forward))!!
        assertThat(repainted.sender!!.name).isEqualTo("Bob")
        assertThat(repainted.replyTo!!.sender!!.name).isEqualTo("Bob Two")
        assertThat(repainted.replyTo!!.senderDisplayName).isEqualTo("Bob Two")
        assertThat(repainted.forwardedFrom!!.sender!!.resolvedAvatar).isEqualTo("new.png")
    }

    @Test
    fun `a message that does not name the peer, or already shows the new look, is left alone`() {
        assertThat(rename.repainted(message(sender = sender("u2")))).isNull()
        assertThat(rename.repainted(rename.repainted(message())!!)).isNull()
    }

    @Test
    fun `the last-message author and the interlocutor of a direct conversation are repainted`() {
        val conversation = ApiConversation(
            id = "c", type = "direct",
            participants = listOf(
                ApiParticipant(id = "p1", userId = "u1", displayName = "Bob", avatar = "old.png"),
                ApiParticipant(id = "p2", userId = "u2", displayName = "Me"),
            ),
            lastMessage = ApiConversationLastMessage(id = "m", content = "yo", senderId = "u1", senderName = "Bob"),
        )
        val repainted = rename.repainted(conversation)!!
        assertThat(repainted.participants[0].displayName).isEqualTo("Bob Two")
        assertThat(repainted.participants[0].avatar).isEqualTo("new.png")
        assertThat(repainted.participants[1].displayName).isEqualTo("Me")
        assertThat(repainted.lastMessage!!.senderName).isEqualTo("Bob Two")
        assertThat(rename.repainted(repainted)).isNull()
        assertThat(rename.repainted(conversation.copy(participants = emptyList(), lastMessage = null))).isNull()
    }
}
