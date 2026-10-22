package me.meeshy.sdk.model.auth

import kotlinx.serialization.Serializable

/**
 * Corps de `POST /auth/login/2fa` : le défi rendu par `POST /auth/login`
 * (`requires2FA`) et le code TOTP à six chiffres — ou un code de secours
 * `XXXX-XXXX`. `rememberDevice` n'y figure PLUS (#4471) : la préférence est celle
 * exprimée à la connexion, retenue par la passerelle entre les deux étapes.
 */
@Serializable
data class TwoFactorLoginRequest(
    val twoFactorToken: String,
    val code: String,
)

/** Corps de `POST /auth/send-phone-code`. */
@Serializable
data class SendPhoneCodeRequest(val phoneNumber: String)

/** Corps de `POST /auth/verify-phone`. */
@Serializable
data class VerifyPhoneRequest(
    val phoneNumber: String,
    val code: String,
)

/**
 * `data` de `POST /auth/verify-phone`. La passerelle ne sert aujourd'hui qu'un
 * `message` ; [verified] et [phoneTransferToken] sont déclarés par le contrat iOS
 * (`VerifyPhoneResponse`) et restent nuls tant qu'elle ne les sert pas.
 */
@Serializable
data class VerifyPhoneData(
    val message: String? = null,
    val verified: Boolean? = null,
    val phoneTransferToken: String? = null,
)

/** `data` de `POST /auth/2fa/verify` — `usedBackupCode` dit qu'un code de secours a été consommé. */
@Serializable
data class TwoFactorVerifyResult(
    val valid: Boolean = false,
    val usedBackupCode: Boolean = false,
)

/**
 * `GET /auth/me?fields=id&expand=security` — la seule chose que l'écran du mot de
 * passe en lit (#9186). `hasPassword` est dérivé du hash par la passerelle sans
 * jamais le servir ; `null` quand elle ne sert pas le résumé (passerelle d'avant
 * `expand`) : l'écran garde alors le formulaire d'un CHANGEMENT de mot de passe.
 */
@Serializable
data class MeSecurityEnvelope(val user: MeSecurityUser)

@Serializable
data class MeSecurityUser(val security: MeSecuritySummary? = null)

@Serializable
data class MeSecuritySummary(val hasPassword: Boolean? = null)
