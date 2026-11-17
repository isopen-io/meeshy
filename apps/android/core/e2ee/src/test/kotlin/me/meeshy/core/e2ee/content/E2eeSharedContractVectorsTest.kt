package me.meeshy.core.e2ee.content

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import java.util.Base64
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.long
import org.junit.Test

/**
 * #18944 — Android lit et écrit le contenu et les signaux chiffrés EXACTEMENT comme les vecteurs communs
 * (`packages/shared/fixtures/e2ee-content/`, `e2ee-signal/`, écrits d'après ce que l'iPhone écrit et accepte, #18940) :
 * mêmes octets canoniques, même remplissage, même sonde, mêmes verdicts. Les fichiers du dépôt sont lus par chemin
 * relatif (aucune copie) : un vecteur qui change fait tourner la CI Android (`packages/shared/fixtures/**`).
 */
class E2eeSharedContractVectorsTest {

    private fun repositoryFile(path: String): File {
        var dir: File? = File(".").absoluteFile
        while (dir != null) {
            val candidate = File(dir, path)
            if (candidate.isFile) return candidate
            dir = dir.parentFile
        }
        throw AssertionError("Fichier partagé introuvable : $path")
    }

    private fun parse(path: String): JsonObject = Json.parseToJsonElement(repositoryFile(path).readText()).jsonObject

    private val content = parse("packages/shared/fixtures/e2ee-content/content.vectors.json")
    private val signal = parse("packages/shared/fixtures/e2ee-signal/signal.vectors.json")
    private val padding = parse("packages/shared/fixtures/e2ee-content/padding.vectors.json")

    private fun JsonObject.obj(key: String): JsonObject = getValue(key).jsonObject
    private fun JsonObject.text(key: String): String = getValue(key).jsonPrimitive.content
    private fun JsonObject.number(key: String): Int = getValue(key).jsonPrimitive.int
    private fun JsonObject.rows(key: String): List<JsonObject> = getValue(key).jsonArray.map { it.jsonObject }
    private fun JsonObject.present(key: String) = get(key)?.takeUnless { it is JsonNull }

    private fun base64(bytes: ByteArray): String = Base64.getEncoder().encodeToString(bytes)

    private fun origin(case: JsonObject): E2eeEnvelopeOrigin {
        val envelope = case.obj("envelope")
        return E2eeEnvelopeOrigin(envelope.text("conversationId"), envelope.text("senderUserId"), envelope.number("senderDeviceId"))
    }

    /** Le verdict du contrat que rend la lecture Android. */
    private fun verdictOf(opening: E2eeOpening): String = when (opening) {
        is E2eeOpening.Message ->
            if (opening.content.authorUserId == null && opening.content.authorDeviceId == null) "admitted-unauthored" else "admitted"
        is E2eeOpening.Signal -> if (opening.signal.action is E2eeSignalAction.Unknown) "admitted-unknown-kind" else "admitted"
        is E2eeOpening.FutureVersion -> "future-version"
        is E2eeOpening.Unreadable -> "unreadable"
        is E2eeOpening.Misattributed -> if (opening.conversation) "misattributed-conversation" else "misattributed-author"
    }

    private fun payloadOf(opening: E2eeOpening): String = if (opening.payload == E2eePayloadKind.SIGNAL) "signal" else "message"

    @Test
    fun everyContentCase_encodesToTheCanonicalBytes_padsByUtf8Bytes_andOpensAdmitted() {
        content.rows("cases").forEach { case ->
            val name = case.text("name")
            val read = E2eePlaintextReader.read(case.obj("object").toString().toByteArray(Charsets.UTF_8))
            assertWithMessage(name).that(read).isInstanceOf(E2eeOpening.Message::class.java)
            val encoded = (read as E2eeOpening.Message).content.encoded()
            assertWithMessage(name).that(base64(encoded)).isEqualTo(case.text("canonicalBase64"))
            assertWithMessage(name).that(encoded.size).isEqualTo(case.number("canonicalLength"))
            val padded = case.obj("padded")
            val paddedBytes = E2eePadding.padded(encoded, padded.number("recipients"))
            assertWithMessage(name).that(paddedBytes.size).isEqualTo(padded.number("length"))
            assertWithMessage(name).that(base64(paddedBytes)).isEqualTo(padded.text("base64"))
            assertWithMessage(name).that(E2eePayloadKind.of(paddedBytes)).isEqualTo(E2eePayloadKind.MESSAGE)
            assertWithMessage(name).that(E2eePlaintextReader.open(paddedBytes, origin(case))).isEqualTo(read)
        }
    }

