package me.meeshy.app.push

import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import dagger.hilt.android.AndroidEntryPoint
import timber.log.Timber
import javax.inject.Inject

/**
 * FCM push entry point (ARCHITECTURE.md §8) — a thin dispatcher, never edited to add a
 * behaviour :
 *  - a new token is registered on the gateway ([PushTokenHandler]) ;
 *  - each push is decoded ONCE ([IncomingPush], `PushPayload`) and handed to
 *    [PushMessageDispatcher] : call ring / stop-ring ([IncomingCallNotificationPresenter]),
 *    revocation ([RevocationPushHandler]), message pipeline ([MessageNotificationPresenter]),
 *    then every [PushObserver] (`@IntoSet`).
 */
@AndroidEntryPoint
class MeeshyFcmService : FirebaseMessagingService() {

    @Inject
    lateinit var pushHandler: PushTokenHandler

    @Inject
    lateinit var dispatcher: PushMessageDispatcher

    override fun onNewToken(token: String) {
        Timber.d("FCM token refreshed")
        pushHandler.onTokenRefresh(token)
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val notification = message.notification
        Timber.d("FCM message received (type=%s)", message.data["type"])
        dispatcher.dispatch(
            IncomingPush.of(
                data = message.data,
                notificationTitle = notification?.title,
                notificationBody = notification?.body,
                hasNotificationBlock = notification != null,
            ),
        )
    }

    companion object {
        const val EXTRA_CALL_ID = "callId"
        const val EXTRA_CONVERSATION_ID = "conversationId"
        const val EXTRA_CALLER_NAME = "callerName"
        const val EXTRA_IS_VIDEO = "isVideo"
        const val EXTRA_AUTO_ANSWER = "autoAnswer"
    }
}
