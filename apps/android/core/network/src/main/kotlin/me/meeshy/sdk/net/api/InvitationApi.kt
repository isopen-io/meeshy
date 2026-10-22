package me.meeshy.sdk.net.api

import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.auth.EmailInvitationRequest
import me.meeshy.sdk.model.auth.EmailInvitationSent
import retrofit2.http.Body
import retrofit2.http.POST

/** L'invitation par e-mail (`InvitationsEndpoint.email` côté iOS) — authentifiée, adresse du compte prouvée. */
interface InvitationApi {
    @POST("invitations/email")
    suspend fun inviteByEmail(@Body body: EmailInvitationRequest): ApiResponse<EmailInvitationSent>
}
