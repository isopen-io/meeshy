package me.meeshy.app.push.pipeline

import androidx.core.app.NotificationCompat
import javax.inject.Inject

/** BODY : the subtitle line the gateway resolved (already in the reader's language). */
class SubtitleEnricher @Inject constructor() : NotificationEnricher {
    override val phase: EnrichmentPhase = EnrichmentPhase.BODY

    override suspend fun enrich(builder: NotificationCompat.Builder, request: EnrichmentRequest) {
        request.push.payload.subtitle?.let { builder.setSubText(it) }
    }
}

/** STYLE : the full body readable when the notification is expanded (a conversation message uses [MessagingStyleEnricher]). */
class BigTextEnricher @Inject constructor() : NotificationEnricher {
    override val phase: EnrichmentPhase = EnrichmentPhase.STYLE

    override suspend fun enrich(builder: NotificationCompat.Builder, request: EnrichmentRequest) {
        if (MessagingStyleEnricher.appliesTo(request)) return
        val body = request.push.notificationBody ?: request.push.payload.body ?: return
        builder.setStyle(NotificationCompat.BigTextStyle().bigText(body))
    }
}

/**
 * STYLE : one tray group per conversation / post (setGroup) and the app-icon badge
 * (setNumber). The group summary itself is posted by [PushSummaryNotifier].
 */
class GroupAndBadgeEnricher @Inject constructor() : NotificationEnricher {
    override val phase: EnrichmentPhase = EnrichmentPhase.STYLE

    override suspend fun enrich(builder: NotificationCompat.Builder, request: EnrichmentRequest) {
        request.groupKey?.let { builder.setGroup(it) }
        request.badge?.let { builder.setNumber(it) }
    }
}

/** EXPIRATION : an ephemeral message's notification disappears with the message. */
class EphemeralExpirationEnricher @Inject constructor() : NotificationEnricher {
    override val phase: EnrichmentPhase = EnrichmentPhase.EXPIRATION

    override suspend fun enrich(builder: NotificationCompat.Builder, request: EnrichmentRequest) {
        val seconds = request.push.payload.ephemeralDuration ?: return
        if (seconds > 0) builder.setTimeoutAfter(seconds * MILLIS_PER_SECOND)
    }

    private companion object {
        const val MILLIS_PER_SECOND = 1_000L
    }
}
