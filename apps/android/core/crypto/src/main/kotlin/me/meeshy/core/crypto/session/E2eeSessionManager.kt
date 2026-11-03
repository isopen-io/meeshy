package me.meeshy.core.crypto.session

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.isActive
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import me.meeshy.core.crypto.keys.E2eeIdentityUnreadableException
import me.meeshy.core.crypto.keys.E2eeKeyStore
import me.meeshy.core.crypto.primitives.AesGcmCombined
import me.meeshy.core.crypto.primitives.CryptoException
import me.meeshy.sdk.model.security.SecureStore
import me.meeshy.sdk.model.signal.E2eeSessionCooldown

/**
 * Les sessions E2EE directes de l'appareil (parité `SessionManager` iOS, avec trois corrections).
 *
 * - Premier message vers un contact : bundle du pair, notification de la session, dérivation, persistance ;
 *   les envois suivants lisent la session du coffre sans réseau.
 * - Premier message REÇU d'un contact sans session : la session se dérive via le bundle de l'expéditeur
 *   (récupéré par la passerelle), pas via une identité que personne ne transmet.
 * - La dérivation est canonique ([SessionKeyDerivation]) : des messages croisés convergent sur la même clé.
 * - Un échec d'établissement n'est jamais un envoi en clair : [E2eeSessionException], et un cache négatif de
 *   600 s ; une annulation de coroutine ne l'alimente pas.
 *
 * Un seul verrou sérialise toutes les opérations. [currentUserId] est nul au démontage de session : le
 * dernier userId observé (mémoire puis coffre) désigne alors le compte SORTANT.
 */
