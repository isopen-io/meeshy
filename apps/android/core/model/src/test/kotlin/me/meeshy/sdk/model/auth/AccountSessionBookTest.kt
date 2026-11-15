package me.meeshy.sdk.model.auth

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

class AccountSessionBookTest {
    private fun account(id: String, keeps: Boolean = true) =
        SavedAccount(id, "u$id", null, null, 1L, keeps)

    @Test
    fun `un seul compte est actif a la fois`() {
        val book = AccountSessionBook().activate("A").activate("B")
        assertThat(book.activeId).isEqualTo("B")
    }

    @Test
    fun `quitter un compte garde ses jetons s'il est garde`() {
        val departure = AccountSessionBook().activate("A", keepSignedIn = true).leave()
        assertThat(departure.wipe).isNull()
        assertThat(departure.book.activeId).isNull()
    }

    @Test
    fun `quitter un compte non garde demande l'effacement de ses jetons`() {
        val departure = AccountSessionBook().activate("A").activate("B", keepSignedIn = false).leave()
        assertThat(departure.wipe).isEqualTo("B")
        assertThat(departure.book.keepsSession("A")).isTrue()
    }

    @Test
    fun `quitter sans compte actif ne fait rien`() {
        val departure = AccountSessionBook().leave()
        assertThat(departure.wipe).isNull()
    }

    @Test
    fun `retirer le compte actif le desactive et l'oublie`() {
        val book = AccountSessionBook().activate("A", false).forget("A")
        assertThat(book.activeId).isNull()
        assertThat(book.keepsSession("A")).isTrue()
    }

    @Test
    fun `etat d'une ligne courant connecte ou deconnecte`() {
        val book = AccountSessionBook().activate("A")
        val withTokens = setOf("A", "B")
        assertThat(book.rowState("A", withTokens)).isEqualTo(AccountRowState.CURRENT)
        assertThat(book.rowState("B", withTokens)).isEqualTo(AccountRowState.SIGNED_IN)
        assertThat(book.rowState("C", withTokens)).isEqualTo(AccountRowState.SIGNED_OUT)
    }

    @Test
    fun `la case rester connecte n'est proposee que si un autre compte est garde`() {
        val book = AccountSessionBook().activate("A")
        assertThat(book.offersKeepSignedIn(setOf("A"))).isFalse()
        assertThat(book.offersKeepSignedIn(setOf("A", "B"))).isTrue()
    }

    @Test
    fun `se construit depuis les comptes sauvegardes`() {
        val book = AccountSessionBook.of(listOf(account("A"), account("B", keeps = false)), "A")
        assertThat(book.activeId).isEqualTo("A")
        assertThat(book.keepsSession("B")).isFalse()
    }

    @Test
    fun `une ancienne entree sans keepsSession vaut garde`() {
        val old = """{"id":"A","username":"a","displayName":null,"avatarUrl":null,"lastActiveAtMillis":1}"""
        val decoded = Json { ignoreUnknownKeys = true }.decodeFromString(SavedAccount.serializer(), old)
        assertThat(decoded.keepsSession).isTrue()
    }
}
