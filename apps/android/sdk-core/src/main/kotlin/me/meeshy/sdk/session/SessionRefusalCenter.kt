package me.meeshy.sdk.session

import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import me.meeshy.sdk.auth.AuthRepository
import me.meeshy.sdk.auth.SavedAccountsStore
import me.meeshy.sdk.model.auth.AccountDeletedSignal
import me.meeshy.sdk.net.AccountShelf
import me.meeshy.sdk.net.SessionBackup
import me.meeshy.sdk.net.SessionRefusalNotifier
import me.meeshy.sdk.net.TokenStore
import me.meeshy.sdk.socket.SocketManager
import timber.log.Timber

/**
 * Applique les refus de session (iOS `DeletedAccountRetirement` + `AgeGateController`). Pour un compte supprimé : le compte
 * est DÉJÀ en attente de retrait ([SessionRefusalNotifier], posé avant la notification) ; s'il est la session active, la
 * socket est coupée puis l'appareil purgé (Room, jetons, brouillons : [AuthRepository.closeDeletedAccountSession]) et
 * l'écran « session fermée » se lève ; dans tous les cas le compte quitte le sélecteur ([SavedAccountsStore]) et le
 * coffre ([AccountShelf], [SessionBackup]). La mise en attente ne se lève qu'une fois le retrait fait.
 *
 * Hors ligne ou sur un 401 ordinaire, rien n'arrive ici : le réseau ne signale que les refus nommés.
 */
@Singleton
public class SessionRefusalCenter internal constructor(
    private val notifier: SessionRefusalNotifier,
    private val tokenStore: TokenStore,
    private val savedAccounts: SavedAccountsStore,
    private val accountShelf: AccountShelf,
    private val sessionBackup: SessionBackup,
    private val stopSocket: () -> Unit,
    private val closeSession: suspend () -> Unit,
) {
    @Inject
    public constructor(
        notifier: SessionRefusalNotifier,
        tokenStore: TokenStore,
        savedAccounts: SavedAccountsStore,
        accountShelf: AccountShelf,
        sessionBackup: SessionBackup,
        socket: SocketManager,
        authRepository: AuthRepository,
    ) : this(notifier, tokenStore, savedAccounts, accountShelf, sessionBackup, socket::disconnect, authRepository::closeDeletedAccountSession)

    private val _closed = MutableStateFlow(false)

    /** Vrai tant que l'écran « session fermée » doit couvrir l'app (le compte de la session active est supprimé). */
    public val closed: StateFlow<Boolean> = _closed.asStateFlow()

    /** Écoute les signaux du réseau ; appelé UNE fois au démarrage de l'app. */
    public fun start(scope: CoroutineScope): Job = scope.launch {
        notifier.accountDeleted.collect { accountId ->
            try {
                retire(accountId)
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (@Suppress("TooGenericExceptionCaught") failure: Exception) {
                Timber.e(failure, "SessionRefusalCenter : retrait du compte supprime en echec")
            }
        }
    }

    /** Retire [accountId] de l'appareil ; si c'est la session active, la ferme d'abord. */
    public suspend fun retire(accountId: String) {
        val active = tokenStore.userId ?: AccountDeletedSignal.ownerOfJwt(tokenStore.jwt)
        if (active == accountId) {
            stopSocket()
            closeSession()
            _closed.value = true
        }
        savedAccounts.remove(accountId)
        accountShelf.erase(accountId)
        if (sessionBackup.read()?.userId == accountId) sessionBackup.erase()
        notifier.retirementDone(accountId)
    }

    /** « Se reconnecter » : l'écran « session fermée » se retire. */
    public fun acknowledgeClosed() {
        _closed.value = false
    }
}
