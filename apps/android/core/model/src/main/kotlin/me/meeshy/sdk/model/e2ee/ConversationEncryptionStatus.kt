package me.meeshy.sdk.model.e2ee

import java.time.Instant
import java.time.format.DateTimeParseException
import java.util.Locale
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import me.meeshy.sdk.model.EndToEndRegime

/**
 * Le régime de chiffrement d'une conversation, tel que l'utilisateur le lit (#12880). Même lecture
 * que `DeviceTranslationEligibility.serverReadsMessage` : seuls l'absence de mode, `server` et
 * `hybrid` laissent le serveur lire ; un mode INCONNU se lit comme le bout en bout (le sens sûr :
 * on ne promet jamais au serveur une lecture que la passerelle n'a pas dite).
 */
enum class ConversationEncryptionRegime {
    NONE,
    SERVER,
    HYBRID,
    END_TO_END,
    ;

    val serverReads: Boolean get() = this != END_TO_END

    companion object {
        fun of(mode: String?): ConversationEncryptionRegime = when (mode?.trim()?.lowercase(Locale.ROOT).orEmpty()) {
            "" -> NONE
            "server" -> SERVER
            "hybrid" -> HYBRID
            else -> END_TO_END
        }
    }
}

/**
 * `GET /conversations/:id/encryption-status` (`encryptionStatusView`, #12522). Aucune clé, aucun
 * contenu : un régime, sa date et ce que l'appelant a le droit d'y faire.
 */
data class ConversationEncryptionStatus(
    val isEncrypted: Boolean,
    val mode: String?,
    val enabledAt: Instant?,
    val canTranslate: Boolean,
    /** `null` : passerelle antérieure qui ne sert pas le droit. Jamais lu comme un « oui ». */
    val canToggleEncryption: Boolean?,
    /** Le tête-à-tête chiffré de bout en bout de la même paire, quand celui-ci est le lisible (#12966). */
    val pairEndToEndConversationId: String?,
) {
    val isEndToEnd: Boolean get() = EndToEndRegime.isEndToEnd(mode)
}

/**
 * Décodage STRICT : un drapeau de sécurité coercé (`"true"` lu `true`) serait une garantie inventée.
 * Un champ requis absent ou du mauvais type rend `null` — la réponse est malformée, jamais crue à moitié.
 */
object ConversationEncryptionStatusDecoder {
    fun decode(data: JsonObject): ConversationEncryptionStatus? {
        val isEncrypted = data.flag("isEncrypted") ?: return null
        val canTranslate = data.flag("canTranslate") ?: return null
        val mode = data.nullableText("mode") ?: return null
        val enabledAtField = data.nullableText("enabledAt") ?: return null
        val enabledAt = enabledAtField.value?.let { instantOf(it) ?: return null }
        val canToggle = data.nullableFlag("canToggleEncryption") ?: return null
        val pair = data.nullableText("pairEndToEndConversationId") ?: return null
        return ConversationEncryptionStatus(
            isEncrypted = isEncrypted,
            mode = mode.value,
            enabledAt = enabledAt,
            canTranslate = canTranslate,
            canToggleEncryption = canToggle.value,
            pairEndToEndConversationId = pair.value,
        )
    }

    private class Maybe<T>(val value: T?)

    private fun instantOf(text: String): Instant? = try {
        Instant.parse(text)
    } catch (_: DateTimeParseException) {
        null
    }

    private fun JsonObject.flag(key: String): Boolean? =
        (this[key] as? JsonPrimitive)?.takeIf { !it.isString }?.booleanOrNull

    private fun JsonObject.nullableFlag(key: String): Maybe<Boolean>? = when (val element = this[key]) {
        null, JsonNull -> Maybe(null)
        is JsonPrimitive -> element.takeIf { !it.isString }?.booleanOrNull?.let { Maybe(it) }
        else -> null
    }

    private fun JsonObject.nullableText(key: String): Maybe<String>? = when (val element = this[key]) {
        null, JsonNull -> Maybe(null)
        is JsonPrimitive -> element.takeIf { it.isString }?.content?.let { Maybe(it) }
        else -> null
    }
}
