package me.meeshy.sdk.conversation

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiMessage
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class MessageIdReconciliationTest {

    private val cid = "cid_0b6c2a4e-7c1d-4f3a-9e21-5d8a1b2c3d4e"

    private fun message(id: String, clientMessageId: String? = null) =
        ApiMessage(id = id, conversationId = "c1", content = "yo", clientMessageId = clientMessageId)

    @Test
    fun `un ack relie l'identifiant local a l'identifiant serveur et la ligne se retrouve par les deux`() = runHarnessTest { harness ->
        val db = harness.database
        db.messageDao().upsertAll(listOf(MessageEntityFactory.cached(message("srv1", cid), 1L)))

        MessageIdReconciliation.recordAck(db, cid, "srv1", "c1", nowMillis = 5L)

        assertThat(MessageIdReconciliation.locate(db, cid)!!.id).isEqualTo("srv1")
        assertThat(MessageIdReconciliation.locate(db, "srv1")!!.id).isEqualTo("srv1")
        assertThat(db.pendingIdDao().byLocalId(cid)!!.reconciledAt).isEqualTo(5L)
    }

    @Test
    fun `une ligne optimiste dont l'identifiant serveur est connu se retrouve par le troisieme niveau`() = runHarnessTest { harness ->
        val db = harness.database
        val optimistic = MessageEntityFactory.local(message(cid), 1L, LocalSendState.SENDING).copy(serverId = "srv2")
        db.messageDao().upsertAll(listOf(optimistic))

        assertThat(MessageIdReconciliation.locate(db, "srv2")!!.id).isEqualTo(cid)
    }

    @Test
    fun `un identifiant inconnu ne donne aucune ligne`() = runHarnessTest { harness ->
        assertThat(MessageIdReconciliation.locate(harness.database, "nope")).isNull()
    }

    @Test
    fun `un identifiant local qui n'est pas un cid n'est pas enregistre`() = runHarnessTest { harness ->
        MessageIdReconciliation.recordAck(harness.database, "c1", "srv1", "c1", 5L)

        assertThat(harness.database.pendingIdDao().byLocalId("c1")).isNull()
    }

    @Test
    fun `l'acquittement d'un envoi laisse une seule ligne et le pont`() = runHarnessTest { harness ->
        val coordinator = MessageSendCoordinator(harness.database, harness.database.messageDao(), harness.outbox, harness.clock)
        harness.database.messageDao().upsertAll(listOf(MessageEntityFactory.local(message(cid), 1L, LocalSendState.SENDING)))

        coordinator.reconcileSent(cid, message("srv1", cid))

        val rows = harness.database.messageDao().listForConversation("c1")
        assertThat(rows.map { it.id }).containsExactly("srv1")
        assertThat(harness.database.pendingIdDao().byLocalId(cid)!!.serverId).isEqualTo("srv1")
        assertThat(harness.updater.find(cid)!!.id).isEqualTo("srv1")
    }
}
