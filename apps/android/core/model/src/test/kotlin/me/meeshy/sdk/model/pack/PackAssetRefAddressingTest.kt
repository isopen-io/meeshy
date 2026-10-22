package me.meeshy.sdk.model.pack

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import org.junit.Assert.assertThrows
import org.junit.Test

/** Un fichier de pack se nomme par son contenu : le nom engage les 16 premiers caractères de son SHA-256. */
class PackAssetRefAddressingTest {

    private val sha = "b19ebab0f4cfeed8715e0264fab552c11fcce89f71ba78b2f01feb0b78ab634e"

    @Test
    fun `a reference named by the prefix of its hash is accepted`() {
        val ref = PackAssetRef.of("b19ebab0f4cfeed8.json", 1842, sha)

        assertThat(ref).isEqualTo(PackAssetRef(src = "b19ebab0f4cfeed8.json", bytes = 1842, sha256 = sha))
    }

    @Test
    fun `the four content types are accepted`() {
        listOf("webp", "png", "json", "woff2").forEach { extension ->
            assertThat(PackAssetRef.of("b19ebab0f4cfeed8.$extension", 1, sha)).isNotNull()
        }
    }

    @Test
    fun `a name that is not the prefix of the hash is refused`() {
        assertThat(PackAssetRef.of("0000000000000000.json", 1842, sha)).isNull()
    }

    @Test
    fun `a name that is not content addressed is refused`() {
        listOf("logo.png", "b19ebab0f4cfeed8", "b19ebab0f4cfeed8.exe", "b19ebab0f4cfee.json", "B19EBAB0F4CFEED8.json", "../b19ebab0f4cfeed8.json", "b19ebab0f4cfeed8.json.json")
            .forEach { assertThat(PackAssetRef.of(it, 1, sha)).isNull() }
    }

    @Test
    fun `a hash that is not sixty four lowercase hexadecimal characters is refused`() {
        assertThat(PackAssetRef.of("b19ebab0f4cfeed8.json", 1, sha.take(63))).isNull()
        assertThat(PackAssetRef.of("b19ebab0f4cfeed8.json", 1, sha.uppercase())).isNull()
        assertThat(PackAssetRef.of("b19ebab0f4cfeed8.json", 1, "z".repeat(64))).isNull()
    }

    @Test
    fun `a negative size is refused`() {
        assertThat(PackAssetRef.of("b19ebab0f4cfeed8.json", -1, sha)).isNull()
        assertThat(PackAssetRef.of("b19ebab0f4cfeed8.json", 0, sha)).isNotNull()
    }

    @Test
    fun `decoding is fail-closed with a serialization error`() {
        val json = Json { ignoreUnknownKeys = true }

        val ref = json.decodeFromString(PackAssetRef.serializer(), """{"src":"b19ebab0f4cfeed8.json","bytes":1842,"sha256":"$sha","extra":1}""")

        assertThat(ref.bytes).isEqualTo(1842)
        assertThrows(SerializationException::class.java) {
            json.decodeFromString(PackAssetRef.serializer(), """{"src":"logo.png","bytes":1,"sha256":"$sha"}""")
        }
    }

    @Test
    fun `a reference round trips through JSON`() {
        val ref = PackAssetRef.of("b19ebab0f4cfeed8.json", 1842, sha)!!
        val json = Json

        assertThat(json.decodeFromString(PackAssetRef.serializer(), json.encodeToString(PackAssetRef.serializer(), ref))).isEqualTo(ref)
    }
}