    @Test
    fun everySignalCase_encodesToTheCanonicalBytes_andOpensAdmitted() {
        signal.rows("cases").forEach { case ->
            val name = case.text("name")
            val read = E2eePlaintextReader.read(case.obj("object").toString().toByteArray(Charsets.UTF_8))
            assertWithMessage(name).that(read).isInstanceOf(E2eeOpening.Signal::class.java)
            val encoded = (read as E2eeOpening.Signal).signal.encoded()
            assertWithMessage(name).that(base64(encoded)).isEqualTo(case.text("canonicalBase64"))
            val padded = case.obj("padded")
            val paddedBytes = E2eePadding.padded(encoded, padded.number("recipients"))
            assertWithMessage(name).that(base64(paddedBytes)).isEqualTo(padded.text("base64"))
            assertWithMessage(name).that(E2eePayloadKind.of(paddedBytes)).isEqualTo(E2eePayloadKind.SIGNAL)
            assertWithMessage(name).that(E2eePlaintextReader.open(paddedBytes, origin(case))).isEqualTo(read)
        }
    }

    @Test
    fun everyVerdict_isTheVerdictOfTheContract() {
        (content.rows("verdicts") + signal.rows("verdicts")).forEach { case ->
            val name = case.text("name")
            val opening = E2eePlaintextReader.open(Base64.getDecoder().decode(case.text("plaintextBase64")), origin(case))

            assertWithMessage(name).that(payloadOf(opening)).isEqualTo(case.text("payload"))
            assertWithMessage(name).that(verdictOf(opening)).isEqualTo(case.text("verdict"))
            case.present("version")?.let { version ->
                assertWithMessage(name).that((opening as E2eeOpening.FutureVersion).version).isEqualTo(version.jsonPrimitive.long)
            }
            case.present("kind")?.let { kind ->
                val action = (opening as E2eeOpening.Signal).signal.action
                assertWithMessage(name).that(action).isEqualTo(E2eeSignalAction.Unknown(kind.jsonPrimitive.content))
            }
            case.present("expected")?.let { expected ->
                assertWithMessage(name).that(opening).isEqualTo(E2eePlaintextReader.read(expected.toString().toByteArray(Charsets.UTF_8)))
            }
        }
    }

    @Test
    fun aFutureVersion_keepsItsJsonWithoutThePadding() {
        val case = content.rows("verdicts").first { it.text("verdict") == "future-version" }
        val plaintext = Base64.getDecoder().decode(case.text("plaintextBase64"))

        val opening = E2eePlaintextReader.open(plaintext, origin(case)) as E2eeOpening.FutureVersion

        assertThat(opening.json).isEqualTo(plaintext.toString(Charsets.UTF_8).trimEnd(' '))
        assertThat(opening.json).isEqualTo(case.text("plaintextJson"))
    }

    @Test
    fun theTiersAndCeilingsOfThePadding_areTheContracts() {
        assertThat(E2eePadding.TIERS).isEqualTo(padding.getValue("tiers").jsonArray.map { it.jsonPrimitive.int })
        assertThat(E2eePadding.STEP).isEqualTo(padding.number("step"))
        assertThat(E2eePadding.MAX_ENVELOPE_BYTES).isEqualTo(padding.number("maxEnvelopeBytes"))
        assertThat(E2eePadding.MAX_TOTAL_BYTES).isEqualTo(padding.number("maxTotalBytes"))
        assertThat(E2eePadding.CIPHER_OVERHEAD).isEqualTo(padding.number("cipherOverhead"))
        padding.rows("ceilings").forEach { row ->
            assertWithMessage("plafond pour ${row.number("recipients")}").that(E2eePadding.ceiling(row.number("recipients"))).isEqualTo(row.number("ceiling"))
        }
        padding.rows("lengths").forEach { row ->
            val label = "${row.number("length")} octets pour ${row.number("recipients")}"
            assertWithMessage(label).that(E2eePadding.paddedLength(row.number("length"), row.number("recipients"))).isEqualTo(row.number("padded"))
        }
    }
}
