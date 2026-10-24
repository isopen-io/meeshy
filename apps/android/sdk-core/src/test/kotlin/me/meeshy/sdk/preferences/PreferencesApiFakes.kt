package me.meeshy.sdk.preferences

import kotlinx.serialization.json.JsonObject
import me.meeshy.sdk.model.ApiCategory
import me.meeshy.sdk.model.ApiConversationPreferences
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.CategoryPatchBody
import me.meeshy.sdk.model.ConversationReorderBody
import me.meeshy.sdk.model.CreateCategoryBody
import me.meeshy.sdk.model.NotificationPreferenceSyncBody
import me.meeshy.sdk.model.PrivacyPreferenceSyncBody
import me.meeshy.sdk.model.UserPreferences
import me.meeshy.sdk.net.api.ConversationPreferencesApi
import me.meeshy.sdk.net.api.PreferencesApi
import java.io.IOException

internal fun <T> okResponse(data: T) = ApiResponse(success = true, data = data)

internal fun refused() = ApiResponse<Unit>(success = false, error = "refused", code = "FORBIDDEN")

/** Scriptable [PreferencesApi]: every route records its call and answers from a public field. */
internal open class ScriptedPreferencesApi : PreferencesApi {
    var all: ApiResponse<UserPreferences> = ApiResponse(success = false, error = "offline")
    var categories: ApiResponse<List<ApiCategory>> = ApiResponse(success = false, error = "offline")
    var patchCategoryResponse: ApiResponse<Unit> = okResponse(Unit)
    var patchBlockResponse: ApiResponse<Unit> = okResponse(Unit)
    var resetResponse: ApiResponse<Unit> = okResponse(Unit)
    var throwNetwork: Boolean = false

    var allCalls = 0
    val patchedCategories = mutableListOf<Pair<String, CategoryPatchBody>>()
    val patchedBlocks = mutableListOf<Pair<String, JsonObject>>()
    val resetBlocks = mutableListOf<String>()

    private fun guardNetwork() {
        if (throwNetwork) throw IOException("no network")
    }

    override suspend fun getAll(): ApiResponse<UserPreferences> {
        allCalls++
        guardNetwork()
        return all
    }

    override suspend fun patchCategory(categoryId: String, body: CategoryPatchBody): ApiResponse<Unit> {
        patchedCategories += categoryId to body
        guardNetwork()
        return patchCategoryResponse
    }

    override suspend fun patchBlock(category: String, body: JsonObject): ApiResponse<Unit> {
        patchedBlocks += category to body
        guardNetwork()
        return patchBlockResponse
    }

    override suspend fun resetBlock(category: String): ApiResponse<Unit> {
        resetBlocks += category
        guardNetwork()
        return resetResponse
    }

    override suspend fun getCategories(limit: Int?): ApiResponse<List<ApiCategory>> {
        guardNetwork()
        return categories
    }

    override suspend fun createCategory(body: CreateCategoryBody) = ApiResponse<ApiCategory>(success = false)

    override suspend fun updateNotification(body: NotificationPreferenceSyncBody) = ApiResponse<Unit>(success = false)

    override suspend fun updatePrivacy(body: PrivacyPreferenceSyncBody) = ApiResponse<Unit>(success = false)

    override suspend fun getNotification() = ApiResponse<NotificationPreferenceSyncBody>(success = false)

    override suspend fun getPrivacy() = ApiResponse<PrivacyPreferenceSyncBody>(success = false)
}

internal class ScriptedConversationPreferencesApi : ConversationPreferencesApi {
    var one: ApiResponse<ApiConversationPreferences> = ApiResponse(success = false, error = "offline")
    var list: ApiResponse<List<ApiConversationPreferences>> = ApiResponse(success = false, error = "offline")
    var reorderResponse: ApiResponse<Unit> = okResponse(Unit)
    var throwNetwork: Boolean = false

    val reorders = mutableListOf<ConversationReorderBody>()
    var listCalls = 0

    override suspend fun getPreferences(id: String): ApiResponse<ApiConversationPreferences> = one

    override suspend fun listPreferences(offset: Int?, limit: Int?): ApiResponse<List<ApiConversationPreferences>> {
        listCalls++
        return list
    }

    override suspend fun reorder(body: ConversationReorderBody): ApiResponse<Unit> {
        reorders += body
        if (throwNetwork) throw IOException("no network")
        return reorderResponse
    }
}
