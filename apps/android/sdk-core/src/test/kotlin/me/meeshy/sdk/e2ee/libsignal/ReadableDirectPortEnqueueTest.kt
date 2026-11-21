package me.meeshy.sdk.e2ee.libsignal

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.mockk
import me.meeshy.sdk.conversation.EndToEndRegimeKeeper
import me.meeshy.sdk.conversation.LocalSendState
import me.meeshy.sdk.conversation.MessageCollaboratorHarness
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.conversation.runHarnessTest
import me.meeshy.sdk.e2ee.EndToEndRegimeLedger
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.MessageEffectFlags
import me.meeshy.sdk.model.MessageEffects
import me.meeshy.sdk.outbox.OutboxEnqueueResult
import me.meeshy.sdk.outbox.OutboxIds
import me.meeshy.sdk.outbox.OutboxRepository
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * #20182 (3) — le VRAI port de la redirection dit si la ligne est en file : une file pleine rend `false`, et l'appelant
 * garde le refus lisible au lieu d'annoncer « envoyé » et d'effacer la bulle chiffrée.
 */
@RunWith(RobolectricTestRunner::class)
class ReadableDirectPortEnqueueTest {

    private val me = MeeshyUser(id = "me", username = "me", displayName = "Moi")
    private val cid = OutboxIds.derivedCid("e2ee-readable|cid_1")

    private fun MessageCollaboratorHarness.port(answer: OutboxEnqueueResult): RepositoryReadableDirectPort {
        val queue = mockk<OutboxRepository>(relaxed = true) {
            coEvery { currentTicket() } returns null
            coEvery { tryEnqueue(any(), any()) } returns answer
        }
        val messages = MessageRepository(
            mockk(relaxed = true),
            mockk(relaxed = true),
            database,
            database.messageDao(),
            database.syncMetaDao(),
            queue,
            clock,
            regime = EndToEndRegimeKeeper(EndToEndRegimeLedger.None, database),
        )
        return RepositoryReadableDirectPort(mockk(relaxed = true), mockk(relaxed = true), messages)
    }

    @Test
    fun `a full outbox is not a sent message`() = runHarnessTest { harness ->
        val queued = harness.port(OutboxEnqueueResult.QueueFull(500, 500)).send("readable", "Bonjour", "fr", me, cid, MessageEffects())

        assertThat(queued).isFalse()
        assertThat(harness.cachedSendState(cid)).isEqualTo(LocalSendState.FAILED.name)
    }

    @Test
    fun `an accepted row is a queued message, its effect on the bubble`() = runHarnessTest { harness ->
        val viewOnce = MessageEffects(flags = MessageEffectFlags.VIEW_ONCE, maxViewOnceCount = 1)

        val queued = harness.port(OutboxEnqueueResult.Accepted(cid)).send("readable", "Bonjour", "fr", me, cid, viewOnce)

        assertThat(queued).isTrue()
        assertThat(harness.cachedSendState(cid)).isEqualTo(LocalSendState.SENDING.name)
        assertThat(harness.cachedMessage(cid).isViewOnce).isTrue()
    }
}
