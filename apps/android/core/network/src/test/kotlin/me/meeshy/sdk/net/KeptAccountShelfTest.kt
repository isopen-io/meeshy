package me.meeshy.sdk.net

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * #14079 — un compte gardé « Rester connecté » a son entrée au coffre hors de l'app, liée à CET appareil, et la sienne
 * seulement part avec lui. Le porte-jetons sait aussi rendre et endormir les jetons d'un compte qui n'est pas actif.
 */
class KeptAccountShelfTest {

    private val account = BackedUpAccount(
        session = BackedUpSession(userId = "u2", jwt = "jwt-2", sessionToken = "sess-2"),
        username = "bob",
        displayName = "Bob",
        avatarUrl = "https://cdn.meeshy.me/a.png",
    )

    private class RecordingShelf : AccountShelf {
        val erased = mutableListOf<String>()
        override suspend fun readAll(): List<BackedUpAccount> = emptyList()
        override fun save(account: BackedUpAccount) = Unit
        override fun erase(userId: String) {
            erased += userId
        }
    }

    private object NullBackup : SessionBackup {
        override suspend fun read(): BackedUpSession? = null
        override fun save(session: BackedUpSession) = Unit
        override fun erase() = Unit
    }

    @Test
    fun `un compte garde se relit sur le meme appareil`() {
        val bytes = account.encode("device-1")!!

        assertThat(BackedUpAccount.decode(bytes, "device-1")).isEqualTo(account)
    }

    @Test
    fun `un compte garde ne se relit pas sur un autre appareil`() {
        val bytes = account.encode("device-1")!!

        assertThat(BackedUpAccount.decode(bytes, "device-2")).isNull()
    }

    @Test
    fun `une charge illisible ou incomplete se lit comme une absence`() {
        val incomplete = account.copy(session = account.session.copy(sessionToken = "")).encode("device-1")!!

        assertThat(BackedUpAccount.decode("pas du json".toByteArray(), "device-1")).isNull()
        assertThat(BackedUpAccount.decode(incomplete, "device-1")).isNull()
    }

    @Test
    fun `une entree qui depasse ce que porte le block store ne part pas`() {
        val huge = account.copy(displayName = "x".repeat(BackedUpAccount.MAX_ENTRY_BYTES))

        assertThat(huge.encode("device-1")).isNull()
    }

    @Test
    fun `la deconnexion du compte actif n'efface que son entree au coffre`() {
        val shelf = RecordingShelf()
        val store = BackedUpTokenStore(InMemoryTokenStore(jwt = "jwt-1", sessionToken = "sess-1", userId = "u1"), NullBackup, shelf = shelf)

        store.clear()

        assertThat(shelf.erased).containsExactly("u1")
    }

    @Test
    fun `un compte endormi garde ses jetons sans devenir actif`() {
        val store = InMemoryTokenStore(jwt = "jwt-1", sessionToken = "sess-1", userId = "u1")

        store.keepDormant("u2", AccountTokens("jwt-2", "sess-2"))

        assertThat(store.userId).isEqualTo("u1")
        assertThat(store.jwt).isEqualTo("jwt-1")
        assertThat(store.tokensOf("u2")).isEqualTo(AccountTokens("jwt-2", "sess-2"))
        assertThat(store.accountsWithTokens(listOf("u1", "u2", "u3"))).containsExactly("u1", "u2")
    }

    @Test
    fun `endormir le compte actif ne remplace jamais sa session`() {
        val store = InMemoryTokenStore(jwt = "jwt-1", sessionToken = "sess-1", userId = "u1")

        store.keepDormant("u1", AccountTokens("old", "old"))

        assertThat(store.tokensOf("u1")).isEqualTo(AccountTokens("jwt-1", "sess-1"))
    }
}
