package me.meeshy.sdk.model

import kotlinx.serialization.Serializable

@Serializable
data class LoginRequest(
    val username: String,
    val password: String,
)

/**
 * Corps de `POST /auth/register`.
 *
 * L'inscription tient en UN écran : elle envoie `displayName`, `email`,
 * `password`, la langue de lecture et — seulement s'il est rempli — le
 * téléphone. Elle n'envoie NI `username`, NI `firstName`, NI `lastName` : la
 * passerelle dérive le pseudo du nom affiché. Ces trois champs restent déclarés,
 * nullables et par défaut absents, parce que la passerelle les accepte encore
 * d'autres clients — un champ retiré du type interdirait à ce dépôt de décrire
 * une charge que le serveur sert toujours.
 *
 * Aucun `null` ne part sur le fil : `MeeshyApi.json` est configuré
 * `explicitNulls = false`, donc une propriété nulle est OMISE du JSON. C'est ce
 * qui rend `username = null` sûr — sérialisé, il ferait échouer la validation
 * de la passerelle, qui attend une chaîne ou rien.
 */
@Serializable
data class RegisterRequest(
    val email: String,
    val password: String,
    /** Le nom affiché, seule identité saisie à l'inscription. */
    val displayName: String? = null,
    val username: String? = null,
    val firstName: String? = null,
    val lastName: String? = null,
    val systemLanguage: String? = null,
    val regionalLanguage: String? = null,
    /** E.164 (dial code + national digits, e.g. `"+33612345678"`), or `null` when skipped/empty. */
    val phoneNumber: String? = null,
    /** The selected dial-code country's ISO 3166-1 alpha-2, or `null` alongside [phoneNumber]. */
    val phoneCountryCode: String? = null,
)

/**
 * Charge du `200` de `POST /auth/register` — DEUX branches sous un seul statut.
 *
 * Branche nominale : le compte est créé, [user] et [token] sont servis (plus
 * [sessionToken] / [expiresIn]) et [asSession] les recompose en [AuthSession].
 * Branche conflit : le numéro appartient déjà à un compte vérifié, AUCUN compte
 * n'a été créé, [phoneOwnershipConflict] vaut `true` et l'identité est absente.
 *
 * D'où des champs tous nullables : décoder cette réponse dans [AuthSession] —
 * dont `user` et `token` sont requis — faisait échouer la branche conflit à la
 * désérialisation, et l'utilisateur lisait « réponse malformée » au lieu de
 * « ce numéro est déjà rattaché à un compte ».
 */
@Serializable
data class RegisterResponse(
    val user: MeeshyUser? = null,
    val token: String? = null,
    val sessionToken: String? = null,
    val expiresIn: Int? = null,
    val phoneOwnershipConflict: Boolean = false,
) {
    /** La session créée, ou `null` quand la réponse ne porte pas d'identité. */
    fun asSession(): AuthSession? {
        val account = user ?: return null
        val jwt = token ?: return null
        return AuthSession(user = account, token = jwt, sessionToken = sessionToken, expiresIn = expiresIn)
    }
}

/**
 * Payload of `POST /auth/login`, `POST /auth/refresh` and
 * `POST /auth/magic-link/validate` responses. `POST /auth/register` answers with
 * the two-branch [RegisterResponse] instead, which recomposes this on success.
 */
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
