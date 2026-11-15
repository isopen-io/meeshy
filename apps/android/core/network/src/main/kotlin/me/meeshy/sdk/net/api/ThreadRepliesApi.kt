package me.meeshy.sdk.net.api

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiResponse
import retrofit2.Retrofit
import retrofit2.http.GET
import retrofit2.http.Path
import retrofit2.http.Query

interface ThreadRepliesApi {
    /**
     * Le fil de réponses d'un message (miroir de `ThreadRepliesLoader` iOS) : `replyToId` filtre côté
     * serveur — le même prédicat sur la page et sur le total —, paginé par `offset`.
     */
    @GET("conversations/{cid}/messages")
    suspend fun replies(
        @Path("cid") conversationId: String,
        @Query("replyToId") parentMessageId: String,
        @Query("limit") limit: Int,
        @Query("offset") offset: Int? = null,
    ): ApiResponse<List<ApiMessage>>
}

@Module
@InstallIn(SingletonComponent::class)
object ThreadRepliesApiModule {
    @Provides
    @Singleton
    fun provideThreadRepliesApi(retrofit: Retrofit): ThreadRepliesApi =
        retrofit.create(ThreadRepliesApi::class.java)
}
