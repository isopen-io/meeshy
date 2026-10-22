package me.meeshy.sdk.outbox.senders

import dagger.Binds
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
import me.meeshy.sdk.outbox.toSendResult
import me.meeshy.sdk.outbox.withPayload
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.user.UserRepository
import javax.inject.Inject

/**
 * `UPDATE_PROFILE`: patches the profile, then adopts the server-authoritative user (the
 * gateway may normalise names or derive fields the local merge cannot). An exhausted edit
 * reverts the optimistic paint to the gateway's truth so the identity never drifts.
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
                    sessionRepository.adopt(result.data)
                    SendResult.Success
                }
                is NetworkResult.Failure -> SendResult.TransientFailure
            }
        }

    override suspend fun onExhausted(row: OutboxEntity) {
        sessionRepository.refresh()
    }
}

/** `UPDATE_SETTINGS`: syncs the notification preference block. */
public class UpdateSettingsHandler @Inject constructor(
    private val preferencesApi: PreferencesApi,
    private val json: Json,
) : OutboxKindHandler {

    override suspend fun send(row: OutboxEntity): SendResult =
        json.withPayload<NotificationPreferenceSyncBody>(row) { body ->
            apiCall { preferencesApi.updateNotification(body) }.toSendResult()
        }
}

/** `UPDATE_PRIVACY_SETTINGS`: syncs the privacy preference block. */
public class UpdatePrivacySettingsHandler @Inject constructor(
    private val preferencesApi: PreferencesApi,
    private val json: Json,
) : OutboxKindHandler {

    override suspend fun send(row: OutboxEntity): SendResult =
        json.withPayload<PrivacyPreferenceSyncBody>(row) { body ->
            apiCall { preferencesApi.updatePrivacy(body) }.toSendResult()
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
