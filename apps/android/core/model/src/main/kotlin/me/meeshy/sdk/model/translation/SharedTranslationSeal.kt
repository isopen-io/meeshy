package me.meeshy.sdk.model.translation

import java.nio.ByteBuffer
import java.nio.charset.CodingErrorAction
import java.security.MessageDigest
import java.security.SecureRandom
import java.text.Normalizer
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull

/**
 * SCELLER ET OUVRIR UNE TRADUCTION PARTAGÉE — sur l'appareil, jamais ailleurs (#9899).
 *
 * Miroir Kotlin de packages/shared/utils/shared-translation-seal.ts (qui fait foi)
 * et de SharedTranslationSeal.swift, tenus ensemble par
 * packages/shared/fixtures/shared-translation/seal.vectors.json.
 *
 * Clé : HKDF-SHA256, sel `meeshy-shared-translation/v1`, info
 * `<kdf>|<conversationId>|<messageId>|<targetLanguage>`, 32 octets ; matière = texte
 * original en NFC (message-content) ou secret du message (message-secret).
 * Scellement : AES-256-GCM, nonce de 12 octets, tag de 16 ; payload = base64
 * canonique de nonce ‖ chiffré ‖ tag. Données associées : protocole|kdf|conversation|
 * message|langue|sha256 hex du texte original NFC.
 *
 * Le nonce n'est jamais choisi par un appelant public. Ouvrir ne lève jamais.
 */
public enum class SharedTranslationSealFailure {
    INVALID_BINDING,
    EMPTY_SOURCE_CONTENT,
    INVALID_SECRET_LENGTH,
    INVALID_INNER,
    INVALID_NONCE,
    PAYLOAD_TOO_LONG,
    SEAL_FAILED,
}

public class SharedTranslationSealException(public val failure: SharedTranslationSealFailure) :
    Exception(failure.name)

public data class SharedTranslationBinding(
    val conversationId: String,
    val messageId: String,
    val targetLanguage: String,
    val sourceContent: String,
) {
    public val isSound: Boolean
        get() = SharedTranslationFormat.isObjectId(conversationId) &&
            SharedTranslationFormat.isObjectId(messageId) &&
            SharedTranslationFormat.isLanguageCode(targetLanguage) &&
            SharedTranslationFormat.isWellFormedText(sourceContent)
}

public sealed interface SharedTranslationKeySource {
    public val kdf: SharedTranslationKdf

    public data object MessageContent : SharedTranslationKeySource {
        override val kdf: SharedTranslationKdf = SharedTranslationKdf.MESSAGE_CONTENT
    }

    public class MessageSecret(secret: ByteArray) : SharedTranslationKeySource {
        private val bytes: ByteArray = secret.copyOf()
        public val secret: ByteArray get() = bytes.copyOf()
        override val kdf: SharedTranslationKdf = SharedTranslationKdf.MESSAGE_SECRET
    }
}

public object SharedTranslationSeal {
    private const val KEY_BYTE_COUNT = 32
    private val random = SecureRandom()

    /** Scelle sous un nonce tiré au hasard. Lève si la liaison ou la traduction est inadmissible. */
    public fun seal(
        binding: SharedTranslationBinding,
        key: SharedTranslationKeySource,
        inner: SharedTranslationInner,
    ): SharedTranslationEnvelope =
        seal(binding, key, inner, ByteArray(SharedTranslationLimits.NONCE_LENGTH).also(random::nextBytes))

    /** `null` pour tout ce qui ne s'ouvre pas — jamais d'exception. */
    public fun open(
        binding: SharedTranslationBinding,
        key: SharedTranslationKeySource,
        envelope: SharedTranslationEnvelope,
    ): SharedTranslationInner? = try {
        openOrThrow(binding, key, envelope)
    } catch (_: Exception) {
        null
    }

    private fun openOrThrow(
        binding: SharedTranslationBinding,
        key: SharedTranslationKeySource,
        envelope: SharedTranslationEnvelope,
    ): SharedTranslationInner? {
        if (envelope.v != SharedTranslationWire.VERSION || envelope.alg != SharedTranslationWire.ALGORITHM ||
            envelope.kdf != key.kdf || !binding.isSound ||
            !SharedTranslationFormat.isCanonicalBase64(envelope.payload)
        ) {
            return null
        }
        val combined = Base64.getDecoder().decode(envelope.payload)
        val nonceLength = SharedTranslationLimits.NONCE_LENGTH
        if (combined.size < nonceLength + SharedTranslationLimits.TAG_LENGTH) return null
        val plaintext = cipher(Cipher.DECRYPT_MODE, binding, key, combined.copyOfRange(0, nonceLength))
            .doFinal(combined, nonceLength, combined.size - nonceLength)
        return decodeInner(plaintext)
    }

