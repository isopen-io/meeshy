package me.meeshy.app.ongoing

import android.annotation.SuppressLint
import android.app.Notification
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.annotation.RequiresApi
import androidx.core.app.NotificationCompat
import dagger.hilt.android.qualifiers.ApplicationContext
import me.meeshy.app.push.NotificationChannelIds
import me.meeshy.sdk.model.ongoing.LiveActivityAction
import me.meeshy.sdk.model.ongoing.LiveActivityPlan
import me.meeshy.sdk.model.ongoing.OngoingActivityKind
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Dessine un [LiveActivityPlan] : Android 16 (API 36) pose la barre de progression par
 * `Notification.ProgressStyle`, Android 8 à 15 une notification standard équivalente avec barre de
 * progression. Dans les deux cas : silencieuse, locale, contenu masqué sur l'écran verrouillé (texte
 * neutre), boutons adressés au récepteur unique de commandes.
 */
@Singleton
internal class LiveActivityNotifier @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    @SuppressLint("NewApi")
    fun build(plan: LiveActivityPlan, timeoutMs: Long? = null, sdk: Int = Build.VERSION.SDK_INT): Notification {
        OngoingChannel.ensure(context)
        val styled = plan.isOngoing && (plan.progress != null || plan.indeterminate)
        return if (sdk >= PROGRESS_STYLE_API && styled) styledBuild(plan) else standardBuild(plan, timeoutMs)
    }

    private fun standardBuild(plan: LiveActivityPlan, timeoutMs: Long?): Notification {
        val builder = NotificationCompat.Builder(context, NotificationChannelIds.CHANNEL_ONGOING)
            .setSmallIcon(iconOf(plan))
            .setContentTitle(plan.title)
            .setContentText(plan.detail)
            .setContentIntent(openApp(context))
            .setOngoing(plan.isOngoing)
            .setAutoCancel(!plan.isOngoing)
            .setCategory(if (plan.progress != null || plan.indeterminate) NotificationCompat.CATEGORY_PROGRESS else NotificationCompat.CATEGORY_STATUS)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setLocalOnly(true)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setPublicVersion(publicVersion(context))
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
        if (plan.isOngoing && plan.progress != null) builder.setProgress(PROGRESS_MAX, percent(plan.progress), false)
        if (plan.isOngoing && plan.indeterminate) builder.setProgress(0, 0, true)
        plan.chronometerFromEpochMs?.let { builder.setUsesChronometer(true).setWhen(it).setShowWhen(true) }
            ?: builder.setShowWhen(false)
        timeoutMs?.let(builder::setTimeoutAfter)
        plan.actions.forEach { builder.addAction(0, it.label, commandIntent(plan.kind, it)) }
        return builder.build()
    }

    @RequiresApi(PROGRESS_STYLE_API)
    private fun styledBuild(plan: LiveActivityPlan): Notification {
        val style = Notification.ProgressStyle()
            .setProgressSegments(listOf(Notification.ProgressStyle.Segment(PROGRESS_MAX)))
            .setProgress(percent(plan.progress))
            .setProgressIndeterminate(plan.progress == null)
        val builder = Notification.Builder(context, NotificationChannelIds.CHANNEL_ONGOING)
            .setSmallIcon(iconOf(plan))
            .setContentTitle(plan.title)
            .setContentText(plan.detail)
            .setContentIntent(openApp(context))
            .setOngoing(true)
            .setCategory(Notification.CATEGORY_PROGRESS)
            .setOnlyAlertOnce(true)
            .setVisibility(Notification.VISIBILITY_PRIVATE)
            .setPublicVersion(publicVersion(context))
            .setStyle(style)
            .setShowWhen(false)
        plan.actions.forEach { action ->
            @Suppress("DEPRECATION")
            builder.addAction(Notification.Action.Builder(0, action.label, commandIntent(plan.kind, action)).build())
        }
        return builder.build()
    }

    private fun percent(fraction: Double?): Int = ((fraction ?: 0.0).coerceIn(0.0, 1.0) * PROGRESS_MAX).toInt()

    private fun iconOf(plan: LiveActivityPlan): Int = when {
        plan.isError -> android.R.drawable.stat_notify_error
        plan.kind == OngoingActivityKind.Outbox ->
            if (plan.isOngoing) android.R.drawable.stat_sys_upload else android.R.drawable.stat_sys_upload_done
        plan.kind == OngoingActivityKind.Recording -> android.R.drawable.ic_btn_speak_now
        plan.kind == OngoingActivityKind.Playback -> android.R.drawable.ic_media_play
        plan.kind == OngoingActivityKind.Call -> android.R.drawable.stat_sys_phone_call
        else -> android.R.drawable.stat_notify_sync
    }

    private fun commandIntent(kind: OngoingActivityKind, action: LiveActivityAction): PendingIntent =
        PendingIntent.getBroadcast(
            context,
            kind.notificationId + action.command.ordinal + 1,
            OngoingCommandReceiver.intent(context, action.command),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

    internal companion object {
        const val PROGRESS_STYLE_API: Int = 36
        const val PROGRESS_MAX: Int = 100
    }
}
