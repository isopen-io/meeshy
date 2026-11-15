package me.meeshy.sdk.auth

import me.meeshy.sdk.model.auth.OtpCodeField
import me.meeshy.sdk.model.auth.PhoneRecoveryCodeData
import me.meeshy.sdk.model.auth.PhoneRecoveryCodeRequest
import me.meeshy.sdk.model.auth.PhoneRecoveryIdentityData
import me.meeshy.sdk.model.auth.PhoneRecoveryIdentityRequest
import me.meeshy.sdk.model.auth.PhoneRecoveryLookupData
import me.meeshy.sdk.model.auth.PhoneRecoveryLookupRequest
import me.meeshy.sdk.model.auth.PhoneRecoveryResendRequest
import me.meeshy.sdk.net.api.AuthApi
import me.meeshy.sdk.net.apiCall
import me.meeshy.sdk.net.apiCallUnit
import javax.inject.Inject
import javax.inject.Singleton

/**
 * La récupération du mot de passe PAR TÉLÉPHONE, en quatre étapes
 * (`POST /auth/forgot-password/phone/{lookup,verify-identity,verify-code,resend}`) :
 *
 *  1. [lookup] retrouve le compte — rendu MASQUÉ — et ouvre le parcours (`tokenId`) ;
 *  2. [verifyIdentity] exige le pseudo ET l'adresse complets, puis envoie le SMS ;
 *  3. [verifyCode] vérifie le code et rend le `resetToken` ;
 *  4. ce jeton se présente à [AuthRepository.submitPasswordReset].
 *
 * Sans état : chaque étape reçoit ce que la précédente a rendu (le `tokenId`, le
 * `resetToken`), et la machine à états pure qui les enchaîne est
 * `PhoneRecoveryState` (`:core:model`). Chaque refus est un [PhoneProofResult.Refused]
 * TYPÉ ([me.meeshy.sdk.model.auth.PhoneProofRefusal]) : « mauvaise identité, il reste
 * N essais », « code expiré », « trop d'essais, recommencez » ne se confondent pas.
 */
@Singleton
class PhoneRecoveryRepository @Inject constructor(
    private val authApi: AuthApi,
) {
    suspend fun lookup(phoneNumber: String, countryCode: String? = null): PhoneProofResult<PhoneRecoveryLookupData> =
        apiCall {
            authApi.phoneRecoveryLookup(PhoneRecoveryLookupRequest(phoneNumber = phoneNumber, countryCode = countryCode))
        }.toPhoneProofResult()

    /** Le pseudo et l'adresse sont envoyés tels que tapés, bords blancs retirés. */
    suspend fun verifyIdentity(
        tokenId: String,
        fullUsername: String,
        fullEmail: String,
    ): PhoneProofResult<PhoneRecoveryIdentityData> =
        apiCall {
            authApi.phoneRecoveryVerifyIdentity(
                PhoneRecoveryIdentityRequest(
                    tokenId = tokenId,
                    fullUsername = fullUsername.trim(),
                    fullEmail = fullEmail.trim(),
                ),
            )
        }.toPhoneProofResult()

    /** Le code est réduit à ses chiffres (six au plus) avant l'envoi : une saisie collée avec des espaces passe. */
    suspend fun verifyCode(tokenId: String, code: String): PhoneProofResult<PhoneRecoveryCodeData> =
        apiCall {
            authApi.phoneRecoveryVerifyCode(PhoneRecoveryCodeRequest(tokenId = tokenId, code = OtpCodeField.sanitize(code)))
        }.toPhoneProofResult()

    /** Une fois par minute côté passerelle : un renvoi trop rapproché est un [me.meeshy.sdk.model.auth.PhoneProofRefusal.RATE_LIMITED]. */
    suspend fun resend(tokenId: String): PhoneProofResult<Unit> =
        apiCallUnit { authApi.phoneRecoveryResend(PhoneRecoveryResendRequest(tokenId)) }.toPhoneProofResult()
}
