package me.meeshy.app.push.pipeline

import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeoutOrNull
import me.meeshy.app.MainActivity
import me.meeshy.app.push.IncomingPush
import me.meeshy.app.push.MessageNotificationId
import me.meeshy.app.push.NotificationChannelIds
import me.meeshy.sdk.model.FocusFilterSnapshot
import me.meeshy.sdk.model.UserNotificationPreferences
import me.meeshy.sdk.model.push.PushBadgePolicy
import me.meeshy.sdk.model.push.PushChannelCategory
import me.meeshy.sdk.model.push.PushDelivery
import me.meeshy.sdk.model.push.PushDeliveryContext
import me.meeshy.sdk.model.push.PushDeliveryGate
import me.meeshy.sdk.model.push.PushGrouping
import me.meeshy.sdk.notification.ActiveConversationStore
import me.meeshy.sdk.notification.NotificationPreferencesStore
import timber.log.Timber
import java.time.LocalDateTime
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Renders every non-call, non-revocation push — data-only (app in background or killed)
 * and legacy `notification + data` (foreground) alike — the Android counterpart of the iOS
 * Notification Service Extension :
 *  1. **dedup** on `notificationId` (a push delivered twice posts once) ;
 *  2. **gate** ([PushDeliveryGate]) with the HYDRATED preferences (a cold process reads the
 *     persisted ones, not the defaults), the system interruption filter read at reception ;
 *  3. **build** on the category channel (or the silent one for a passive delivery), under
 *     the index revocation cancels ([MessageNotificationId]) ;
 *  4. **enrich** phase by phase ([NotificationEnricher], `@IntoSet`), each step cut at the
 *     FCM deadline and isolated — a failure or a timeout still posts the text banner ;
 *  5. **post**, replacing `replacesNotificationId`, then the group summary.
 */
@Singleton
class PushNotificationPipeline @Inject constructor(
    @ApplicationContext private val context: Context,
    private val preferencesStore: NotificationPreferencesStore,
    private val activeConversationStore: ActiveConversationStore,
    private val environment: PushEnvironment,
    enrichers: Set<@JvmSuppressWildcards NotificationEnricher>,
    private val summaryNotifier: PushSummaryNotifier,
) {
    private val enrichers: List<NotificationEnricher> =
        enrichers.sortedWith(compareBy<NotificationEnricher> { it.phase }.thenBy { it.javaClass.name })

    private val rendered = LinkedHashSet<String>()

    /** Blocking entry point for the FCM worker thread. */
    fun render(push: IncomingPush) {
        runBlocking { renderNow(push) }
    }

    /** `true` when a notification was posted. */
    suspend fun renderNow(push: IncomingPush): Boolean {
        val payload = push.payload
        val title = push.notificationTitle ?: payload.title
        val body = push.notificationBody ?: payload.body
        // A data push with nothing to show is a silent sync : the observers handle it.
        if (title == null && body == null) return false
        if (!firstDelivery(payload.notificationId)) return false

        val deadline = environment.nowMillis() + DEADLINE_MILLIS
        val preferences = hydratedPreferences()
        val decision = PushDeliveryGate.decide(
            payload,
            PushDeliveryContext(
                appInForeground = environment.isAppInForeground(),
                socketConnected = environment.isSocketConnected(),
                activeConversationId = activeConversationStore.conversationId.value,
                preferences = preferences,
                focus = FocusFilterSnapshot.fromInterruptionFilter(environment.interruptionFilter()),
                now = LocalDateTime.now(),
            ),
        )
        val passive = decision is PushDelivery.Passive
        val playSound = when (decision) {
            PushDelivery.Suppress -> return false
            PushDelivery.Passive -> false
            is PushDelivery.Alert -> decision.playSound
        }

        val channelId = if (passive) {
            NotificationChannelIds.CHANNEL_SILENT
        } else {
            NotificationChannelIds.forCategory(PushChannelCategory.of(payload.type))
        }
        val notificationId = MessageNotificationId.of(payload.type, payload.conversationId, payload.notificationId)
        val groupKey = PushGrouping.groupKey(payload, preferences)
        val badge = PushBadgePolicy.badge(payload, preferences, localUnread(payload.unreadCount))

        val builder = NotificationCompat.Builder(context, channelId)
            .setSmallIcon(android.R.drawable.ic_dialog_email)
            .setContentTitle(title ?: DEFAULT_TITLE)
            .setContentText(body.orEmpty())
            .setAutoCancel(true)
            .setContentIntent(tapIntent(payload.conversationId, notificationId))
            .setPriority(if (passive) NotificationCompat.PRIORITY_LOW else NotificationCompat.PRIORITY_HIGH)
            // « Sons » coupé ou livraison passive ⇒ ni son ni vibration.
            .setSilent(!playSound)

        val request = EnrichmentRequest(push, preferences, channelId, groupKey, badge, passive, deadline)
        enrich(builder, request)

        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        payload.replacesNotificationId?.let { manager.cancel(MessageNotificationId.forNotification(it)) }
        manager.notify(notificationId, builder.build())
        groupKey?.let { summaryNotifier.post(it, channelId, badge) }
        return true
    }

    private suspend fun enrich(builder: NotificationCompat.Builder, request: EnrichmentRequest) {
        for (enricher in enrichers) {
            val remaining = request.deadlineMillis - environment.nowMillis()
            if (remaining <= 0) {
                Timber.w("Push enrichment cut at the FCM deadline before %s", enricher.javaClass.name)
                return
            }
            try {
                withTimeoutOrNull(remaining) { enricher.enrich(builder, request) }
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (failure: Exception) {
                Timber.e(failure, "NotificationEnricher %s failed", enricher.javaClass.name)
            }
        }
    }

    private suspend fun hydratedPreferences(): UserNotificationPreferences {
        val persisted = try {
            withTimeoutOrNull(PREFERENCES_BUDGET_MILLIS) { preferencesStore.awaitHydrated() }
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (failure: Exception) {
            Timber.w(failure, "Persisted notification preferences unreadable, using the live ones")
            null
        }
        return persisted ?: preferencesStore.preferences.value
    }

    private suspend fun localUnread(fromPayload: Int?): Int? =
        if (fromPayload != null) null else environment.localUnreadConversations()

    private fun firstDelivery(notificationId: String?): Boolean {
        if (notificationId == null) return true
        synchronized(rendered) {
            if (!rendered.add(notificationId)) return false
            if (rendered.size > DEDUP_CAPACITY) rendered.remove(rendered.first())
        }
        return true
    }

    private fun tapIntent(conversationId: String?, requestCode: Int): PendingIntent {
        val tapIntent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            conversationId?.let { putExtra(EXTRA_CONVERSATION_ID, it) }
        }
        return PendingIntent.getActivity(
            context,
            requestCode,
            tapIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    internal companion object {
        /** FCM grants ~10 s to `onMessageReceived` ; the pipeline keeps a margin to post. */
        const val DEADLINE_MILLIS: Long = 8_000L
        const val PREFERENCES_BUDGET_MILLIS: Long = 1_000L
        const val DEDUP_CAPACITY: Int = 128
        const val DEFAULT_TITLE: String = "Meeshy"
        const val EXTRA_CONVERSATION_ID: String = "conversationId"
    }
}
