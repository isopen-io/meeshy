package me.meeshy.app.ongoing

import android.app.Notification
import android.content.Context
import android.content.pm.ServiceInfo
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.work.ForegroundInfo
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import me.meeshy.app.R
import me.meeshy.app.push.NotificationChannelIds
import me.meeshy.sdk.media.MediaUploadScheduler
import me.meeshy.sdk.media.UploadLeaseNotifier
import me.meeshy.sdk.media.WorkManagerMediaUploadScheduler
import javax.inject.Inject
import javax.inject.Singleton

/**
 * La notification du bail d'un envoi de média : « Envoi en cours… », faible importance (canal des notifications en
 * cours, sans son ni vibration), barre de progression indéterminée tant que le pourcentage est inconnu. Contenu masqué
 * sur l'écran verrouillé ([publicVersion]).
 */
@Singleton
internal class MediaUploadLeaseNotifications @Inject constructor(
    @ApplicationContext private val context: Context,
) : UploadLeaseNotifier {

    override fun foregroundInfo(progressPercent: Int?): ForegroundInfo {
        OngoingChannel.ensure(context)
        val notification = build(progressPercent)
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ForegroundInfo(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        } else {
            ForegroundInfo(NOTIFICATION_ID, notification)
        }
    }

    private fun build(progressPercent: Int?): Notification =
        NotificationCompat.Builder(context, NotificationChannelIds.CHANNEL_ONGOING)
            .setSmallIcon(android.R.drawable.stat_sys_upload)
            .setContentTitle(context.getString(R.string.share_sending))
            .setContentIntent(openApp(context))
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_PROGRESS)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setPublicVersion(publicVersion(context))
            .setProgress(PROGRESS_MAX, progressPercent ?: 0, progressPercent == null)
            .build()

    companion object {
        /** Distinct des notifications du service des activités en cours : les deux peuvent coexister. */
        const val NOTIFICATION_ID: Int = 0x4D55
        private const val PROGRESS_MAX = 100
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal abstract class MediaUploadLeaseModule {
    @Binds
    abstract fun notifier(impl: MediaUploadLeaseNotifications): UploadLeaseNotifier

    @Binds
    abstract fun scheduler(impl: WorkManagerMediaUploadScheduler): MediaUploadScheduler
}
