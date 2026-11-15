package me.meeshy.app.push.pipeline

import android.graphics.Color
import androidx.core.app.NotificationCompat
import me.meeshy.app.push.PushActionProvider
import me.meeshy.app.push.PushBannerDecorator
import me.meeshy.sdk.model.notificationTypeAccentHex
import me.meeshy.sdk.model.push.PushNotificationActions
import javax.inject.Inject

/**
 * DETAIL : la couleur d'accent du TYPE de notification, l'heure SERVEUR du message (la bannière se range au bon
 * endroit du tiroir) et les contributions des lots (décorateurs, actions) — chacune isolée.
 */
class BannerAccentEnricher @Inject constructor(
    private val decorators: Set<@JvmSuppressWildcards PushBannerDecorator>,
    private val actionProviders: Set<@JvmSuppressWildcards PushActionProvider>,
) : NotificationEnricher {
    override val phase: EnrichmentPhase = EnrichmentPhase.DETAIL

    override suspend fun enrich(builder: NotificationCompat.Builder, request: EnrichmentRequest) {
        val payload = request.push.payload
        payload.type?.let { type ->
            runCatching { Color.parseColor(notificationTypeAccentHex(type)) }.getOrNull()?.let(builder::setColor)
        }
        if (payload.createdAt != null) {
            builder.setWhen(PushNotificationActions.timestampMillis(payload, System.currentTimeMillis())).setShowWhen(true)
        }
        actionProviders.sortedBy { it.order }.forEach { provider ->
            runCatching { provider.actions(request.push).forEach(builder::addAction) }
        }
        decorators.sortedBy { it.order }.forEach { runCatching { it.decorate(builder, request.push) } }
    }
}
