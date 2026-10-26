package me.meeshy.sdk.outbox.senders

import dagger.Binds
import dagger.Lazy
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoMap
import kotlinx.serialization.json.Json
import me.meeshy.core.database.entity.OutboxEntity
import me.meeshy.sdk.model.NotificationPreferenceSyncBody
import me.meeshy.sdk.model.PrivacyPreferenceSyncBody
import me.meeshy.sdk.model.UpdateProfileRequest
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.PreferencesApi
import me.meeshy.sdk.net.apiCall
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxKindHandler
import me.meeshy.sdk.outbox.OutboxKindKey
import me.meeshy.sdk.outbox.SendResult
import me.meeshy.sdk.outbox.withPayload
import me.meeshy.sdk.preferences.PreferencesSyncCoordinator
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.user.UserRepository
import javax.inject.Inject

/**
 * `UPDATE_PROFILE`: patches the profile, then MERGES the server-authoritative user onto the session
 * ([SessionRepository.adoptMerging]: the route does not serve voicePublic, the decor nor the
 * activation, and an edit queued after this one must survive the confirmation). A 4xx refusal
 * (validation) can never succeed on retry: it is permanent, so the edit rolls back at once instead
 * of spinning the lane. An exhausted edit reverts the optimistic paint to the gateway's truth; the
 * screen that queued it also restores its snapshot and reopens the editor.
 */
public class UpdateProfileHandler @Inject constructor(
    private val userRepository: UserRepository,
    private val sessionRepository: SessionRepository,
    private val json: Json,
) : OutboxKindHandler {

    override suspend fun send(row: OutboxEntity): SendResult =
        json.withPayload<UpdateProfileRequest>(row) { request ->
            when (val result = userRepository.updateProfile(request)) {
                is NetworkResult.Success -> {
                    sessionRepository.adoptMerging(result.data, deliveredCmid = row.cmid)
                    SendResult.Success
                }
                is NetworkResult.Failure -> result.error.httpStatus.toProfileFailure()
            }
        }

    override suspend fun onExhausted(row: OutboxEntity) {
        sessionRepository.refresh()
    }

    private fun Int?.toProfileFailure(): SendResult = when {
        this == HTTP_GONE -> SendResult.Success
        this == null || this in HTTP_RETRYABLE -> SendResult.TransientFailure
        this in HTTP_CLIENT_ERRORS -> SendResult.PermanentFailure("Profile edit refused: HTTP $this")
        else -> SendResult.TransientFailure
    }

    private companion object {
        const val HTTP_GONE = 410
        val HTTP_RETRYABLE = setOf(401, 408, 429)
        val HTTP_CLIENT_ERRORS = 400..499
    }
}

/**
 * `UPDATE_SETTINGS`: syncs the notification preference block. The toggle was painted on the local
 * store before the row was queued; a 4xx refusal can never succeed on retry, so it fails
 * permanently instead of stalling the settings lane, and an exhausted row returns the block to the
 * server's truth (unless a newer toggle is still on its way) rather than leaving the screen showing
 * a setting the gateway does not hold — the reconciliation iOS `UserPreferencesManager` gets from
 * its next backend read.
 */
public class UpdateSettingsHandler @Inject constructor(
    private val preferencesApi: PreferencesApi,
    private val json: Json,
    private val preferencesSync: Lazy<PreferencesSyncCoordinator>,
) : OutboxKindHandler {

    override suspend fun send(row: OutboxEntity): SendResult =
        json.withPayload<NotificationPreferenceSyncBody>(row) { body ->
            apiCall { preferencesApi.updateNotification(body) }.toPreferenceSendResult("Notification")
        }

    override suspend fun onExhausted(row: OutboxEntity) {
        preferencesSync.get().refreshNotification()
    }
}

/** `UPDATE_PRIVACY_SETTINGS`: syncs the privacy preference block, with the same refusal rule. */
public class UpdatePrivacySettingsHandler @Inject constructor(
    private val preferencesApi: PreferencesApi,
    private val json: Json,
    private val preferencesSync: Lazy<PreferencesSyncCoordinator>,
) : OutboxKindHandler {

    override suspend fun send(row: OutboxEntity): SendResult =
        json.withPayload<PrivacyPreferenceSyncBody>(row) { body ->
            apiCall { preferencesApi.updatePrivacy(body) }.toPreferenceSendResult("Privacy")
        }

    override suspend fun onExhausted(row: OutboxEntity) {
        preferencesSync.get().refreshPrivacy()
    }
}

private val PREFERENCE_RETRYABLE = setOf(401, 408, 429)
private val PREFERENCE_CLIENT_ERRORS = 400..499

private fun NetworkResult<*>.toPreferenceSendResult(block: String): SendResult = when (this) {
    is NetworkResult.Success -> SendResult.Success
    is NetworkResult.Failure -> {
        val status = error.httpStatus
        when {
            status == null || status in PREFERENCE_RETRYABLE -> SendResult.TransientFailure
            status in PREFERENCE_CLIENT_ERRORS -> SendResult.PermanentFailure("$block preferences refused: HTTP $status")
            else -> SendResult.TransientFailure
        }
    }
}

@Module
@InstallIn(SingletonComponent::class)
public interface ProfileSettingsSendersModule {

    @Binds
    @IntoMap
    @OutboxKindKey(OutboxKind.UPDATE_PROFILE)
    public fun updateProfile(handler: UpdateProfileHandler): OutboxKindHandler

    @Binds
    @IntoMap
    @OutboxKindKey(OutboxKind.UPDATE_SETTINGS)
    public fun updateSettings(handler: UpdateSettingsHandler): OutboxKindHandler

    @Binds
    @IntoMap
    @OutboxKindKey(OutboxKind.UPDATE_PRIVACY_SETTINGS)
    public fun updatePrivacySettings(handler: UpdatePrivacySettingsHandler): OutboxKindHandler
}
