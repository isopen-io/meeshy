package me.meeshy.sdk.model.auth

import kotlinx.serialization.Serializable

/**
 * Le verdict de `POST /auth/reset-password/verify-token`, sans consommer le
 * jeton (#10866). [requires2FA] suit `twoFactorEnabledAt`, le même prédicat que
 * l'envoi : un compte protégé doit voir la saisie du code, pas « lien invalide ».
 * Miroir de `ResetTokenVerification` (`packages/MeeshySDK/.../Auth/PasswordReset.swift`).
 *
 * Un champ absent ne présume rien de bon : [valid] vaut `false` (le lien n'est
 * pas tenu pour valable sans que la passerelle l'ait dit) et [requires2FA]
 * `false`, comme sur iOS. Une clé que la passerelle ajoute demain (`expiresAt`)
 * est ignorée.
 */
@Serializable
data class ResetTokenVerification(
    val valid: Boolean = false,
    val requires2FA: Boolean = false,
)

/** Corps de `POST /auth/reset-password/verify-token` : le jeton voyage dans le CORPS (#10859), jamais dans une adresse journalisée. */
@Serializable
data class ResetTokenVerificationRequest(val token: String)

/**
 * Corps de `POST /auth/reset-password`.
 *
 * [confirmPassword] est exigé par la passerelle (`resetPasswordSchema`) — sans
 * lui l'envoi partait en 400 `Invalid request data`. Il n'a volontairement AUCUN
 * défaut : `MeeshyApi.json` n'écrit pas les valeurs par défaut
 * (`encodeDefaults = false`), donc une confirmation « par défaut égale au mot de
 * passe » serait omise du corps, précisément ce que la passerelle refuse.
 * [twoFactorCode] est le code d'un compte protégé (#10867), omis quand il est nul.
 */
@Serializable
data class ResetPasswordRequest(
    val token: String,
    val newPassword: String,
    val confirmPassword: String,
    val twoFactorCode: String? = null,
)