    /** Pièce interne : le nonce n'est fixé que par les vecteurs. Un nonce réutilisé romprait GCM. */
    internal fun seal(
        binding: SharedTranslationBinding,
        key: SharedTranslationKeySource,
        inner: SharedTranslationInner,
        nonce: ByteArray,
    ): SharedTranslationEnvelope {
        if (!binding.isSound) throw SharedTranslationSealException(SharedTranslationSealFailure.INVALID_BINDING)
        if (!inner.isSealable) throw SharedTranslationSealException(SharedTranslationSealFailure.INVALID_INNER)
        if (nonce.size != SharedTranslationLimits.NONCE_LENGTH) {
            throw SharedTranslationSealException(SharedTranslationSealFailure.INVALID_NONCE)
        }
        val sealed = try {
            cipher(Cipher.ENCRYPT_MODE, binding, key, nonce).doFinal(canonicalInnerJson(inner).toByteArray(Charsets.UTF_8))
        } catch (failure: SharedTranslationSealException) {
            throw failure
        } catch (_: Exception) {
            throw SharedTranslationSealException(SharedTranslationSealFailure.SEAL_FAILED)
        }
        val payload = Base64.getEncoder().encodeToString(nonce + sealed)
        if (payload.length > SharedTranslationLimits.PAYLOAD_MAX_LENGTH) {
            throw SharedTranslationSealException(SharedTranslationSealFailure.PAYLOAD_TOO_LONG)
        }
        return SharedTranslationEnvelope.of(key.kdf, payload)
    }

    private fun cipher(mode: Int, binding: SharedTranslationBinding, key: SharedTranslationKeySource, nonce: ByteArray): Cipher =
        Cipher.getInstance("AES/GCM/NoPadding").apply {
            init(
                mode,
                SecretKeySpec(derivedKey(binding, key), "AES"),
                GCMParameterSpec(SharedTranslationLimits.TAG_LENGTH * 8, nonce),
            )
            updateAAD(aad(binding, key.kdf).toByteArray(Charsets.UTF_8))
        }

    internal fun derivedKey(binding: SharedTranslationBinding, key: SharedTranslationKeySource): ByteArray =
        Hkdf.deriveKey(
            inputKeyMaterial = keyMaterial(binding, key),
            salt = SharedTranslationWire.PROTOCOL_IDENTIFIER.toByteArray(Charsets.UTF_8),
            info = listOf(key.kdf.wire, binding.conversationId, binding.messageId, binding.targetLanguage)
                .joinToString("|").toByteArray(Charsets.UTF_8),
            outputByteCount = KEY_BYTE_COUNT,
        )

    private fun keyMaterial(binding: SharedTranslationBinding, key: SharedTranslationKeySource): ByteArray =
        when (key) {
            is SharedTranslationKeySource.MessageSecret -> key.secret.also {
                if (it.size != SharedTranslationLimits.SECRET_LENGTH) {
                    throw SharedTranslationSealException(SharedTranslationSealFailure.INVALID_SECRET_LENGTH)
                }
            }
            SharedTranslationKeySource.MessageContent -> {
                if (binding.sourceContent.isEmpty()) {
                    throw SharedTranslationSealException(SharedTranslationSealFailure.EMPTY_SOURCE_CONTENT)
                }
                nfc(binding.sourceContent).toByteArray(Charsets.UTF_8)
            }
        }

    /** Empreinte du texte original en NFC, hexadécimal minuscule. */
    internal fun sourceDigest(sourceContent: String): String =
        MessageDigest.getInstance("SHA-256").digest(nfc(sourceContent).toByteArray(Charsets.UTF_8))
            .joinToString("") { "%02x".format(it) }

    internal fun aad(binding: SharedTranslationBinding, kdf: SharedTranslationKdf): String =
        listOf(
            SharedTranslationWire.PROTOCOL_IDENTIFIER,
            kdf.wire,
            binding.conversationId,
            binding.messageId,
            binding.targetLanguage,
            sourceDigest(binding.sourceContent),
        ).joinToString("|")

    private fun nfc(text: String): String = Normalizer.normalize(text, Normalizer.Form.NFC)

    /** `JSON.stringify({ engine, sourceLanguage, text, v: 1 })` : clés triées, sans espace, barres non échappées. */
    internal fun canonicalInnerJson(inner: SharedTranslationInner): String =
        "{\"engine\":${quoted(inner.engine)},\"sourceLanguage\":${quoted(inner.sourceLanguage)}," +
            "\"text\":${quoted(inner.text)},\"v\":1}"

    private fun quoted(text: String): String = buildString(text.length + 2) {
        append('"')
        text.forEach { char ->
            when {
                char == '"' -> append("\\\"")
                char == '\\' -> append("\\\\")
                char == '\b' -> append("\\b")
                char == '\u000C' -> append("\\f")
                char == '\n' -> append("\\n")
                char == '\r' -> append("\\r")
                char == '\t' -> append("\\t")
                char < ' ' -> append("\\u").append("%04x".format(char.code))
                else -> append(char)
            }
        }
        append('"')
    }

    private fun decodeInner(plaintext: ByteArray): SharedTranslationInner? {
        val decoder = Charsets.UTF_8.newDecoder()
            .onMalformedInput(CodingErrorAction.REPORT)
            .onUnmappableCharacter(CodingErrorAction.REPORT)
        val root = Json.parseToJsonElement(decoder.decode(ByteBuffer.wrap(plaintext)).toString()) as? JsonObject
            ?: return null
        fun string(name: String): String? = (root[name] as? JsonPrimitive)?.takeIf { it.isString }?.contentOrNull
        val version = (root["v"] as? JsonPrimitive)?.takeIf { !it.isString }?.intOrNull
        val inner = SharedTranslationInner(
            text = string("text") ?: return null,
            sourceLanguage = string("sourceLanguage") ?: return null,
            engine = string("engine") ?: return null,
            v = version ?: return null,
        )
        return inner.takeIf { it.isSealable }
    }
}
