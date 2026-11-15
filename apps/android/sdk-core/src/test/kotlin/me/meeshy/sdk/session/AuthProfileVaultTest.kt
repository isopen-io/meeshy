package me.meeshy.sdk.session

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.security.InMemorySecureStore
import org.junit.Test

class AuthProfileVaultTest {
    private val alice = MeeshyUser(id = "u1", username = "alice", displayName = "Alice", systemLanguage = "fr")

    @Test
    fun `a saved profile reads back`() {
        val vault = AuthProfileVault(InMemorySecureStore())
        vault.save(alice)
        assertThat(vault.load("u1")).isEqualTo(alice)
    }

    @Test
    fun `data uri images are never written`() {
        val store = InMemorySecureStore()
        AuthProfileVault(store).save(alice.copy(avatar = "data:image/png;base64,AAAA", banner = "https://m.me/b.png"))
        val raw = store.get("meeshy_user_u1", "u1")!!
        assertThat(raw).doesNotContain("data:")
        assertThat(raw).contains("https://m.me/b.png")
    }

    @Test
    fun `a corrupted blob reads as null`() {
        val store = InMemorySecureStore()
        store.put("meeshy_user_u1", "{not json", "u1")
        assertThat(AuthProfileVault(store).load("u1")).isNull()
    }

    @Test
    fun `an account never reads another account's profile`() {
        val store = InMemorySecureStore()
        val vault = AuthProfileVault(store)
        vault.save(alice)
        assertThat(vault.load("u2")).isNull()
        store.put("meeshy_user_u2", store.get("meeshy_user_u1", "u1")!!, "u2")
        assertThat(vault.load("u2")).isNull()
    }

    @Test
    fun `clear removes the profile`() {
        val vault = AuthProfileVault(InMemorySecureStore())
        vault.save(alice)
        vault.clear("u1")
        assertThat(vault.load("u1")).isNull()
    }

    @Test
    fun `a failed write does not throw`() {
        val vault = AuthProfileVault(InMemorySecureStore(failWrites = true))
        vault.save(alice)
        assertThat(vault.load("u1")).isNull()
    }
}
