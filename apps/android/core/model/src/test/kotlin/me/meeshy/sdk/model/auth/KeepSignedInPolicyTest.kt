package me.meeshy.sdk.model.auth

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class KeepSignedInPolicyTest {

    private fun account(id: String) = SavedAccount(id, "u$id", null, null, 0L)

    @Test
    fun `le premier compte est garde sans question`() {
        assertThat(KeepSignedInPolicy.offers(emptyList(), null, emptySet())).isFalse()
        assertThat(KeepSignedInPolicy.keepsNewSession(offered = false, toggle = false)).isTrue()
    }

    @Test
    fun `la case est proposee quand un autre compte garde sa session`() {
        val accounts = listOf(account("1"))

        assertThat(KeepSignedInPolicy.offers(accounts, activeId = null, accountsWithTokens = setOf("1"))).isTrue()
        assertThat(KeepSignedInPolicy.keepsNewSession(offered = true, toggle = false)).isFalse()
        assertThat(KeepSignedInPolicy.keepsNewSession(offered = true, toggle = true)).isTrue()
    }

    @Test
    fun `le compte actif ou sans jeton ne la fait pas proposer`() {
        val accounts = listOf(account("1"))

        assertThat(KeepSignedInPolicy.offers(accounts, activeId = "1", accountsWithTokens = setOf("1"))).isFalse()
        assertThat(KeepSignedInPolicy.offers(accounts, activeId = null, accountsWithTokens = emptySet())).isFalse()
    }
}
