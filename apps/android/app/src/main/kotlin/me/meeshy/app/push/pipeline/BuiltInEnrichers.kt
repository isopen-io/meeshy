package me.meeshy.app.push.pipeline

import android.graphics.BitmapFactory
import androidx.core.app.NotificationCompat
import me.meeshy.app.push.media.PushMediaFetcher
import javax.inject.Inject

/** BODY : the subtitle line the gateway resolved (already in the reader's language). */
class SubtitleEnricher @Inject constructor() : NotificationEnricher {
    override val phase: EnrichmentPhase = EnrichmentPhase.BODY

    override suspend fun enrich(builder: NotificationCompat.Builder, request: EnrichmentRequest) {
        request.push.payload.subtitle?.let { builder.setSubText(it) }
    }
}

/** STYLE : the full body readable when the notification is expanded. */
class BigTextEnricher @Inject constructor() : NotificationEnricher {
    override val phase: EnrichmentPhase = EnrichmentPhase.STYLE

    override suspend fun enrich(builder: NotificationCompat.Builder, request: EnrichmentRequest) {
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

/**
 * MEDIA : the image of the message (thumbnail first) as a big picture — ONLY when no
 * protection is declared ([me.meeshy.sdk.model.push.PushPayload.mediaMayTravel] : a
 * `notificationLocKey`, a lifecycle flag or an ephemeral duration forbids any media), and
 * only through [PushMediaFetcher] (trusted origin, bounded download, budget).
 */
class ImageMediaEnricher @Inject constructor(
    private val fetcher: PushMediaFetcher,
) : NotificationEnricher {
    override val phase: EnrichmentPhase = EnrichmentPhase.MEDIA

    override suspend fun enrich(builder: NotificationCompat.Builder, request: EnrichmentRequest) {
        val payload = request.push.payload
        if (!payload.mediaMayTravel) return
        val declaredMime = request.push.data["attachmentMimeType"]?.takeIf { it.isNotBlank() }
        val (url, mimeType) = when {
            payload.thumbnailUrl != null -> payload.thumbnailUrl to (declaredMime?.takeIf { it.startsWith("image/") } ?: DEFAULT_IMAGE_MIME)
            payload.firstAttachmentUrl != null && declaredMime != null -> payload.firstAttachmentUrl to declaredMime
            else -> return
        }
        if (url == null || !mimeType.startsWith("image/")) return
        val budget = request.deadlineMillis - System.currentTimeMillis()
        val file = fetcher.fetch(
            url = url,
            mimeType = mimeType,
            declaredSize = request.push.data["attachmentFileSize"]?.trim()?.toLongOrNull(),
            data = request.push.data,
            budgetMillis = budget,
        ) ?: return
        try {
            val bitmap = BitmapFactory.decodeFile(file.absolutePath) ?: return
            builder.setLargeIcon(bitmap)
            builder.setStyle(NotificationCompat.BigPictureStyle().bigPicture(bitmap))
        } finally {
            file.delete()
        }
    }

    private companion object {
        const val DEFAULT_IMAGE_MIME = "image/jpeg"
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
