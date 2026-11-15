package me.meeshy.sdk.model.account

import java.security.MessageDigest

/**
 * Le compte à qui appartient tout ce que l'appareil garde en local — cache, base
 * des messages, file d'envoi (#8656, #8657, #8674).
 *
 * Un compte se dit « utilisateur + environnement API » : le même identifiant existe
 * en production ET en staging, et deux jeux de données qui partagent un fichier
 * laisseraient le compte suivant lire, le temps d'une purge asynchrone, les lignes
 * du compte quitté (contenu protégé compris).
 *
 * Le nom de tout fichier du compte est son [fingerprint], jamais l'identifiant en
 * clair : l'identité d'un compte n'a rien à faire dans un nom de fichier, un chemin
 * de sauvegarde ou un journal. [toString] n'imprime donc que l'empreinte.
 *
 * Miroir Kotlin de iOS `MessageStoreAccountKey`
 * (`packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessageStoreAccountKey.swift`) ;
 * la formule d'empreinte est identique octet pour octet.
 */
class AccountStorageKey private constructor(
    /** L'identifiant de l'utilisateur, nettoyé de ses blancs, jamais vide. */
    val userId: String,
    /** L'hôte de l'API (`gate.meeshy.me`, `localhost:3000`), en minuscules, sans schéma ni chemin. */
    val environmentHost: String,
) {

    /**
     * L'empreinte du compte : `SHA-256("<hôte>|<utilisateur>")`, seize premiers octets
     * en hexadécimal minuscule — 32 caractères `[0-9a-f]`, sûrs dans un nom de fichier.
     */
    val fingerprint: String = fingerprintOf(userId = userId, environmentHost = environmentHost)

    /** Le nom d'un fichier de ce compte : `<prefix><empreinte><suffix>`. */
    fun fileName(prefix: String, suffix: String): String = prefix + fingerprint + suffix

    override fun equals(other: Any?): Boolean =
        other is AccountStorageKey && other.userId == userId && other.environmentHost == environmentHost

    override fun hashCode(): Int = 31 * userId.hashCode() + environmentHost.hashCode()

    override fun toString(): String = "AccountStorageKey($fingerprint)"

    companion object {

        /**
         * Le compte de [userId] sur le serveur [serverOrigin] ; `null` quand personne
         * n'est connecté (identifiant absent ou blanc). Une origine absente donne un
         * hôte vide : le compte existe, rattaché à aucun environnement nommé.
         */
        fun of(userId: String?, serverOrigin: String?): AccountStorageKey? {
            val trimmed = userId?.trim().orEmpty()
            if (trimmed.isEmpty()) return null
            return AccountStorageKey(userId = trimmed, environmentHost = normalizedHost(serverOrigin.orEmpty()))
        }

        /**
         * Le compte tel qu'il a été gravé, hôte déjà normalisé — relu depuis le
         * marqueur du propriétaire du cache. `null` quand l'identifiant est vide.
         */
        fun ofNormalized(userId: String, environmentHost: String): AccountStorageKey? {
            val trimmed = userId.trim()
            if (trimmed.isEmpty()) return null
            return AccountStorageKey(userId = trimmed, environmentHost = environmentHost)
        }

        private val SCHEME_PREFIX = Regex("^(?:[a-z][a-z0-9+.-]*:)?//")

        /**
         * Ramène une origine à `hôte[:port]` : schéma, identifiants et chemin sont
         * abandonnés, la casse est écrasée. Une saisie sans schéma (`localhost:3000`)
         * est gardée telle quelle, sans ses barres de bordure.
         */
        internal fun normalizedHost(origin: String): String {
            val trimmed = origin.trim().lowercase()
            return authorityOf(trimmed) ?: trimmed.trim('/')
        }

        private fun authorityOf(url: String): String? {
            if (url.any { it.isWhitespace() }) return null
            val prefix = SCHEME_PREFIX.find(url) ?: return null
            val authority = url.substring(prefix.range.last + 1).takeWhile { it != '/' && it != '?' && it != '#' }
            val hostAndPort = authority.substringAfterLast('@').removeSuffix(":")
            return hostAndPort.takeIf { it.isNotEmpty() }
        }

        private fun fingerprintOf(userId: String, environmentHost: String): String {
            val digest = MessageDigest.getInstance("SHA-256")
                .digest("$environmentHost|$userId".toByteArray(Charsets.UTF_8))
            return digest.take(FINGERPRINT_BYTES).joinToString("") { "%02x".format(it.toInt() and 0xff) }
        }

        private const val FINGERPRINT_BYTES = 16
    }
}
