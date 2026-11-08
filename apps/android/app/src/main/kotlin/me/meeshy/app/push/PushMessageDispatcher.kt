package me.meeshy.app.push

import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeoutOrNull
import me.meeshy.app.bring.BringPushHandler
import me.meeshy.sdk.call.CallFreshnessChecker
import me.meeshy.sdk.model.call.CallFreshness
import me.meeshy.sdk.model.call.IncomingCallPushRoute
import me.meeshy.sdk.model.push.PushRecipient
import me.meeshy.sdk.net.TokenStore
import me.meeshy.sdk.session.SessionRepository
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

/**
 * The thin dispatcher behind [MeeshyFcmService] : renders each push through ONE presenter
 * then hands it to every [PushObserver].
 *
 * Rendering priority (first match wins), unchanged from the former service :
 *  1. an incoming **call** ring ([IncomingCallNotificationPresenter.show]) ;
 *  2. a **stop-ring** (`call_cancel` / `call_answered_elsewhere`) ([IncomingCallNotificationPresenter.cancel]) ;
 *  3. a **revocation** (`notification_revoked`) ([RevocationPushHandler]) ;
 *  4. a **Bring** ring or stop (`bring` / `bring_stopped`, #13936) ([BringPushHandler]) — before the message path,
 *     which would render it as an ordinary banner ;
 *  5. anything else : the message pipeline ([MessageNotificationPresenter]).
 *
 * Each stage is isolated (the async EventEmitter rule) : a rendering failure never deprives
 * the observers, an observer failure never deprives the others.
 */
@Singleton
class PushMessageDispatcher @Inject constructor(
    private val ringStore: IncomingCallRingStore,
    private val session: SessionRepository,
    private val tokenStore: TokenStore,
    private val callPresenter: IncomingCallNotificationPresenter,
    private val revocationHandler: RevocationPushHandler,
    private val bringHandler: BringPushHandler,
    private val messagePresenter: MessageNotificationPresenter,
    private val freshness: CallFreshnessChecker,
    observers: Set<@JvmSuppressWildcards PushObserver>,
) {
    private val observers: List<PushObserver> =
        observers.sortedWith(compareBy<PushObserver> { it.order }.thenBy { it.javaClass.name })

    fun dispatch(push: IncomingPush, nowMillis: Long = System.currentTimeMillis()) {
        if (recipientOf(push) == PushRecipient.FOREIGN) {
            Timber.d("Push destine a un autre compte : ignore")
            return
        }
        try {
            render(push, nowMillis)
        } catch (failure: Exception) {
            Timber.e(failure, "Push rendering failed")
        }
        observers.forEach { observer ->
            try {
                observer.onPush(push)
            } catch (failure: Exception) {
                Timber.e(failure, "PushObserver %s failed", observer.javaClass.name)
            }
        }
    }

    /**
     * #13567 : le compte connecté est lu sur son miroir PERSISTÉ — un processus réveillé à froid par FCM n'a pas encore
     * restauré la session en mémoire ; à défaut, l'identité de la session courante. Une identité introuvable est
     * fail-closed : un push qui NOMME un destinataire est étranger ; seul un push qui ne nomme personne (passerelle
     * antérieure) garde le chemin d'avant.
     *
     * Un push ÉTRANGER n'a aucun effet, retraits compris : la fin de session a déjà retiré toutes les bannières
     * (`PostedNotificationsTeardown`), donc un arrêt de sonnerie ou une révocation du compte quitté ne peut viser
     * que des bannières du compte CONNECTÉ (même appel de groupe, même conversation) — et passer par
     * [IncomingCallRingStore.route] y inscrirait l'appel comme déjà vu, faisant taire la sonnerie du compte connecté.
     */
    private fun recipientOf(push: IncomingPush): PushRecipient {
        val signedIn = (tokenStore.userId ?: session.currentUserId).takeIf { tokenStore.isAuthenticated }
        return PushRecipient.of(push.payload.recipientUserId, signedIn)
    }

    private fun render(push: IncomingPush, nowMillis: Long) {
        when (val route = ringStore.route(push.data, nowMillis, selfUserId = session.currentUserId)) {
            is IncomingCallPushRoute.Ring -> if (isStillLive(route.push.callId)) {
                callPresenter.show(route.push)
            } else {
                ringStore.remember(route.push.callId, nowMillis)
                Timber.d("Call push for an already finished call: no ring")
            }
            is IncomingCallPushRoute.StopRing -> callPresenter.cancel(route.push)
            is IncomingCallPushRoute.Suppress -> Timber.d("Suppressed call push: ${route.reason}")
            IncomingCallPushRoute.NotACallPush -> when {
                revocationHandler.handle(push.data) -> Unit
                bringHandler.handle(push.data, nowMillis) -> Unit
                else -> messagePresenter.present(push)
            }
        }
    }

    /** Contrôle de fraîcheur borné : push livrée après la fin de l'appel = pas de sonnerie ; doute = sonner. */
    private fun isStillLive(callId: String): Boolean {
        val verdict = runCatching {
            runBlocking { withTimeoutOrNull(FRESHNESS_TIMEOUT_MS) { freshness.check(callId) } }
        }.getOrNull()
        return verdict != CallFreshness.Finished
    }

    private companion object {
        const val FRESHNESS_TIMEOUT_MS = 3_000L
    }
}
