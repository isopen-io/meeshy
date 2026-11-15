package me.meeshy.sdk.model.translation

import java.time.Instant
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject

/*
 * La traduction qu'un membre PARTAGE aux autres (#9899) : l'appareil traduit vers
 * SA langue, scelle le résultat, et la passerelle garde et relaie l'enveloppe sans
 * l'ouvrir. Miroirs : packages/shared/types/shared-translation.ts (le contrat, qui
 * fait foi) et SharedTranslationModels.swift.
 */

@Serializable
public enum class SharedTranslationKdf(public val wire: String) {
    @SerialName("message-content") MESSAGE_CONTENT("message-content"),
    @SerialName("message-secret") MESSAGE_SECRET("message-secret"),
}

public object SharedTranslationWire {
    public const val PROTOCOL_IDENTIFIER: String = "meeshy-shared-translation/v1"
    public const val ALGORITHM: String = "A256GCM"
    public const val VERSION: Int = 1
}

public object SharedTranslationLimits {
    public const val PAYLOAD_MIN_LENGTH: Int = 40
    public const val PAYLOAD_MAX_LENGTH: Int = 40_960
    public const val TEXT_MAX_LENGTH: Int = 10_000
    public const val ENGINE_MAX_LENGTH: Int = 64
    public const val MESSAGE_IDS_MAX_COUNT: Int = 100
    public const val LANGUAGES_MAX_COUNT: Int = 8
    public const val SECRET_LENGTH: Int = 32
    public const val NONCE_LENGTH: Int = 12
    public const val TAG_LENGTH: Int = 16
}

public object SharedTranslationFormat {
    /** `^[0-9a-fA-F]{24}$` */
    public fun isObjectId(value: String): Boolean =
        value.length == 24 && value.all { it in '0'..'9' || it in 'a'..'f' || it in 'A'..'F' }

    /** `^[A-Za-z]{2,3}(?:[-_][A-Za-z0-9]{2,8})?$` */
    public fun isLanguageCode(value: String): Boolean {
        val separator = value.indexOfFirst { it == '-' || it == '_' }
        if (separator < 0) return value.length in 2..3 && value.all(::isAsciiLetter)
        val primary = value.substring(0, separator)
        val subtag = value.substring(separator + 1)
        return primary.length in 2..3 && primary.all(::isAsciiLetter) &&
            subtag.length in 2..8 && subtag.all { isAsciiLetter(it) || it in '0'..'9' }
    }

    /** Aucune moitié de paire de substitution seule : deux appareils ne liraient pas les mêmes octets. */
    public fun isWellFormedText(text: String): Boolean {
        var index = 0
        while (index < text.length) {
            val char = text[index]
            when {
                char.isHighSurrogate() -> {
                    if (index + 1 >= text.length || !text[index + 1].isLowSurrogate()) return false
                    index += 2
                }
                char.isLowSurrogate() -> return false
                else -> index += 1
            }
        }
        return true
    }

    /** base64 CANONIQUE : remplissage présent, bits de remplissage nuls, aucun blanc. */
    public fun isCanonicalBase64(payload: String): Boolean {
        if (payload.length % 4 != 0) return false
        val body = payload.trimEnd('=')
        val padding = payload.length - body.length
        if (padding > 2 || !body.all { isAsciiLetter(it) || it in '0'..'9' || it == '+' || it == '/' }) return false
        if (padding == 0) return true
        val last = body.last()
        return if (padding == 2) last in "AQgw" else last in "AEIMQUYcgkosw048"
    }

    private fun isAsciiLetter(char: Char): Boolean = char in 'a'..'z' || char in 'A'..'Z'
}

/** Ce que la passerelle garde et relaie : ni texte, ni langue source, ni moteur en clair. */
@Serializable
public data class SharedTranslationEnvelope(
    val v: Int,
    val alg: String,
    val kdf: SharedTranslationKdf,
    val payload: String,
) {
    public companion object {
        public fun of(kdf: SharedTranslationKdf, payload: String): SharedTranslationEnvelope =
            SharedTranslationEnvelope(SharedTranslationWire.VERSION, SharedTranslationWire.ALGORITHM, kdf, payload)

        /** Décodage tolérant : champs inconnus ignorés, enveloppe malformée = null, jamais d'exception. */
        public fun decodeOrNull(element: JsonElement?): SharedTranslationEnvelope? =
            element?.let { runCatching { SharedTranslationJson.decodeFromJsonElement(serializer(), it) }.getOrNull() }
    }
}

/** Ce que l'enveloppe contient ; le serveur ne l'ouvre pas. */
public data class SharedTranslationInner(
    val text: String,
    val sourceLanguage: String,
    val engine: String,
    val v: Int = SharedTranslationWire.VERSION,
) {
    /** `sharedTranslationInnerSchema` : ce qu'un appareil accepte de sceller comme d'ouvrir. */
    val isSealable: Boolean
        get() = v == SharedTranslationWire.VERSION &&
            text.isNotEmpty() && text.length <= SharedTranslationLimits.TEXT_MAX_LENGTH &&
            SharedTranslationFormat.isWellFormedText(text) &&
            SharedTranslationFormat.isLanguageCode(sourceLanguage) &&
            engine.isNotEmpty() && engine.length <= SharedTranslationLimits.ENGINE_MAX_LENGTH &&
            SharedTranslationFormat.isWellFormedText(engine)
}

@Serializable
public data class SharedTranslation(
    val id: String,
    val conversationId: String,
    val messageId: String,
    val targetLanguage: String,
    val envelope: SharedTranslationEnvelope,
    val sharedBy: String,
    val sharedAt: String,
)

/** Corps de `POST /conversations/:conversationId/shared-translations`. */
@Serializable
public data class ShareTranslationBody(
    val messageId: String,
    val targetLanguage: String,
    val sourceVersion: String,
    val envelope: SharedTranslationEnvelope,
)

@Serializable
public data class ShareTranslationResult(
    val sharedTranslation: SharedTranslation,
    val created: Boolean,
)

/** La liste se lit élément par élément : un élément illisible est écarté, jamais les autres. */
public data class SharedTranslationsResult(val sharedTranslations: List<SharedTranslation>) {
    public companion object {
        public fun decodeOrEmpty(element: JsonElement?): SharedTranslationsResult {
            val list = ((element as? JsonObject)?.get("sharedTranslations") as? JsonArray).orEmpty()
            return SharedTranslationsResult(
                list.mapNotNull {
                    runCatching { SharedTranslationJson.decodeFromJsonElement(SharedTranslation.serializer(), it) }.getOrNull()
                },
            )
        }
    }
}

public enum class SharedTranslationShareRefusal(public val code: String) {
    READ_RECEIPTS_OFF("SHARED_TRANSLATION_READ_RECEIPTS_OFF"),
    STALE_SOURCE("SHARED_TRANSLATION_STALE_SOURCE"),
    ;

    public companion object {
        public fun fromCode(code: String?): SharedTranslationShareRefusal? = entries.firstOrNull { it.code == code }
    }
}

/** `original`, ou l'instant de la dernière modification écrit comme `toISOString` (UTC, millisecondes). */
public object SharedTranslationSourceVersion {
    public const val ORIGINAL: String = "original"
    private val format = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'").withZone(ZoneOffset.UTC)

    public fun of(editedAtEpochMillis: Long?): String =
        editedAtEpochMillis?.let { format.format(Instant.ofEpochMilli(it)) } ?: ORIGINAL
}

internal val SharedTranslationJson: Json = Json { ignoreUnknownKeys = true }
