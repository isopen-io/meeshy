package me.meeshy.app.push

import android.app.NotificationManager
import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

/**
 * A **revocation** data push (`notification_revoked`, [NotificationRevocationParser]) cancels
 * the banners the server retracted (reaction undone, message / post / comment deleted) —
 * data-only, so it reaches the service even when killed. Moved unchanged out of
 * [MeeshyFcmService] ; it runs BEFORE the message path, which would ignore it.
 */
@Singleton
class RevocationPushHandler @Inject constructor(
    @ApplicationContext private val context: Context,
) {

    /** `true` when [data] was a revocation (handled) ; `false` lets the message path run. */
    fun handle(data: Map<String, String>): Boolean {
        val revocation = NotificationRevocationParser.parse(data) ?: return false
        Timber.d("Revocation push: ${revocation.notificationIds.size} notification(s)")
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        revocation.notificationManagerIds().forEach { manager.cancel(it) }
        revocation.systemRenderedTags().forEach { manager.cancel(it, 0) }
        return true
    }
}
