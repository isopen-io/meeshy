package me.meeshy.sdk.auth

import me.meeshy.sdk.model.auth.LoginOutcome
import me.meeshy.sdk.net.ApiError

/**
 * Les échecs TYPÉS d'une connexion qui a réussi côté transport mais n'a pas ouvert
 * de session. [AuthRepository.login] (la porte de l'écran actuel) ne sait rendre
 * qu'une session : toute autre issue de [AuthRepository.loginOutcome] y devient un
 * [ApiError] portant l'un de ces codes, que l'appelant peut distinguer sans lire
 * le message.
 */
object AuthFailureCode {
    /** Le compte est protégé : un code de second facteur est attendu (`POST /auth/login/2fa`). */
    const val TWO_FACTOR_REQUIRED: String = "TWO_FACTOR_REQUIRED"

    /** L'adresse doit être prouvée par code ou par lien avant toute session. */
    const val VERIFICATION_REQUIRED: String = "VERIFICATION_REQUIRED"

    /** Le lien ouvrirait un compte qu'il faut d'abord confirmer. */
    const val LINK_CONFIRMATION_REQUIRED: String = "LINK_CONFIRMATION_REQUIRED"

    /** Réponse que ce client ne sait pas lire (statut inconnu, charge vide) : « non pris en charge », jamais une session supposée. */
    const val UNSUPPORTED_RESPONSE: String = "UNSUPPORTED_LOGIN_RESPONSE"

    /** L'échec typé d'une issue qui n'est pas une session. */
    internal fun forNonSession(outcome: LoginOutcome?): ApiError = when (outcome) {
        is LoginOutcome.TwoFactorRequired ->
            ApiError(message = "A second factor is required to sign in", code = TWO_FACTOR_REQUIRED)
        is LoginOutcome.VerificationRequired ->
            ApiError(message = "The email address must be verified before signing in", code = VERIFICATION_REQUIRED)
        is LoginOutcome.LinkConfirmationRequired ->
            ApiError(message = "The sign-in link needs a confirmation", code = LINK_CONFIRMATION_REQUIRED)
        is LoginOutcome.Authenticated, null ->
            ApiError(message = "Unsupported login response", code = UNSUPPORTED_RESPONSE)
    }
}
