package me.meeshy.sdk.conversation

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.socket.SendMessageAck
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.time.Instant

/** Le repli socket : l'accusé (messageId, createdAt) réconcilie la bulle optimiste, sans doublon. */
@RunWith(RobolectricTestRunner::class)
class MessageRepositoryReconcileTest {

    private val sender = MeeshyUser(id = "me", username = "atabeth", displayName = "Atabeth")

    @Test
    fun `l'accuse socket remplace la bulle par le message serveur sans doublon`() = runHarnessTest { harness ->
        val coordinator = MessageSendCoordinator(harness.database, harness.database.messageDao(), harness.outbox, harness.clock)
        val cid = coordinator.sendOptimistic("c1", "salut", "fr", sender)

        coordinator.reconcileAcknowledged(cid, SendMessageAck("srv1", cid, "2026-06-01T10:00:00Z"))

        val dao = harness.database.messageDao()
        assertThat(dao.find(cid)).isNull()
        val row = dao.find("srv1")!!
        assertThat(row.sendState).isNull()
        assertThat(row.createdAt).isEqualTo(Instant.parse("2026-06-01T10:00:00Z").toEpochMilli())
        assertThat(harness.cachedMessage("srv1")?.content).isEqualTo("salut")
    }

    @Test
    fun `un accuse rejoue apres la reconciliation ne cree rien`() = runHarnessTest { harness ->
        val coordinator = MessageSendCoordinator(harness.database, harness.database.messageDao(), harness.outbox, harness.clock)
        val cid = coordinator.sendOptimistic("c1", "salut", "fr", sender)
        val ack = SendMessageAck("srv1", cid, "2026-06-01T10:00:00Z")

        coordinator.reconcileAcknowledged(cid, ack)
        coordinator.reconcileAcknowledged(cid, ack)

        assertThat(harness.database.messageDao().find("srv1")).isNotNull()
        assertThat(harness.database.messageDao().find(cid)).isNull()
    }
}
