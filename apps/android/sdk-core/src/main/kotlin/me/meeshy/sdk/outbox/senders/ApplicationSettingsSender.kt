package me.meeshy.sdk.outbox.senders

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoMap
import kotlinx.serialization.json.Json
import me.meeshy.core.database.entity.OutboxEntity
import me.meeshy.sdk.model.ApplicationPreferenceSyncBody
import me.meeshy.sdk.net.api.PreferencesApi
import me.meeshy.sdk.net.apiCall
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxKindHandler
import me.meeshy.sdk.outbox.OutboxKindKey
import me.meeshy.sdk.outbox.SendResult
import me.meeshy.sdk.outbox.withPayload
import javax.inject.Inject

/**
 * `UPDATE_APPLICATION_SETTINGS` : livre le thème au bloc application, avec la règle de refus des
 * autres blocs de préférences (4xx = définitif, 401/408/429/réseau/5xx = on rejoue). Le thème est déjà
 * peint par le magasin local : un envoi épuisé ne le défait pas.
 */
public class UpdateApplicationSettingsHandler @Inject constructor(
    private val preferencesApi: PreferencesApi,
    private val json: Json,
) : OutboxKindHandler {

    override suspend fun send(row: OutboxEntity): SendResult =
        json.withPayload<ApplicationPreferenceSyncBody>(row) { body ->
            apiCall { preferencesApi.updateApplication(body) }.toPreferenceSendResult("Application")
        }
}

@Module
@InstallIn(SingletonComponent::class)
public interface ApplicationSettingsSendersModule {

    @Binds
    @IntoMap
    @OutboxKindKey(OutboxKind.UPDATE_APPLICATION_SETTINGS)
    public fun updateApplicationSettings(handler: UpdateApplicationSettingsHandler): OutboxKindHandler
}
