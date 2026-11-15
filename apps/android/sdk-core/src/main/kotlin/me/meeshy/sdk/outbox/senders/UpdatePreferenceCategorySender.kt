package me.meeshy.sdk.outbox.senders

import dagger.Binds
import dagger.Lazy
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoMap
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import me.meeshy.core.database.entity.OutboxEntity
import me.meeshy.sdk.model.PendingPreferenceCategories
import me.meeshy.sdk.net.api.PreferencesApi
import me.meeshy.sdk.net.apiCall
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxKindHandler
import me.meeshy.sdk.outbox.OutboxKindKey
import me.meeshy.sdk.outbox.SendResult
import me.meeshy.sdk.outbox.withPayload
import me.meeshy.sdk.preferences.PreferencesSyncCoordinator
import javax.inject.Inject

/**
 * `UPDATE_PREFERENCE_CATEGORY` : le cliché complet d'une catégorie part en `PATCH /me/preferences/{categorie}`, la
 * catégorie étant la cible de la ligne. Un refus 4xx ne réussira jamais au rejeu : il est définitif plutôt que de
 * bloquer la voie des réglages ; un envoi épuisé replace la catégorie sur la vérité du serveur.
 */
public class UpdatePreferenceCategoryHandler @Inject constructor(
    private val preferencesApi: PreferencesApi,
    private val json: Json,
    private val preferencesSync: Lazy<PreferencesSyncCoordinator>,
) : OutboxKindHandler {

    override suspend fun send(row: OutboxEntity): SendResult {
        val category = PendingPreferenceCategories.categoryNamed(row.targetId)
            ?: return SendResult.PermanentFailure("Unknown preference category: ${row.targetId}", unreadable = true)
        return json.withPayload<JsonObject>(row) { body ->
            apiCall { preferencesApi.patchBlock(row.targetId, body) }.toPreferenceSendResult(category.name)
        }
    }

    override suspend fun onExhausted(row: OutboxEntity) {
        preferencesSync.get().refreshCategory(row.targetId)
    }
}

@Module
@InstallIn(SingletonComponent::class)
public interface UpdatePreferenceCategorySenderModule {
    @Binds
    @IntoMap
    @OutboxKindKey(OutboxKind.UPDATE_PREFERENCE_CATEGORY)
    public fun updatePreferenceCategory(handler: UpdatePreferenceCategoryHandler): OutboxKindHandler
}
