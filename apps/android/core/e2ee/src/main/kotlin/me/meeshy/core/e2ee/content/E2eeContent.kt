package me.meeshy.core.e2ee.content

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json

/**
 * Ce que libsignal chiffre (spec § 4.2) : pas le texte nu, une structure versionnée. Miroir à l'octet près de
 * `E2EEContent` (`packages/MeeshySDK/Sources/MeeshyE2EE/E2EEContent.swift`) : mêmes clés, même JSON canonique (clés
 * triées, aucun champ absent écrit). Ce qui part À CÔTÉ du corps et dit quelque chose du contenu (langue détectée,
 * message cité) voyage DEDANS, jamais en champ libre du message (#12526).
 *
 * Les propriétés sont déclarées dans l'ordre alphabétique de leurs clés : c'est l'ordre dans lequel
 * `kotlinx.serialization` les écrit, donc le `sortedKeys` de l'encodeur Swift.
 */
@Serializable
public data class E2eeContent(
    /** L'appareil auteur, posé par le scelleur (#12976). Absent chez un client plus ancien. */
    val authorDeviceId: Int? = null,
    val authorUserId: String? = null,
    /** L'identifiant client du message, DANS le chiffré : libsignal ne lie pas le chiffré au message que le serveur lui associe. */
    val clientMessageId: String? = null,
    /** La conversation, DANS le chiffré : un serveur compromis ne range pas un message dans une autre conversation. */
    val conversationId: String? = null,
    val language: String? = null,
    val replyTo: String? = null,
    /** L'instant de composition, en millisecondes depuis 1970. */
    val sentAt: Long,
    val text: String? = null,
    /** Requise à la lecture, comme chez iOS : un objet sans `v` n'est pas un contenu. */
    @SerialName("v") val version: Int,
) {
    /** Le même contenu, signé de son auteur avant d'être chiffré. */
    public fun authoredBy(userId: String, deviceId: Int): E2eeContent = copy(authorUserId = userId, authorDeviceId = deviceId)

    /** L'auteur porté dans le chiffré est-il l'expéditeur annoncé ? Un contenu sans auteur (client plus ancien) n'en dit rien. */
    public fun isAuthoredBy(userId: String, deviceId: Int): Boolean {
        if (authorUserId == null || authorDeviceId == null) return authorUserId == null && authorDeviceId == null
        return authorUserId == userId && authorDeviceId == deviceId
    }

    /** Un contenu qui ne nomme pas sa conversation ne se range nulle part. */
    public fun belongsTo(conversationId: String): Boolean = this.conversationId == conversationId

    /** JSON canonique, UTF-8. */
    public fun encoded(): ByteArray = canonicalJson.encodeToString(serializer(), this).toByteArray(Charsets.UTF_8)

    public companion object {
        public const val CURRENT_VERSION: Int = 1

        /** Un contenu de la version courante, à sceller. */
        public fun compose(
            text: String?,
            language: String?,
            replyTo: String?,
            conversationId: String?,
            clientMessageId: String?,
            sentAtMillis: Long,
        ): E2eeContent = E2eeContent(
            clientMessageId = clientMessageId,
            conversationId = conversationId,
            language = language,
            replyTo = replyTo,
            sentAt = sentAtMillis,
            text = text,
            version = CURRENT_VERSION,
        )

        /** Refuse une version que cet appareil ne sait pas lire : un message d'une version future ne s'affiche jamais à moitié. */
        public fun decoded(bytes: ByteArray): E2eeContent {
            val content = try {
                lenientJson.decodeFromString(serializer(), bytes.toString(Charsets.UTF_8))
            } catch (error: SerializationException) {
                throw E2eeContentException.Malformed(error)
            } catch (error: IllegalArgumentException) {
                throw E2eeContentException.Malformed(error)
            }
            if (content.version != CURRENT_VERSION) throw E2eeContentException.UnsupportedVersion(content.version)
            return content
        }
    }
}

/** Les refus d'un contenu déchiffré : ils JUGENT l'enveloppe (verdict), jamais « pas maintenant ». */
public sealed class E2eeContentException(message: String, cause: Throwable? = null) : Exception(message, cause) {
    public class UnsupportedVersion(public val version: Int) : E2eeContentException("unsupported content version $version")
    public class Malformed(cause: Throwable) : E2eeContentException("malformed content", cause)

    /** Le serveur présente ce chiffré dans une autre conversation que la sienne. */
    public class Misattributed : E2eeContentException("content belongs to another conversation")

    /** Le serveur présente ce chiffré sous un autre expéditeur que son auteur. */
    public class MisattributedAuthor : E2eeContentException("content authored by another device")
}

/** L'encodeur canonique : aucun champ nul écrit, aucune valeur par défaut omise (`v` s'écrit toujours). */
internal val canonicalJson: Json = Json {
    explicitNulls = false
    encodeDefaults = true
}

/** Le décodeur tolérant : un champ d'un lot ultérieur (mentions, pièces, lieu) est ignoré, pas refusé. */
internal val lenientJson: Json = Json {
    ignoreUnknownKeys = true
    explicitNulls = false
}
