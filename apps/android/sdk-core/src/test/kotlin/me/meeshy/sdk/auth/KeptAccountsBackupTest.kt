package me.meeshy.sdk.auth

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.auth.SavedAccount
import me.meeshy.sdk.net.AccountShelf
import me.meeshy.sdk.net.AccountTokens
import me.meeshy.sdk.net.BackedUpAccount
import me.meeshy.sdk.net.BackedUpSession
import me.meeshy.sdk.net.InMemoryTokenStore
import me.meeshy.sdk.net.SessionBackup
import org.junit.Test

/**
 * #14079 — les comptes gardés « Rester connecté » survivent à la réinstallation, comme dans le Keychain iOS : chacun a
 * sa sauvegarde, la sortie d'un compte n'efface que la sienne, et l'installation neuve les remet dans le sélecteur.
 */
class KeptAccountsBackupTest {

    private class FakeShelf(initial: List<BackedUpAccount> = emptyList()) : AccountShelf {
        val held = initial.associateBy { it.userId }.toMutableMap()
        var writes = 0
        val erased = mutableListOf<String>()
        override suspend fun readAll(): List<BackedUpAccount> = held.values.toList()
        override fun save(account: BackedUpAccount) { writes += 1; held[account.userId] = account }
        override fun erase(userId: String) { erased += userId; held.remove(userId) }
    }

    private class FakeBackup(private val held: BackedUpSession? = null) : SessionBackup {
        override suspend fun read(): BackedUpSession? = held
        override fun save(session: BackedUpSession) = Unit
        override fun erase() = Unit
    }

    private fun account(id: String, at: Long = 0L, keeps: Boolean = true) =
        SavedAccount(id = id, username = "user-$id", displayName = "Name $id", avatarUrl = "https://a/$id.png", lastActiveAtMillis = at, keepsSession = keeps)

    private fun shelved(id: String) =
        BackedUpAccount(BackedUpSession(id, "jwt-$id", "sess-$id"), username = "user-$id", displayName = "Name $id", avatarUrl = "https://a/$id.png")

    private class Device(
        val tokens: InMemoryTokenStore = InMemoryTokenStore(),
        val shelf: FakeShelf = FakeShelf(),
        val accounts: InMemorySavedAccountsStore = InMemorySavedAccountsStore(),
        backup: SessionBackup = FakeBackup(),
    ) {
        val kept = KeptAccountsBackup(shelf, tokens, accounts, backup)

        fun signedIn(id: String) {
            tokens.keepDormant(id, AccountTokens("jwt-$id", "sess-$id"))
        }
    }

    @Test
    fun `every kept account with a session has its own backup, with what the selector shows`() {
        val d = Device()
        d.signedIn("a")
        d.signedIn("b")

        d.kept.sync(listOf(account("a", at = 2), account("b", at = 1)))

        assertThat(d.shelf.held.keys).containsExactly("a", "b")
        assertThat(d.shelf.held.getValue("b")).isEqualTo(shelved("b"))
    }

    @Test
    fun `an account not kept signed in is never backed up, and leaving the choice erases it`() {
        val d = Device()
        d.signedIn("a")
        d.kept.sync(listOf(account("a")))

        d.kept.sync(listOf(account("a", keeps = false)))

        assertThat(d.shelf.held).isEmpty()
        assertThat(d.shelf.erased).containsExactly("a")
    }

    @Test
    fun `removing an account erases its backup only`() {
        val d = Device()
        d.signedIn("a")
        d.signedIn("b")
        d.kept.sync(listOf(account("a"), account("b")))

        d.kept.sync(listOf(account("b")))

        assertThat(d.shelf.held.keys).containsExactly("b")
        assertThat(d.shelf.erased).containsExactly("a")
    }

    @Test
    fun `an account without a session has no backup`() {
        val d = Device()
        d.signedIn("a")

        d.kept.sync(listOf(account("a"), account("ghost")))

        assertThat(d.shelf.held.keys).containsExactly("a")
    }

