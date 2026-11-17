package me.meeshy.core.e2ee.content

import java.math.BigDecimal
import java.nio.ByteBuffer
import java.nio.charset.CharacterCodingException
import java.nio.charset.CodingErrorAction
import java.nio.charset.StandardCharsets
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/** Ce que l'enveloppe servie dit d'elle-même, et que le clair doit confirmer (`E2EEEnvelopeOrigin`, contrat #18940). */
public data class E2eeEnvelopeOrigin(val conversationId: String, val senderUserId: String, val senderDeviceId: Int)

/** Pourquoi un clair est illisible — pour le journal de l'appareil, jamais pour l'interface. */
public enum class E2eeUnreadableReason { NOT_UTF8, NOT_JSON, NOT_AN_OBJECT, INVALID_VERSION, INVALID_FIELDS }

/**
 * L'issue de la lecture d'un clair déchiffré par libsignal, verdict par verdict du contrat commun
 * (`E2EEOpening`, `packages/shared/types/e2ee-content.ts`, vecteurs `packages/shared/fixtures/e2ee-content/` et
 * `e2ee-signal/`). Un appareil n'acquitte une enveloppe que sur un verdict qui la JUGE ([Unreadable], [Misattributed])
 * ou qui l'a rangée ([Message], [Signal], [FutureVersion]).
 */
public sealed interface E2eeOpening {
    public val payload: E2eePayloadKind

    /** `admitted` — ou `admitted-unauthored` quand le contenu ne nomme aucun auteur (client antérieur à #12976). */
    public data class Message(val content: E2eeContent) : E2eeOpening {
        override val payload: E2eePayloadKind get() = E2eePayloadKind.MESSAGE
    }

    /** `admitted` — ou `admitted-unknown-kind` quand l'action est [E2eeSignalAction.Unknown] : rangé, jamais appliqué. */
    public data class Signal(val signal: E2eeSignal) : E2eeOpening {
        override val payload: E2eePayloadKind get() = E2eePayloadKind.SIGNAL
    }

    /** `future-version` : une version que cet appareil ne lit pas encore. Son JSON (sans remplissage) se GARDE (#9223). */
    public data class FutureVersion(override val payload: E2eePayloadKind, val version: Long, val json: String) : E2eeOpening

    /** `unreadable` : pas de l'UTF-8, pas du JSON, pas un objet, version invalide, clé requise absente ou du mauvais type. */
    public data class Unreadable(override val payload: E2eePayloadKind, val reason: E2eeUnreadableReason) : E2eeOpening

    /** `misattributed-conversation` ou `misattributed-author` : le serveur présente ce clair hors de SA place. */
    public data class Misattributed(override val payload: E2eePayloadKind, val conversation: Boolean) : E2eeOpening
}

/**
 * La lecture STRICTE d'un clair déchiffré (#18944), fidèle au contrat commun écrit d'après ce que l'iPhone écrit et
 * accepte : UTF-8 strict (une séquence invalide ne se remplace pas, elle rend le clair illisible), JSON strict (aucun
 * littéral nu, aucune demi-paire de substitution), clé à `null` lue absente, clé inconnue ignorée, AUCUNE coercition (un
 * nombre entre guillemets n'est pas un nombre, `1.5` n'est pas un entier), la version jugée AVANT toute autre clé.
 *
 * Rien ici n'est une primitive cryptographique : l'authenticité vient de libsignal (l'appareil émetteur) ; cette lecture ne
 * fait que lier le clair à SA conversation et à SON auteur, que libsignal ne couvre pas.
 */
public object E2eePlaintextReader {
    public const val CONTENT_VERSION: Long = 1
    public const val SIGNAL_VERSION: Long = 1

    /** La sonde (`E2EEPayloadKind.of`) : un signal si et seulement si `s` est un ENTIER JSON ; tout le reste est un message. */
    public fun payloadOf(plaintext: ByteArray): E2eePayloadKind = payloadOf(parse(plaintext))

