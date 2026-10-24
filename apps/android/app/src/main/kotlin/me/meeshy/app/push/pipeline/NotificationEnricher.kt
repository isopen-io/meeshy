package me.meeshy.app.push.pipeline

import androidx.core.app.NotificationCompat
import me.meeshy.app.push.IncomingPush
import me.meeshy.sdk.model.UserNotificationPreferences

/** The phases a notification is enriched in, in this order. A later phase may override an earlier one. */
enum class EnrichmentPhase {
    BODY,
    STYLE,
    MEDIA,
    ACTIONS,
    DETAIL,
    EXPIRATION,
}

/** Everything an enricher may read about the push being rendered. */
data class EnrichmentRequest(
    val push: IncomingPush,
    val preferences: UserNotificationPreferences,
    val channelId: String,
    val groupKey: String?,
    val badge: Int?,
    val passive: Boolean,
    /** Wall-clock deadline (epoch ms) of the FCM budget : an enricher never works past it. */
    val deadlineMillis: Long,
)

/**
 * One enrichment step of the push pipeline (body, style, media, actions, detail, expiration),
 * contributed with `@Binds @IntoSet` from the module of the lot that owns it : the pipeline
 * and [me.meeshy.app.push.MeeshyFcmService] are never edited to add one.
 *
 * [enrich] runs inside the FCM budget ; the pipeline cuts it at the deadline and an exception
 * is logged and skipped — the notification still posts with what the other phases built.
 */
interface NotificationEnricher {
    val phase: EnrichmentPhase

    suspend fun enrich(builder: NotificationCompat.Builder, request: EnrichmentRequest)
}
