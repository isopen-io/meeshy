package me.meeshy.app.push

import android.content.Intent
import android.os.Bundle
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

    /**
     * Un push `notification + data` (tous les messages que la passerelle adresse à Android) est
     * rendu PAR LE SYSTÈME quand l'app est en arrière-plan ou tuée : `onMessageReceived` ne tourne
     * jamais, donc ni icône Meeshy, ni expéditeur, ni « Répondre » (#13394). On le remet au
     * pipeline comme un push de données — le corps servi par la passerelle (Prisme résolu) y est
     * lu tel quel — au lieu de laisser le système poser une bannière générique. Un push sans bloc
     * `notification` suit le chemin ordinaire.
     */
    override fun handleIntent(intent: Intent) {
        val extras = intent.extras
        if (extras != null && carriesNotificationBlock(extras)) {
            onMessageReceived(RemoteMessage(extras))
            return
        }
        super.handleIntent(intent)
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
        /** Les drapeaux « ce message porte un bloc notification » que le SDK FCM pose dans l'intent reçu. */
        internal fun carriesNotificationBlock(extras: Bundle): Boolean =
            extras.getString("gcm.n.e") == "1" || extras.getString("gcm.notification.e") == "1"

        const val EXTRA_CALL_ID = "callId"
        const val EXTRA_CONVERSATION_ID = "conversationId"
        const val EXTRA_CALLER_NAME = "callerName"
        const val EXTRA_CALLER_ID = "callerUserId"
        const val EXTRA_IS_VIDEO = "isVideo"
        const val EXTRA_AUTO_ANSWER = "autoAnswer"
    }
}
