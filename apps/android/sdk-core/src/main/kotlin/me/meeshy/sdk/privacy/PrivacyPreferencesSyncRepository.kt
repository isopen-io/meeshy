package me.meeshy.sdk.privacy

import kotlinx.serialization.encodeToString
import me.meeshy.sdk.model.PrivacyPreferenceSyncBody
import me.meeshy.sdk.model.PrivacyPreferences
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxLanes
import me.meeshy.sdk.outbox.OutboxMutation
import me.meeshy.sdk.outbox.OutboxRepository
import me.meeshy.sdk.session.SessionRepository
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Durable backend sync of the privacy-preference block (feature-parity §L; ADR-006).
 *
 * The device-local [PrivacyPreferencesStore] stays the UI source of truth — a toggle paints
 * instantly from it. This repository propagates that choice to the gateway
 * (`PATCH /me/preferences/privacy`) via the outbox so it survives offline and process death
 * instead of an online-first REST call a dropped connection would silently lose. Each write
 * enqueues the current editable-toggle snapshot (the coalescer keeps only the latest for this
 * kind, so an offline burst of toggles collapses to one PATCH), keyed by the signed-in user id on
 * the settings lane — a **distinct** [OutboxKind.UPDATE_PRIVACY_SETTINGS] from the notification
 * sync's [OutboxKind.UPDATE_SETTINGS], so the two share the lane yet never supersede one another.
 *
 * Because the local store already holds the value, there is no optimistic session flip here; the
 * gateway PATCH is an idempotent partial merge, so a delivery retry is harmless and no rollback is
 * needed on exhaustion. The read-only encryption leg is excluded from the wire body
 * ([PrivacyPreferenceSyncBody]), so a sync never stamps device defaults over server encryption
 * preferences.
 *
 * Inert with no session (returns `null`, no queue write) — mirrors the notification sync gate.
 *
 * @return the queued row's `cmid`, or `null` when there is no active session or the enqueue was
 *   superseded — the caller uses a non-`null` result to decide whether to wake the worker.
 */
@Singleton
public class PrivacyPreferencesSyncRepository @Inject constructor(
    private val sessionRepository: SessionRepository,
    private val outboxRepository: OutboxRepository,
) {
    public suspend fun enqueueSync(preferences: PrivacyPreferences): String? {
        val userId = sessionRepository.currentUserId?.takeIf { it.isNotBlank() } ?: return null
        return outboxRepository.enqueue(
            OutboxMutation(
                kind = OutboxKind.UPDATE_PRIVACY_SETTINGS,
                lane = OutboxLanes.SETTINGS,
                targetId = userId,
                payload = MeeshyApi.json.encodeToString(PrivacyPreferenceSyncBody.from(preferences)),
            ),
        )
    }
}
