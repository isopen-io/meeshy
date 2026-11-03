package me.meeshy.core.e2ee.flow

import java.util.Base64
import me.meeshy.core.e2ee.device.E2eeDirectoryClient
import me.meeshy.core.e2ee.wire.E2eeAckResult
import me.meeshy.core.e2ee.wire.E2eeDeviceBindingProof
import me.meeshy.core.e2ee.wire.E2eeDeviceBundle
import me.meeshy.core.e2ee.wire.E2eeDeviceListing
import me.meeshy.core.e2ee.wire.E2eeDeviceRef
import me.meeshy.core.e2ee.wire.E2eeDevicesMismatch
import me.meeshy.core.e2ee.wire.E2eeEnrollDeviceRequest
import me.meeshy.core.e2ee.wire.E2eeEnrollment
import me.meeshy.core.e2ee.wire.E2eeEnvelopePage
import me.meeshy.core.e2ee.wire.E2eeErrorCode
import me.meeshy.core.e2ee.wire.E2eeJson
import me.meeshy.core.e2ee.wire.E2eeKyberBundleKey
import me.meeshy.core.e2ee.wire.E2eeOneTimeKey
import me.meeshy.core.e2ee.wire.E2eePreKeyStock
import me.meeshy.core.e2ee.wire.E2eePublishKeysRequest
import me.meeshy.core.e2ee.wire.E2eeRemoteException
import me.meeshy.core.e2ee.wire.E2eeRetirement
import me.meeshy.core.e2ee.wire.E2eeServedEnvelope
import me.meeshy.core.e2ee.wire.E2eeSignedKey
import me.meeshy.core.e2ee.wire.E2eeUserBundles
import me.meeshy.core.e2ee.wire.E2eeUserDevices
import me.meeshy.core.e2ee.wire.LibsignalSendRequest
import org.signal.libsignal.protocol.IdentityKey

/**
 * Une passerelle en mémoire qui tient le contrat de `services/gateway/src/services/e2ee/` : la preuve de liaison
 * vérifiée (XEdDSA), la réservation des pré-clés uniques une seule fois, l'admission Sesame (409 avec l'écart), et une
 * boîte d'enveloppes par génération d'appareil. Elle ne voit QUE ce que le fil transporte : le témoin « aucun clair »
 * relit tout ce qu'elle a reçu.
 */
class FakeE2eeServer {
    class Device(
        val userId: String,
        val deviceId: Int,
        var registrationId: Int,
        var identityKey: String,
        var signedPreKey: E2eeSignedKey,
        var kyberLastResort: E2eeSignedKey,
        val oneTime: ArrayDeque<E2eeOneTimeKey> = ArrayDeque(),
        val kyber: ArrayDeque<E2eeSignedKey> = ArrayDeque(),
        var retired: Boolean = false,
    )

    val devices = mutableListOf<Device>()
    val mailbox = mutableListOf<Pair<Device, E2eeServedEnvelope>>()
    val wireLog = mutableListOf<String>()
    private var nextMessage = 1
    private var nextEnvelope = 1

    fun active(userId: String): List<Device> = devices.filter { it.userId == userId && !it.retired }

