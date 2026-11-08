package me.meeshy.core.database.crypto

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.security.InMemorySecureStore
import me.meeshy.sdk.model.security.SecureKeyNamespace
import me.meeshy.sdk.model.security.SecureRead
import me.meeshy.sdk.model.security.SecureStore
import org.junit.Assert.assertThrows
import org.junit.Test

class DatabaseKeyProviderTest {

    private fun provider(store: InMemorySecureStore = InMemorySecureStore()) = DatabaseKeyProvider(store) to store

    @Test
    fun `une cle de 32 octets est creee une fois puis relue a l'identique`() {
        val (first, store) = provider()
        val created = first.obtain()
        val reread = DatabaseKeyProvider(store).obtain()

        assertThat(created.origin).isEqualTo(KeyOrigin.CREATED)
        assertThat(created.hex()).hasLength(64)
        assertThat(reread.origin).isEqualTo(KeyOrigin.EXISTING)
        assertThat(reread.hex()).isEqualTo(created.hex())
    }

    @Test
    fun `la phrase secrete est la forme cle brute et ne fuit pas par toString`() {
        val key = provider().first.obtain()

        assertThat(String(key.passphrase(), Charsets.US_ASCII)).isEqualTo("x'${key.hex()}'")
        assertThat(key.toString()).doesNotContain(key.hex())
    }

    @Test
    fun `un coffre recree de facon certaine regenere la cle et le signale`() {
        val (_, store) = provider()
        val original = DatabaseKeyProvider(store).obtain()
        val unreadable = InMemorySecureStore(allUnreadable = true)

        val regenerated = DatabaseKeyProvider(unreadable).obtain()

        assertThat(regenerated.origin).isEqualTo(KeyOrigin.REGENERATED)
        assertThat(regenerated.hex()).isNotEqualTo(original.hex())
        assertThat(DatabaseKeyProvider(unreadable).obtain().origin).isEqualTo(KeyOrigin.EXISTING)
    }

    @Test
    fun `une cle illisible du coffre n'est jamais ecrasee et l'ouverture se replie en memoire`() {
        val store = InMemorySecureStore()
        store.put(DatabaseKeyProvider.KEY, "pas-une-cle", DatabaseKeyProvider.ACCOUNT)

        assertThrows(DatabaseKeyUnavailableException::class.java) { DatabaseKeyProvider(store).obtain() }

        assertThat(store.get(DatabaseKeyProvider.KEY, DatabaseKeyProvider.ACCOUNT)).isEqualTo("pas-une-cle")
    }

    @Test
    fun `une entree du coffre momentanement illisible n'est pas ecrasee et reste pour le lancement suivant`() {
        val original = DatabaseKeyProvider(InMemorySecureStore()).obtain()
        val composed = SecureKeyNamespace.compose(DatabaseKeyProvider.ACCOUNT, DatabaseKeyProvider.KEY)
        val flaky = InMemorySecureStore(unreadableKeys = setOf(composed)).also {
            it.put(DatabaseKeyProvider.KEY, original.hex(), DatabaseKeyProvider.ACCOUNT)
        }

        assertThrows(DatabaseKeyUnavailableException::class.java) { DatabaseKeyProvider(flaky).obtain() }

        assertThat(flaky.get(DatabaseKeyProvider.KEY, DatabaseKeyProvider.ACCOUNT)).isEqualTo(original.hex())
    }

    @Test
    fun `un coffre qui a abandonne n'ecrit rien et la cle se retente au lancement suivant`() {
        val vault = GaveUpVault()

        assertThrows(DatabaseKeyUnavailableException::class.java) { DatabaseKeyProvider(vault).obtain() }

        assertThat(vault.writes).isEqualTo(0)
    }

    /** Le coffre Keystore qui a renonce (`gaveUp`) : toute lecture est illisible, toute ecriture refusee. */
    private class GaveUpVault : SecureStore {
        var writes = 0
        override fun get(key: String, account: String?): String? = null
        override fun read(key: String, account: String?): SecureRead = SecureRead.Unreadable
        override fun put(key: String, value: String, account: String?): Boolean {
            writes++
            return false
        }
        override fun remove(key: String, account: String?) = Unit
        override fun keys(account: String?): Set<String> = emptySet()
        override fun clearAccount(account: String) = Unit
        override fun clearAll() = Unit
    }

    @Test(expected = DatabaseEncryptionException::class)
    fun `un coffre qui refuse l'ecriture fait lever sans repli`() {
        DatabaseKeyProvider(InMemorySecureStore(failWrites = true)).obtain()
    }

    @Test
    fun `destroyKey rend la cle suivante nouvelle`() {
        val (keys, store) = provider()
        val before = keys.obtain().hex()
        keys.destroyKey()

        val after = DatabaseKeyProvider(store).obtain()

        assertThat(after.origin).isEqualTo(KeyOrigin.CREATED)
        assertThat(after.hex()).isNotEqualTo(before)
    }
}
