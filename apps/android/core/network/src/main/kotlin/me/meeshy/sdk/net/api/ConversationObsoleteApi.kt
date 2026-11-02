package me.meeshy.sdk.net.api

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.ConversationObsoleted
import me.meeshy.sdk.net.routes.ApiRoutesConversations
import retrofit2.Retrofit
import retrofit2.http.DELETE
import retrofit2.http.Path

/**
 * Rendre une conversation OBSOLÈTE (#14643, #14645) — `DELETE /conversations/:id/obsolete`, même
 * permission que la suppression pour tous ; Global refusée (403). Idempotente. Interface à part de
 * [ConversationApi] : un geste, un contrat, sans toucher aux nombreux doubles de celle-ci.
 */
interface ConversationObsoleteApi {
    @DELETE(ApiRoutesConversations.BY_ID_OBSOLETE)
    suspend fun makeObsolete(@Path("id") id: String): ApiResponse<ConversationObsoleted>
}

@Module
@InstallIn(SingletonComponent::class)
object ConversationObsoleteApiModule {
    @Provides
    @Singleton
    fun provideConversationObsoleteApi(retrofit: Retrofit): ConversationObsoleteApi =
        retrofit.create(ConversationObsoleteApi::class.java)
}
