package me.meeshy.core.e2ee.wire

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import me.meeshy.core.e2ee.E2eeWire

// Le contrat FIL du relais d'enveloppes libsignal (spec § 3.4 et § 4.3), miroir de `E2EERelayModels.swift`. Aucun type
// ne porte de clé ni de clair : des identifiants d'appareil et des chiffrés opaques.

/** Un appareil désigné par la passerelle (Sesame). */
@Serializable
public data class E2eeDeviceRef(val userId: String, val deviceId: Int)

/** L'écart d'un 409 `E2EE_DEVICES_MISMATCH` (Sesame § 3) : manquants, en trop, ou dont la génération a changé. */
@Serializable
public data class E2eeDevicesMismatch(
    val missing: List<E2eeDeviceRef> = emptyList(),
    val extra: List<E2eeDeviceRef> = emptyList(),
    val stale: List<E2eeDeviceRef> = emptyList(),
)

/** Une enveloppe émise : le chiffré libsignal d'UN appareil destinataire. */
@Serializable
public data class E2eeOutgoingEnvelope(
    val userId: String,
    val deviceId: Int,
    val registrationId: Int,
    /** 3 = `PreKeySignalMessage`, 2 = `SignalMessage`. */
    val type: Int,
    /** Le chiffré, en base64. */
    val body: String,
)

/** `encryptionMetadata` d'un envoi libsignal : le protocole, l'appareil émetteur et l'époque du régime (#12522). */
@Serializable
public data class E2eeWireMetadata(
    @SerialName("protocol") val protocolName: String = E2eeWire.LIBSIGNAL_PROTOCOL,
    val senderDeviceId: Int,
    val regimeEpoch: Int? = null,
)

/**
 * Une enveloppe servie à SON appareil. [recipientRegistrationId] dit pour quelle génération de la place elle a été
 * chiffrée (#12592) : une enveloppe qui n'est pas pour la mienne ne s'ouvre pas, elle s'écarte.
 */
@Serializable
public data class E2eeServedEnvelope(
    val id: String,
    val messageId: String,
    val conversationId: String,
    val recipientRegistrationId: Int? = null,
    val senderUserId: String,
    val senderDeviceId: Int,
    val type: Int,
    val body: String,
    val createdAt: String,
) {
    public fun isAddressedTo(registrationId: Int): Boolean = recipientRegistrationId?.let { it == registrationId } ?: true
}

/**
 * Le corps REST d'un envoi libsignal (`POST /conversations/:id/messages`, spec § 4.3), à la clé près celui de
 * `SendMessageRequest.libsignal` + `OutgoingMessage.libsignalWireRequest` (iOS) : AUCUN `content`, aucune langue, aucune
 * pièce, aucun lieu — le texte ne voyage QUE dans les enveloppes. Les métadonnées que le serveur applique sans lire le
 * contenu (réponse à, éphémère, vue unique, flou, effets) restent sur le fil.
 */
@Serializable
public data class LibsignalSendRequest(
    val clientMessageId: String,
    val replyToId: String? = null,
    val storyReplyToId: String? = null,
    val ephemeralDuration: Int? = null,
    val isViewOnce: Boolean? = null,
    val maxViewOnceCount: Int? = null,
    val isBlurred: Boolean? = null,
    val effectFlags: Long? = null,
    val isEncrypted: Boolean = true,
    val encryptionMode: String = E2eeWire.MODE,
    val encryptionProtocol: String = E2eeWire.LIBSIGNAL_PROTOCOL,
    val encryptedContent: String = E2eeWire.ENCRYPTED_CONTENT_MARKER,
    val encryptionMetadata: E2eeWireMetadata,
    val envelopes: List<E2eeOutgoingEnvelope>,
    val unapprovedOwnDevices: List<Int>? = null,
) {
    public companion object {
        public fun of(
            clientMessageId: String,
            sealed: E2eeSealedMessage,
            replyToId: String? = null,
            regimeEpoch: Int? = null,
        ): LibsignalSendRequest = LibsignalSendRequest(
            clientMessageId = clientMessageId,
            replyToId = replyToId,
            encryptionMetadata = E2eeWireMetadata(senderDeviceId = sealed.senderDeviceId, regimeEpoch = regimeEpoch),
            envelopes = sealed.envelopes,
            unapprovedOwnDevices = sealed.unapprovedOwnDevices.takeIf { it.isNotEmpty() },
        )
    }
}

/** Ce qu'un envoi libsignal porte : une enveloppe par appareil destinataire, l'appareil émetteur, mes appareils non approuvés. */
public data class E2eeSealedMessage(
    val senderDeviceId: Int,
    val envelopes: List<E2eeOutgoingEnvelope>,
    val unapprovedOwnDevices: List<Int>,
)
