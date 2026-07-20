package me.meeshy.sdk.model

import kotlinx.serialization.Serializable

/** Profile update request — port of UpdateProfileRequest (UserModels.swift). */
@Serializable
data class UpdateProfileRequest(
    val firstName: String? = null,
    val lastName: String? = null,
    val displayName: String? = null,
    val bio: String? = null,
    val systemLanguage: String? = null,
    val regionalLanguage: String? = null,
    val customDestinationLanguage: String? = null,
)

@Serializable
data class UpdateProfileResponse(
    val user: MeeshyUser,
)

@Serializable
data class ChangeEmailRequest(
    val newEmail: String,
)

@Serializable
data class ChangeEmailResponse(
    val message: String = "",
    val pendingEmail: String = "",
)

@Serializable
data class VerifyEmailChangeRequest(
    val token: String,
)

@Serializable
data class VerifyEmailChangeResponse(
    val message: String = "",
    val newEmail: String = "",
)

@Serializable
data class ChangePhoneRequest(
    val newPhoneNumber: String,
)

@Serializable
data class ChangePhoneResponse(
    val message: String = "",
    val pendingPhoneNumber: String = "",
)

@Serializable
data class VerifyPhoneChangeRequest(
    val code: String,
)

@Serializable
data class VerifyPhoneChangeResponse(
    val message: String = "",
    val newPhoneNumber: String = "",
)

/** Change-password body — port of AuthService.changePassword inline body (AuthService.swift). */
@Serializable
data class ChangePasswordRequest(
    val currentPassword: String,
    val newPassword: String,
)

@Serializable
data class ChangePasswordResponse(
    val message: String = "",
)

/** Account-deletion body — port of AccountService.deleteAccount body (AccountService.swift). */
@Serializable
data class DeleteAccountRequest(
    val confirmationPhrase: String,
)

@Serializable
data class DeleteAccountResponse(
    val message: String = "",
)
