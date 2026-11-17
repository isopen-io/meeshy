package me.meeshy.core.e2ee.flow

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.core.e2ee.device.E2eeDeviceRegistrar
import me.meeshy.core.e2ee.device.E2eeDirectoryClient
import me.meeshy.core.e2ee.vault.RecordKind
import me.meeshy.core.e2ee.wire.E2eePlatform
import me.meeshy.core.e2ee.wire.E2eePreKeyStock
import me.meeshy.core.e2ee.wire.E2eePublishKeysRequest
import me.meeshy.core.e2ee.wire.E2eeRemoteException
import org.junit.Test

/**
 * #18974 (AND-14 + ANDX-04) — le réapprovisionnement des pré-clés est AU MIEUX : un refus ne retire pas à l'appareil sa
 * capacité de chiffrer ni de lire. Et le lot écrit avant la publication (une pré-clé publiée a toujours sa clé privée sur
 * l'appareil) est republié TEL QUEL tant que la passerelle ne l'a pas jugé, jamais régénéré ; il ne quitte le coffre que
 * sur un refus définitif, qui prouve qu'elle ne l'a pas rangé.
 */
class E2eeReplenishmentTest {
    private val alice = "64f0c0ffee0000000000aaaa"

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
}
