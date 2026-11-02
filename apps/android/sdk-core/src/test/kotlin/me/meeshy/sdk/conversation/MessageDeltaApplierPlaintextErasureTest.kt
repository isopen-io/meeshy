package me.meeshy.sdk.conversation

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.e2ee.EndToEndPlaintextEraser
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
 * #14633 — un message chiffré de bout en bout supprimé pour tous, échu, masqué pour moi ou vu une fois quitte AUSSI le
 * coffre E2EE : son clair n'y reste pas sans limite de durée. Mes envois y sont rangés sous leur `cid_` en plus de l'id
 * servi : les deux clés partent ; celle d'un pair, jamais sous son `cid_` (un serveur compromis pourrait la reprendre).
 */
@RunWith(RobolectricTestRunner::class)
class MessageDeltaApplierPlaintextErasureTest {

    private class RecordingEraser : EndToEndPlaintextEraser {
        val erased = mutableListOf<String>()
        override suspend fun erase(messageIds: Collection<String>) {
            erased += messageIds
        }
    }

    private fun applier(harness: MessageCollaboratorHarness, eraser: RecordingEraser) =
        MessageDeltaApplier(harness.database, harness.updater, harness.clock, eraser = eraser)

    private fun sealed(id: String, author: String, cid: String? = null) = ApiMessage(
        id = id, conversationId = "c1", senderId = "p_$author", sender = ApiMessageSender(userId = author),
        content = "[Encrypted]", isEncrypted = true, encryptionMode = "e2ee", clientMessageId = cid,
        createdAt = "2026-11-01T09:00:00Z",
    )

    @Test
    fun `deleting my message for everyone erases its served and client ids`() = runHarnessTest { harness ->
        harness.seedSynced(sealed("m1", author = "me", cid = "cid_1"))
        val eraser = RecordingEraser()

        applier(harness, eraser).apply(MessageRemoved("m1", "c1", "2026-11-01T10:00:00Z"), viewerId = "me")

        assertThat(eraser.erased).containsExactly("m1", "cid_1")
    }

    @Test
    fun `deleting a peer message erases its served id only`() = runHarnessTest { harness ->
        harness.seedSynced(sealed("m2", author = "alice", cid = "cid_x"))
        val eraser = RecordingEraser()

        applier(harness, eraser).apply(MessageRemoved("m2", "c1", "2026-11-01T10:00:00Z"), viewerId = "me")

        assertThat(eraser.erased).containsExactly("m2")
    }

    @Test
    fun `an expiry erases the plaintext, even of a message not cached yet`() = runHarnessTest { harness ->
        harness.seedSynced(sealed("m1", author = "alice"))
        val eraser = RecordingEraser()
        val applier = applier(harness, eraser)

        applier.apply(MessageRemoved("m1", "c1", expired = true), viewerId = "me")
        applier.apply(MessageRemoved("m9", "c1", expired = true), viewerId = "me")

        assertThat(eraser.erased).containsExactly("m1", "m9")
    }

    @Test
    fun `a view once opened by me erases the plaintext, another reader does not`() = runHarnessTest { harness ->
        harness.seedSynced(sealed("m1", author = "alice").copy(isViewOnce = true))
        val eraser = RecordingEraser()
        val applier = applier(harness, eraser)

        applier.apply(MessageConsumedEvent("m1", "c1", userId = "carol", viewOnceCount = 1), viewerId = "me")
        assertThat(eraser.erased).isEmpty()

        applier.apply(MessageConsumedEvent("m1", "c1", userId = "me", viewOnceCount = 2), viewerId = "me")
        assertThat(eraser.erased).containsExactly("m1")
    }

    @Test
    fun `a purged view once, a personal hide and a local after-read expiry erase the plaintext`() = runHarnessTest { harness ->
        harness.seedSynced(sealed("m1", author = "alice"))
        harness.seedSynced(sealed("m2", author = "alice"))
        harness.seedSynced(sealed("m3", author = "alice"))
        val eraser = RecordingEraser()
        val applier = applier(harness, eraser)

        applier.apply(MessageViewOncePurgedEvent("m1", "c1"), viewerId = "me")
        applier.apply(MessageHiddenForMeEvent(userId = "me", messages = listOf(PersonalMessageVisibilityRef("m2", "c1"))), viewerId = "me")
        applier.expireLocally(listOf("m3"))

        assertThat(eraser.erased).containsExactly("m1", "m2", "m3")
    }
}
