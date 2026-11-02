package me.meeshy.core.crypto.keys

import me.meeshy.core.crypto.primitives.CanonicalBase64
import me.meeshy.sdk.model.signal.SignalPreKeyBundle

/**
 * Compose le bundle PUBLIC de cet appareil, octet pour octet celui d'iOS (`generatePublicBundle`) :
 * identityKey et signedPreKeyPublic en 32 octets bruts base64, signature Ed25519 de la signed prekey
 * publique par la clé de signature dédiée, deviceId 1, Kyber absent. Aucune clé privée n'en sort.
 */
public class PreKeyBundleFactory(private val keys: E2eeKeyStore) {

    public fun create(): SignalPreKeyBundle {
        val identity = keys.getOrGenerateIdentityKey()
        val signedPreKey = keys.getOrGenerateSignedPreKey()
        val oneTimePreKey = keys.getOrGenerateOneTimePreKey()
        val signature = keys.getOrGenerateSigningKey().sign(signedPreKey.publicKey)
        return SignalPreKeyBundle(
            identityKey = CanonicalBase64.encode(identity.publicKey),
            registrationId = keys.registrationId(),
            deviceId = DEVICE_ID,
            preKeyId = keys.preKeyId(),
            preKeyPublic = CanonicalBase64.encode(oneTimePreKey.publicKey),
            signedPreKeyId = keys.signedPreKeyId(),
            signedPreKeyPublic = CanonicalBase64.encode(signedPreKey.publicKey),
            signedPreKeySignature = CanonicalBase64.encode(signature),
        )
    }

    /** Clé publique de vérification des signatures de ce bundle. */
    public fun signingPublicKey(): ByteArray = keys.getOrGenerateSigningKey().publicKey

    public companion object {
        public const val DEVICE_ID: Int = 1
    }
}
