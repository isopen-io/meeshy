package me.meeshy.core.e2ee.flow

import com.google.common.truth.Truth.assertThat
import java.io.File
import java.util.Base64
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import me.meeshy.core.e2ee.E2eeWire
import me.meeshy.core.e2ee.session.E2eeCiphertext
import me.meeshy.core.e2ee.session.E2eeSessionCipher
import me.meeshy.core.e2ee.store.E2eeDeviceAddress
import me.meeshy.core.e2ee.store.E2eeLocalIdentity
import me.meeshy.core.e2ee.store.MeeshySignalProtocolStore
import me.meeshy.core.e2ee.vault.InMemoryRecordBackend
import me.meeshy.core.e2ee.vault.TransactionalRecordVault
import org.junit.Assert.assertThrows
import org.junit.Test
import org.signal.libsignal.protocol.IdentityKeyPair
import org.signal.libsignal.protocol.SignalProtocolAddress
import org.signal.libsignal.protocol.state.KyberPreKeyRecord
import org.signal.libsignal.protocol.state.PreKeyRecord
import org.signal.libsignal.protocol.state.SessionRecord
import org.signal.libsignal.protocol.state.SignedPreKeyRecord

/**
 * Les VECTEURS CROISÉS libsignal (#17113) : le fichier COMMUN `packages/shared/fixtures/libsignal/cross-platform.vectors.json`,
 * scellé par la passerelle et rejoué tel quel par elle (jest) et par le SDK iOS, s'ouvre ici par le chiffreur de PRODUCTION
 * ([E2eeSessionCipher]) sur le coffre transactionnel. PQXDH depuis les seules pré-clés, puis des sessions sérialisées rechargées
 * (rétrocompatibilité #9231). Les jeux de `legacy/`, scellés par une version ANTÉRIEURE, s'ouvrent de même : une session
 * persistée avant une montée survit à la montée. Une charge altérée d'un octet est refusée.
 */
class LibsignalCrossPlatformVectorsTest {

    private class Device(val address: E2eeDeviceAddress, val identity: E2eeLocalIdentity) {
        val vault = TransactionalRecordVault(InMemoryRecordBackend())
        val cipher = E2eeSessionCipher(address, identity, vault)

        fun seed(block: MeeshySignalProtocolStore.() -> Unit) {
            vault.write { transaction -> MeeshySignalProtocolStore(identity, transaction).block() }
        }

        fun open(ciphertext: E2eeCiphertext, from: E2eeDeviceAddress): String =
            cipher.decrypt(ciphertext, from) { plaintext, _ -> plaintext.toString(Charsets.UTF_8) }
    }

    private fun repositoryFile(path: String): File {
        var dir: File? = File(".").absoluteFile
        while (dir != null) {
            val candidate = File(dir, path)
            if (candidate.isFile) return candidate
            dir = dir.parentFile
        }
        throw AssertionError("Fichier partagé introuvable : $path")
    }

    private fun JsonObject.obj(key: String): JsonObject = getValue(key).jsonObject
    private fun JsonObject.text(key: String): String = getValue(key).jsonPrimitive.content
    private fun JsonObject.number(key: String): Int = getValue(key).jsonPrimitive.int
    private fun JsonObject.bytes(key: String): ByteArray = Base64.getDecoder().decode(text(key))

    private fun parse(file: File): JsonObject = Json.parseToJsonElement(file.readText()).jsonObject

    private val currentFile = repositoryFile("packages/shared/fixtures/libsignal/cross-platform.vectors.json")
    private val vectors: JsonObject = parse(currentFile)
    private val legacy: List<JsonObject> =
        File(currentFile.parentFile, "legacy").listFiles { file -> file.name.endsWith(".vectors.json") }.orEmpty()
            .sortedBy { it.name }
            .map(::parse)
    private val allSets: List<JsonObject> = listOf(vectors) + legacy

    private fun address(party: JsonObject) = E2eeDeviceAddress(party.text("name"), party.number("deviceId"))

    private fun device(party: JsonObject) =
        Device(address(party), E2eeLocalIdentity(IdentityKeyPair(party.bytes("identityKeyPair")), party.number("registrationId")))

