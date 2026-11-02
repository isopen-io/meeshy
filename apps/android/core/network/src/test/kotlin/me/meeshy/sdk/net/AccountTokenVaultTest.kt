package me.meeshy.sdk.net

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.security.InMemorySecureStore
import org.junit.Test

class AccountTokenVaultTest {
    private fun vault(store: InMemorySecureStore = InMemorySecureStore()) = EncryptedAccountTokenVault(store)

    @Test
    fun `les jetons de deux comptes ne se melangent jamais`() {
        val vault = vault()
        vault.save("A", AccountTokens("jwtA", "sessA"))
        vault.save("B", AccountTokens("jwtB", null))
        assertThat(vault.tokens("A")).isEqualTo(AccountTokens("jwtA", "sessA"))
        assertThat(vault.tokens("B")).isEqualTo(AccountTokens("jwtB", null))
        assertThat(vault.tokens("C")).isNull()
    }

    @Test
    fun `retirer un compte ne touche pas les autres`() {
        val vault = vault()
        vault.save("A", AccountTokens("a", null))
        vault.save("B", AccountTokens("b", null))
        vault.remove("A")
        assertThat(vault.hasTokens("A")).isFalse()
        assertThat(vault.hasTokens("B")).isTrue()
        assertThat(vault.accountsWithTokens(listOf("A", "B", "C"))).containsExactly("B")
    }

    @Test
    fun `les anciennes cles nues sont adoptees puis supprimees`() {
        val store = InMemorySecureStore()
        store.put("jwt", "old")
        store.put("session_token", "oldSess")
        val vault = vault(store)
        vault.adoptLegacyTokens("A")
        assertThat(vault.tokens("A")).isEqualTo(AccountTokens("old", "oldSess"))
        assertThat(store.get("jwt")).isNull()
        vault.adoptLegacyTokens("A")
        assertThat(vault.tokens("A")).isEqualTo(AccountTokens("old", "oldSess"))
    }
}
