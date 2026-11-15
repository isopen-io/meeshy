package me.meeshy.sdk.model.auth

/**
 * Ce que la porte « e-mail seul » rend à la demande d'un code et d'un lien (iOS `EmailCodeDispatch`, #8083) :
 * la durée de validité, qui amorce le compte à rebours, et le jeton d'attente de CET appareil, qui alimente la
 * veille d'une preuve faite ailleurs. Absente de la charge (vieille passerelle), la durée vaut [DEFAULT_EXPIRES_IN_SECONDS].
 */
data class EmailCodeDispatch(
    val expiresInSeconds: Int,
    val pendingSessionToken: String?,
) {
    companion object {
        /** iOS `dispatch.expiresInSeconds ?? 300`. */
        const val DEFAULT_EXPIRES_IN_SECONDS: Int = 300
    }
}
