package me.meeshy.sdk.session

import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import me.meeshy.sdk.auth.AuthRepository
import me.meeshy.sdk.model.auth.AccountDeletedSignal
import me.meeshy.sdk.model.auth.SessionRevocationNotice
import me.meeshy.sdk.model.auth.SessionRevocationReason
import me.meeshy.sdk.net.SessionExpiryNotifier
import me.meeshy.sdk.net.SessionRefusalNotifier
import me.meeshy.sdk.net.TokenStore
import me.meeshy.sdk.socket.RealtimeSessionCoordinator
import me.meeshy.sdk.socket.SocketManager
import me.meeshy.sdk.socket.SocketSessionRevocation
import timber.log.Timber

/**
 * Le compte de la session ouverte, tel que l'appareil le CONNAÎT (iOS `AuthManager.activeUserId`) : l'identité survit au
 * démontage des jetons par un renouvellement refusé ([me.meeshy.sdk.net.SessionRefresher]), qui vide le [TokenStore] avant
 * que l'expiration ne soit annoncée. Garder sur les jetons ferait perdre précisément la fermeture qu'on annonce.
 */
internal fun activeAccountOf(tokenStore: TokenStore, sessionRepository: SessionRepository): String? =
    tokenStore.userId?.takeIf { it.isNotBlank() } ?: sessionRepository.currentUserId

/**
 * Le serveur a fermé la session (iOS `AuthManager.handleSessionRevoked`) : la session se ferme ICI, dans le singleton, et
 * l'utilisateur lit pourquoi — une déconnexion sans explication se vit comme une panne, ou comme une intrusion.
 *
 * Deux sources : l'événement socket `auth:session-revoked` (motif décodé de façon tolérante) et l'expiration vue par le réseau
 * ([SessionExpiryNotifier], motif « session expirée »). La garde porte sur l'IDENTITÉ ([activeAccountOf]), jamais sur les
 * jetons. Chaque fermeture, sérialisée, ferme la session puis pose UN avis identifiable ([notice]) et l'identifiant de la
 * fermeture appliquée ([closed]) : un ÉTAT que la racine relit quand elle revient, jamais un signal qu'on perd sans écran.
 * Une rafale ne ferme qu'une fois — la première fermeture a vidé l'identité. Un compte en attente de retrait (compte
 * supprimé) n'est pas traité ici : [SessionRefusalCenter] le retire.
 *
 * Un `auth:session-revoked` ne vaut que pour le compte de SA connexion (le JWT présenté au handshake) quand il est le compte
 * actif : la révocation d'une socket d'un compte quitté ne ferme pas la session du compte du moment.
 */
@Singleton
public class SessionRevocationCenter internal constructor(
    private val revocations: Flow<SocketSessionRevocation>,
    private val expirations: Flow<Unit>,
    private val activeAccount: () -> String?,
    private val isAwaitingRetirement: (String) -> Boolean,
    private val closeSession: suspend () -> Unit,
    private val newId: () -> String,
    private val now: () -> Long,
) {
    @Inject
    public constructor(
        socket: SocketManager,
        expiry: SessionExpiryNotifier,
        tokenStore: TokenStore,
        sessionRepository: SessionRepository,
        refusals: SessionRefusalNotifier,
        authRepository: AuthRepository,
        realtime: RealtimeSessionCoordinator,
    ) : this(
        revocations = socket.sessionRevocations,
        expirations = expiry.expirations,
        activeAccount = { activeAccountOf(tokenStore, sessionRepository) },
        isAwaitingRetirement = refusals::isAwaitingRetirement,
        closeSession = {
            authRepository.logout()
            realtime.onAuthenticatedChanged(false)
        },
        newId = { UUID.randomUUID().toString() },
        now = System::currentTimeMillis,
    )

    private val mutex = Mutex()
    private val _notice = MutableStateFlow<SessionRevocationNotice?>(null)
    private val _closed = MutableStateFlow<String?>(null)

    /** L'avis à montrer à la racine, `null` une fois acquitté. */
    public val notice: StateFlow<SessionRevocationNotice?> = _notice.asStateFlow()

    /** L'identifiant de la dernière fermeture APPLIQUÉE (session déjà fermée) : la racine aligne son état dessus. */
    public val closed: StateFlow<String?> = _closed.asStateFlow()

    /** Écoute la socket et le réseau ; appelé UNE fois au démarrage de l'app. */
    public fun start(scope: CoroutineScope): Collection<Job> = listOf(
        scope.launch { revocations.collect { guarded { onRevocation(it) } } },
        scope.launch { expirations.collect { guarded { report(SessionRevocationReason.SESSION_EXPIRED) } } },
    )

    internal suspend fun onRevocation(revocation: SocketSessionRevocation): Boolean {
        val owner = AccountDeletedSignal.ownerOfJwt(revocation.accountJwt) ?: return false
        if (AccountDeletedSignal.owned(AccountDeletedSignal.namedAccountInSessionRevoked(revocation.payload), owner) != null) return false
        return close(SessionRevocationReason.fromSocketPayload(revocation.payload), expectedAccount = owner)
    }

    /** Une fermeture de [reason] pour le compte actif : session fermée, avis posé. `false` = aucun compte à fermer. */
    public suspend fun report(reason: SessionRevocationReason): Boolean = close(reason, expectedAccount = null)

    private suspend fun close(reason: SessionRevocationReason, expectedAccount: String?): Boolean = mutex.withLock {
        val account = activeAccount() ?: return@withLock false
        if (expectedAccount != null && expectedAccount != account) return@withLock false
        if (isAwaitingRetirement(account)) return@withLock false
        val notice = SessionRevocationNotice(id = newId(), reason = reason, receivedAtEpochMillis = now())
        _notice.value = notice
        try {
            closeSession()
        } finally {
            _closed.value = notice.id
        }
        true
    }

    /** « Se reconnecter » : seul l'avis [id] se retire, un avis plus récent reste. */
    public fun acknowledge(id: String) {
        _notice.update { current -> current?.takeUnless { it.id == id } }
    }

    private inline fun guarded(action: () -> Unit) {
        try {
            action()
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (@Suppress("TooGenericExceptionCaught") failure: Exception) {
            Timber.e(failure, "SessionRevocationCenter : fermeture en echec")
        }
    }
}
