package me.meeshy.app.ongoing

import android.annotation.SuppressLint
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.app.PendingIntent
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import dagger.hilt.android.qualifiers.ApplicationContext
import me.meeshy.app.R
import me.meeshy.app.push.NotificationChannelIds
import me.meeshy.sdk.model.ongoing.VoiceRecordingSnapshot
import javax.inject.Inject
import javax.inject.Singleton

/**
 * La notification d'un vocal en cours : chronomètre natif depuis le début de la prise (le système
 * le déroule, l'app ne réveille rien) et un bouton « Arrêter ». Le bouton est un diffuseur
 * dynamique, enregistré tant que la notification existe — le micro n'est ouvert que process
 * vivant, aucun composant déclaré au manifeste. L'écran verrouillé ne reçoit qu'un texte neutre.
 */
@Singleton
internal class VoiceRecordingOngoingNotifications @Inject constructor(
    @ApplicationContext private val context: Context,
    private val bridge: VoiceRecordingActivityBridge,
) : OngoingNotificationSink<VoiceRecordingSnapshot> {

    private var receiver: BroadcastReceiver? = null

    override fun show(snapshot: VoiceRecordingSnapshot) {
        listenForStop()
        OngoingChannel.ensure(context)
        val notification = NotificationCompat.Builder(context, NotificationChannelIds.CHANNEL_ONGOING)
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setContentTitle(snapshot.statusLabel)
            .setContentIntent(openApp(context))
            .addAction(0, context.getString(R.string.voice_recording_activity_stop), stopIntent())
            .setUsesChronometer(true)
            .setWhen(snapshot.startedAtEpochMs)
            .setShowWhen(true)
            .setOngoing(true)
            .setCategory(NotificationCompat.CATEGORY_STATUS)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setLocalOnly(true)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setPublicVersion(publicVersion(context))
            .build()
        post(notification)
    }

    override fun conclude(snapshot: VoiceRecordingSnapshot, dismissAfterMs: Long) = cancel()

    override fun cancel() {
        NotificationManagerCompat.from(context).cancel(NOTIFICATION_ID)
        receiver?.let { runCatching { context.unregisterReceiver(it) } }
        receiver = null
    }

    private fun listenForStop() {
        if (receiver != null) return
        val created = object : BroadcastReceiver() {
            override fun onReceive(context: Context?, intent: Intent?) = bridge.requestStop()
        }
        ContextCompat.registerReceiver(context, created, IntentFilter(ACTION_STOP), ContextCompat.RECEIVER_NOT_EXPORTED)
        receiver = created
    }

    private fun stopIntent(): PendingIntent = PendingIntent.getBroadcast(
        context,
        NOTIFICATION_ID,
        Intent(ACTION_STOP).setPackage(context.packageName),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    @SuppressLint("MissingPermission")
    private fun post(notification: android.app.Notification) {
        val manager = NotificationManagerCompat.from(context)
        if (!manager.areNotificationsEnabled()) return
        runCatching { manager.notify(NOTIFICATION_ID, notification) }
    }

    internal companion object {
        const val NOTIFICATION_ID: Int = 0x4d52
        const val ACTION_STOP: String = "me.meeshy.app.voice.RECORDING_STOP"
    }
}
