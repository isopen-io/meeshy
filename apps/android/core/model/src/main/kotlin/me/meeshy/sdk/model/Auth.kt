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
