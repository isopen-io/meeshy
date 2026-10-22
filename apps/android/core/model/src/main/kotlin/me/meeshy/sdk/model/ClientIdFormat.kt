package me.meeshy.sdk.model

import java.security.MessageDigest
import java.util.UUID

/**
 * Les identifiants d'idempotence du client, au format EXACT de la passerelle.
 *
 * - `cid_<uuid v4 minuscule>` — le `clientMessageId` d'une bulle optimiste. Miroir de
 *   `CLIENT_MESSAGE_ID_REGEX` (`packages/shared/utils/client-message-id.ts`) et de
 *   `ClientMessageId.swift`. La passerelle déduplique `(conversationId, clientMessageId)`.
 * - `cmid_<uuid minuscule>` — le `clientMutationId` d'une mutation qui n'est pas un message
 *   (`X-Client-Mutation-Id`). Miroir de `services/gateway/src/middleware/clientMutationId.ts` et
 *   de `ClientMutationId.swift`. La passerelle rejoue le résultat enregistré dans `MutationLog`
 *   au lieu de réappliquer la mutation.
 *
 * Les deux formats sont refusés dès qu'une lettre est en capitale : `UUID.randomUUID().toString()`
 * est minuscule, un `uuidString` Swift ne l'est pas.
 *
 * Les regex sont évaluées en correspondance TOTALE (`matches`) : un `$` Java accepterait un saut
 * de ligne final que le `$` d'une regex JavaScript refuse.
 */
public object ClientIdFormat {

    public const val CID_PREFIX: String = "cid_"
    public const val CMID_PREFIX: String = "cmid_"

    public const val CID_PATTERN: String =
        "^cid_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"

    public const val CMID_PATTERN: String =
        "^cmid_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"

    private val cidRegex = Regex(CID_PATTERN)
    private val cmidRegex = Regex(CMID_PATTERN)

    /** Un `cid_<uuid v4>` neuf (40 caractères). */
    public fun newCid(): String = CID_PREFIX + UUID.randomUUID().toString().lowercase()

    /** Un `cmid_<uuid v4>` neuf (41 caractères). */
    public fun newCmid(): String = CMID_PREFIX + UUID.randomUUID().toString().lowercase()

    public fun isValidCid(value: String?): Boolean = value != null && cidRegex.matches(value)

    public fun isValidCmid(value: String?): Boolean = value != null && cmidRegex.matches(value)

    /**
     * **Une clé d'idempotence STABLE pour un même contenu** (miroir de
     * `ClientMutationId.derived(from:)`, #10321).
     *
     * [newCmid] tire une clé neuve à chaque appel : parfait pour une ligne d'outbox, qui la grave
     * une fois. Une story, elle, se rejoue depuis sa file sans clé gravée — une app tuée entre le
     * succès serveur et l'écriture disque la republierait. Dériver la clé d'une graine stable
     * (l'item de file et la slide) rend la même clé à chaque rejeu : le `MutationLog` de la
     * passerelle reconnaît la seconde requête et rend la publication déjà écrite, jamais un
     * doublon.
     *
     * La forme respecte [CMID_PATTERN] : 16 octets d'un SHA-256 de la graine en UTF-8, bits de
     * version (4) et de variante (10xx) posés comme ceux d'un UUID v4.
     */
    public fun derivedCmid(seed: String): String {
        val bytes = MessageDigest.getInstance("SHA-256").digest(seed.toByteArray(Charsets.UTF_8)).copyOf(UUID_BYTES)
        bytes[VERSION_BYTE] = ((bytes[VERSION_BYTE].toInt() and 0x0F) or 0x40).toByte()
        bytes[VARIANT_BYTE] = ((bytes[VARIANT_BYTE].toInt() and 0x3F) or 0x80).toByte()
        return CMID_PREFIX + bytes.toUuidString()
    }

    /** La clé d'une slide de story publiée depuis sa file : un item, une slide, une clé. */
    public fun storySlideCmid(queueItemId: String, slideId: String): String =
        derivedCmid("story-slide|$queueItemId|$slideId")

    private fun ByteArray.toUuidString(): String {
        val hex = joinToString(separator = "") { "%02x".format(it.toInt() and 0xFF) }
        return "${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-" +
            "${hex.substring(16, 20)}-${hex.substring(20, 32)}"
    }

    private const val UUID_BYTES = 16
    private const val VERSION_BYTE = 6
    private const val VARIANT_BYTE = 8
}