public class E2eeSessionManager(
    private val vault: SecureStore,
    private val peers: PeerBundleSource,
    private val currentUserId: () -> String?,
    private val nowEpochMillis: () -> Long = System::currentTimeMillis,
    private val dispatcher: CoroutineDispatcher = Dispatchers.IO,
    private val keyStoreFor: (String) -> E2eeKeyStore = { E2eeKeyStore(vault, it) },
) : DirectMessageEncrypting, E2eeSessionClearer {
    private val mutex = Mutex()
    private val sessions = SessionKeyStore(vault)
    private val cipher = AesGcmCombined()
    private val active = HashMap<String, E2eeSession>()
    private val failedAt = HashMap<String, Long>()

    @Volatile
    private var lastKnownUserId: String? = null

    override suspend fun encryptMessage(payload: ByteArray, userId: String, conversationId: String): EncryptedDirectPayload =
        withContext(dispatcher) {
            val session = mutex.withLock { sessionLocked(userId, conversationId) }
            EncryptedDirectPayload(cipher.seal(session.key, payload), session.version)
        }

    /** Déchiffre un message d'un pair ; `null` si le contenu est altéré (bulle chiffrée illisible). */
    public suspend fun decryptMessage(ciphertext: ByteArray, fromUserId: String): ByteArray? = withContext(dispatcher) {
        val session = mutex.withLock { sessionLocked(fromUserId, conversationId = null) }
        cipher.open(session.key, ciphertext)
    }

    public suspend fun getOrCreateSession(peerId: String, conversationId: String): E2eeSession =
        withContext(dispatcher) { mutex.withLock { sessionLocked(peerId, conversationId) } }

    /** Migration de l'espace de noms, une fois par userId (le drapeau vit dans le coffre). */
    public suspend fun migrateNamespaceIfNeeded() {
        withContext(dispatcher) {
            mutex.withLock { observedUserId()?.let(sessions::migrateLegacyIfNeeded) }
        }
    }

    override suspend fun clearSessions() {
        withContext(dispatcher) {
            mutex.withLock {
                val userId = currentUserId() ?: lastKnownUserId ?: sessions.lastUserId()
                sessions.clear(userId)
                if (userId != null) keyStoreFor(userId).clearAll()
                sessions.forgetUserId()
                active.clear()
                failedAt.clear()
                lastKnownUserId = null
            }
        }
    }

    private suspend fun sessionLocked(peerId: String, conversationId: String?): E2eeSession {
        val userId = observedUserId() ?: throw E2eeSessionException(E2eeSessionFailure.NO_ACCOUNT)
        val cacheKey = "$userId/$peerId"
        (active[cacheKey] ?: sessions.load(userId, peerId))?.let { stored ->
            active[cacheKey] = stored
            return stored
        }
        if (E2eeSessionCooldown.isWithinFailureCooldown(failedAt[cacheKey], nowEpochMillis())) {
            throw E2eeSessionException(E2eeSessionFailure.COOLDOWN)
        }
        return try {
            establish(userId, peerId, conversationId).also {
                active[cacheKey] = it
                failedAt.remove(cacheKey)
            }
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (failure: Exception) {
            val refusal = failure as? E2eeSessionException ?: E2eeSessionException(E2eeSessionFailure.UNAVAILABLE)
            if (refusal.failure.feedsNegativeCache() && currentCoroutineContext().isActive) failedAt[cacheKey] = nowEpochMillis()
            throw refusal
        }
    }

    private suspend fun establish(userId: String, peerId: String, conversationId: String?): E2eeSession {
        val bundle = when (val lookup = fetch(peerId)) {
            is PeerBundleLookup.Found -> lookup.bundle
            PeerBundleLookup.NotPublished -> throw E2eeSessionException(E2eeSessionFailure.KEYS_NOT_PUBLISHED)
            PeerBundleLookup.Malformed -> throw E2eeSessionException(E2eeSessionFailure.MALFORMED_BUNDLE)
            PeerBundleLookup.Unavailable -> throw E2eeSessionException(E2eeSessionFailure.UNAVAILABLE)
        }
        if (conversationId != null && !announce(peerId, conversationId)) {
            throw E2eeSessionException(E2eeSessionFailure.UNAVAILABLE)
        }
        val key = try {
            val keys = keyStoreFor(userId)
            SessionKeyDerivation.derive(userId, peerId, keys.getOrGenerateIdentityKey(), keys.getOrGenerateSignedPreKey(), bundle)
        } catch (_: E2eeIdentityUnreadableException) {
            throw E2eeSessionException(E2eeSessionFailure.IDENTITY_UNREADABLE)
        } catch (_: CryptoException) {
            throw E2eeSessionException(E2eeSessionFailure.MALFORMED_BUNDLE)
        }
        val session = E2eeSession(key, SessionKeyDerivation.VERSION)
        if (!sessions.save(userId, peerId, session)) throw E2eeSessionException(E2eeSessionFailure.PERSISTENCE)
        return session
    }

    private suspend fun fetch(peerId: String): PeerBundleLookup = try {
        peers.fetchBundle(peerId)
    } catch (cancelled: CancellationException) {
        throw cancelled
    } catch (_: Exception) {
        PeerBundleLookup.Unavailable
    }

    private suspend fun announce(peerId: String, conversationId: String): Boolean = try {
        peers.announceSession(peerId, conversationId)
    } catch (cancelled: CancellationException) {
        throw cancelled
    } catch (_: Exception) {
        false
    }

    private fun observedUserId(): String? = currentUserId()?.also {
        if (lastKnownUserId != it) {
            lastKnownUserId = it
            sessions.rememberUserId(it)
        }
    }

    private fun E2eeSessionFailure.feedsNegativeCache(): Boolean = when (this) {
        E2eeSessionFailure.KEYS_NOT_PUBLISHED,
        E2eeSessionFailure.UNAVAILABLE,
        E2eeSessionFailure.MALFORMED_BUNDLE,
        -> true
        E2eeSessionFailure.COOLDOWN,
        E2eeSessionFailure.IDENTITY_UNREADABLE,
        E2eeSessionFailure.NO_ACCOUNT,
        E2eeSessionFailure.PERSISTENCE,
        -> false
    }
}
