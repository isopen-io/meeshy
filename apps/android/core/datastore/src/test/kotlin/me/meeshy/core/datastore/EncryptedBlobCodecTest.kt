package me.meeshy.core.datastore

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.security.SecureRead
import me.meeshy.sdk.model.security.SecureStore
import org.junit.Assert.assertThrows
import org.junit.Test

class EncryptedBlobCodecTest {

    private class MapVault(var unreadable: Boolean = false, var writable: Boolean = true) : SecureStore {
        val map = mutableMapOf<String, String>()
        override fun get(key: String, account: String?) = map[key]
        override fun read(key: String, account: String?): SecureRead = when {
            unreadable -> SecureRead.Unreadable
            else -> map[key]?.let(SecureRead::Present) ?: SecureRead.Absent
        }
        override fun put(key: String, value: String, account: String?): Boolean {
            if (writable) map[key] = value
            return writable
        }
        override fun remove(key: String, account: String?) { map.remove(key) }
        override fun keys(account: String?) = map.keys
        override fun clearAccount(account: String) {}
        override fun clearAll() { map.clear() }
    }

    private fun codec(vault: SecureStore = MapVault()) = EncryptedBlobCodec(VaultBlobKeySource(vault))

    @Test
    fun `a sealed blob opens back to the same text and carries the version prefix`() {
        val codec = codec()

        val stored = codec.seal("""{"text":"brouillon"}""", "draft:c1")

        assertThat(stored).startsWith(EncryptedBlobCodec.PREFIX)
        assertThat(stored).doesNotContain("brouillon")
        assertThat(codec.open(stored, "draft:c1")).isEqualTo("""{"text":"brouillon"}""")
    }

    @Test
    fun `a clear text value written before encryption is still read and flagged legacy`() {
        val codec = codec()

        assertThat(codec.isLegacy("""{"a":1}""")).isTrue()
        assertThat(codec.open("""{"a":1}""", "k")).isEqualTo("""{"a":1}""")
        assertThat(codec.isLegacy(codec.seal("x", "k"))).isFalse()
    }

    @Test
    fun `a tampered blob is a cache miss, not a crash`() {
        val codec = codec()
        val stored = codec.seal("secret", "k")
        val tampered = stored.dropLast(6) + (if (stored.takeLast(6) == "AAAAAA") "BBBBBB" else "AAAAAA")

        assertThat(codec.open(tampered, "k")).isNull()
        assertThat(codec.open(EncryptedBlobCodec.PREFIX + "%%%", "k")).isNull()
    }

    @Test
    fun `a blob moved to another slot does not open`() {
        val codec = codec()

        assertThat(codec.open(codec.seal("secret", "draft:c1"), "draft:c2")).isNull()
    }

    @Test
    fun `a lost key makes the blob unreadable and never invents a new key on read`() {
        val vault = MapVault()
        val stored = codec(vault).seal("secret", "k")
        vault.map.clear()

        assertThat(codec(vault).open(stored, "k")).isNull()
        assertThat(vault.map).isEmpty()
    }

    @Test
    fun `sealing fails closed when the vault is unreadable or cannot store the key`() {
        assertThrows(IllegalStateException::class.java) { codec(MapVault(unreadable = true)).seal("x", "k") }
        assertThrows(IllegalStateException::class.java) { codec(MapVault(writable = false)).seal("x", "k") }
    }
}
