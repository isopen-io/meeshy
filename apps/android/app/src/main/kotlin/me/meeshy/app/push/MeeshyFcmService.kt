package me.meeshy.app.push

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import dagger.hilt.android.AndroidEntryPoint
import me.meeshy.app.MainActivity
import me.meeshy.sdk.outbox.OutboxFlushWorker
import timber.log.Timber
import javax.inject.Inject

/**
 * FCM push handler (ARCHITECTURE.md §8).
 * New token registration → persisted on server via [NotificationRepository.registerDeviceToken].
 * Incoming push → show rich notification + trigger outbox flush.
 */
@AndroidEntryPoint
class MeeshyFcmService : FirebaseMessagingService() {

    @Inject
    lateinit var pushHandler: PushTokenHandler

    override fun onNewToken(token: String) {
        Timber.d("FCM token refreshed")
        pushHandler.onTokenRefresh(token)
    }

    override fun onMessageReceived(message: RemoteMessage) {
        Timber.d("FCM message: ${message.data}")

        // Trigger outbox flush on any push (may have connectivity restored)
        WorkManager.getInstance(applicationContext)
            .enqueue(OutboxFlushWorker.buildRequest())

        val notification = message.notification ?: return
        showNotification(
            title = notification.title ?: "Meeshy",
            body = notification.body ?: "",
            conversationId = message.data["conversationId"],
        )
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
    }
}
