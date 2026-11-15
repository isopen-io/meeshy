package me.meeshy.sdk.conversation

import com.google.common.truth.Truth.assertThat
import me.meeshy.core.database.entity.ConversationEntity
import me.meeshy.core.database.entity.MessageEntity
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiParticipant
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.model.ApiForwardedFrom
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageReplyPreview
import me.meeshy.sdk.model.ApiMessageSender
import me.meeshy.sdk.model.ServedProfileDecor
import me.meeshy.sdk.model.ServedProfileDecorItem
import me.meeshy.sdk.model.UserUpdatedEvent
import me.meeshy.sdk.model.UserUpdatedEvent.OptionalMediaChange
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class SenderRepaintTest {
    private val rename = UserUpdatedEvent(
        userId = "u1", username = "bob2", firstName = "Bob", lastName = "Two", hasNameGroup = true,
        avatar = OptionalMediaChange.Replaced("new.png"),
    )
    private val ring = ServedProfileDecor(avatarRing = ServedProfileDecorItem(pack = "p", item = "i"))

    private fun sender(userId: String) = ApiMessageSender(userId = userId, displayName = "Bob", avatar = "old.png", profileDecor = ring)

    private fun own(id: String, userId: String = "u1", conversationId: String = "c1") =
        ApiMessage(id = id, conversationId = conversationId, senderId = userId, sender = sender(userId))

    @Test
    fun `the peer is repainted in his messages, quotes and forwards, ring included, and only those rows are decoded`() = runHarnessTest { harness ->
        harness.seedSynced(own("m1"))
        harness.seedSynced(own("m2", userId = "u2").copy(replyTo = ApiMessageReplyPreview(id = "q", sender = sender("u1"))))
        harness.seedSynced(own("m3", userId = "u2", conversationId = "c2").copy(forwardedFrom = ApiForwardedFrom(id = "f", sender = sender("u1"))))
        harness.seedSynced(own("m4", userId = "u2"))
        // Une charge illisible qui ne nomme pas le pair : si elle était décodée, la réécriture échouerait.
        val unrelated = MessageEntity(id = "x", conversationId = "c9", seq = null, payload = "{not json", createdAt = 1L, cachedAt = 1L, senderId = "u7")
        harness.database.messageDao().upsertAll(listOf(unrelated))
        val untouchedVersion = harness.database.messageDao().find("m4")!!.changeVersion

        val written = SenderRepaint(harness.database, harness.updater).repaint(rename)

        assertThat(written).containsExactly("c1", "c2")
        assertThat(harness.cachedMessage("m1").sender!!.name).isEqualTo("Bob Two")
        assertThat(harness.cachedMessage("m1").sender!!.profileDecor).isEqualTo(ring)
        assertThat(harness.cachedMessage("m2").replyTo!!.sender!!.name).isEqualTo("Bob Two")
        assertThat(harness.cachedMessage("m3").forwardedFrom!!.sender!!.resolvedAvatar).isEqualTo("new.png")
        assertThat(harness.cachedMessage("m4").sender!!.name).isEqualTo("Bob")
        assertThat(harness.database.messageDao().find("m4")!!.changeVersion).isEqualTo(untouchedVersion)
        assertThat(harness.database.messageDao().find("x")!!.payload).isEqualTo("{not json")
    }

    @Test
    fun `a repaint that changes nothing writes nothing`() = runHarnessTest { harness ->
        harness.seedSynced(own("m1"))
        val repaint = SenderRepaint(harness.database, harness.updater)
        repaint.repaint(rename)
        val version = harness.database.messageDao().find("m1")!!.changeVersion

        assertThat(repaint.repaint(rename)).isEmpty()
        assertThat(harness.database.messageDao().find("m1")!!.changeVersion).isEqualTo(version)
    }

    @Test
    fun `the direct conversation row follows the renamed interlocutor`() = runHarnessTest { harness ->
        val direct = ApiConversation(
            id = "d1", type = "direct",
            participants = listOf(ApiParticipant(id = "p1", userId = "u1", displayName = "Bob", avatar = "old.png")),
        )
        harness.database.conversationDao().upsertAll(
            listOf(ConversationEntity(id = "d1", payload = MeeshyApi.json.encodeToString(ApiConversation.serializer(), direct), updatedAt = 1L, cachedAt = 1L)),
        )

        val written = SenderRepaint(harness.database, harness.updater).repaint(rename)

        assertThat(written).containsExactly("d1")
        val stored = MeeshyApi.json.decodeFromString<ApiConversation>(harness.database.conversationDao().find("d1")!!.payload)
        assertThat(stored.participants.single().displayName).isEqualTo("Bob Two")
        assertThat(stored.participants.single().avatar).isEqualTo("new.png")
    }
}
