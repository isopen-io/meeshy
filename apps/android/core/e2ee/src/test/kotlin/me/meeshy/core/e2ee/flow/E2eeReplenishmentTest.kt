package me.meeshy.core.e2ee.flow

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import java.io.IOException
import me.meeshy.core.e2ee.content.E2eeContent
import me.meeshy.core.e2ee.device.E2eeDeviceRegistrar
import me.meeshy.core.e2ee.device.E2eeDirectoryClient
import me.meeshy.core.e2ee.open.E2eeOpenOutcome
import me.meeshy.core.e2ee.vault.RecordKind
import me.meeshy.core.e2ee.wire.E2eeErrorCode
import me.meeshy.core.e2ee.wire.E2eePlatform
import me.meeshy.core.e2ee.wire.E2eePreKeyStock
import me.meeshy.core.e2ee.wire.E2eePublishKeysRequest
import me.meeshy.core.e2ee.wire.E2eeRemoteException
import me.meeshy.core.e2ee.wire.LibsignalSendRequest
import org.junit.Test

/**
 * #18974 (AND-14 + ANDX-04) — le réapprovisionnement des pré-clés est AU MIEUX : un refus ne retire pas à l'appareil sa
 * capacité de chiffrer ni de lire. Et le lot écrit avant la publication (une pré-clé publiée a toujours sa clé privée sur
 * l'appareil) est republié TEL QUEL tant que la passerelle ne l'a pas jugé, jamais régénéré ; il ne quitte le coffre que
 * sur un refus définitif, qui prouve qu'elle ne l'a pas rangé.
 *
 * Audit de #19077, P2 — la passerelle efface les pré-clés d'une génération, marques de réservation comprises, quand sa
 * session finit (`eraseGeneration`) et quand l'installation reprend sa place (`takeSlot`) : un lot présenté AVANT cet
 * effacement ne se republie jamais après, et un lot déjà présenté ne quitte jamais le coffre avec ses clés privées.
 */
class E2eeReplenishmentTest {
    private val alice = "64f0c0ffee0000000000aaaa"
    private val bob = "64f0c0ffee0000000000bbbb"
    private val carol = "64f0c0ffee0000000000cccc"
    private val conversation = "64f0c0ffee000000000c0001"

    /** La passerelle range le lot, puis sa réponse se perd (délai, coupure, 5xx après écriture) : le lot reste en attente. */
    private class LostResponse(private val inner: E2eeDirectoryClient) : E2eeDirectoryClient by inner {
        override suspend fun publishKeys(deviceId: Int, request: E2eePublishKeysRequest): E2eePreKeyStock {
            inner.publishKeys(deviceId, request)
            throw IOException("response lost")
        }
    }

    /** La session de l'appareil finit : la passerelle retire sa génération et efface ses pré-clés, réservations comprises. */
    private fun FakeE2eeServer.endSessionOf(userId: String) {
        active(userId).forEach { device ->
            device.retired = true
            device.oneTime.clear()
            device.kyber.clear()
        }
    }

    private suspend fun send(from: E2eeTestDevice, to: String, text: String) {
        val content = E2eeContent.compose(text, null, null, conversation, "cid_$text", 1L)
        from.sealer.sealAndDeliver(content, to) { from.session.send(conversation, to, LibsignalSendRequest.of("cid_$text", it)) }
    }

    private fun E2eeTestDevice.kyberPreKeys(): Set<String> = vault.read { it.keys(RecordKind.KYBER_PRE_KEY).toSet() }

    private suspend fun E2eeTestDevice.prepareWith(directory: E2eeDirectoryClient) =
        runCatching { E2eeDeviceRegistrar(vault, directory, E2eePlatform.ANDROID, label = "Pixel").ensureEnrolled(alice) }

    /** La passerelle refuse chaque publication avec ce statut, et garde ce qu'on lui a présenté. */
    private class RefusingKeys(private val inner: E2eeDirectoryClient, private val status: Int, private val code: String) : E2eeDirectoryClient by inner {
        val presented = mutableListOf<E2eePublishKeysRequest>()

        override suspend fun publishKeys(deviceId: Int, request: E2eePublishKeysRequest): E2eePreKeyStock {
            presented += request
            throw E2eeRemoteException(code, status)
        }
    }

    /** Un appareil enrôlé dont la passerelle a épuisé le stock de pré-clés uniques. */
    private suspend fun drained(server: FakeE2eeServer): E2eeTestDevice =
        E2eeTestDevice(server, alice).enroll().also { server.active(alice).single().apply { oneTime.clear(); kyber.clear() } }

    private fun E2eeTestDevice.preKeys(): Set<String> = vault.read { it.keys(RecordKind.PRE_KEY).toSet() }

    @Test
    fun aRefusedReplenishment_leavesAnEnrolledDeviceReady() = runTest {
        val device = drained(FakeE2eeServer())
        val registrar = E2eeDeviceRegistrar(device.vault, RefusingKeys(device.session, 429, "HTTP_429"), E2eePlatform.ANDROID, label = "Pixel")

        val ready = runCatching { registrar.ensureEnrolled(alice) }

        assertThat(ready.exceptionOrNull()).isNull()
        assertThat(ready.getOrNull()?.device).isEqualTo(device.enrolled.device)
    }