    /** Lit le clair sans le confronter à son enveloppe : jamais [E2eeOpening.Misattributed]. */
    public fun read(plaintext: ByteArray): E2eeOpening {
        val parsed = parse(plaintext)
        return if (payloadOf(parsed) == E2eePayloadKind.SIGNAL) readSignal(parsed) else readContent(parsed)
    }

    /** Lit le clair puis le confronte à l'enveloppe servie : d'abord la conversation, ensuite l'auteur. */
    public fun open(plaintext: ByteArray, origin: E2eeEnvelopeOrigin): E2eeOpening = when (val reading = read(plaintext)) {
        is E2eeOpening.Message -> placeContent(reading, origin)
        is E2eeOpening.Signal -> placeSignal(reading, origin)
        else -> reading
    }

    private fun placeContent(reading: E2eeOpening.Message, origin: E2eeEnvelopeOrigin): E2eeOpening {
        val content = reading.content
        if (content.conversationId != origin.conversationId) return E2eeOpening.Misattributed(E2eePayloadKind.MESSAGE, conversation = true)
        if (content.authorUserId == null && content.authorDeviceId == null) return reading
        val authored = content.authorUserId == origin.senderUserId && content.authorDeviceId == origin.senderDeviceId
        return if (authored) reading else E2eeOpening.Misattributed(E2eePayloadKind.MESSAGE, conversation = false)
    }

    /** Un signal n'a pas de version antérieure sans auteur : sans auteur, il n'est celui de personne. */
    private fun placeSignal(reading: E2eeOpening.Signal, origin: E2eeEnvelopeOrigin): E2eeOpening {
        val signal = reading.signal
        if (signal.conversationId != origin.conversationId) return E2eeOpening.Misattributed(E2eePayloadKind.SIGNAL, conversation = true)
        val authored = signal.authorUserId == origin.senderUserId && signal.authorDeviceId == origin.senderDeviceId.toLong()
        return if (authored) reading else E2eeOpening.Misattributed(E2eePayloadKind.SIGNAL, conversation = false)
    }

    private sealed interface Parsed {
        class Ok(val text: String, val root: JsonElement) : Parsed
        class Failed(val reason: E2eeUnreadableReason) : Parsed
    }

    private val parser: Json = Json { isLenient = false }

    private fun parse(plaintext: ByteArray): Parsed {
        val text = strictUtf8(plaintext) ?: return Parsed.Failed(E2eeUnreadableReason.NOT_UTF8)
        val root = try {
            parser.parseToJsonElement(text)
        } catch (_: IllegalArgumentException) {
            return Parsed.Failed(E2eeUnreadableReason.NOT_JSON)
        }
        return if (root.isStrictJson()) Parsed.Ok(text, root) else Parsed.Failed(E2eeUnreadableReason.NOT_JSON)
    }

    /** UTF-8 strict : une séquence invalide REFUSE le clair (JSONDecoder), elle ne se remplace pas par U+FFFD. */
    private fun strictUtf8(bytes: ByteArray): String? = try {
        StandardCharsets.UTF_8.newDecoder()
            .onMalformedInput(CodingErrorAction.REPORT)
            .onUnmappableCharacter(CodingErrorAction.REPORT)
            .decode(ByteBuffer.wrap(bytes))
            .toString()
    } catch (_: CharacterCodingException) {
        null
    }

    private fun payloadOf(parsed: Parsed): E2eePayloadKind {
        val root = (parsed as? Parsed.Ok)?.root as? JsonObject ?: return E2eePayloadKind.MESSAGE
        return if (root["s"].safeInteger() != null) E2eePayloadKind.SIGNAL else E2eePayloadKind.MESSAGE
    }

