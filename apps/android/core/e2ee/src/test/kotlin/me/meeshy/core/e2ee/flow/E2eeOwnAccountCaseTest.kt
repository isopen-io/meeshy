package me.meeshy.core.e2ee.flow

import com.google.common.truth.Truth.assertThat
import java.util.Base64
import kotlinx.coroutines.test.runTest
import me.meeshy.core.e2ee.content.E2eeContent
import me.meeshy.core.e2ee.device.E2eeDirectoryClient
import me.meeshy.core.e2ee.open.E2eeOpenOutcome
import me.meeshy.core.e2ee.seal.E2eeMessageSealer
import me.meeshy.core.e2ee.seal.E2eeSealException
import me.meeshy.core.e2ee.session.E2eeSessionCipher
import me.meeshy.core.e2ee.store.E2eeDeviceAddress
import me.meeshy.core.e2ee.store.E2eeLocalDevice
import me.meeshy.core.e2ee.store.E2eeLocalIdentity
import me.meeshy.core.e2ee.store.isSameAccount
import me.meeshy.core.e2ee.vault.InMemoryRecordBackend
import me.meeshy.core.e2ee.vault.TransactionalRecordVault
import me.meeshy.core.e2ee.wire.E2eeSealedMessage
import me.meeshy.core.e2ee.wire.E2eeServedEnvelope
import me.meeshy.core.e2ee.wire.E2eeUserBundles
import me.meeshy.core.e2ee.wire.E2eeUserDevices
import org.junit.Test

/**
 * #18973 (ANDX-07, jumelle Android de #18950) — « moi » ne se reconnaît pas à une égalité de chaînes sensible à la casse.
 * Un serveur hostile qui sert MON identifiant en majuscules ne fait ni ouvrir la copie d'un appareil fantôme de mon compte,
 * ni sceller un message pour mes appareils non approuvés en me présentant comme mon propre correspondant.
 */
class E2eeOwnAccountCaseTest {
    private val alice = "64f0c0ffee0000000000aaaa"
    private val conversation = "64f0c0ffee000000000c0001"

    /** Une passerelle qui résout un identifiant de compte quelle que soit sa casse (ce qu'une base peut faire). */
    private class CaseBlindDirectory(private val inner: E2eeDirectoryClient) : E2eeDirectoryClient by inner {
        override suspend fun devices(userId: String): E2eeUserDevices = inner.devices(userId.lowercase()).copy(userId = userId)

        override suspend fun bundles(userId: String, deviceIds: List<Int>?): E2eeUserBundles =
            inner.bundles(userId.lowercase(), deviceIds).copy(userId = userId)
    }

    @Test
    fun myIdServedInCapitals_doesNotOpenTheCopyOfAnUnapprovedDeviceOfMine() = runTest {
        val server = FakeE2eeServer()
        val phone = E2eeTestDevice(server, alice).enroll()
        val phantom = E2eeTestDevice(server, alice).enroll()
        val shouted = alice.uppercase()
        val phantomCipher = E2eeSessionCipher(
            E2eeDeviceAddress("64f0c0ffee0000000000dddd", phantom.enrolled.device.deviceId),
            E2eeLocalIdentity(phantom.enrolled.identity.keyPair, phantom.enrolled.device.registrationId),
            TransactionalRecordVault(InMemoryRecordBackend()),
        )
        val phoneAddress = E2eeDeviceAddress(alice, phone.enrolled.device.deviceId)
        phantomCipher.startSession(phantom.session.bundles(alice, listOf(phoneAddress.deviceId)).devices.single(), alice)
        val copy = E2eeContent.compose("copie fantôme", null, null, conversation, "cid_x", 1L).authoredBy(shouted, phantom.enrolled.device.deviceId)
        val ciphertext = phantomCipher.encrypt(copy.encoded(), phoneAddress)
        val envelope = E2eeServedEnvelope(
            id = "e-shouted", messageId = "m-shouted", conversationId = conversation,
            recipientRegistrationId = phone.enrolled.device.registrationId, senderUserId = shouted,
            senderDeviceId = phantom.enrolled.device.deviceId, type = ciphertext.type,
            body = Base64.getEncoder().encodeToString(ciphertext.body), createdAt = "2026-11-17T00:00:00.000Z",
        )

        val outcome = phone.opener.open(envelope)

        assertThat(outcome).isNotInstanceOf(E2eeOpenOutcome.Opened::class.java)
        assertThat(outcome.acknowledges).isFalse()
        assertThat(phone.plaintexts.entry("m-shouted")).isNull()
    }

    @Test
    fun aPeerThatIsMeInCapitals_isRefused_beforeAnythingIsSealedForMyDevices() = runTest {
        val server = FakeE2eeServer()
        val phone = E2eeTestDevice(server, alice).enroll()
        E2eeTestDevice(server, alice).enroll()
        val sealer = E2eeMessageSealer(phone.enrolled.device, phone.cipher, CaseBlindDirectory(phone.session), phone.vault)
        val sealedFor = mutableListOf<E2eeSealedMessage>()
        val content = E2eeContent.compose("à moi-même", null, null, conversation, "cid_me", 1L)

        val result = runCatching { sealer.sealAndDeliver(content, alice.uppercase()) { sealed -> sealedFor += sealed } }

        assertThat(result.isFailure).isTrue()
        assertThat(sealedFor).isEmpty()
    }

    /** Audit de #19077, P8 — ces témoins tombent si « moi » redevient une égalité sensible à la casse. */
    @Test
    fun myAccount_isRecognisedInAnyCase_andNoOtherAccountIs() {
        val me = E2eeLocalDevice(alice, 1, 4242)

        assertThat(isSameAccount(alice.uppercase(), alice)).isTrue()
        assertThat(me.isMe(alice.uppercase())).isTrue()
        assertThat(me.isMe("64f0c0ffee0000000000bbbb")).isFalse()
    }

    /** Audit de #19077, P8 — une session qui nomme mon compte dans une autre casse ne réinitialise jamais mon identité. */
    @Test
    fun aSessionNamingMyAccountInAnotherCase_neverWipesMyIdentity() = runTest {
        val server = FakeE2eeServer()
        val phone = E2eeTestDevice(server, alice).enroll()

        val again = phone.registrar.ensureEnrolled(alice.uppercase())

        assertThat(again.device.deviceId).isEqualTo(phone.enrolled.device.deviceId)
        assertThat(again.identity.registrationId).isEqualTo(phone.enrolled.identity.registrationId)
        assertThat(again.identity.identityKeyBase64).isEqualTo(phone.enrolled.identity.identityKeyBase64)
    }

    /** Audit de #19077, P8 — un correspondant qui est MOI, dans la même casse, est refusé avant tout scellement. */
    @Test
    fun aPeerThatIsMeInTheSameCase_isRefused_beforeAnythingIsSealed() = runTest {
        val server = FakeE2eeServer()
        val phone = E2eeTestDevice(server, alice).enroll()
        val sealedFor = mutableListOf<E2eeSealedMessage>()
        val content = E2eeContent.compose("à moi-même", null, null, conversation, "cid_me", 1L)

        val result = runCatching { phone.sealer.sealAndDeliver(content, alice) { sealed -> sealedFor += sealed } }

        assertThat(result.exceptionOrNull()).isInstanceOf(E2eeSealException.InvalidPeer::class.java)
        assertThat(sealedFor).isEmpty()
    }
}
