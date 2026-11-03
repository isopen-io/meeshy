package me.meeshy.sdk.auth

import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import me.meeshy.sdk.model.auth.EmailVerificationWatchPolicy
import me.meeshy.sdk.model.auth.EmailVerificationWatchStatus
import me.meeshy.sdk.net.NetworkResult
import javax.inject.Inject

/** Lire l'état d'une attente — injecté dans la veille, adossé à `POST /auth/verification/status`. */
fun interface EmailVerificationStatusSource {
    suspend fun status(pendingSessionToken: String): NetworkResult<EmailVerificationWatchStatus>
}

/**
 * La veille d'une preuve d'adresse faite AILLEURS (miroir de `EmailVerificationViewModel.watchProof`, iOS #8083).
 *
 * Une lecture de l'état toutes les [EmailVerificationWatchPolicy.INTERVAL_MS], [EmailVerificationWatchPolicy.LIMIT_MS]
 * au plus ; le flux se termine sur `PROVEN` ou `ENDED` (401/410) et à la borne. Une panne passagère n'émet rien
 * et se rejoue au tour suivant. Annuler le collecteur arrête toute lecture : rien ne survit à l'écran.
 * Cet état ne donne JAMAIS de session.
 */
class EmailVerificationWatcher @Inject constructor(
    private val source: EmailVerificationStatusSource,
) {
    fun watch(pendingSessionToken: String): Flow<EmailVerificationWatchStatus> = flow {
        var elapsedMs = 0L
        while (EmailVerificationWatchPolicy.withinLimit(elapsedMs)) {
            val result = source.status(pendingSessionToken)
            if (result is NetworkResult.Success) {
                emit(result.data)
                if (!EmailVerificationWatchPolicy.keepsWatching(result.data)) return@flow
            }
            delay(EmailVerificationWatchPolicy.INTERVAL_MS)
            elapsedMs += EmailVerificationWatchPolicy.INTERVAL_MS
        }
    }
}
