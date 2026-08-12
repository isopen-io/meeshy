package me.meeshy.sdk.model

import kotlinx.serialization.Serializable

@Serializable
data class LoginRequest(
    val username: String,
    val password: String,
)

@Serializable
data class RegisterRequest(
    val username: String,
    val email: String,
    val password: String,
    val firstName: String? = null,
    val lastName: String? = null,
    val systemLanguage: String? = null,
    val regionalLanguage: String? = null,
    /** E.164 (dial code + national digits, e.g. `"+33612345678"`), or `null` when skipped/empty. */
    val phoneNumber: String? = null,
    /** The selected dial-code country's ISO 3166-1 alpha-2, or `null` alongside [phoneNumber]. */
    val phoneCountryCode: String? = null,
)

/** Payload of `POST /auth/login` and `POST /auth/register` responses. */
@Serializable
data class AuthSession(
    val user: MeeshyUser,
    val token: String,
    val sessionToken: String? = null,
    val expiresIn: Int? = null,
)

/** Payload of `GET /auth/me` — the identity is nested under `user`, not at the top level. */
@Serializable
data class MeEnvelope(
    val user: MeeshyUser,
)

@Serializable
data class RefreshTokenRequest(
    val sessionToken: String,
)

/**
 * Payload of `GET /auth/check-availability?username=&email=&phoneNumber=`.
 *
 * Every field is nullable because the gateway only echoes back the checks it was
 * actually asked to run (a probe for a single field returns only that field's
 * verdict). `suggestions` carries free alternate handles when a username is taken.
 * Parity with the gateway response in `services/gateway/src/routes/auth/register.ts`.
 */
@Serializable
data class AvailabilityResult(
    val usernameAvailable: Boolean? = null,
    val suggestions: List<String>? = null,
    val emailAvailable: Boolean? = null,
    val phoneNumberAvailable: Boolean? = null,
    val phoneNumberValid: Boolean? = null,
)
