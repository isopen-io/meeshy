package me.meeshy.app.ongoing

import android.app.Notification
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import me.meeshy.app.R
import me.meeshy.app.push.NotificationChannelIds
import me.meeshy.sdk.model.ongoing.VoiceRecordingSnapshot

/**
 * La notification d'un vocal en cours, UNE seule fois composée pour le service de premier plan et pour sa
 * mise à jour : chronomètre natif depuis le début de la prise, « Arrêter » (le vocal rejoint le tiroir) et
 * « Annuler » (il est jeté), comme l'îlot iOS. Les boutons sont des diffuseurs IMMUABLES, adressés à ce
 * seul paquet ; l'écran verrouillé ne reçoit qu'un texte neutre — jamais le nom d'une conversation.
 */
internal object VoiceRecordingNotificationFactory {

    fun build(context: Context, snapshot: VoiceRecordingSnapshot): Notification =
        NotificationCompat.Builder(context, NotificationChannelIds.CHANNEL_ONGOING)
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setContentTitle(snapshot.statusLabel)
            .setContentIntent(openApp(context))
            .addAction(0, context.getString(R.string.voice_recording_activity_stop), button(context, VoiceRecordingOngoingNotifications.ACTION_STOP, 0))
            .addAction(0, context.getString(R.string.voice_recording_activity_cancel), button(context, VoiceRecordingOngoingNotifications.ACTION_CANCEL, 1))
            .setUsesChronometer(true)
            .setWhen(snapshot.startedAtEpochMs)
            .setShowWhen(true)
            .setOngoing(true)
            .setCategory(NotificationCompat.CATEGORY_STATUS)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setLocalOnly(true)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setPublicVersion(publicVersion(context))
            .build()

    private fun button(context: Context, action: String, slot: Int): PendingIntent = PendingIntent.getBroadcast(
        context,
        VoiceRecordingOngoingNotifications.NOTIFICATION_ID + slot,
        Intent(action).setPackage(context.packageName),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
}
