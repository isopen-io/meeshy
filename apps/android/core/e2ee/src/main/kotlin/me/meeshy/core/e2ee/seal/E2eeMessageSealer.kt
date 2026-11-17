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
import me.meeshy.core.e2ee.wire.E2eeDevicesMismatch
import me.meeshy.core.e2ee.wire.E2eeOutgoingEnvelope
import me.meeshy.core.e2ee.wire.E2eeRemoteException
import me.meeshy.core.e2ee.wire.E2eeSealedMessage
import me.meeshy.core.e2ee.wire.E2eeServedIds
import org.signal.libsignal.protocol.UntrustedIdentityException

public sealed class E2eeSealException(message: String) : Exception(message) {
    /** Le correspondant n'a aucun appareil enrôlé : il n'a pas de version de Meeshy qui chiffre. Rien ne part, rien en clair. */
    public class RecipientHasNoDevice(public val userId: String) : E2eeSealException("recipient has no e2ee device")

    /** L'annuaire a refusé la liste plus de fois que Sesame ne le justifie : la liste change sous nos pieds, ou le serveur ment. */
    public class DevicesMismatchUnresolved : E2eeSealException("devices mismatch unresolved")

    /**
     * Le correspondant servi n'est pas un compte que la passerelle honnête sert, ou c'est MOI dans une autre casse (#18973) :
     * rien n'est scellé — un tête-à-tête avec moi-même scellerait pour mes appareils sans leur épingle.
     */
    public class InvalidPeer : E2eeSealException("the direct peer is not another account")
}

/**
 * Le chiffrement d'un message pour CHAQUE appareil de la conversation directe (Sesame rév. 2, § 3), miroir de
 * `E2EEMessageSealer` (iOS) : les appareils actifs du correspondant, plus mes autres appareils APPROUVÉS. Une session
 * manquante ou d'une autre génération s'ouvre depuis le bundle de l'appareil (PQXDH) ; un 409 `E2EE_DEVICES_MISMATCH`
 * rechiffre sur la liste relue. Aucune session n'est jamais EFFACÉE (#18979) : libsignal archive l'état courant quand une
 * neuve s'ouvre, et un appareil `extra` voit sa session archivée — un message encore en vol sous elle reste lisible.
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
                retire(error.mismatch ?: throw error)
            }
        }
        throw E2eeSealException.DevicesMismatchUnresolved()
    }

    internal suspend fun seal(unpadded: ByteArray, peerUserId: String): E2eeSealedMessage {
        if (!E2eeServedIds.isAccount(peerUserId) || local.isMe(peerUserId)) throw E2eeSealException.InvalidPeer()
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

    /**
     * Après un 409 : un appareil `stale` n'a rien à effacer (la liste relue porte sa nouvelle génération, et l'ouverture de
     * sa session archive l'ancienne) ; un appareil `extra` ne reçoit plus rien, sa session est ARCHIVÉE, jamais effacée.
     */
    private fun retire(mismatch: E2eeDevicesMismatch) {
        mismatch.extra.forEach { cipher.archiveSession(E2eeDeviceAddress(it.userId, it.deviceId)) }
    }

    private class Target(val address: E2eeDeviceAddress, val registrationId: Int)

    private class OwnTargets(val approved: List<Target>, val unapproved: List<Int>)

    /** Les appareils actifs d'un utilisateur, chacun avec une session à jour. */
    private suspend fun targets(userId: String): List<Target> {
        val listed = directory.devices(userId).devices.filter { E2eeServedIds.isDevice(it.deviceId) }
        return withSessions(userId, listed)
    }

    /** Mes autres appareils : approuvés (ils reçoivent leur enveloppe) ou non (`unapprovedOwnDevices`, spec § 3.5). */
    private suspend fun ownTargets(): OwnTargets {
        val others = directory.devices(local.userId).devices.filter { it.deviceId != local.deviceId && E2eeServedIds.isDevice(it.deviceId) }
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

    /**
     * Ouvre (PQXDH) la session de chaque appareil qui n'en a pas, ou dont la session vise une autre génération ; l'état
     * courant est archivé par libsignal, jamais effacé (#18979). Un bundle servi pour un appareil qu'on n'a pas demandé
     * ne s'ouvre pas.
     */
    private suspend fun withSessions(userId: String, listed: List<E2eeDeviceListing>): List<Target> {
        val toOpen = listed.filter { cipher.remoteRegistrationId(E2eeDeviceAddress(userId, it.deviceId)) != it.registrationId }
        if (toOpen.isNotEmpty()) {
            val requested = toOpen.map { it.deviceId }.toSet()
            directory.bundles(userId, requested.toList()).devices
                .filter { it.deviceId in requested }
                .forEach { bundle -> cipher.startSession(bundle, userId) }
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
