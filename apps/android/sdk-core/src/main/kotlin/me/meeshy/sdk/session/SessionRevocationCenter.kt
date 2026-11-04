package me.meeshy.sdk.session

import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.auth.AuthRepository
import me.meeshy.sdk.model.auth.AccountDeletedSignal
import me.meeshy.sdk.model.auth.SessionRevocationNotice
import me.meeshy.sdk.model.auth.SessionRevocationReason
import me.meeshy.sdk.net.SessionExpiryNotifier
import me.meeshy.sdk.socket.SocketManager
import me.meeshy.sdk.socket.SocketSessionRevocation
import timber.log.Timber

/**
 * Ce que l'utilisateur doit lire quand le serveur a fermé sa session (iOS `AuthManager.sessionRevocationNotice`) : une
 * déconnexion sans explication se vit comme une panne, ou comme une intrusion.
 *
 * Deux sources : l'événement socket `auth:session-revoked` (motif décodé de façon tolérante) et l'expiration vue par le réseau
 * ([SessionExpiryNotifier], motif « session expirée »). Chaque fermeture produit UN avis identifiable ([notice]) et un signal
 * de fermeture ([closures]) que la racine applique ; l'avis reste jusqu'à son acquittement. Pas de session ouverte, ou un
 * avis déjà en attente (rafale de 401) : rien de plus. Un événement qui porte `deletedAccountId` n'affiche rien : le retrait
 * du compte supprimé le traite ([SessionRefusalCenter]).
 */
@Singleton
public class SessionRevocationCenter internal constructor(
    private val revocations: Flow<SocketSessionRevocation>,
    private val expirations: Flow<Unit>,
    private val isSignedIn: () -> Boolean,
    private val newId: () -> String,
    private val now: () -> Long,
) {
    @Inject
    public constructor(
        socket: SocketManager,
        expiry: SessionExpiryNotifier,
        authRepository: AuthRepository,
    ) : this(
        revocations = socket.sessionRevocations,
        expirations = expiry.expirations,
        isSignedIn = { authRepository.isAuthenticated },
        newId = { UUID.randomUUID().toString() },
        now = System::currentTimeMillis,
    )

    private val _notice = MutableStateFlow<SessionRevocationNotice?>(null)
    private val _closures = MutableSharedFlow<SessionRevocationNotice>(extraBufferCapacity = 4)

    /** L'avis à montrer à la racine, `null` une fois acquitté. */
    public val notice: StateFlow<SessionRevocationNotice?> = _notice.asStateFlow()

    /** Un signal par fermeture : la racine ferme la session (jetons actifs vidés, compte mémorisé conservé). */
    public val closures: SharedFlow<SessionRevocationNotice> = _closures.asSharedFlow()

    /** Écoute la socket et le réseau ; appelé UNE fois au démarrage de l'app. */
    public fun start(scope: CoroutineScope): Collection<Job> = listOf(
        scope.launch { revocations.collect { guarded { onRevocation(it) } } },
        scope.launch { expirations.collect { guarded { report(SessionRevocationReason.SESSION_EXPIRED) } } },
    )

    internal fun onRevocation(revocation: SocketSessionRevocation) {
        if (AccountDeletedSignal.namedAccountInSessionRevoked(revocation.payload) != null) return
        report(SessionRevocationReason.fromSocketPayload(revocation.payload))
    }

    /** Une fermeture de [reason] : un avis neuf et son signal, sauf sans session ouverte ou avec un avis déjà en attente. */
    public fun report(reason: SessionRevocationReason) {
        if (!isSignedIn() || _notice.value != null) return
        val notice = SessionRevocationNotice(id = newId(), reason = reason, receivedAtEpochMillis = now())
        _notice.value = notice
        _closures.tryEmit(notice)
    }

    /** « Se reconnecter » : seul l'avis [id] se retire, un avis plus récent reste. */
    public fun acknowledge(id: String) {
        _notice.update { current -> current?.takeUnless { it.id == id } }
    }

    private inline fun guarded(action: () -> Unit) {
        try {
            action()
        } catch (@Suppress("TooGenericExceptionCaught") failure: Exception) {
            Timber.e(failure, "SessionRevocationCenter : avis en echec")
        }
    }
}
