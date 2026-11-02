package me.meeshy.sdk.net.api

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import me.meeshy.sdk.model.ConversationEngagementSnapshot
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.net.MeeshyApi
import retrofit2.http.GET
import retrofit2.http.Path

/** « N (M) 🔥 » : ce que la conversation a rapporté au LECTEUR — gateway `conversations/engagement.ts`. */
interface ConversationEngagementApi {
    @GET("conversations/{id}/engagement")
    suspend fun engagement(@Path("id") id: String): ApiResponse<ConversationEngagementSnapshot>
}

@Module
@InstallIn(SingletonComponent::class)
internal object ConversationEngagementRoutesModule {

    @Provides
    fun providesConversationEngagementApi(api: MeeshyApi): ConversationEngagementApi =
        api.service(ConversationEngagementApi::class.java)
}
