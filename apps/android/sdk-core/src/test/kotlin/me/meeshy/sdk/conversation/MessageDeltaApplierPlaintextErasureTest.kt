package me.meeshy.sdk.conversation

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.e2ee.PlaintextErasureLedger
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageSender
import me.meeshy.sdk.model.MessageConsumedEvent
import me.meeshy.sdk.model.MessageHiddenForMeEvent
import me.meeshy.sdk.model.MessageRemoved
import me.meeshy.sdk.model.MessageViewOncePurgedEvent
import me.meeshy.sdk.model.PersonalMessageVisibilityRef
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * #14633, #14655 — un message chiffré de bout en bout supprimé pour tous, échu, masqué pour moi ou vu une fois s'inscrit
 * dans la file DURABLE qui vide le coffre E2EE : son clair n'y reste pas sans limite de durée. Mes envois y sont rangés
 * sous leur `cid_` en plus de l'id servi : les deux clés partent, y compris par une expiration locale (sans lecteur
 * nommé) ; celle d'un pair, jamais sous son `cid_` (un serveur compromis pourrait la reprendre).
 */
@RunWith(RobolectricTestRunner::class)
class MessageDeltaApplierPlaintextErasureTest {

    private class Recorded(harness: MessageCollaboratorHarness) {
        val ledger = PlaintextErasureLedger(harness.database, harness.clock) { "me" }

        suspend fun keys(): List<String> = ledger.pending("me", 100).flatMap { it.messageKeys("me") }
    }

    private fun applier(harness: MessageCollaboratorHarness, recorded: Recorded) =
        MessageDeltaApplier(harness.database, harness.updater, harness.clock, erasures = recorded.ledger)

    private fun sealed(id: String, author: String, cid: String? = null) = ApiMessage(
        id = id, conversationId = "c1", senderId = "p_$author", sender = ApiMessageSender(userId = author),
        content = "[Encrypted]", isEncrypted = true, encryptionMode = "e2ee", clientMessageId = cid,
        createdAt = "2026-11-01T09:00:00Z",
    )

    @Test
    fun `deleting my message for everyone erases its served and client ids`() = runHarnessTest { harness ->
        harness.seedSynced(sealed("m1", author = "me", cid = "cid_1"))
        val eraser = Recorded(harness)

        applier(harness, eraser).apply(MessageRemoved("m1", "c1", "2026-11-01T10:00:00Z"), viewerId = "me")

        assertThat(eraser.keys()).containsExactly("m1", "cid_1")
    }

    @Test
    fun `deleting a peer message erases its served id only`() = runHarnessTest { harness ->
        harness.seedSynced(sealed("m2", author = "alice", cid = "cid_x"))
        val eraser = Recorded(harness)

        applier(harness, eraser).apply(MessageRemoved("m2", "c1", "2026-11-01T10:00:00Z"), viewerId = "me")

        assertThat(eraser.keys()).containsExactly("m2")
    }

    @Test
    fun `an expiry erases the plaintext, even of a message not cached yet`() = runHarnessTest { harness ->
        harness.seedSynced(sealed("m1", author = "alice"))
        val eraser = Recorded(harness)
        val applier = applier(harness, eraser)

        applier.apply(MessageRemoved("m1", "c1", expired = true), viewerId = "me")
        applier.apply(MessageRemoved("m9", "c1", expired = true), viewerId = "me")

        assertThat(eraser.keys()).containsExactly("m1", "m9")
    }

    @Test
    fun `a view once opened by me erases the plaintext, another reader does not`() = runHarnessTest { harness ->
        harness.seedSynced(sealed("m1", author = "alice").copy(isViewOnce = true))
        val eraser = Recorded(harness)
        val applier = applier(harness, eraser)

        applier.apply(MessageConsumedEvent("m1", "c1", userId = "carol", viewOnceCount = 1), viewerId = "me")
        assertThat(eraser.keys()).isEmpty()

        applier.apply(MessageConsumedEvent("m1", "c1", userId = "me", viewOnceCount = 2), viewerId = "me")
        assertThat(eraser.keys()).containsExactly("m1")
    }

    @Test
    fun `a purged view once, a personal hide and a local after-read expiry erase the plaintext`() = runHarnessTest { harness ->
        harness.seedSynced(sealed("m1", author = "alice"))
        harness.seedSynced(sealed("m2", author = "alice"))
        harness.seedSynced(sealed("m3", author = "alice"))
        val eraser = Recorded(harness)
        val applier = applier(harness, eraser)

        applier.apply(MessageViewOncePurgedEvent("m1", "c1"), viewerId = "me")
        applier.apply(MessageHiddenForMeEvent(userId = "me", messages = listOf(PersonalMessageVisibilityRef("m2", "c1"))), viewerId = "me")
        applier.expireLocally(listOf("m3"))

        assertThat(eraser.keys()).containsExactly("m1", "m2", "m3")
    }

    @Test
    fun `my message expired locally erases its client id too, without any viewer named`() = runHarnessTest { harness ->
        harness.seedSynced(sealed("m1", author = "me", cid = "cid_1"))
        val eraser = Recorded(harness)

        applier(harness, eraser).expireLocally(listOf("m1"))

        assertThat(eraser.keys()).containsExactly("m1", "cid_1")
        assertThat(harness.database.messageDao().find("m1")).isNull()
    }

    @Test
    fun `a message sent in clear records nothing`() = runHarnessTest { harness ->
        harness.seedSynced(ApiMessage(id = "m1", conversationId = "c1", content = "en clair", senderId = "me", createdAt = "2026-11-01T09:00:00Z"))
        val eraser = Recorded(harness)

        applier(harness, eraser).apply(MessageRemoved("m1", "c1", "2026-11-01T10:00:00Z"), viewerId = "me")

        assertThat(eraser.keys()).isEmpty()
    }
}
