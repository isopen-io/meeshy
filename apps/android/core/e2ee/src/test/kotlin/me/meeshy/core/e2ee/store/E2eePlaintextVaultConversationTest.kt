package me.meeshy.core.e2ee.store

import com.google.common.truth.Truth.assertThat
import me.meeshy.core.e2ee.content.E2eeContent
import me.meeshy.core.e2ee.vault.InMemoryRecordBackend
import me.meeshy.core.e2ee.vault.TransactionalRecordVault
import org.junit.Test

/**
 * #14655 — supprimer une conversation retire du coffre le clair de chacun de ses messages composés jusque-là, même ceux
 * que Room n'a jamais tenus ; ceux d'une autre conversation, et ceux composés après, restent.
 */
class E2eePlaintextVaultConversationTest {

    private val vault = E2eePlaintextVault(TransactionalRecordVault(InMemoryRecordBackend()), owner = null)

    private fun keep(id: String, conversationId: String, sentAt: Long) =
        vault.save(E2eePlaintextEntry.Readable(E2eeContent.compose("t$id", "fr", null, conversationId, null, sentAt), "alice"), listOf(id))

    @Test
    fun `les clairs de la conversation composes jusqu a la borne partent, les autres restent`() {
        keep("m1", "c1", sentAt = 10)
        keep("m2", "c1", sentAt = 20)
        keep("m3", "c2", sentAt = 10)
        keep("m4", "c1", sentAt = 31)
        vault.save(E2eePlaintextEntry.Undecryptable, listOf("m5"))

        vault.removeConversation("c1", composedUpTo = 30)

        assertThat(vault.entries(listOf("m1", "m2", "m3", "m4", "m5")).keys).containsExactly("m3", "m4", "m5")
    }
}
