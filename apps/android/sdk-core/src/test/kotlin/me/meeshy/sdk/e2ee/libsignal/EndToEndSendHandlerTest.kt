package me.meeshy.sdk.e2ee.libsignal

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import me.meeshy.core.database.entity.OutboxEntity
import me.meeshy.core.e2ee.content.E2eeContent
import me.meeshy.core.e2ee.seal.E2eeSealException
import me.meeshy.core.e2ee.store.E2eePlaintextEntry
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.e2ee.PlaintextErasureLedger
import me.meeshy.sdk.model.MessageEffectFlags
import me.meeshy.sdk.model.MessageEffects
import me.meeshy.sdk.outbox.SendResult
import me.meeshy.sdk.session.SessionRepository
import org.junit.Test

/**
 * #18977 (AND-07), audit de #19077 P6 — un téléphone qui ne tient pas de coffre durable le DIT : l'envoi chiffré échoue avec
 * sa raison propre, jamais confondu avec un clair perdu, et rien ne repart en clair.
 */
class EndToEndSendHandlerTest {
    private val alice = "64f0c0ffee0000000000aaaa"

    private fun row(
        payload: String = """{"conversationId":"64f0c0ffee000000000c0001","peerUserId":"64f0c0ffee0000000000bbbb","clientMessageId":"cid_1"}""",
    ): OutboxEntity = OutboxEntity(
        cmid = "cid_1",
        lane = "messages",
        kind = "SEND_E2EE_MESSAGE",
        targetId = "64f0c0ffee000000000c0001",
        payload = payload,
        dependsOn = null,
        attempts = 0,
        state = "PENDING",
        createdAt = 0L,
        updatedAt = 0L,
    )

    @Test
    fun aVaultThisPhoneCannotKeep_failsTheSendWithItsOwnReason() = runTest {
        val runtime = mockk<EndToEndMessagingRuntime>()
        coEvery { runtime.plaintext(any(), any()) } throws E2eeVaultUnavailableException(IllegalStateException("no usable keystore"))
        val session = mockk<SessionRepository> { every { currentUserId } returns alice }
        val handler = EndToEndSendHandler(runtime, session, mockk<MessageRepository>(relaxed = true), Json, reach(), mockk(relaxed = true), mockk(relaxed = true))

        val result = handler.send(row())

        assertThat(result).isEqualTo(SendResult.PermanentFailure(EndToEndSendHandler.REASON_UNAVAILABLE))
    }

    private val peer = "64f0c0ffee0000000000bbbb"
    private val conversation = "64f0c0ffee000000000c0001"

    private fun reach() = EndToEndPeerDeviceReach { 1 }

    private fun runtimeWithoutPeerDevice(): EndToEndMessagingRuntime = mockk(relaxed = true) {
        coEvery { plaintext(alice, "cid_1") } returns
            E2eePlaintextEntry.Readable(E2eeContent.compose("Bonjour", "fr", "m0", conversation, "cid_1", 0L), alice)
        coEvery { deliver(any(), any(), any(), any(), any()) } throws E2eeSealException.RecipientHasNoDevice(peer)
    }

    /** #20076 — le pair n'a aucun appareil chiffré : le texte part dans le tête-à-tête lisible, la bulle chiffrée s'en va. */
    @Test
    fun aPeerWithoutDevice_redirectsTheTextToTheReadableDirect_andWithdrawsTheSealedBubble() = runTest {
        val runtime = runtimeWithoutPeerDevice()
        val session = mockk<SessionRepository> { every { currentUserId } returns alice }
        val messages = mockk<MessageRepository>(relaxed = true)
        val redirect = mockk<EndToEndReadableRedirect> {
            coEvery { deliver(conversation, peer, "cid_1", "Bonjour", "fr", MessageEffects()) } returns true
        }
        val reach = reach()
        val handler = EndToEndSendHandler(runtime, session, messages, Json, reach, redirect, mockk(relaxed = true))

        val result = handler.send(row())

        assertThat(result).isEqualTo(SendResult.Success)
        assertThat(reach.lacksEncryptedDevice(peer)).isTrue()
        coVerify(exactly = 1) { messages.withdrawLocal("cid_1") }
        coVerify(exactly = 1) { runtime.erase(alice, listOf("cid_1")) }
        coVerify(exactly = 0) { messages.reconcileSent(any(), any()) }
    }

    /** #20076 — une redirection qui échoue garde le refus lisible d'avant, et rien ne part en clair ici (#12949). */
    @Test
    fun aRedirectThatFails_keepsTheReadableRefusal_andTheBubble() = runTest {
        val runtime = runtimeWithoutPeerDevice()
        val session = mockk<SessionRepository> { every { currentUserId } returns alice }
        val messages = mockk<MessageRepository>(relaxed = true)
        val redirect = mockk<EndToEndReadableRedirect> { coEvery { deliver(any(), any(), any(), any(), any(), any()) } returns false }
        val handler = EndToEndSendHandler(runtime, session, messages, Json, reach(), redirect, mockk(relaxed = true))

        val result = handler.send(row())

        assertThat(result).isEqualTo(SendResult.PermanentFailure(EndToEndSendHandler.REASON_NOT_SEALED))
        coVerify(exactly = 0) { messages.withdrawLocal(any()) }
        coVerify(exactly = 0) { runtime.erase(any(), any()) }
    }