    @Test
    fun `the Block Store keeps at most fifteen accounts, the most recent ones`() {
        val d = Device()
        val all = (1..20).map { i -> account("u$i", at = i.toLong()).also { d.signedIn(it.id) } }

        d.kept.sync(all)

        assertThat(d.shelf.held).hasSize(AccountShelf.MAX_ACCOUNTS)
        assertThat(d.shelf.held.keys).doesNotContain("u1")
        assertThat(d.shelf.held.keys).contains("u20")
    }

    @Test
    fun `a sync that changes nothing writes nothing`() {
        val d = Device()
        d.signedIn("a")
        d.kept.sync(listOf(account("a")))

        d.kept.sync(listOf(account("a")))

        assertThat(d.shelf.writes).isEqualTo(1)
    }

    @Test
    fun `a fresh install puts the kept accounts back in the selector, signed in, except the one reopening`() = runTest {
        val d = Device(
            shelf = FakeShelf(listOf(shelved("active"), shelved("b"), shelved("c"))),
            backup = FakeBackup(BackedUpSession("active", "jwt-active", "sess-active")),
        )

        val restored = d.kept.restoreDormant()

        assertThat(restored).isEqualTo(2)
        assertThat(d.accounts.accounts.value.map { it.id }).containsExactly("b", "c")
        assertThat(d.accounts.accounts.value.first { it.id == "b" }.username).isEqualTo("user-b")
        assertThat(d.accounts.accounts.value.all { it.keepsSession }).isTrue()
        assertThat(d.tokens.tokensOf("b")).isEqualTo(AccountTokens("jwt-b", "sess-b"))
        assertThat(d.tokens.tokensOf("active")).isNull()
        assertThat(d.tokens.isAuthenticated).isFalse()
    }

    @Test
    fun `an account the device already knows is not put back`() = runTest {
        val d = Device(shelf = FakeShelf(listOf(shelved("b"))))
        d.accounts.upsert(account("b").copy(username = "renamed"))

        assertThat(d.kept.restoreDormant()).isEqualTo(0)
        assertThat(d.accounts.accounts.value.single().username).isEqualTo("renamed")
    }

    @Test
    fun `the open account is never put back as a dormant one`() = runTest {
        val tokens = InMemoryTokenStore(jwt = "jwt-me", sessionToken = "sess-me", userId = "me")
        val d = Device(tokens = tokens, shelf = FakeShelf(listOf(shelved("me"))))

        assertThat(d.kept.restoreDormant()).isEqualTo(0)
        assertThat(tokens.jwt).isEqualTo("jwt-me")
    }

    @Test
    fun `after a restart, an entry the device no longer wants is erased by the first sync`() = runTest {
        val d = Device(shelf = FakeShelf(listOf(shelved("k"), shelved("gone"))))
        d.accounts.upsert(account("k", keeps = false))

        d.kept.restoreDormant()
        d.kept.sync(d.accounts.accounts.value)

        assertThat(d.shelf.erased).containsExactly("k")
        assertThat(d.shelf.held.keys).containsExactly("gone")
        assertThat(d.accounts.accounts.value.single { it.id == "gone" }.keepsSession).isTrue()
    }

    @Test
    fun `entries that leave are erased before new ones are written, so the Block Store never overflows`() {
        val order = mutableListOf<String>()
        val shelf = object : AccountShelf {
            override suspend fun readAll(): List<BackedUpAccount> = emptyList()
            override fun save(account: BackedUpAccount) { order += "save:${account.userId}" }
            override fun erase(userId: String) { order += "erase:$userId" }
        }
        val tokens = InMemoryTokenStore()
        val kept = KeptAccountsBackup(shelf, tokens, InMemorySavedAccountsStore(), FakeBackup())
        listOf("a", "b").forEach { tokens.keepDormant(it, AccountTokens("jwt-$it", "sess-$it")) }
        kept.sync(listOf(account("a")))
        order.clear()

        kept.sync(listOf(account("b")))

        assertThat(order).containsExactly("erase:a", "save:b").inOrder()
    }
}
