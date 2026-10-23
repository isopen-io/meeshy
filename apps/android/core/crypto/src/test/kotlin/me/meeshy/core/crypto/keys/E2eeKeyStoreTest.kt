package me.meeshy.core.crypto.keys

import com.google.common.truth.Truth.assertThat
import me.meeshy.core.crypto.primitives.CryptoException
import me.meeshy.sdk.model.security.InMemorySecureStore
import org.junit.Assert.assertThrows
import org.junit.Test

class E2eeKeyStoreTest {
    private fun keyStore(vault: InMemorySecureStore = InMemorySecureStore(), account: String? = "u1") =
        E2eeKeyStore(vault, account)

    @Test
    fun `l'identite est creee une fois puis relue a l'identique`() {
        val vault = InMemorySecureStore()
        val first = keyStore(vault).getOrGenerateIdentityKey()
        val again = keyStore(vault).getOrGenerateIdentityKey()
        assertThat(again.publicKey).isEqualTo(first.publicKey)
        assertThat(first.publicKey).hasLength(32)
    }

    @Test
    fun `identite signed prekey one-time prekey et signature sont quatre materiaux distincts`() {
        val keys = keyStore()
        val all = listOf(
            keys.getOrGenerateIdentityKey().publicKey.toList(),
            keys.getOrGenerateSignedPreKey().publicKey.toList(),
            keys.getOrGenerateOneTimePreKey().publicKey.toList(),
            keys.getOrGenerateSigningKey().publicKey.toList(),
        )
        assertThat(all.toSet()).hasSize(4)
    }

    @Test
    fun `la signature releve la meme cle apres relecture`() {
        val vault = InMemorySecureStore()
        val first = keyStore(vault).getOrGenerateSigningKey().publicKey
        assertThat(keyStore(vault).getOrGenerateSigningKey().publicKey).isEqualTo(first)
    }

    @Test
    fun `les identifiants sont dans 1 a 65535 et stables`() {
        val vault = InMemorySecureStore()
        val keys = keyStore(vault)
        val ids = listOf(keys.registrationId(), keys.preKeyId(), keys.signedPreKeyId())
        ids.forEach { assertThat(it).isIn(1..65535) }
        val reread = keyStore(vault)
        assertThat(listOf(reread.registrationId(), reread.preKeyId(), reread.signedPreKeyId())).isEqualTo(ids)
    }

    @Test
    fun `l'identifiant est persiste en Int32 petit-boutiste base64 comme sur iOS`() {
        val vault = InMemorySecureStore()
        E2eeKeyStore(vault, "u1", ids = { 0x0102 }).registrationId()
        assertThat(vault.get("me.meeshy.e2ee.registrationId", "u1")).isEqualTo("AgEAAA==")
    }

    @Test
    fun `un identifiant hors plage est regenere`() {
        val vault = InMemorySecureStore()
        vault.put("me.meeshy.e2ee.preKeyId", "AAAAAA==", "u1")
        assertThat(E2eeKeyStore(vault, "u1", ids = { 9 }).preKeyId()).isEqualTo(9)
    }

    @Test
    fun `clearAll efface les cles du compte sans toucher au reste du coffre`() {
        val vault = InMemorySecureStore()
        val keys = keyStore(vault)
        keys.getOrGenerateIdentityKey(); keys.getOrGenerateSigningKey(); keys.registrationId()
        vault.put("jwt", "x", "u1")
        keys.clearAll()
        assertThat(vault.keys("u1")).containsExactly("jwt")
        assertThat(keyStore(vault).getOrGenerateIdentityKey().publicKey).isNotEmpty()
    }

    @Test
    fun `deux comptes ont deux identites`() {
        val vault = InMemorySecureStore()
        val a = keyStore(vault, "a").getOrGenerateIdentityKey().publicKey
        val b = keyStore(vault, "b").getOrGenerateIdentityKey().publicKey
        assertThat(a).isNotEqualTo(b)
    }

    @Test
    fun `une cle qui ne peut pas etre persistee n'est jamais rendue`() {
        val keys = keyStore(InMemorySecureStore(failWrites = true))
        assertThrows(CryptoException::class.java) { keys.getOrGenerateIdentityKey() }
        assertThrows(CryptoException::class.java) { keys.registrationId() }
    }

    @Test
    fun `une valeur corrompue du coffre est remplacee`() {
        val vault = InMemorySecureStore()
        vault.put("me.meeshy.e2ee.identityKey", "pas-du-base64!", "u1")
        assertThat(keyStore(vault).getOrGenerateIdentityKey().publicKey).hasLength(32)
    }

    @Test
    fun `toString de la paire n'imprime aucun octet`() {
        assertThat(keyStore().getOrGenerateIdentityKey().toString()).isEqualTo("X25519KeyPair")
    }
}
