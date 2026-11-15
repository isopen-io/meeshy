package me.meeshy.sdk.auth

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.mockk
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.security.InMemorySecureStore
import me.meeshy.sdk.net.EncryptedTokenStore
import me.meeshy.sdk.net.SessionTransitionFlags
import me.meeshy.sdk.net.api.AuthApi
import me.meeshy.sdk.session.AuthProfileVault
import me.meeshy.sdk.session.PendingProfileEdits
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.session.SessionTeardown
import me.meeshy.sdk.session.SignedInIdentityStore
import me.meeshy.sdk.session.VaultSignedInIdentityStore
import me.meeshy.sdk.sync.SyncSeqTracker
import org.junit.After
import org.junit.Test

/**
 * Le câblage de production : les jetons et le profil vivent dans DEUX coffres distincts. Le seul faux est l'API réseau.
 * Un effacement qui viserait le mauvais coffre laisse `meeshy_user_<id>` dans celui du profil, et ces tests tombent (#14840).
 */
class AuthRepositoryProfileErasureTest {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val alice = MeeshyUser(id = "A", username = "alice", displayName = "Alice")
    private val bob = MeeshyUser(id = "B", username = "bob", displayName = "Bob")

    @After fun tearDown() = scope.cancel()

    private class Wiring(
        val repository: AuthRepository,
        val tokenVault: InMemorySecureStore,
        val profileVault: InMemorySecureStore,
    )

    private fun wiring(profileStoreOfTokens: Boolean): Wiring {
        val tokenVault = InMemorySecureStore()
        val profileVault = InMemorySecureStore()
        val tokens = EncryptedTokenStore(tokenVault, profileVault.takeIf { profileStoreOfTokens })
        val identities: SignedInIdentityStore =
            VaultSignedInIdentityStore(AuthProfileVault(profileVault), tokens, SignedInIdentityStore.NONE, scope)
        val api = mockk<AuthApi>().apply { coEvery { logout(any(), any()) } returns ApiResponse(success = true) }
        val session = SessionRepository(api, tokens, SessionTransitionFlags(), PendingProfileEdits.NONE, identities)
        val teardown = object : SessionTeardown {
            override suspend fun wipe() = Unit
        }
        tokens.userId = "A"
        tokens.jwt = "jwt-a"
        AuthProfileVault(profileVault).save(alice)
        AuthProfileVault(profileVault).save(bob)
        return Wiring(AuthRepository(api, tokens, session, teardown, SyncSeqTracker()), tokenVault, profileVault)
    }

    @Test
    fun `apres logout le profil du compte sortant a disparu du coffre du profil, celui d'un compte dormant reste`() = runTest {
        val w = wiring(profileStoreOfTokens = false)
        assertThat(w.profileVault.get("meeshy_user_A", "A")).isNotNull()

        w.repository.logout()

        assertThat(w.profileVault.get("meeshy_user_A", "A")).isNull()
        assertThat(w.profileVault.get("meeshy_user_B", "B")).isNotNull()
        assertThat(w.tokenVault.get("meeshy_user_A", "A")).isNull()
    }

    @Test
    fun `le retrait des jetons par un refus 401 efface aussi le profil, sans passer par la deconnexion`() = runTest {
        val w = wiring(profileStoreOfTokens = true)
        val tokens = EncryptedTokenStore(w.tokenVault, w.profileVault)

        tokens.clear()

        assertThat(w.profileVault.get("meeshy_user_A", "A")).isNull()
        assertThat(w.profileVault.get("meeshy_user_B", "B")).isNotNull()
    }
}
