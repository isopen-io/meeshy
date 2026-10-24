package me.meeshy.app.push

import me.meeshy.sdk.model.call.IncomingCallPushRoute
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
    private val callPresenter: IncomingCallNotificationPresenter,
    private val revocationHandler: RevocationPushHandler,
    private val messagePresenter: MessageNotificationPresenter,
    observers: Set<@JvmSuppressWildcards PushObserver>,
) {
    private val observers: List<PushObserver> =
        observers.sortedWith(compareBy<PushObserver> { it.order }.thenBy { it.javaClass.name })

    fun dispatch(push: IncomingPush, nowMillis: Long = System.currentTimeMillis()) {
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