    private fun readContent(parsed: Parsed): E2eeOpening {
        val payload = E2eePayloadKind.MESSAGE
        val (fields, text) = when (val reading = objectOf(parsed, payload)) {
            is ObjectReading.Refused -> return reading.opening
            is ObjectReading.Read -> reading
        }
        versionVerdict(payload, fields["v"], CONTENT_VERSION, text)?.let { return it }
        return try {
            val reader = Fields(fields)
            E2eeOpening.Message(
                E2eeContent(
                    authorDeviceId = reader.optionalDevice("authorDeviceId"),
                    authorUserId = reader.optionalString("authorUserId"),
                    clientMessageId = reader.optionalString("clientMessageId"),
                    conversationId = reader.optionalString("conversationId"),
                    language = reader.optionalString("language"),
                    replyTo = reader.optionalString("replyTo"),
                    sentAt = reader.int64("sentAt"),
                    text = reader.optionalString("text"),
                    version = CONTENT_VERSION.toInt(),
                ),
            )
        } catch (_: InvalidField) {
            E2eeOpening.Unreadable(payload, E2eeUnreadableReason.INVALID_FIELDS)
        }
    }

    private fun readSignal(parsed: Parsed): E2eeOpening {
        val payload = E2eePayloadKind.SIGNAL
        val (fields, text) = when (val reading = objectOf(parsed, payload)) {
            is ObjectReading.Refused -> return reading.opening
            is ObjectReading.Read -> reading
        }
        versionVerdict(payload, fields["s"], SIGNAL_VERSION, text)?.let { return it }
        return try {
            val reader = Fields(fields)
            val conversationId = reader.string("conversationId")
            val sentAt = reader.int64("sentAt")
            val authorUserId = reader.optionalString("authorUserId")
            val authorDeviceId = reader.optionalUint32("authorDeviceId")
            val action = E2eeSignalAction.read(reader.string("kind"), reader)
            E2eeOpening.Signal(E2eeSignal(conversationId, sentAt, authorUserId, authorDeviceId, action))
        } catch (_: InvalidField) {
            E2eeOpening.Unreadable(payload, E2eeUnreadableReason.INVALID_FIELDS)
        }
    }

    private sealed interface ObjectReading {
        data class Read(val fields: Map<String, JsonElement>, val text: String) : ObjectReading
        class Refused(val opening: E2eeOpening) : ObjectReading
    }

    /** L'objet du clair, ses clés à `null` ôtées (lues absentes), et son texte ; ou ce qui le rend illisible. */
    private fun objectOf(parsed: Parsed, payload: E2eePayloadKind): ObjectReading = when (parsed) {
        is Parsed.Failed -> ObjectReading.Refused(E2eeOpening.Unreadable(payload, parsed.reason))
        is Parsed.Ok -> (parsed.root as? JsonObject)
            ?.let { root -> ObjectReading.Read(root.filterValues { it !is JsonNull }, parsed.text) }
            ?: ObjectReading.Refused(E2eeOpening.Unreadable(payload, E2eeUnreadableReason.NOT_AN_OBJECT))
    }

    /** La version se juge AVANT toute autre clé : une version future garde son JSON quelle que soit sa forme. */
    private fun versionVerdict(payload: E2eePayloadKind, value: JsonElement?, current: Long, text: String): E2eeOpening? {
        val version = value.safeInteger() ?: return E2eeOpening.Unreadable(payload, E2eeUnreadableReason.INVALID_VERSION)
        if (version > current) return E2eeOpening.FutureVersion(payload, version, withoutTrailingWhitespace(text))
        return if (version == current) null else E2eeOpening.Unreadable(payload, E2eeUnreadableReason.INVALID_VERSION)
    }
}

/** Une clé connue absente quand elle est requise, ou présente du mauvais type : le clair entier est illisible. */
internal class InvalidField : RuntimeException("invalid e2ee field")

/** La lecture des clés d'un objet du contrat, sans coercition : une clé du mauvais type lève [InvalidField]. */
internal class Fields(private val fields: Map<String, JsonElement>) {
    private fun primitive(key: String): JsonPrimitive? = fields[key]?.let { it as? JsonPrimitive ?: throw InvalidField() }

    fun optionalString(key: String): String? = primitive(key)?.let { if (it.isString) it.content else throw InvalidField() }

    fun string(key: String): String = optionalString(key) ?: throw InvalidField()

