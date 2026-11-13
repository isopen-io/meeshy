package me.meeshy.core.e2ee.content

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.jsonObject

/**
 * Ce qu'un clair déchiffré porte (#13142) : un message (`v`) ou un SIGNAL (`s`, réaction, frappe, accusé…). Miroir de
 * `E2EEPayloadKind` (`E2EESignal.swift`). Un clair illisible se classe message : `E2eeContent.decoded` le refusera.
 */
public enum class E2eePayloadKind {
    MESSAGE,
    SIGNAL,
    ;

    public companion object {
        public fun of(plaintext: ByteArray): E2eePayloadKind {
            val root = runCatching { lenientJson.parseToJsonElement(plaintext.toString(Charsets.UTF_8)).jsonObject }.getOrNull()
            return if (root.hasSignalVersion()) SIGNAL else MESSAGE
        }

        private fun JsonObject?.hasSignalVersion(): Boolean = this != null && this["s"].let { it != null && it != JsonNull }
    }
}

/**
 * Le remplissage du clair AVANT libsignal (#13142), commun aux messages et aux signaux : la passerelle ne distingue pas
 * une réaction d'un message court par la taille de son enveloppe. Miroir exact de `E2EEPadding` (`E2EESignal.swift`) et
 * de `E2EE_PADDING_TIERS` de `@meeshy/shared` : des ESPACES après l'objet JSON, qui reste un JSON valide.
 */
public object E2eePadding {
    public val TIERS: List<Int> = listOf(256, 1024, 4096, 16384)
    public const val STEP: Int = 16384
    public const val MAX_ENVELOPE_BYTES: Int = 64 * 1024
    public const val MAX_TOTAL_BYTES: Int = 512 * 1024

    /** Ce que libsignal ajoute au clair, majoré (mesuré sur libsignal 0.106.2 : 1 753 à 1 761 octets pour un premier message, clairs de 0 à 4 096 octets). */
    public const val CIPHER_OVERHEAD: Int = 2048

    private const val SPACE: Byte = 0x20

    /** Le plus grand clair que [recipients] enveloppes portent sous les deux plafonds. */
    public fun ceiling(recipients: Int): Int = minOf(MAX_ENVELOPE_BYTES, MAX_TOTAL_BYTES / maxOf(recipients, 1)) - CIPHER_OVERHEAD

    /** La taille d'un clair une fois rempli : le premier palier qui le contient, borné par [ceiling]. */
    public fun paddedLength(length: Int, recipients: Int = 1): Int {
        val ceiling = ceiling(recipients)
        if (length > ceiling) return length
        val bucket = TIERS.firstOrNull { it >= length } ?: (((length + STEP - 1) / STEP) * STEP)
        return minOf(bucket, ceiling)
    }

    public fun padded(plaintext: ByteArray, recipients: Int = 1): ByteArray {
        val target = paddedLength(plaintext.size, recipients)
        if (target <= plaintext.size) return plaintext
        return plaintext + ByteArray(target - plaintext.size) { SPACE }
    }
}