    private fun bobWithPreKeys(set: JsonObject): Device {
        val bob = set.obj("bob")
        return device(bob).apply {
            seed {
                storeSignedPreKey(bob.obj("signedPreKey").number("id"), SignedPreKeyRecord(bob.obj("signedPreKey").bytes("record")))
                storeKyberPreKey(bob.obj("kyberPreKey").number("id"), KyberPreKeyRecord(bob.obj("kyberPreKey").bytes("record")))
                storePreKey(bob.obj("preKey").number("id"), PreKeyRecord(bob.obj("preKey").bytes("record")))
            }
        }
    }

    private fun persisted(party: JsonObject, peer: JsonObject, session: String): Device = device(party).apply {
        seed {
            storeSession(SignalProtocolAddress(peer.text("name"), peer.number("deviceId")), SessionRecord(Base64.getDecoder().decode(session)))
        }
    }

    private fun ciphertext(message: JsonObject) = E2eeCiphertext(message.number("type"), message.bytes("body"))

    private fun tampered(message: JsonObject): E2eeCiphertext {
        val body = message.bytes("body")
        return E2eeCiphertext(message.number("type"), body.copyOf().also { it[it.lastIndex] = (it[it.lastIndex].toInt() xor 0x01).toByte() })
    }

    private fun JsonObject.freshMessages(): List<JsonObject> = obj("freshSession").getValue("messages").jsonArray.map { it.jsonObject }
    private fun JsonObject.reply(): JsonObject = obj("persistedSessions").obj("aliceOpensReply")
    private fun JsonObject.third(): JsonObject = obj("persistedSessions").obj("bobOpensThird")

    @Test
    fun `the vectors are sealed by the libsignal version this module pins`() {
        val pinned = Regex("""^libsignal\s*=\s*"([^"]+)"""", RegexOption.MULTILINE)
            .find(repositoryFile("apps/android/gradle/libs.versions.toml").readText())?.groupValues?.get(1)
        assertThat(vectors.text("libsignal")).isEqualTo(pinned)
    }

    @Test
    fun `a set sealed by an earlier libsignal version is replayed`() {
        val versions = legacy.map { it.text("libsignal") }
        assertThat(versions).isNotEmpty()
        assertThat(versions).doesNotContain(vectors.text("libsignal"))
    }

    @Test
    fun `bob opens both PreKeySignalMessages from his pre-keys alone`() {
        allSets.forEach { set ->
            val device = bobWithPreKeys(set)
            val messages = set.freshMessages()

            val plaintexts = messages.map { device.open(ciphertext(it), address(set.obj("alice"))) }

            assertThat(messages.map { it.number("type") }).containsExactly(E2eeWire.PRE_KEY_TYPE, E2eeWire.PRE_KEY_TYPE).inOrder()
            assertThat(plaintexts).isEqualTo(messages.map { it.text("plaintext") })
        }
    }

    @Test
    fun `sessions reloaded from their serialized records open the next SignalMessage on both sides`() {
        allSets.forEach { set ->
            val alice = set.obj("alice")
            val bob = set.obj("bob")
            val aliceDevice = persisted(alice, bob, set.reply().text("session"))
            val bobDevice = persisted(bob, alice, set.third().text("session"))
            val replyMessage = set.reply().obj("message")
            val thirdMessage = set.third().obj("message")

            assertThat(listOf(replyMessage.number("type"), thirdMessage.number("type")))
                .containsExactly(E2eeWire.WHISPER_TYPE, E2eeWire.WHISPER_TYPE)
            assertThat(aliceDevice.open(ciphertext(replyMessage), address(bob))).isEqualTo(replyMessage.text("plaintext"))
            assertThat(bobDevice.open(ciphertext(thirdMessage), address(alice))).isEqualTo(thirdMessage.text("plaintext"))
        }
    }

    @Test
    fun `each payload altered by one byte is refused`() {
        allSets.forEach { set ->
            val alice = set.obj("alice")
            val bob = set.obj("bob")
            val freshBob = bobWithPreKeys(set)
            val aliceDevice = persisted(alice, bob, set.reply().text("session"))
            val persistedBob = persisted(bob, alice, set.third().text("session"))
            val alteredFirst = tampered(set.freshMessages().first())
            val alteredReply = tampered(set.reply().obj("message"))
            val alteredThird = tampered(set.third().obj("message"))

            assertThrows(Exception::class.java) { freshBob.open(alteredFirst, address(alice)) }
            assertThrows(Exception::class.java) { aliceDevice.open(alteredReply, address(bob)) }
            assertThrows(Exception::class.java) { persistedBob.open(alteredThird, address(alice)) }
        }
    }
}
