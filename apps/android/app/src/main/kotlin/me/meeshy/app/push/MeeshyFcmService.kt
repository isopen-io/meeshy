package me.meeshy.app.push

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.RingtoneManager
import androidx.core.app.NotificationCompat
import androidx.work.WorkManager
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import dagger.hilt.android.AndroidEntryPoint
import me.meeshy.app.MainActivity
import me.meeshy.app.R
import me.meeshy.sdk.model.call.CallStopPush
import me.meeshy.sdk.model.call.IncomingCallPush
import me.meeshy.sdk.model.call.IncomingCallPushRoute
import me.meeshy.sdk.outbox.OutboxFlushWorker
import me.meeshy.sdk.session.SessionRepository
import timber.log.Timber
import javax.inject.Inject

/**
 * FCM push handler (ARCHITECTURE.md §8).
 * New token registration → persisted on server via [NotificationRepository.registerDeviceToken].
 * Incoming push → routed by kind:
 *  - a **call** data push ([IncomingCallPushRoute.Ring]) fires a full-screen,
 *    CATEGORY_CALL notification so a backgrounded/killed device rings; duplicates
 *    are suppressed by [IncomingCallRingStore].
 *  - a **stop-ring** data push ([IncomingCallPushRoute.StopRing] —
 *    `call_cancel` / `call_answered_elsewhere`) cancels that notification so the
 *    device stops ringing for a call that ended or was answered on another device.
 *  - any other push shows the rich message notification + triggers an outbox flush.
 */
@AndroidEntryPoint
class MeeshyFcmService : FirebaseMessagingService() {

    @Inject
    lateinit var pushHandler: PushTokenHandler

    @Inject
    lateinit var ringStore: IncomingCallRingStore

    @Inject
    lateinit var session: SessionRepository

    override fun onNewToken(token: String) {
        Timber.d("FCM token refreshed")
        pushHandler.onTokenRefresh(token)
    }

    override fun onMessageReceived(message: RemoteMessage) {
        Timber.d("FCM message: ${message.data}")

        when (val route = ringStore.route(message.data, System.currentTimeMillis(), selfUserId = session.currentUserId)) {
            is IncomingCallPushRoute.Ring -> showIncomingCallNotification(route.push)
            is IncomingCallPushRoute.StopRing -> cancelIncomingCallNotification(route.push)
            is IncomingCallPushRoute.Suppress -> Timber.d("Suppressed call push: ${route.reason}")
            IncomingCallPushRoute.NotACallPush -> handleMessagePush(message)
        }
    }

    private fun cancelIncomingCallNotification(push: CallStopPush) {
        Timber.d("Stop-ring push (${push.type}) for call ${push.callId}")
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.cancel(push.callId.hashCode())
    }

    private fun handleMessagePush(message: RemoteMessage) {
        // Trigger outbox flush on any non-call push (connectivity may be restored).
        WorkManager.getInstance(applicationContext)
            .enqueue(OutboxFlushWorker.buildRequest())

        val notification = message.notification ?: return
        showNotification(
            title = notification.title ?: "Meeshy",
            body = notification.body ?: "",
            conversationId = message.data["conversationId"],
        )
    }

    private fun showIncomingCallNotification(push: IncomingCallPush) {
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.createNotificationChannel(
            NotificationChannel(
                CHANNEL_CALLS,
                getString(R.string.call_channel_name),
                NotificationManager.IMPORTANCE_HIGH,
            ).apply {
                description = getString(R.string.call_channel_description)
                setShowBadge(false)
                // Sonnerie APPAREIL en usage ring (volume sonnerie, mode
                // silencieux respecté) : écran allumé/déverrouillé, le ring
                // arrive en heads-up — sans son de canal il n'émettait qu'un
                // ding de notification. Écran verrouillé, le full-screen
                // intent ouvre l'app qui sonne via son CallToneController.
                setSound(
                    RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE),
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build(),
                )
                enableVibration(true)
                vibrationPattern = longArrayOf(0, 1_000, 800, 1_000, 800)
            },
        )
        // Les canaux sont IMMUABLES après création : les installs existantes
        // gardaient l'ancien canal muet — on le supprime pour que le nouveau
        // (id v2) porte la sonnerie partout.
        manager.deleteNotificationChannel(LEGACY_CHANNEL_CALLS)

        val fullScreenIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra(EXTRA_CALL_ID, push.callId)
            push.conversationId?.let { putExtra(EXTRA_CONVERSATION_ID, it) }
            putExtra(EXTRA_CALLER_NAME, push.displayName)
            putExtra(EXTRA_IS_VIDEO, push.isVideo)
        }
        val pendingIntent = PendingIntent.getActivity(
            this,
            push.callId.hashCode(),
            fullScreenIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        // Prisme : le push d'appel est data-only et le serveur a déjà résolu la
        // langue de l'utilisateur (data.title/body localisés) — les ressources
        // (locale appareil) ne servent que de fallback pour un gateway antérieur.
        val fallbackBody = getString(
            if (push.isVideo) R.string.call_incoming_video else R.string.call_incoming_audio,
        )
        val notification = NotificationCompat.Builder(this, CHANNEL_CALLS)
            .setSmallIcon(android.R.drawable.sym_call_incoming)
            .setContentTitle(push.title ?: push.displayName)
            .setContentText(push.body ?: fallbackBody)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setOngoing(true)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .setFullScreenIntent(pendingIntent, true)
            .build()

        manager.notify(push.callId.hashCode(), notification)
    }

    private fun showNotification(title: String, body: String, conversationId: String?) {
        val channelId = CHANNEL_MESSAGES
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        manager.createNotificationChannel(
            NotificationChannel(channelId, "Messages", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "New messages and mentions"
            },
        )

        val tapIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            conversationId?.let { putExtra("conversationId", it) }
        }
        val pendingIntent = PendingIntent.getActivity(
            this,
            conversationId.hashCode(),
            tapIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val notification = NotificationCompat.Builder(this, channelId)
            .setSmallIcon(android.R.drawable.ic_dialog_email)
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .build()

        manager.notify(conversationId.hashCode(), notification)
    }

    companion object {
        const val CHANNEL_MESSAGES = "meeshy_messages"
        /** v2 : les canaux sont immuables — le v1 (muet, sans sonnerie) est supprimé au passage. */
        const val CHANNEL_CALLS = "meeshy_calls_v2"
        const val LEGACY_CHANNEL_CALLS = "meeshy_calls"
        const val EXTRA_CALL_ID = "callId"
        const val EXTRA_CONVERSATION_ID = "conversationId"
        const val EXTRA_CALLER_NAME = "callerName"
        const val EXTRA_IS_VIDEO = "isVideo"
    }
}