    fun boolean(key: String): Boolean = when (primitive(key)?.takeUnless { it.isString }?.content) {
        "true" -> true
        "false" -> false
        else -> throw InvalidField()
    }

    /** Un nombre JSON quelconque (`z.number()`) : jamais une chaîne. */
    fun number(key: String): Double = primitive(key)?.takeUnless { it.isString }?.content?.toDoubleOrNull() ?: throw InvalidField()

    /** Un `Int64` Swift : un entier JSON qui tient sur 64 bits. */
    fun int64(key: String): Long = fields[key].integral(Long.MIN_VALUE, Long.MAX_VALUE) ?: throw InvalidField()

    /** Un `UInt32` Swift, absent ou entre 0 et 2³²−1. */
    fun optionalUint32(key: String): Long? = fields[key]?.let { it.integral(0, UINT32_MAX) ?: throw InvalidField() }

    /** Un appareil auteur d'un CONTENU : un `UInt32` ; un numéro qu'aucun appareil ne porte (au-delà d'un `Int`) n'est l'auteur de personne. */
    fun optionalDevice(key: String): Int? = optionalUint32(key)?.let { if (it > Int.MAX_VALUE) NO_DEVICE else it.toInt() }

    fun strings(key: String): List<String> {
        val array = fields[key] as? JsonArray ?: throw InvalidField()
        return array.map { (it as? JsonPrimitive)?.takeIf { primitive -> primitive.isString && primitive !is JsonNull }?.content ?: throw InvalidField() }
    }

    private companion object {
        const val UINT32_MAX: Long = 0xFFFF_FFFFL

        /** Aucun appareil ne porte ce numéro (libsignal borne les appareils à 1..127) : l'auteur ne correspond à aucune enveloppe. */
        const val NO_DEVICE: Int = -1
    }
}

/**
 * Le JSON sans ce qui le suit : le remplissage (des espaces) et tout autre blanc JSON (RFC 8259 § 2) qu'un émetteur y
 * aurait ajouté, par un parcours LINÉAIRE depuis la fin (WEBX-06 : une expression ancrée sur la fin était quadratique).
 */
internal fun withoutTrailingWhitespace(text: String): String = text.trimEnd(' ', '\t', '\n', '\r')

private val JSON_NUMBER = Regex("-?(0|[1-9][0-9]*)(\\.[0-9]+)?([eE][+-]?[0-9]+)?")
private const val MAX_SAFE_INTEGER: Long = 9_007_199_254_740_991L

/** Le JSON que `JSON.parse` et `JSONDecoder` acceptent : aucun littéral nu, aucune demi-paire de substitution. */
private fun JsonElement.isStrictJson(): Boolean = when (this) {
    is JsonNull -> true
    is JsonPrimitive -> if (isString) content.isWellFormedUtf16() else content == "true" || content == "false" || JSON_NUMBER.matches(content)
    is JsonArray -> all { it.isStrictJson() }
    is JsonObject -> all { (key, value) -> key.isWellFormedUtf16() && value.isStrictJson() }
}

private fun String.isWellFormedUtf16(): Boolean = codePoints().noneMatch { it in 0xD800..0xDFFF }

/** Un nombre JSON entier (`1` et `1.0` oui, `1.5`, `"1"` et `null` non) compris entre [min] et [max]. */
private fun JsonElement?.integral(min: Long, max: Long): Long? {
    val primitive = this as? JsonPrimitive ?: return null
    if (primitive is JsonNull || primitive.isString) return null
    val value = primitive.content.toBigDecimalOrNull() ?: return null
    if (value.signum() != 0 && value.stripTrailingZeros().scale() > 0) return null
    if (value < BigDecimal.valueOf(min) || value > BigDecimal.valueOf(max)) return null
    return value.toLong()
}

/** Un ENTIER JSON sûr, comme `Number.isSafeInteger` du contrat TS : la version d'un contenu ou d'un signal, la sonde. */
private fun JsonElement?.safeInteger(): Long? = integral(-MAX_SAFE_INTEGER, MAX_SAFE_INTEGER)
