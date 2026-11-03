package me.meeshy.sdk.session

import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import me.meeshy.core.datastore.SecretVault
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.security.SecureStore
import me.meeshy.sdk.net.TokenStore
import javax.inject.Inject
import javax.inject.Singleton

/**
 * [SignedInIdentityStore] sur le coffre ([AuthProfileVault]) : le profil du compte actif se relit AVANT la
 * revalidation réseau, et se réécrit à chaque adoption ou relecture. Les écritures passent l'une après l'autre (la plus
 * récente compte) hors du fil appelant — le Keystore ne bloque jamais l'interface — et un profil dont le compte n'est
 * plus celui des jetons n'est jamais écrit. Une installation antérieure, qui gardait le profil dans le cache disque,
 * est relue une dernière fois depuis [legacy].
 */
class VaultSignedInIdentityStore(
    private val vault: AuthProfileVault,
    private val tokens: TokenStore,
    private val legacy: SignedInIdentityStore,
    scope: CoroutineScope,
) : SignedInIdentityStore {

    private val pending = Channel<MeeshyUser>(Channel.CONFLATED)
    private val vaultAccess = Mutex()

    init {
        scope.launch { for (user in pending) vaultAccess.withLock { write(user) } }
    }

    override suspend fun recall(userId: String): MeeshyUser? {
        val fromVault = try {
            withContext(Dispatchers.IO) { vault.load(userId) }
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (_: Exception) {
            null
        }
        return fromVault ?: legacy.recall(userId)
    }

    override fun remember(user: MeeshyUser) {
        pending.trySend(user)
    }

    /**
     * Efface le profil de [userId] du coffre où il est écrit. Appelée APRÈS que les jetons ont quitté ce compte : une
     * écriture en cours finit d'abord (verrou), puis l'effacement passe ; toute écriture suivante voit un compte qui n'est
     * plus celui des jetons et ne revient pas. Le profil des autres comptes n'est pas touché.
     */
    override suspend fun forget(userId: String) {
        withContext(Dispatchers.IO) { vaultAccess.withLock { vault.clear(userId) } }
    }

    private fun write(user: MeeshyUser) {
        if (user.id.isBlank() || tokens.userId != user.id) return
        vault.save(user)
        if (tokens.userId == null) vault.clear(user.id)
    }
}

@Module
@InstallIn(SingletonComponent::class)
object VaultSignedInIdentityStoreModule {
    @Provides
    @Singleton
    fun signedInIdentityStore(
        @SecretVault secureStore: SecureStore,
        tokens: TokenStore,
        legacy: DiskSignedInIdentityStore,
    ): SignedInIdentityStore = VaultSignedInIdentityStore(
        vault = AuthProfileVault(secureStore),
        tokens = tokens,
        legacy = legacy,
        scope = CoroutineScope(SupervisorJob() + Dispatchers.IO),
    )
}
