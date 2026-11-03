package me.meeshy.core.crypto.session

/** Un contenu scellé et la version de dérivation qui l'a produit (`encryptionMetadata`). */
public class EncryptedDirectPayload(public val ciphertext: ByteArray, public val derivationVersion: Int)

/**
 * Chiffre le contenu d'un message direct pour son destinataire — couture d'injection du compositeur (parité
 * `DirectMessageEncrypting` iOS). Un échec lève [E2eeSessionException] : l'appelant REFUSE l'envoi, il ne
 * l'envoie jamais en clair (fail-closed, directive 2026-10-03).
 */
public interface DirectMessageEncrypting {
    public suspend fun encryptMessage(payload: ByteArray, userId: String, conversationId: String): EncryptedDirectPayload
}
