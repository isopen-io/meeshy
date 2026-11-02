package me.meeshy.sdk.session

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.launch
import me.meeshy.core.database.dao.KeyedJsonCacheDao
import me.meeshy.sdk.cache.KeyedJsonCache
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.net.TokenStore
import javax.inject.Inject
import javax.inject.Singleton

/**
 * L'identité du compte connecté telle qu'elle survit à un redémarrage — le pendant de `saveUserToKeychain` iOS
 * (`AuthManager`). Un démarrage à froid sans réseau sert cette identité au lieu d'un compte sans nom : l'avatar, les
 * langues du Prisme et la couleur d'auteur restent ceux du compte (#14264).
 */
public interface SignedInIdentityStore {
    /** L'identité gardée pour [userId], `null` à froid ou si la charge ne se lit plus. */
    public suspend fun recall(userId: String): MeeshyUser?

    /** Garde [user] ; ne bloque jamais, et une écriture qui échoue ne garde rien. */
    public fun remember(user: MeeshyUser)

    public companion object {
        /** Aucune mémoire : rien n'est gardé ni rendu (tests, aperçus). */
        public val NONE: SignedInIdentityStore = object : SignedInIdentityStore {
            override suspend fun recall(userId: String): MeeshyUser? = null
            override fun remember(user: MeeshyUser) = Unit
        }
    }
}

/**
 * [SignedInIdentityStore] sur le cache JSON du disque (`session:identity`, clé = id du compte). Les écritures passent
 * l'une après l'autre et seule la plus récente compte ; une identité dont le compte n'est plus celui des jetons au moment
 * d'écrire n'est jamais écrite. La purge de session vide la table entière : rien ne survit chez le compte suivant.
 */
@Singleton
public class DiskSignedInIdentityStore(
    private val cache: KeyedJsonCache,
    private val tokens: TokenStore,
    scope: CoroutineScope,
) : SignedInIdentityStore {

    @Inject
    public constructor(dao: KeyedJsonCacheDao, tokens: TokenStore) :
        this(KeyedJsonCache(dao), tokens, CoroutineScope(SupervisorJob() + Dispatchers.IO))

    private val pending = Channel<MeeshyUser>(Channel.CONFLATED)

    init {
        scope.launch { for (user in pending) write(user) }
    }

    override suspend fun recall(userId: String): MeeshyUser? {
        if (userId.isBlank()) return null
        return try {
            cache.get(NAMESPACE, userId, MeeshyUser.serializer())?.value
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (_: Exception) {
            null
        }
    }

    override fun remember(user: MeeshyUser) {
        pending.trySend(user)
    }

    private suspend fun write(user: MeeshyUser) {
        if (user.id.isBlank() || tokens.userId != user.id) return
        try {
            cache.put(NAMESPACE, user.id, user, MeeshyUser.serializer(), ticket = null)
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (_: Exception) {
            Unit
        }
    }

    private companion object {
        const val NAMESPACE = "session:identity"
    }
}

@Module
@InstallIn(SingletonComponent::class)
public interface SignedInIdentityStoreModule {
    @Binds
    public fun signedInIdentityStore(impl: DiskSignedInIdentityStore): SignedInIdentityStore
}
