package me.meeshy.sdk.net.api

import kotlinx.serialization.json.JsonElement
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.preferences.CommunityReorderBody
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path

/**
 * Lecture brute d'un bloc de préférences (`GET /me/preferences/{categorie}`, iOS `getPreferences`) : le
 * corps est rendu tel que servi, pour que le décodeur tolérant de la catégorie garde les clés d'une
 * version plus récente du serveur (`extras`). L'écriture est `PreferencesApi.patchBlock`.
 */
interface PreferencesCategoryApi {
    @GET("me/preferences/{category}")
    suspend fun getBlock(@Path("category") category: String): ApiResponse<JsonElement>
}

/** `POST /user-preferences/communities/reorder` : l'ordre COMPLET des communautés. */
interface CommunityPreferencesApi {
    @POST("user-preferences/communities/reorder")
    suspend fun reorder(@Body body: CommunityReorderBody): ApiResponse<Unit>
}

/** `GET /user/deleted-conversations` : les conversations retirées depuis un autre appareil (rattrapage de synchro). */
interface DeletedConversationsApi {
    @GET("user/deleted-conversations")
    suspend fun deletedConversations(): ApiResponse<JsonElement>
}

@dagger.Module
@dagger.hilt.InstallIn(dagger.hilt.components.SingletonComponent::class)
internal object PreferencesCategoryRoutesModule {

    @dagger.Provides
    fun providesPreferencesCategoryApi(api: me.meeshy.sdk.net.MeeshyApi): PreferencesCategoryApi =
        api.service(PreferencesCategoryApi::class.java)

    @dagger.Provides
    fun providesCommunityPreferencesApi(api: me.meeshy.sdk.net.MeeshyApi): CommunityPreferencesApi =
        api.service(CommunityPreferencesApi::class.java)

    @dagger.Provides
    fun providesDeletedConversationsApi(api: me.meeshy.sdk.net.MeeshyApi): DeletedConversationsApi =
        api.service(DeletedConversationsApi::class.java)
}
