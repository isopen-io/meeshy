package me.meeshy.sdk.model.auth

import kotlinx.serialization.Serializable

/*
 * Le transfert d'un numéro de téléphone (`POST /auth/phone-transfer/…`, sept
 * routes) : un numéro déjà détenu par un autre compte passe au nouveau compte
 * après un SMS envoyé AU TITULAIRE ACTUEL. Deux parcours : sur un compte déjà
 * créé (`initiate` → `verify`) et pendant l'inscription, quand le compte n'existe
 * pas encore (`initiate-registration` → `verify-registration`, dont le
 * `transferToken` se présente ensuite à `POST /auth/register`).
 */

/** Corps de `…/phone-transfer/check` — [firstName] et [lastName] sont l'identité déclarée, comparée au titulaire pour proposer la récupération. */
@Serializable
data class PhoneOwnershipCheckRequest(
    val phoneNumber: String,
    val countryCode: String? = null,
    val firstName: String? = null,
    val lastName: String? = null,
)

/** L'identité du titulaire d'un numéro, masquée PAR LA PASSERELLE ; chaque champ peut manquer. */
@Serializable
data class PhoneOwnerMaskedInfo(
    val displayName: String? = null,
    val username: String? = null,
    val email: String? = null,
)

/**
 * `data` de `…/phone-transfer/check`.
 *
 * `exists` a été RETIRÉ du fil (#4239) : il confirmait, sans compte, qu'un numéro
 * appartient à un utilisateur Meeshy — un oracle. [maskedInfo] ne vient que
 * lorsque [recoverySuggested] est vrai, c'est-à-dire lorsque l'appelant a déjà
 * prouvé qu'il connaît le vrai nom du titulaire.
 */
@Serializable
data class PhoneOwnershipCheckData(
    val maskedInfo: PhoneOwnerMaskedInfo? = null,
    val recoverySuggested: Boolean = false,
)

/** Corps de `…/phone-transfer/initiate` — le compte [newUserId] vient d'être créé et réclame le numéro. */
@Serializable
data class PhoneTransferInitiateRequest(
    val phoneNumber: String,
    val phoneCountryCode: String? = null,
    val newUserId: String,
)

/** `data` de `…/phone-transfer/initiate` : la session de transfert et le titulaire actuel, masqué. */
@Serializable
data class PhoneTransferInitiateData(
    val transferId: String,
    val maskedOwnerInfo: PhoneOwnerMaskedInfo? = null,
)

/** Corps de `…/phone-transfer/verify` et `…/phone-transfer/verify-registration` : le code SMS à six chiffres. */
@Serializable
data class PhoneTransferVerifyRequest(
    val transferId: String,
    val code: String,
)

/** `data` de `…/phone-transfer/verify`. */
@Serializable
data class PhoneTransferVerifyData(val transferred: Boolean = false)

/** Corps de `…/phone-transfer/resend` et `…/phone-transfer/cancel`. */
@Serializable
data class PhoneTransferSessionRequest(val transferId: String)

/** Corps de `…/phone-transfer/initiate-registration` — l'inscription n'a pas encore créé de compte. */
@Serializable
data class PhoneTransferInitiateRegistrationRequest(
    val phoneNumber: String,
    val phoneCountryCode: String? = null,
    val pendingUsername: String,
    val pendingEmail: String,
)

/** `data` de `…/phone-transfer/initiate-registration`. */
@Serializable
data class PhoneTransferInitiateRegistrationData(val transferId: String)

/** `data` de `…/phone-transfer/verify-registration` : [transferToken] se présente à `POST /auth/register`. */
@Serializable
data class PhoneTransferVerifyRegistrationData(
    val verified: Boolean = false,
    val transferToken: String? = null,
)
