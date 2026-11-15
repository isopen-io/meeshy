package me.meeshy.sdk.session

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.auth.InMemorySavedAccountsStore
import me.meeshy.sdk.model.auth.SavedAccount
import me.meeshy.sdk.net.AccountShelf
import me.meeshy.sdk.net.BackedUpAccount
import me.meeshy.sdk.net.BackedUpSession
import me.meeshy.sdk.net.InMemoryTokenStore
import me.meeshy.sdk.net.SessionBackup
import me.meeshy.sdk.net.SessionRefusalNotifier
import org.junit.Test

class SessionRefusalCenterTest {
    private class Shelf : AccountShelf {
        val erased = mutableListOf<String>()
        override suspend fun readAll(): List<BackedUpAccount> = emptyList()
        override fun save(account: BackedUpAccount) = Unit
        override fun erase(userId: String) { erased += userId }
    }

    private class Backup(var saved: BackedUpSession?) : SessionBackup {
        override suspend fun read(): BackedUpSession? = saved
        override fun save(session: BackedUpSession) { saved = session }
        override fun erase() { saved = null }
    }

    private class Rig(active: String?, backupOf: String? = active) {
        val order = mutableListOf<String>()
        val notifier = SessionRefusalNotifier()
        val tokens = InMemoryTokenStore(jwt = "jwt", sessionToken = "s", userId = active)
        val saved = InMemorySavedAccountsStore(
            listOf("u1", "u2").map { SavedAccount(it, "name-$it", null, null, 1L) },
        )
        val shelf = Shelf()
        val backup = Backup(backupOf?.let { BackedUpSession(it, "jwt", "s") })
        val center = SessionRefusalCenter(
            notifier, tokens, saved, shelf, backup,
            stopSocket = { order += "socket-stopped" },
            closeSession = { order += "purged-awaiting=${notifier.isAwaitingRetirement("u1")}"; tokens.clear() },
        )
    }

    @Test
    fun `le compte actif supprime ferme la socket, purge l appareil puis leve l ecran session fermee`() = runTest {
        val rig = Rig(active = "u1")
        rig.notifier.notifyAccountDeleted("u1")
        rig.center.retire("u1")

        assertThat(rig.order).containsExactly("socket-stopped", "purged-awaiting=true").inOrder()
        assertThat(rig.center.closed.value).isTrue()
        assertThat(rig.tokens.isAuthenticated).isFalse()
    }

    @Test
    fun `le compte quitte le selecteur, le coffre des comptes gardes et la sauvegarde de session`() = runTest {
        val rig = Rig(active = "u1")
        rig.notifier.notifyAccountDeleted("u1")
        rig.center.retire("u1")

        assertThat(rig.saved.accounts.value.map { it.id }).containsExactly("u2")
        assertThat(rig.shelf.erased).containsExactly("u1")
        assertThat(rig.backup.saved).isNull()
    }

    @Test
    fun `la mise en attente de retrait ne se leve qu apres le retrait`() = runTest {
        val rig = Rig(active = "u1")
        rig.notifier.notifyAccountDeleted("u1")
        assertThat(rig.notifier.isAwaitingRetirement("u1")).isTrue()
        rig.center.retire("u1")
        assertThat(rig.notifier.isAwaitingRetirement("u1")).isFalse()
    }

    @Test
    fun `un compte dormant supprime est retire sans fermer la session active ni lever d ecran`() = runTest {
        val rig = Rig(active = "u2", backupOf = "u2")
        rig.notifier.notifyAccountDeleted("u1")
        rig.center.retire("u1")

        assertThat(rig.order).isEmpty()
        assertThat(rig.center.closed.value).isFalse()
        assertThat(rig.tokens.isAuthenticated).isTrue()
        assertThat(rig.saved.accounts.value.map { it.id }).containsExactly("u2")
        assertThat(rig.backup.saved).isNotNull()
    }

    @Test
    fun `l ecran se retire a l acquittement`() = runTest {
        val rig = Rig(active = "u1")
        rig.center.retire("u1")
        rig.center.acknowledgeClosed()
        assertThat(rig.center.closed.value).isFalse()
    }
}
