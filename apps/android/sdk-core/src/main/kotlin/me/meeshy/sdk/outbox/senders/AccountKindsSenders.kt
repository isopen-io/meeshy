package me.meeshy.sdk.outbox.senders

import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoMap
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import me.meeshy.core.database.entity.OutboxEntity
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.net.api.SettingsActionApi
import me.meeshy.sdk.net.apiCall
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxKindHandler
import me.meeshy.sdk.outbox.OutboxKindKey
import me.meeshy.sdk.outbox.SendResult
import me.meeshy.sdk.outbox.SettingsActionPayload
import me.meeshy.sdk.outbox.toSendResult
import me.meeshy.sdk.outbox.withPayload
import retrofit2.Retrofit
import javax.inject.Inject

/**
 * `SETTINGS_ACTION` : rejoue un réglage de compte générique (méthode, endpoint relatif, corps). Les erreurs sont classées
 * comme partout ailleurs ([toSendResult]) : un 4xx est définitif, un 5xx ou le réseau se réessaient. Une méthode inconnue
 * (ligne d'une version future) ne partira jamais : refus définitif plutôt qu'une ligne qui tourne en boucle.
 */
public class SettingsActionHandler @Inject constructor(
    private val settingsActionApi: SettingsActionApi,
    private val json: Json,
) : OutboxKindHandler {

    override suspend fun send(row: OutboxEntity): SendResult =
        json.withPayload<SettingsActionPayload>(row) { payload ->
            val endpoint = payload.endpoint.trim().trimStart('/')
            val method = payload.method.uppercase()
            if (endpoint.isEmpty() || endpoint.contains("://") || method !in SUPPORTED_METHODS) {
                SendResult.PermanentFailure("Unusable settings action $method $endpoint", unreadable = true)
            } else {
                apiCall { dispatch(method, endpoint, payload.body) }.toSendResult()
            }
        }

    private suspend fun dispatch(method: String, endpoint: String, body: JsonObject): ApiResponse<JsonElement> {
        val response = when (method) {
            "POST" -> settingsActionApi.post(endpoint, body)
            "PUT" -> settingsActionApi.put(endpoint, body)
            else -> settingsActionApi.patch(endpoint, body)
        }
        return if (response.success && response.data == null) response.copy(data = JsonNull) else response
    }

    private companion object {
        val SUPPORTED_METHODS: Set<String> = setOf("POST", "PUT", "PATCH")
    }
}

@Module
@InstallIn(SingletonComponent::class)
public interface AccountKindsSendersModule {

    @Binds
    @IntoMap
    @OutboxKindKey(OutboxKind.SETTINGS_ACTION)
    public fun settingsAction(handler: SettingsActionHandler): OutboxKindHandler
}

@Module
@InstallIn(SingletonComponent::class)
public object SettingsActionApiModule {

    @Provides
    public fun settingsActionApi(retrofit: Retrofit): SettingsActionApi = retrofit.create(SettingsActionApi::class.java)
}
