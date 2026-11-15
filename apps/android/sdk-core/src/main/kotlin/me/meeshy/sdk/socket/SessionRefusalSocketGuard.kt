package me.meeshy.sdk.socket

import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.auth.AccountDeletedSignal
import me.meeshy.sdk.model.guest.GuestSessionEnd
import me.meeshy.sdk.net.SessionRefusalNotifier

/**
 * Les refus de session que la socket dit (iOS `MessageSocketManager+ConnectionAccount` / `+GuestSessionEnd`).
 *
 * - `error { code: "ACCOUNT_DELETED", accountId }` : le compte de CETTE connexion (le JWT de son handshake) est supprimé.
 *   Le transport s'arrête — les reconnexions seraient refusées de la même façon — puis le retrait est signalé. Un compte
 *   nommé qui n'est pas celui de la connexion ne retire rien.
 * - `auth:session-revoked { deletedAccountId }` : la purge confirmée du compte de cette connexion ; la fermeture de session
 *   suit son chemin habituel, seul le retrait du compte s'y ajoute.
 * - `error { code: SHARE_LINK_EXPIRED | GUEST_ACCESS_REVOKED }` sur une socket d'invité : retenter ne peut pas aboutir, le
 *   transport s'arrête (la purge et l'écran sont ceux de la fin de session d'invité).
 */
@Singleton
public class SessionRefusalSocketGuard internal constructor(
    private val notifier: SessionRefusalNotifier,
    private val errors: Flow<SocketServerError>,
    private val revocations: Flow<SocketSessionRevocation>,
    private val stopSocket: () -> Unit,
) {
    @Inject
    public constructor(notifier: SessionRefusalNotifier, socket: SocketManager) :
        this(notifier, socket.serverErrors, socket.sessionRevocations, socket::disconnect)

    /** Écoute la socket ; appelé UNE fois au démarrage de l'app. */
    public fun start(scope: CoroutineScope): Collection<Job> = listOf(
        scope.launch { errors.collect(::onError) },
        scope.launch { revocations.collect(::onRevocation) },
    )

    internal fun onError(error: SocketServerError) {
        val owner = AccountDeletedSignal.ownerOfJwt(error.accountJwt)
        val deleted = AccountDeletedSignal.owned(AccountDeletedSignal.namedAccountInPayload(error.payload), owner)
        if (deleted != null) {
            stopSocket()
            notifier.notifyAccountDeleted(deleted)
            return
        }
        if (error.guestSessionToken != null && GuestSessionEnd.fromSocketPayload(error.payload) != null) stopSocket()
    }

    internal fun onRevocation(revocation: SocketSessionRevocation) {
        val owner = AccountDeletedSignal.ownerOfJwt(revocation.accountJwt)
        AccountDeletedSignal.owned(AccountDeletedSignal.namedAccountInSessionRevoked(revocation.payload), owner)
            ?.let(notifier::notifyAccountDeleted)
    }
}
