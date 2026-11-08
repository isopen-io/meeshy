package me.meeshy.core.e2ee.wire

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

// Le contrat des routes `/api/v1/e2ee/*` (#3706), miroir de `packages/shared/types/e2ee-directory.ts` et de
// `E2EEDirectoryModels.swift`. Tout ce qui voyage ici est PUBLIC (clés publiques, signatures XEdDSA) ou OPAQUE
// (enveloppes libsignal) : aucun type de ce fichier ne porte de clé privée, et la passerelle refuse une requête
// entière dont un champ porte un nom de clé privée (`containsPrivateKeyField`).

@Serializable
public data class E2eeSignedKey(val keyId: Int, val publicKey: String, val signature: String)

@Serializable
public data class E2eeOneTimeKey(val keyId: Int, val publicKey: String)

/** La preuve que l'appareil détient la clé privée de l'identité qu'il enrôle, pour CE compte, à cet instant. */
@Serializable
public data class E2eeDeviceBindingProof(val timestamp: Long, val signature: String) {
    public companion object {
        /** Le message signé, à l'octet près celui que la passerelle reconstruit (`deviceBindingMessage`). */
        public fun message(userId: String, registrationId: Int, identityKey: String, timestamp: Long): String =
            "meeshy-e2ee-device-binding:v1:$userId:$registrationId:$identityKey:$timestamp"
    }
}

@Serializable
public enum class E2eePlatform {
    @SerialName("ios") IOS,
    @SerialName("macos") MACOS,
    @SerialName("android") ANDROID,
    @SerialName("web") WEB,
}

@Serializable
public data class E2eeEnrollDeviceRequest(
    val registrationId: Int,
    val identityKey: String,
    val signedPreKey: E2eeSignedKey,
    val kyberLastResort: E2eeSignedKey,
    val platform: E2eePlatform,
    val label: String? = null,
    val binding: E2eeDeviceBindingProof,
    val oneTimePreKeys: List<E2eeOneTimeKey>,
    val kyberPreKeys: List<E2eeSignedKey>,
)

@Serializable
public data class E2eePublishKeysRequest(
    val signedPreKey: E2eeSignedKey? = null,
    val kyberLastResort: E2eeSignedKey? = null,
    val oneTimePreKeys: List<E2eeOneTimeKey>? = null,
    val kyberPreKeys: List<E2eeSignedKey>? = null,
)

@Serializable
public data class E2eeEnrollment(val deviceId: Int, val created: Boolean = false)

@Serializable
public data class E2eePreKeyStock(val deviceId: Int, val oneTimePreKeys: Int, val kyberPreKeys: Int)

@Serializable
public data class E2eeKyberBundleKey(val keyId: Int, val publicKey: String, val signature: String, val lastResort: Boolean = false)

/** Le bundle d'UN appareil : PQXDH § 2.4, une pré-clé unique EC au plus, une Kyber toujours. */
@Serializable
public data class E2eeDeviceBundle(
    val deviceId: Int,
    val registrationId: Int,
    val identityKey: String,
    val signedPreKey: E2eeSignedKey,
    val kyberPreKey: E2eeKyberBundleKey,
    val preKey: E2eeOneTimeKey? = null,
)

@Serializable
public data class E2eeUserBundles(val userId: String, val devices: List<E2eeDeviceBundle>)

@Serializable
public data class E2eeDeviceListing(val deviceId: Int, val registrationId: Int)

@Serializable
public data class E2eeUserDevices(val userId: String, val devices: List<E2eeDeviceListing>)

@Serializable
public data class E2eeEnvelopePage(val envelopes: List<E2eeServedEnvelope>, val nextCursor: String? = null)

@Serializable
public data class E2eeAckResult(val deleted: Int)

@Serializable
public data class E2eeRetirement(val deviceId: Int, val retired: Boolean)

@Serializable
public data class E2eeAckRequest(val ids: List<String>)
