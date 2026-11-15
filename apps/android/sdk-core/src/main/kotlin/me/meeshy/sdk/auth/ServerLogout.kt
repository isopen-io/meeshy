package me.meeshy.sdk.auth

import android.util.Log
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import me.meeshy.core.common.IoDispatcher
import me.meeshy.sdk.model.auth.ServerLogoutPolicy
import me.meeshy.sdk.model.auth.ServerLogoutPolicy.AttemptOutcome
import me.meeshy.sdk.model.auth.ServerLogoutPolicy.Step
import me.meeshy.sdk.model.auth.ServerLogoutPolicy.Verdict
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.AuthApi
import me.meeshy.sdk.net.apiCallUnit
import javax.inject.Inject
import javax.inject.Singleton

/** Qui prend la suite quand les essais immédiats échouent (WorkManager en production). */
interface ServerLogoutScheduler {
    fun schedule(jwt: String?, sessionToken: String?)
}

/** Le journal de la fermeture : jamais un jeton, jamais une donnée personnelle. */
interface ServerLogoutLog {
    fun info(message: String)
    fun warn(message: String)
    fun error(message: String)
}

class AndroidServerLogoutLog @Inject constructor() : ServerLogoutLog {
    override fun info(message: String) {
        Log.i(TAG, message)
    }

    override fun warn(message: String) {
        Log.w(TAG, message)
    }

    override fun error(message: String) {
        Log.e(TAG, message)
    }

    private companion object {
        const val TAG = "ServerLogout"
    }
}

/**
 * Fermeture de la session côté passerelle, au mieux, miroir d'`AuthServerLogout` (iOS) : `POST /auth/logout` avec
 * les jetons CAPTURÉS avant l'effacement local, trois essais à 0 s, 1 s, 5 s ([ServerLogoutPolicy]). Un 401 vaut
 * « session déjà close ». Trois échecs passent la main à la reprise WorkManager (réseau requis, recul exponentiel).
 * La déconnexion locale ne l'attend jamais : [closeInBackground] rend la main aussitôt.
 */
@Singleton
class ServerLogout internal constructor(
    private val authApi: AuthApi,
    private val scheduler: ServerLogoutScheduler,
    private val log: ServerLogoutLog,
    private val scope: CoroutineScope,
) {
    @Inject
    constructor(
        authApi: AuthApi,
        scheduler: ServerLogoutScheduler,
        log: ServerLogoutLog,
        @IoDispatcher dispatcher: CoroutineDispatcher,
    ) : this(authApi, scheduler, log, CoroutineScope(SupervisorJob() + dispatcher))

    fun closeInBackground(jwt: String?, sessionToken: String?) {
        if (jwt == null && sessionToken == null) return
        scope.launch { close(jwt, sessionToken) }
    }

    suspend fun close(jwt: String?, sessionToken: String?): Verdict? {
        var attemptsMade = 0
        var delayMillis = ServerLogoutPolicy.ATTEMPT_DELAYS_MILLIS.first()
        while (true) {
            if (delayMillis > 0) delay(delayMillis)
            val outcome = attemptOnce(jwt, sessionToken)
            attemptsMade += 1
            when (val step = ServerLogoutPolicy.after(attemptsMade, outcome)) {
                is Step.Retry -> delayMillis = step.delayMillis
                is Step.Finished -> {
                    log.info(if (step.verdict == Verdict.CLOSED) "session closed" else "token refused: session already closed")
                    return step.verdict
                }
                Step.HandOver -> {
                    log.warn("server logout failed $attemptsMade times: handing over to the retry worker")
                    scheduler.schedule(jwt, sessionToken)
                    return null
                }
            }
        }
    }

    /** Un seul essai, avec les jetons explicites (jamais ceux du porte-jetons, déjà vidé ou habité par un autre compte). */
    suspend fun attemptOnce(jwt: String?, sessionToken: String?): AttemptOutcome =
        try {
            when (val result = apiCallUnit { authApi.logout(authorization = jwt?.let { "Bearer $it" }, sessionToken = sessionToken) }) {
                is NetworkResult.Success -> AttemptOutcome.CLOSED
                is NetworkResult.Failure -> ServerLogoutPolicy.outcomeOf(result.error.httpStatus)
            }
        } catch (cancellation: CancellationException) {
            throw cancellation
        } catch (failure: Exception) {
            AttemptOutcome.FAILED
        }

    /** Fin de la reprise sans accusé : la session passerelle PEUT subsister (elle expirera d'elle-même). */
    fun logMayLinger() {
        log.error("server logout abandoned: session may linger on gateway")
    }
}
