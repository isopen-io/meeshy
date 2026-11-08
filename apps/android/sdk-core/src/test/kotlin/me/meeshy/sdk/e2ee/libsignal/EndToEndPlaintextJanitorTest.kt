package me.meeshy.sdk.e2ee.libsignal

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.emptyFlow
import me.meeshy.core.e2ee.content.E2eeContent
import me.meeshy.core.e2ee.open.E2eeOpenOutcome
import me.meeshy.sdk.conversation.MessageCollaboratorHarness
import me.meeshy.sdk.conversation.runHarnessTest
import me.meeshy.sdk.e2ee.PlaintextErasureLedger
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageSender
import me.meeshy.sdk.session.AccountTicket
import me.meeshy.sdk.session.withAccountTicket
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * #14655 — la file durable se vide pour le seul compte de la session : un coffre verrouillé garde l'inscription pour la
 * fois suivante, le `cid_` ne part que pour son auteur, une conversation part jusqu'à sa borne, et une enveloppe ouverte
 * APRÈS l'effacement de son message voit son clair repartir aussitôt (iOS `EndToEndPlaintextJanitor`).
 */
@RunWith(RobolectricTestRunner::class)
class EndToEndPlaintextJanitorTest {

    private class FakeVault(var locked: Boolean = false) : PlaintextVaultEraser {
        val erased = mutableListOf<Pair<String, String>>()
        val conversations = mutableListOf<Triple<String, String, Long>>()

        override suspend fun erase(account: String, messageIds: Collection<String>): Boolean {
            if (locked) return false
            messageIds.forEach { erased += account to it }
            return true
        }

        override suspend fun eraseConversation(account: String, conversationId: String, composedUpTo: Long): Boolean {
            if (locked) return false
            conversations += Triple(account, conversationId, composedUpTo)
            return true
        }
    }

    private class Rig(harness: MessageCollaboratorHarness, var account: String? = "me") {
        val vault = FakeVault()
        val ledger = PlaintextErasureLedger(harness.database, harness.clock) { account }
        val janitor = EndToEndPlaintextJanitor(ledger, vault, { account }, emptyFlow(), emptyFlow(), CoroutineScope(kotlinx.coroutines.Dispatchers.Unconfined))
    }

    private fun sealed(id: String, author: String, cid: String? = null) = ApiMessage(
        id = id, conversationId = "c1", senderId = "p_$author", sender = ApiMessageSender(userId = author),
        content = "[Encrypted]", isEncrypted = true, encryptionMode = "e2ee", clientMessageId = cid,
        createdAt = "2026-11-01T09:00:00Z",
    )

    private fun opened(id: String, conversationId: String = "c1", sentAt: Long) = E2eeOpenOutcome.Opened(
        id, conversationId, "alice", 1, E2eeContent.compose("salut", "fr", null, conversationId, null, sentAt),
    )

    @Test
    fun `a drain erases my message under both keys, a peer message under its served id only`() = runHarnessTest { harness ->
        harness.seedSynced(sealed("m1", author = "me", cid = "cid_1"))
        harness.seedSynced(sealed("m2", author = "alice", cid = "cid_x"))
        val rig = Rig(harness)
        rig.ledger.recordNamed(listOf("m1", "m2"))

        assertThat(rig.janitor.drain()).isTrue()

        assertThat(rig.vault.erased).containsExactly("me" to "m1", "me" to "cid_1", "me" to "m2")
        assertThat(rig.ledger.pending("me", 10)).isEmpty()
    }

    @Test
    fun `a locked vault keeps the erasure pending, and the next drain erases it`() = runHarnessTest { harness ->
        harness.seedSynced(sealed("m1", author = "alice"))
        val rig = Rig(harness)
        rig.ledger.recordNamed(listOf("m1"))
        rig.vault.locked = true

        assertThat(rig.janitor.drain()).isFalse()
        assertThat(rig.ledger.pending("me", 10)).hasSize(1)

        rig.vault.locked = false
        assertThat(rig.janitor.drain()).isTrue()
        assertThat(rig.vault.erased).containsExactly("me" to "m1")
    }

    @Test
    fun `without a session nothing is drained, and another account never drains mine`() = runHarnessTest { harness ->
        val rig = Rig(harness)
        rig.ledger.recordNamed(listOf("m1"))

        rig.account = null
        assertThat(rig.janitor.drain()).isFalse()
        rig.account = "bob"
        rig.janitor.drain()

        assertThat(rig.vault.erased).isEmpty()
    }

    @Test
    fun `a deleted conversation is erased up to the instant it was recorded`() = runHarnessTest { harness ->
        val rig = Rig(harness)
        harness.clock.now = 5_000L
        rig.ledger.recordConversation("c1")

        rig.janitor.drain()

        assertThat(rig.vault.conversations).containsExactly(Triple("me", "c1", 5_000L))
    }

    @Test
    fun `an envelope opened after its message was erased leaves the vault at once, a live one stays`() = runHarnessTest { harness ->
        val rig = Rig(harness)
        rig.ledger.recordNamed(listOf("m1"))
        rig.janitor.drain()
        rig.vault.erased.clear()

        rig.janitor.reconsider(opened("m1", sentAt = 1L))
        rig.janitor.reconsider(opened("m2", sentAt = 1L))

        assertThat(rig.vault.erased).containsExactly("me" to "m1")
    }

    @Test
    fun `an envelope of a deleted conversation leaves the vault only if composed before the deletion`() = runHarnessTest { harness ->
        val rig = Rig(harness)
        harness.clock.now = 5_000L
        rig.ledger.recordConversation("c1")

        rig.janitor.reconsider(opened("m1", sentAt = 4_000L))
        rig.janitor.reconsider(opened("m2", sentAt = 6_000L))

        assertThat(rig.vault.erased).containsExactly("me" to "m1")
    }

    @Test
    fun `an event that arrived under alice is stamped for alice even when bob is signed in by the time it is recorded`() = runHarnessTest { harness ->
        val rig = Rig(harness, account = "bob")

        withAccountTicket(AccountTicket("alice", 0L)) {
            rig.ledger.recordConversation("c1")
            rig.ledger.recordNamed(listOf("m1"))
        }

        assertThat(rig.janitor.drain()).isTrue()
        assertThat(rig.vault.erased).isEmpty()
        assertThat(rig.vault.conversations).isEmpty()
        rig.account = "alice"
        assertThat(rig.janitor.drain()).isTrue()
        assertThat(rig.vault.erased).containsExactly("alice" to "m1")
        assertThat(rig.vault.conversations.map { it.first to it.second }).containsExactly("alice" to "c1")
    }
}
