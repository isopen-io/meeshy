package me.meeshy.sdk.net.api

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.external.ExternalInteropConsentRequest
import me.meeshy.sdk.model.external.ExternalInteropConsentStatus
import me.meeshy.sdk.model.external.ExternalReportAck
import me.meeshy.sdk.model.external.ExternalReportRequest
import me.meeshy.sdk.net.routes.ApiRoutesConversations
import retrofit2.Retrofit
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * La conformité de l'interopérabilité WhatsApp (#17120) — portage des portes de la passerelle
 * (`routes/conversations/external-compliance.ts`) et de l'`ExternalInteropService` iOS : lire ce
 * qui part chez Meta et le consentement, le donner ou le retirer, signaler un contenu externe.
 * Interface à part : un contrat, sans toucher aux doubles de [ConversationApi].
 */
interface ExternalInteropApi {
    @GET(ApiRoutesConversations.EXTERNAL_CONSENT)
    suspend fun consentStatus(@Query("network") network: String = "whatsapp"): ApiResponse<ExternalInteropConsentStatus>

    @PUT(ApiRoutesConversations.EXTERNAL_CONSENT)
    suspend fun recordConsent(@Body body: ExternalInteropConsentRequest): ApiResponse<ExternalInteropConsentStatus>

    @POST(ApiRoutesConversations.BY_ID_EXTERNAL_REPORT)
    suspend fun report(@Path("id") conversationId: String, @Body body: ExternalReportRequest): ApiResponse<ExternalReportAck>
}

@Module
@InstallIn(SingletonComponent::class)
object ExternalInteropApiModule {
    @Provides
    @Singleton
    fun provideExternalInteropApi(retrofit: Retrofit): ExternalInteropApi =
        retrofit.create(ExternalInteropApi::class.java)
}
