package me.meeshy.core.e2ee.seal

import me.meeshy.core.e2ee.content.E2eeContent
import me.meeshy.core.e2ee.content.E2eePadding
import me.meeshy.core.e2ee.device.E2eeDirectoryClient
import me.meeshy.core.e2ee.session.E2eeSessionCipher
import me.meeshy.core.e2ee.store.E2eeDeviceAddress
import me.meeshy.core.e2ee.store.E2eeLocalDevice
import me.meeshy.core.e2ee.store.E2eeOwnDeviceApprovals
import me.meeshy.core.e2ee.store.base64
import me.meeshy.core.e2ee.vault.RecordVault
import me.meeshy.core.e2ee.wire.E2eeDeviceListing
import me.meeshy.core.e2ee.wire.E2eeDeviceRef
import me.meeshy.core.e2ee.wire.E2eeOutgoingEnvelope
import me.meeshy.core.e2ee.wire.E2eeRemoteException
import me.meeshy.core.e2ee.wire.E2eeSealedMessage
import org.signal.libsignal.protocol.UntrustedIdentityException

public sealed class E2eeSealException(message: String) : Exception(message) {
    /** Le correspondant n'a aucun appareil enrôlé : il n'a pas de version de Meeshy qui chiffre. Rien ne part, rien en clair. */
    public class RecipientHasNoDevice(public val userId: String) : E2eeSealException("recipient has no e2ee device")

    /** L'annuaire a refusé la liste plus de fois que Sesame ne le justifie : la liste change sous nos pieds, ou le serveur ment. */
    public class DevicesMismatchUnresolved : E2eeSealException("devices mismatch unresolved")
}

/**
 * Le chiffrement d'un message pour CHAQUE appareil de la conversation directe (Sesame rév. 2, § 3), miroir de
 * `E2EEMessageSealer` (iOS) : les appareils actifs du correspondant, plus mes autres appareils APPROUVÉS. Une session
 * manquante ou périmée s'ouvre depuis le bundle de l'appareil (PQXDH) ; un 409 `E2EE_DEVICES_MISMATCH` efface les
 * sessions périmées ou en trop et rechiffre.
 *
 * Modèle de menace : serveur compromis. Il ne reçoit que des chiffrés ; il peut annoncer un appareil de trop sur le
 * compte du CORRESPONDANT (TOFU, jusqu'à la vérification du numéro de sécurité), jamais sur le mien.
 */
public class E2eeMessageSealer(
    private val local: E2eeLocalDevice,
    private val cipher: E2eeSessionCipher,
    private val directory: E2eeDirectoryClient,
    private val vault: RecordVault,
) {

    public suspend fun seal(content: E2eeContent, peerUserId: String): E2eeSealedMessage =
        seal(content.authoredBy(local.userId, local.deviceId).encoded(), peerUserId)

    /** Scelle, remet par [deliver], et résout jusqu'à [MAX_ATTEMPTS] refus Sesame. Tout autre refus remonte tel quel. */
    public suspend fun <T> sealAndDeliver(content: E2eeContent, peerUserId: String, deliver: suspend (E2eeSealedMessage) -> T): T =
        sealAndDeliverRaw(content.authoredBy(local.userId, local.deviceId).encoded(), peerUserId, deliver)

    /** Le même chemin pour un clair déjà composé et signé de son auteur (un SIGNAL, #13142) : même remplissage, même Sesame. */
    public suspend fun <T> sealAndDeliverRaw(plaintext: ByteArray, peerUserId: String, deliver: suspend (E2eeSealedMessage) -> T): T {
        repeat(MAX_ATTEMPTS) {
            val sealed = seal(plaintext, peerUserId)
            try {
                return deliver(sealed)
            } catch (error: E2eeRemoteException) {
                val mismatch = error.mismatch ?: throw error
                forget(mismatch.stale + mismatch.extra)
            }
        }
        throw E2eeSealException.DevicesMismatchUnresolved()
    }

    internal suspend fun seal(unpadded: ByteArray, peerUserId: String): E2eeSealedMessage {
        val peerTargets = targets(peerUserId)
        if (peerTargets.isEmpty()) throw E2eeSealException.RecipientHasNoDevice(peerUserId)
        val own = ownTargets()
        val recipients = peerTargets + own.approved
        val plaintext = E2eePadding.padded(unpadded, recipients.size)
        val envelopes = recipients.map { target ->
            val ciphertext = cipher.encrypt(plaintext, target.address)
            E2eeOutgoingEnvelope(target.address.userId, target.address.deviceId, target.registrationId, ciphertext.type, base64(ciphertext.body))
        }
        return E2eeSealedMessage(local.deviceId, envelopes, own.unapproved)
    }

    private fun forget(refs: List<E2eeDeviceRef>) {
        refs.forEach { cipher.deleteSession(E2eeDeviceAddress(it.userId, it.deviceId)) }
    }

    private class Target(val address: E2eeDeviceAddress, val registrationId: Int)

    private class OwnTargets(val approved: List<Target>, val unapproved: List<Int>)

    /** Les appareils actifs d'un utilisateur, chacun avec une session à jour. */
    private suspend fun targets(userId: String): List<Target> {
        val listed = directory.devices(userId).devices.filterNot { userId == local.userId && it.deviceId == local.deviceId }
        return withSessions(userId, listed)
    }

    /** Mes autres appareils : approuvés (ils reçoivent leur enveloppe) ou non (`unapprovedOwnDevices`, spec § 3.5). */
    private suspend fun ownTargets(): OwnTargets {
        val others = directory.devices(local.userId).devices.filter { it.deviceId != local.deviceId }
        val pinned = vault.read { reader ->
            others.filter { E2eeOwnDeviceApprovals.approval(it.deviceId, reader)?.covers(it.registrationId) == true }
        }
        val opened = pinned.mapNotNull { device ->
            try {
                withSessions(local.userId, listOf(device)).firstOrNull()
            } catch (_: UntrustedIdentityException) {
                // Son bundle ne porte pas la clé épinglée : le store le refuse, il ne reçoit rien et l'envoi continue.
                null
            }
        }
        val approved = opened.filter { target ->
            val known = cipher.remoteIdentity(target.address)
            val pinnedKey = vault.read { E2eeOwnDeviceApprovals.pinned(target.address.deviceId, it) }
            known != null && pinnedKey != null && known.contentEquals(pinnedKey)
        }
        val approvedIds = approved.map { it.address.deviceId }.toSet()
        return OwnTargets(approved, others.map { it.deviceId }.filterNot { it in approvedIds })
    }

    /** Ouvre (PQXDH) la session de chaque appareil qui n'en a pas, ou dont la session vise une autre génération. */
    private suspend fun withSessions(userId: String, listed: List<E2eeDeviceListing>): List<Target> {
        val toOpen = listed.filter { cipher.remoteRegistrationId(E2eeDeviceAddress(userId, it.deviceId)) != it.registrationId }
        if (toOpen.isNotEmpty()) {
            directory.bundles(userId, toOpen.map { it.deviceId }).devices.forEach { bundle ->
                cipher.deleteSession(E2eeDeviceAddress(userId, bundle.deviceId))
                cipher.startSession(bundle, userId)
            }
        }
        return listed.mapNotNull { device ->
            val address = E2eeDeviceAddress(userId, device.deviceId)
            cipher.remoteRegistrationId(address)?.let { Target(address, it) }
        }
    }

    public companion object {
        public const val MAX_ATTEMPTS: Int = 3
    }
}
