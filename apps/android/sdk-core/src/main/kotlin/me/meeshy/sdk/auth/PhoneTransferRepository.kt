package me.meeshy.sdk.auth

import me.meeshy.sdk.model.auth.OtpCodeField
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
import me.meeshy.sdk.net.api.PhoneTransferApi
import me.meeshy.sdk.net.apiCall
import me.meeshy.sdk.net.apiCallUnit
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Le transfert d'un numéro détenu par un autre compte (`POST /auth/phone-transfer/…`).
 * Deux parcours, qui partagent [check], [resend] et [cancel] :
 *
 *  - sur un COMPTE DÉJÀ CRÉÉ : [initiate] → [verify] ;
 *  - PENDANT L'INSCRIPTION, quand le compte n'existe pas encore : [initiateRegistration]
 *    → [verifyRegistration], dont le `transferToken` se présente ensuite à
 *    `POST /auth/register`.
 *
 * Le SMS part vers le titulaire ACTUEL du numéro, jamais vers celui qui le réclame.
 * Sans état, comme [PhoneRecoveryRepository] : `transferId` circule d'une étape à
 * l'autre, et chaque refus est un [PhoneProofResult.Refused] typé (code faux, trop
 * d'essais, transfert expiré, SMS non envoyé, trop de demandes).
 */
@Singleton
class PhoneTransferRepository @Inject constructor(
    private val phoneTransferApi: PhoneTransferApi,
) {
    /**
     * Le numéro est-il déjà détenu — et la récupération du compte est-elle suggérée ?
     * [firstName] et [lastName] sont l'identité DÉCLARÉE, comparée au titulaire ; sans
     * elles la passerelle ne dit rien d'un compte existant (#4239, pas d'oracle).
     */
    suspend fun check(
        phoneNumber: String,
        countryCode: String? = null,
        firstName: String? = null,
        lastName: String? = null,
    ): PhoneProofResult<PhoneOwnershipCheckData> =
        apiCall {
            phoneTransferApi.check(
                PhoneOwnershipCheckRequest(
                    phoneNumber = phoneNumber,
                    countryCode = countryCode,
                    firstName = firstName?.takeIf { it.isNotBlank() },
                    lastName = lastName?.takeIf { it.isNotBlank() },
                ),
            )
        }.toPhoneProofResult()

    suspend fun initiate(
        phoneNumber: String,
        newUserId: String,
        phoneCountryCode: String? = null,
    ): PhoneProofResult<PhoneTransferInitiateData> =
        apiCall {
            phoneTransferApi.initiate(
                PhoneTransferInitiateRequest(
                    phoneNumber = phoneNumber,
                    phoneCountryCode = phoneCountryCode,
                    newUserId = newUserId,
                ),
            )
        }.toPhoneProofResult()

    /** Le code du titulaire, réduit à ses chiffres : le numéro passe au nouveau compte. */
    suspend fun verify(transferId: String, code: String): PhoneProofResult<PhoneTransferVerifyData> =
        apiCall {
            phoneTransferApi.verify(PhoneTransferVerifyRequest(transferId = transferId, code = OtpCodeField.sanitize(code)))
        }.toPhoneProofResult()

    suspend fun resend(transferId: String): PhoneProofResult<Unit> =
        apiCallUnit { phoneTransferApi.resend(PhoneTransferSessionRequest(transferId)) }.toPhoneProofResult()

    /** Abandonne le transfert. La passerelle répond succès même si la session a disparu. */
    suspend fun cancel(transferId: String): PhoneProofResult<Unit> =
        apiCallUnit { phoneTransferApi.cancel(PhoneTransferSessionRequest(transferId)) }.toPhoneProofResult()

    suspend fun initiateRegistration(
        phoneNumber: String,
        pendingUsername: String,
        pendingEmail: String,
        phoneCountryCode: String? = null,
    ): PhoneProofResult<PhoneTransferInitiateRegistrationData> =
        apiCall {
            phoneTransferApi.initiateRegistration(
                PhoneTransferInitiateRegistrationRequest(
                    phoneNumber = phoneNumber,
                    phoneCountryCode = phoneCountryCode,
                    pendingUsername = pendingUsername,
                    pendingEmail = pendingEmail,
                ),
            )
        }.toPhoneProofResult()

    suspend fun verifyRegistration(
        transferId: String,
        code: String,
    ): PhoneProofResult<PhoneTransferVerifyRegistrationData> =
        apiCall {
            phoneTransferApi.verifyRegistration(
                PhoneTransferVerifyRequest(transferId = transferId, code = OtpCodeField.sanitize(code)),
            )
        }.toPhoneProofResult()
}
