package me.meeshy.sdk.notification

import kotlinx.serialization.encodeToString
import me.meeshy.sdk.model.NotificationPreferenceSyncBody
import me.meeshy.sdk.model.UserNotificationPreferences
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxLanes
import me.meeshy.sdk.outbox.OutboxMutation
import me.meeshy.sdk.outbox.OutboxRepository
import me.meeshy.sdk.session.SessionRepository
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Durable backend sync of the notification-preference block (feature-parity §L; ADR-006).
 *
 * The device-local [NotificationPreferencesStore] stays the UI source of truth — a toggle
 * paints instantly from it. This repository propagates that choice to the gateway
 * (`PATCH /me/preferences/notification`) via the outbox so it survives offline and process
 * death instead of an online-first REST call a dropped connection would silently lose. Each
 * write enqueues the **full** preference snapshot (the coalescer keeps only the latest, so an
 * offline burst of toggles collapses to one PATCH), keyed by the signed-in user id on the
 * settings lane. Because the local store already holds the value, there is no optimistic
 * session flip here (unlike [me.meeshy.sdk.user.UserRepository.enqueueProfileEdit]); the PATCH
 * is idempotent, so a delivery retry is harmless and no rollback is needed on exhaustion.
 *
 * Inert with no session (returns `null`, no queue write) — mirrors the profile-edit gate.
 *
 * @return the queued row's `cmid`, or `null` when there is no active session or the enqueue
 *   was superseded — the caller uses a non-`null` result to decide whether to wake the worker.
 */
@Singleton
public class NotificationPreferencesSyncRepository @Inject constructor(
    private val sessionRepository: SessionRepository,
    private val outboxRepository: OutboxRepository,
) {
    public suspend fun enqueueSync(preferences: UserNotificationPreferences): String? {
        val userId = sessionRepository.currentUserId?.takeIf { it.isNotBlank() } ?: return null
        return outboxRepository.enqueue(
            OutboxMutation(
                kind = OutboxKind.UPDATE_SETTINGS,
                lane = OutboxLanes.SETTINGS,
                targetId = userId,
                payload = MeeshyApi.json.encodeToString(NotificationPreferenceSyncBody.from(preferences)),
            ),
        )
    }
}
