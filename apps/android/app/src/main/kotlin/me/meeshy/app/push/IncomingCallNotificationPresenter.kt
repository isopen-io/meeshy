package me.meeshy.app.push

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.RingtoneManager
import androidx.core.app.NotificationCompat
import androidx.core.app.Person
import dagger.hilt.android.qualifiers.ApplicationContext
import me.meeshy.app.MainActivity
import me.meeshy.app.R
import me.meeshy.app.push.MeeshyFcmService.Companion.EXTRA_AUTO_ANSWER
import me.meeshy.app.push.MeeshyFcmService.Companion.EXTRA_CALLER_NAME
import me.meeshy.app.push.MeeshyFcmService.Companion.EXTRA_CALL_ID
import me.meeshy.app.push.MeeshyFcmService.Companion.EXTRA_CONVERSATION_ID
import me.meeshy.app.push.MeeshyFcmService.Companion.EXTRA_IS_VIDEO
import me.meeshy.sdk.model.call.CallStopPush
import me.meeshy.sdk.model.call.IncomingCallPush
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

/**
 * The full-screen incoming-call notification — moved unchanged out of [MeeshyFcmService].
 *  - a **call** data push fires a full-screen, CATEGORY_CALL notification so a
 *    backgrounded/killed device rings (duplicates are suppressed upstream by
 *    [IncomingCallRingStore]) ;
 *  - a **stop-ring** data push (`call_cancel` / `call_answered_elsewhere`) cancels it so
 *    the device stops ringing for a call that ended or was answered elsewhere.
 */
@Singleton
class IncomingCallNotificationPresenter @Inject constructor(
    @ApplicationContext private val context: Context,
) {

    fun cancel(push: CallStopPush) {
        Timber.d("Stop-ring push (${push.type}) for call ${push.callId}")
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.cancel(push.callId.hashCode())
    }

    fun show(push: IncomingCallPush) {
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.createNotificationChannel(
            NotificationChannel(
                NotificationChannelIds.CHANNEL_CALLS,
                context.getString(R.string.call_channel_name),
                NotificationManager.IMPORTANCE_HIGH,
            ).apply {
                description = context.getString(R.string.call_channel_description)
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
        manager.deleteNotificationChannel(NotificationChannelIds.LEGACY_CHANNEL_CALLS)

        val fullScreenIntent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra(EXTRA_CALL_ID, push.callId)
            push.conversationId?.let { putExtra(EXTRA_CONVERSATION_ID, it) }
            putExtra(EXTRA_CALLER_NAME, push.displayName)
            putExtra(EXTRA_IS_VIDEO, push.isVideo)
        }
        val pendingIntent = PendingIntent.getActivity(
            context,
            push.callId.hashCode(),
            fullScreenIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        // Bouton « Refuser » (CallStyle) : coupe la sonnerie ET prévient le
        // correspondant — sans lui, refuser n'existait pas et l'appelant
        // sonnait 60 s dans le vide.
        val declinePendingIntent = PendingIntent.getBroadcast(
            context,
            ("decline:" + push.callId).hashCode(),
            Intent(context, DeclineCallReceiver::class.java).putExtra(EXTRA_CALL_ID, push.callId),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        // Bouton « Répondre » : mêmes extras que le full-screen intent + le flag
        // auto-answer — l'écran d'appel décroche directement (gated permissions)
        // au lieu d'exiger un second tap sur Accepter. RequestCode distinct :
        // un même requestCode écraserait le PendingIntent du tap/full-screen.
        val answerIntent = Intent(fullScreenIntent).putExtra(EXTRA_AUTO_ANSWER, true)
        val answerPendingIntent = PendingIntent.getActivity(
            context,
            ("answer:" + push.callId).hashCode(),
            answerIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        // Prisme : le push d'appel est data-only et le serveur a déjà résolu la
        // langue de l'utilisateur (data.title/body localisés) — les ressources
        // (locale appareil) ne servent que de fallback pour un gateway antérieur.
        val fallbackBody = context.getString(
            if (push.isVideo) R.string.call_incoming_video else R.string.call_incoming_audio,
        )
        val caller = Person.Builder()
            .setName(push.displayName)
            .setImportant(true)
            .build()
        val notification = NotificationCompat.Builder(context, NotificationChannelIds.CHANNEL_CALLS)
            .setSmallIcon(android.R.drawable.sym_call_incoming)
            .setContentTitle(push.title ?: push.displayName)
            .setContentText(push.body ?: fallbackBody)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setOngoing(true)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .setFullScreenIntent(pendingIntent, true)
            // Répondre = décroche directement (auto-answer) ; Refuser =
            // DeclineCallReceiver. Sur API < 31, CallStyle dégrade en
            // notification standard avec les deux actions.
            .setStyle(NotificationCompat.CallStyle.forIncomingCall(caller, declinePendingIntent, answerPendingIntent))
            .build()

        manager.notify(push.callId.hashCode(), notification)
    }
}