    /** #20182 (2) — une vue unique redirigée reste une vue unique : l'effet du geste voyage avec le texte. */
    @Test
    fun aRedirectedViewOnce_carriesItsEffect() = runTest {
        val runtime = runtimeWithoutPeerDevice()
        val session = mockk<SessionRepository> { every { currentUserId } returns alice }
        val viewOnce = MessageEffects(flags = MessageEffectFlags.VIEW_ONCE or MessageEffectFlags.BLURRED, maxViewOnceCount = 1)
        val redirect = mockk<EndToEndReadableRedirect> { coEvery { deliver(any(), any(), any(), any(), any(), any()) } returns true }
        val handler = EndToEndSendHandler(runtime, session, mockk(relaxed = true), Json, reach(), redirect, mockk(relaxed = true))
        val payload = """{"conversationId":"$conversation","peerUserId":"$peer","clientMessageId":"cid_1",""" +
            """"effects":{"flags":${viewOnce.flags},"maxViewOnceCount":1}}"""

        assertThat(handler.send(row(payload))).isEqualTo(SendResult.Success)

        coVerify(exactly = 1) { redirect.deliver(conversation, peer, "cid_1", "Bonjour", "fr", viewOnce) }
    }

    /** #20182 (4) — un clair que le coffre n'a pas pu effacer s'inscrit au registre des effacements, jamais oublié. */
    @Test
    fun aRedirectWhoseErasureFails_recordsTheClearForErasure() = runTest {
        val runtime = runtimeWithoutPeerDevice()
        coEvery { runtime.erase(alice, listOf("cid_1")) } returns false
        val session = mockk<SessionRepository> { every { currentUserId } returns alice }
        val redirect = mockk<EndToEndReadableRedirect> { coEvery { deliver(any(), any(), any(), any(), any(), any()) } returns true }
        val erasures = mockk<PlaintextErasureLedger>(relaxed = true)
        val handler = EndToEndSendHandler(runtime, session, mockk(relaxed = true), Json, reach(), redirect, erasures)

        assertThat(handler.send(row())).isEqualTo(SendResult.Success)

        coVerify(exactly = 1) { erasures.recordNamed(listOf("cid_1")) }
    }

    @Test
    fun aRedirectWhoseErasureSucceeds_recordsNothing() = runTest {
        val runtime = runtimeWithoutPeerDevice()
        coEvery { runtime.erase(alice, listOf("cid_1")) } returns true
        val session = mockk<SessionRepository> { every { currentUserId } returns alice }
        val redirect = mockk<EndToEndReadableRedirect> { coEvery { deliver(any(), any(), any(), any(), any(), any()) } returns true }
        val erasures = mockk<PlaintextErasureLedger>(relaxed = true)
        val handler = EndToEndSendHandler(runtime, session, mockk(relaxed = true), Json, reach(), redirect, erasures)

        handler.send(row())

        coVerify(exactly = 0) { erasures.recordNamed(any()) }
    }

    /**
     * #20181 — un pair que cet appareil a connu chiffré, ou dont les appareils listés ne s'ouvrent pas : le refus lisible
     * d'avant et le bandeau « Écrire sans chiffrement » ; RIEN ne part en clair sans le geste de l'utilisateur.
     */
    @Test
    fun anUnreachablePeer_isRefused_withTheBanner_andNothingIsRedirected() = runTest {
        for (listed in listOf(true, false)) {
            val runtime = runtimeWithoutPeerDevice()
            coEvery { runtime.deliver(any(), any(), any(), any(), any()) } throws E2eeSealException.RecipientDevicesUnreachable(peer, listed)
            val session = mockk<SessionRepository> { every { currentUserId } returns alice }
            val messages = mockk<MessageRepository>(relaxed = true)
            val redirect = mockk<EndToEndReadableRedirect>(relaxed = true)
            val reach = EndToEndPeerDeviceReach { 1 }
            val handler = EndToEndSendHandler(runtime, session, messages, Json, reach, redirect, mockk(relaxed = true))

            val result = handler.send(row())

            assertThat(result).isEqualTo(SendResult.PermanentFailure(EndToEndSendHandler.REASON_NOT_SEALED))
            reach.refresh(peer)
            assertThat(reach.lacksEncryptedDevice(peer)).isTrue()
            coVerify(exactly = 0) { redirect.deliver(any(), any(), any(), any(), any(), any()) }
            coVerify(exactly = 0) { messages.withdrawLocal(any()) }
        }
    }
}