    @Test
    fun anAmbiguousFailure_republishesTheSameBatch_andGrowsNothingOnTheDevice() = runTest {
        val device = drained(FakeE2eeServer())
        val refusing = RefusingKeys(device.session, 503, "HTTP_503")
        val registrar = E2eeDeviceRegistrar(device.vault, refusing, E2eePlatform.ANDROID, label = "Pixel")
        runCatching { registrar.ensureEnrolled(alice) }
        val afterFirst = device.preKeys()

        repeat(2) { runCatching { registrar.ensureEnrolled(alice) } }

        assertThat(device.preKeys()).isEqualTo(afterFirst)
        assertThat(refusing.presented).hasSize(3)
        assertThat(refusing.presented.map { batch -> batch.oneTimePreKeys?.map { it.keyId } }.distinct()).hasSize(1)
        assertThat(refusing.presented.map { batch -> batch.kyberPreKeys?.map { it.keyId } }.distinct()).hasSize(1)
    }

    @Test
    fun aDefinitiveRefusal_withdrawsTheBatch_soNoPrivateKeyOutlivesItsRefusal() = runTest {
        val device = drained(FakeE2eeServer())
        val before = device.preKeys()
        val registrar = E2eeDeviceRegistrar(device.vault, RefusingKeys(device.session, 400, "E2EE_PREKEY_STOCK_FULL"), E2eePlatform.ANDROID, label = "Pixel")

        runCatching { registrar.ensureEnrolled(alice) }

        assertThat(device.preKeys()).isEqualTo(before)
    }

    @Test
    fun aRepublishedBatchThatTheGatewayAlreadyHas_isSettled_andTheDeviceKeepsEveryPrivateKey() = runTest {
        val server = FakeE2eeServer()
        val device = drained(server)
        val flaky = RefusingKeys(device.session, 503, "HTTP_503")
        runCatching { E2eeDeviceRegistrar(device.vault, flaky, E2eePlatform.ANDROID, label = "Pixel").ensureEnrolled(alice) }
        val pending = device.preKeys()

        val ready = runCatching { E2eeDeviceRegistrar(device.vault, device.session, E2eePlatform.ANDROID, label = "Pixel").ensureEnrolled(alice) }

        assertThat(ready.exceptionOrNull()).isNull()
        assertThat(device.preKeys()).isEqualTo(pending)
        assertThat(server.active(alice).single().oneTime.map { it.keyId })
            .containsExactlyElementsIn(flaky.presented.single().oneTimePreKeys.orEmpty().map { it.keyId })
    }

    @Test
    fun afterTheGatewayErasedItsPreKeys_aPendingBatchNeverServesAPreKeyAPeerAlreadyConsumed() = runTest {
        val server = FakeE2eeServer()
        val peer = E2eeTestDevice(server, bob).enroll()
        val device = drained(server)
        device.prepareWith(LostResponse(device.session))
        send(peer, alice, "b1")
        device.opener.catchUp()
        server.endSessionOf(alice)

        device.prepareWith(device.session)

        val served = server.active(alice).single()
        assertThat(served.oneTime.map { it.keyId.toString() }).isNotEmpty()
        assertThat(served.oneTime.map { it.keyId.toString() }.toSet() - device.preKeys()).isEmpty()
        assertThat(served.kyber.map { it.keyId.toString() }.toSet() - device.kyberPreKeys()).isEmpty()
    }

    @Test
    fun afterTheGatewayErasedItsPreKeys_aPeerReservationIsNeverHandedOutTwice_andNoFirstMessageIsLost() = runTest {
        val server = FakeE2eeServer()
        val first = E2eeTestDevice(server, bob).enroll()
        val second = E2eeTestDevice(server, carol).enroll()
        val device = drained(server)
        device.prepareWith(LostResponse(device.session))
        send(first, alice, "b1")
        server.endSessionOf(alice)
        device.prepareWith(device.session)
        send(second, alice, "c1")

        val outcomes = device.opener.catchUp()

        assertThat(outcomes.filterIsInstance<E2eeOpenOutcome.Opened>().map { it.content.text }).containsExactly("b1", "c1")
        assertThat(outcomes.filterIsInstance<E2eeOpenOutcome.Undecryptable>()).isEmpty()
    }

    @Test
    fun aRepublishedBatch_refusedOnceTheDeviceIsNoLongerBound_keepsThePrivateKeysAPeerMayHold() = runTest {
        val server = FakeE2eeServer()
        val peer = E2eeTestDevice(server, bob).enroll()
        val device = drained(server)
        device.prepareWith(LostResponse(device.session))
        send(peer, alice, "b1")

        device.prepareWith(RefusingKeys(device.session, 403, E2eeErrorCode.DEVICE_NOT_BOUND))
        val outcomes = device.opener.catchUp()

        assertThat(outcomes.filterIsInstance<E2eeOpenOutcome.Opened>().map { it.content.text }).containsExactly("b1")
    }
}
