package me.meeshy.sdk.model.auth

import kotlinx.serialization.Serializable

/*
 * Les quatre routes de la récupération par téléphone
 * (`POST /auth/forgot-password/phone/{lookup,verify-identity,verify-code,resend}`)
 * — le contrat que `MeeshyForgotPasswordView` (iOS) construit en structures
 * locales, ici une fois pour toutes. Le jeton d'étape (`tokenId`) voyage de la
 * recherche jusqu'au renvoi ; le jeton de réinitialisation (`resetToken`) sort de
 * la vérification du code et se présente à `POST /auth/reset-password`.
 */

/** Étape 1 — corps de `…/phone/lookup`. [countryCode] est l'ISO 3166-1 alpha-2 du pays choisi. */
@Serializable
data class PhoneRecoveryLookupRequest(
    val phoneNumber: String,
    val countryCode: String? = null,
)

/** Étape 1 — `data` de `…/phone/lookup` : le compte, masqué par la passerelle (seul le nom affiché est en clair). */
@Serializable
data class PhoneRecoveryLookupData(
    val tokenId: String,
    val maskedUserInfo: MaskedUserInfo,
)

/** Étape 2 — corps de `…/phone/verify-identity` : le pseudo ET l'adresse COMPLETS, qui déclenchent l'envoi du SMS. */
@Serializable
data class PhoneRecoveryIdentityRequest(
    val tokenId: String,
    val fullUsername: String,
    val fullEmail: String,
)

/** Étape 2 — `data` de `…/phone/verify-identity`. */
@Serializable
data class PhoneRecoveryIdentityData(
    val codeSent: Boolean = false,
    val attemptsRemaining: Int? = null,
)

/** Étape 3 — corps de `…/phone/verify-code` : le code SMS à six chiffres. */
@Serializable
data class PhoneRecoveryCodeRequest(
    val tokenId: String,
    val code: String,
)

/** Étape 3 — `data` de `…/phone/verify-code` : le jeton à présenter à `POST /auth/reset-password`. */
@Serializable
data class PhoneRecoveryCodeData(val resetToken: String)

/** Renvoi du SMS — corps de `…/phone/resend` (une fois par minute, côté passerelle). */
@Serializable
data class PhoneRecoveryResendRequest(val tokenId: String)