    /** La passerelle sert un client au nom d'une session : [boundDeviceId] est l'appareil que cette session a enrôlé. */
    inner class Session(val userId: String) : E2eeDirectoryClient {
        var boundDeviceId: Int? = null

        override suspend fun enroll(request: E2eeEnrollDeviceRequest): E2eeEnrollment {
            wireLog += E2eeJson.encodeToString(E2eeEnrollDeviceRequest.serializer(), request)
            verifyBinding(request, userId)
            val existing = active(userId).firstOrNull { it.identityKey == request.identityKey && it.registrationId == request.registrationId }
            val device = existing ?: Device(
                userId, (1..16).first { slot -> active(userId).none { it.deviceId == slot } }, request.registrationId, request.identityKey,
                request.signedPreKey, request.kyberLastResort,
            ).also { devices += it }
            device.signedPreKey = request.signedPreKey
            device.kyberLastResort = request.kyberLastResort
            device.oneTime.addAll(request.oneTimePreKeys)
            device.kyber.addAll(request.kyberPreKeys)
            boundDeviceId = device.deviceId
            return E2eeEnrollment(device.deviceId, existing == null)
        }

        override suspend fun publishKeys(deviceId: Int, request: E2eePublishKeysRequest): E2eePreKeyStock {
            val device = bound()
            request.oneTimePreKeys?.let(device.oneTime::addAll)
            request.kyberPreKeys?.let(device.kyber::addAll)
            return stock(device)
        }

        override suspend fun preKeyStock(): E2eePreKeyStock = stock(bound())

        override suspend fun retireDevice(deviceId: Int, registrationId: Int): E2eeRetirement {
            val device = active(userId).first { it.deviceId == deviceId }
            if (device.registrationId != registrationId) throw E2eeRemoteException(E2eeErrorCode.DEVICE_CHANGED, 409)
            device.retired = true
            return E2eeRetirement(deviceId, true)
        }

        override suspend fun bundles(userId: String, deviceIds: List<Int>?): E2eeUserBundles =
            E2eeUserBundles(userId, active(userId).filter { deviceIds == null || it.deviceId in deviceIds }.map { device ->
                val kyber = device.kyber.removeFirstOrNull()
                E2eeDeviceBundle(
                    device.deviceId, device.registrationId, device.identityKey, device.signedPreKey,
                    kyber?.let { E2eeKyberBundleKey(it.keyId, it.publicKey, it.signature, lastResort = false) }
                        ?: E2eeKyberBundleKey(device.kyberLastResort.keyId, device.kyberLastResort.publicKey, device.kyberLastResort.signature, true),
                    device.oneTime.removeFirstOrNull(),
                )
            })

        override suspend fun devices(userId: String): E2eeUserDevices =
            E2eeUserDevices(userId, active(userId).map { E2eeDeviceListing(it.deviceId, it.registrationId) })

        override suspend fun envelopes(after: String?, limit: Int?): E2eeEnvelopePage {
            val mine = mailbox.filter { (device, _) -> device.userId == userId && device.deviceId == boundDeviceId }.map { it.second }
            return E2eeEnvelopePage(mine, nextCursor = null)
        }

        override suspend fun acknowledge(envelopeIds: List<String>): E2eeAckResult {
            val before = mailbox.size
            mailbox.removeAll { (device, envelope) -> device.userId == userId && envelope.id in envelopeIds }
            return E2eeAckResult(before - mailbox.size)
        }

        /** `POST /conversations/:id/messages` d'un envoi libsignal : l'admission Sesame, puis une enveloppe par appareil. */
        fun send(conversationId: String, peerUserId: String, request: LibsignalSendRequest): String {
            wireLog += E2eeJson.encodeToString(LibsignalSendRequest.serializer(), request)
            val sender = bound()
            val unapproved = request.unapprovedOwnDevices.orEmpty().toSet()
            val expected = (active(peerUserId) + active(userId).filter { it.deviceId != sender.deviceId && it.deviceId !in unapproved })
            val received = request.envelopes.map { Triple(it.userId, it.deviceId, it.registrationId) }.toSet()
            val missing = expected.filter { d -> received.none { it.first == d.userId && it.second == d.deviceId } }
            val extra = request.envelopes.filter { e -> expected.none { it.userId == e.userId && it.deviceId == e.deviceId } }
            val stale = request.envelopes.filter { e -> expected.any { it.userId == e.userId && it.deviceId == e.deviceId && it.registrationId != e.registrationId } }
            if (missing.isNotEmpty() || extra.isNotEmpty() || stale.isNotEmpty()) {
                throw E2eeRemoteException(
                    E2eeErrorCode.DEVICES_MISMATCH, 409,
                    E2eeDevicesMismatch(
                        missing.map { E2eeDeviceRef(it.userId, it.deviceId) },
                        extra.map { E2eeDeviceRef(it.userId, it.deviceId) },
                        stale.map { E2eeDeviceRef(it.userId, it.deviceId) },
                    ),
                )
            }
            val messageId = "m${nextMessage++}"
            request.envelopes.forEach { envelope ->
                val device = expected.first { it.userId == envelope.userId && it.deviceId == envelope.deviceId }
                mailbox += device to E2eeServedEnvelope(
                    id = "e${nextEnvelope++}", messageId = messageId, conversationId = conversationId,
                    recipientRegistrationId = envelope.registrationId, senderUserId = userId, senderDeviceId = sender.deviceId,
                    type = envelope.type, body = envelope.body, createdAt = "2026-11-02T00:00:00.000Z",
                )
            }
            return messageId
        }

        private fun bound(): Device = active(userId).firstOrNull { it.deviceId == boundDeviceId }
            ?: throw E2eeRemoteException(E2eeErrorCode.DEVICE_NOT_BOUND, 403)
    }

    private fun stock(device: Device) = E2eePreKeyStock(device.deviceId, device.oneTime.size, device.kyber.size)

    private fun verifyBinding(request: E2eeEnrollDeviceRequest, userId: String) {
        val decoder = Base64.getDecoder()
        val identity = IdentityKey(decoder.decode(request.identityKey))
        val message = E2eeDeviceBindingProof.message(userId, request.registrationId, request.identityKey, request.binding.timestamp)
        check(identity.publicKey.verifySignature(message.toByteArray(), decoder.decode(request.binding.signature))) { "binding signature" }
        listOf(request.signedPreKey, request.kyberLastResort).plus(request.kyberPreKeys).forEach {
            check(identity.publicKey.verifySignature(decoder.decode(it.publicKey), decoder.decode(it.signature))) { "prekey signature" }
        }
    }
}
