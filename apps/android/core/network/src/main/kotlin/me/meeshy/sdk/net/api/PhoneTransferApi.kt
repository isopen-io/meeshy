package me.meeshy.sdk.net.api

import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.auth.PhoneOwnershipCheckData
import me.meeshy.sdk.model.auth.PhoneOwnershipCheckRequest
import me.meeshy.sdk.model.auth.PhoneTransferInitiateData
import me.meeshy.sdk.model.auth.PhoneTransferInitiateRegistrationData
import me.meeshy.sdk.model.auth.PhoneTransferInitiateRegistrationRequest
import me.meeshy.sdk.model.auth.PhoneTransferInitiateRequest
import me.meeshy.sdk.model.auth.PhoneTransferSessionRequest
import me.meeshy.sdk.model.auth.PhoneTransferVerifyData
import me.meeshy.sdk.model.auth.PhoneTransferVerifyRegistrationData
import me.meeshy.sdk.model.auth.PhoneTransferVerifyRequest
import retrofit2.http.Body
import retrofit2.http.POST

/**
 * Le transfert d'un numéro de téléphone déjà détenu par un autre compte : les sept
 * routes `POST /auth/phone-transfer/…` (`AuthEndpoint.phoneTransfer*` côté iOS).
 * Aucune n'exige de session : le nouveau compte n'existe parfois pas encore.
 */
interface PhoneTransferApi {
    /** Ce numéro appartient-il déjà à un compte — et la récupération est-elle suggérée ? */
    @POST("auth/phone-transfer/check")
    suspend fun check(@Body body: PhoneOwnershipCheckRequest): ApiResponse<PhoneOwnershipCheckData>

    /** Envoie un SMS au titulaire ACTUEL du numéro, pour un compte déjà créé. */
    @POST("auth/phone-transfer/initiate")
    suspend fun initiate(@Body body: PhoneTransferInitiateRequest): ApiResponse<PhoneTransferInitiateData>

    /** Le code SMS du titulaire : le numéro passe au nouveau compte. */
    @POST("auth/phone-transfer/verify")
    suspend fun verify(@Body body: PhoneTransferVerifyRequest): ApiResponse<PhoneTransferVerifyData>

    @POST("auth/phone-transfer/resend")
    suspend fun resend(@Body body: PhoneTransferSessionRequest): ApiResponse<Unit>

    /** La passerelle répond succès même si la session n'existe plus. */
    @POST("auth/phone-transfer/cancel")
    suspend fun cancel(@Body body: PhoneTransferSessionRequest): ApiResponse<Unit>

    /** Idem [initiate] pendant l'inscription : aucun compte n'est créé, seuls pseudo et adresse sont connus. */
    @POST("auth/phone-transfer/initiate-registration")
    suspend fun initiateRegistration(
        @Body body: PhoneTransferInitiateRegistrationRequest,
    ): ApiResponse<PhoneTransferInitiateRegistrationData>

    /** Rend le `transferToken` à présenter à `POST /auth/register`. */
    @POST("auth/phone-transfer/verify-registration")
    suspend fun verifyRegistration(@Body body: PhoneTransferVerifyRequest): ApiResponse<PhoneTransferVerifyRegistrationData>
}
