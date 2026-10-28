package me.meeshy.app.push

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
 *  4. anything else : the message pipeline ([MessageNotificationPresenter]).
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
    private val messagePresenter: MessageNotificationPresenter,
    observers: Set<@JvmSuppressWildcards PushObserver>,
) {
    private val observers: List<PushObserver> =
        observers.sortedWith(compareBy<PushObserver> { it.order }.thenBy { it.javaClass.name })

    fun dispatch(push: IncomingPush, nowMillis: Long = System.currentTimeMillis()) {
        if (recipientOf(push) == PushRecipient.FOREIGN) {
            withdrawOnly(push, nowMillis)
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
     * restauré la session en mémoire. Rien sans session enregistrée.
     */
    private fun recipientOf(push: IncomingPush): PushRecipient {
        val signedIn = tokenStore.userId?.takeIf { tokenStore.isAuthenticated }
        return PushRecipient.of(push.payload.recipientUserId, signedIn)
    }

    /**
     * Un push d'un autre compte n'écrit rien, n'affiche rien et ne parvient à aucun observateur (pré-enregistrement,
     * accusés) : seuls passent ceux qui RETIRENT — l'arrêt d'une sonnerie, la révocation d'une bannière.
     */
    private fun withdrawOnly(push: IncomingPush, nowMillis: Long) {
        Timber.d("Push destine a un autre compte : ni ecriture ni banniere")
        try {
            val route = ringStore.route(push.data, nowMillis, selfUserId = session.currentUserId)
            if (route is IncomingCallPushRoute.StopRing) {
                callPresenter.cancel(route.push)
            } else if (route == IncomingCallPushRoute.NotACallPush) {
                revocationHandler.handle(push.data)
            }
        } catch (failure: Exception) {
            Timber.e(failure, "Push withdrawal failed")
        }
    }

    private fun render(push: IncomingPush, nowMillis: Long) {
        when (val route = ringStore.route(push.data, nowMillis, selfUserId = session.currentUserId)) {
            is IncomingCallPushRoute.Ring -> callPresenter.show(route.push)
            is IncomingCallPushRoute.StopRing -> callPresenter.cancel(route.push)
            is IncomingCallPushRoute.Suppress -> Timber.d("Suppressed call push: ${route.reason}")
            IncomingCallPushRoute.NotACallPush -> {
                if (!revocationHandler.handle(push.data)) messagePresenter.present(push)
            }
        }
    }
}
