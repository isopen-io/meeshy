package me.meeshy.core.database.crypto

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.security.InMemorySecureStore
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
    fun `un coffre qui ne sait plus relire la cle en regenere une et le signale`() {
        val (_, store) = provider()
        val original = DatabaseKeyProvider(store).obtain()
        val unreadable = InMemorySecureStore(allUnreadable = true)

        val regenerated = DatabaseKeyProvider(unreadable).obtain()

        assertThat(regenerated.origin).isEqualTo(KeyOrigin.REGENERATED)
        assertThat(regenerated.hex()).isNotEqualTo(original.hex())
        assertThat(DatabaseKeyProvider(unreadable).obtain().origin).isEqualTo(KeyOrigin.EXISTING)
    }

    @Test
    fun `une cle illisible du coffre est regeneree`() {
        val store = InMemorySecureStore()
        store.put(DatabaseKeyProvider.KEY, "pas-une-cle", DatabaseKeyProvider.ACCOUNT)

        assertThat(DatabaseKeyProvider(store).obtain().origin).isEqualTo(KeyOrigin.REGENERATED)
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
