package me.meeshy.sdk.net

import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import me.meeshy.sdk.model.auth.JwtExpiry
import me.meeshy.sdk.model.auth.OwnershipVerdict
import me.meeshy.sdk.model.auth.RequestOwnership
import me.meeshy.sdk.model.auth.RetiredTokenRing
import me.meeshy.sdk.model.auth.SessionOwner

/** Le résultat d'une demande de renouvellement faite au nom d'un jeton présenté. */
public sealed interface Renewal {
    /** Rejouer sous [jwt]. */
    public class Renewed(public val jwt: String) : Renewal

    /** La requête n'appartient plus à la session active : ni renouvellement ni rejeu. */
    public data object Abandoned : Renewal

    /** Le renouvellement a échoué : la session du seul compte actif est démontée. */
    public data object Failed : Renewal
}

/**
 * Le renouvellement de session EN UN SEUL VOL. Un [Mutex] sérialise les demandes et une
 * mémoire des jetons remplacés ([RetiredTokenRing]) fait que les demandes en attente, parties
 * avec l'ancien jeton, rejouent sous le nouveau SANS rappeler `POST /auth/refresh` : cinq 401
 * simultanés = un seul renouvellement. Le jeton présenté fixe l'identité renouvelée (jamais
 * « le compte du moment »).
 *
 * @param refreshCall l'appel `auth/refresh` pour un jeton de session ; `null` = refusé.
 */
public class SessionRefresher(
    private val tokenStore: TokenStore,
    private val transition: SessionTransitionFlags = SessionTransitionFlags(),
    private val nowEpochSeconds: () -> Double = { System.currentTimeMillis() / 1000.0 },
    private val refreshCall: suspend (sessionToken: String) -> String?,
) {
    private val mutex = Mutex()

    @Volatile
    private var retired = RetiredTokenRing()

    private class TornDown(val token: String, val generation: Long)

    @Volatile
    private var tornDown: TornDown? = null

    private fun currentOwner() = SessionOwner(tokenStore.userId, transition.generation)

    /** Le jeton frais d'un compte : renouvelé si besoin (échu à 30 s près), pour TUS, /sync et le socket. */
    public suspend fun freshAuthToken(): String? {
        val jwt = tokenStore.jwt ?: return tokenStore.sessionToken
        if (!JwtExpiry.isExpired(jwt, nowEpochSeconds())) return jwt
        return (renew(jwt, sentUnderGeneration = null) as? Renewal.Renewed)?.jwt ?: tokenStore.jwt
    }

    /** Vrai quand le JWT détenu est échu : à renouveler AVANT l'envoi. */
    public fun isDueForRefresh(): Boolean {
        val jwt = tokenStore.jwt ?: return false
        return JwtExpiry.isExpired(jwt, nowEpochSeconds())
    }

    /**
     * Le refus d'une requête vise-t-il le compte actif (jwt, ou jeton d'invité), sous la
     * génération courante, hors bascule ? Un compte que CE refus vient de démonter reste
     * propriétaire de son refus : l'expiration doit encore être annoncée.
     */
    public fun owns(presentedToken: String?, sentUnderGeneration: Long?): Boolean {
        if (presentedToken.isNullOrBlank() || transition.isTransitioning) return false
        val gone = tornDown
        if (gone != null && gone.token == presentedToken && gone.generation == transition.generation) return true
        val active = tokenStore.jwt ?: tokenStore.sessionToken
        return verdictLocked(presentedToken, active, currentOwner(), sentUnderGeneration) == OwnershipVerdict.OWNER
    }

    /** Le garde de [AuthExpiryInterceptor] : sans identité présentée, l'expiration est annoncée. */
    public fun signalsExpiry(request: okhttp3.Request): Boolean {
        val presented = RequestCredential.carriedBy(request)?.token
            ?: return !transition.isTransitioning
        return owns(presented, request.sentCredential()?.generation)
    }

    public suspend fun renew(presentedJwt: String, sentUnderGeneration: Long?): Renewal = mutex.withLock {
        val startOwner = currentOwner()
        val active = tokenStore.jwt
        when (verdictLocked(presentedJwt, active, startOwner, sentUnderGeneration)) {
            OwnershipVerdict.ABANDON -> Renewal.Abandoned
            OwnershipVerdict.REPLAY_WITH_CURRENT -> Renewal.Renewed(requireNotNull(active))
            OwnershipVerdict.OWNER -> renewLocked(requireNotNull(active), startOwner)
        }
    }

    /** Pour l'`Authenticator` d'OkHttp, qui exige une réponse bloquante. */
    public fun renewBlocking(presentedJwt: String, sentUnderGeneration: Long?): Renewal =
        runBlocking { renew(presentedJwt, sentUnderGeneration) }

    public fun freshAuthTokenBlocking(): String? = runBlocking { freshAuthToken() }

    private suspend fun renewLocked(active: String, startOwner: SessionOwner): Renewal {
        val session = tokenStore.sessionToken ?: return tearDown(active, startOwner)
        val newJwt = try {
            refreshCall(session)
        } catch (cancelled: kotlinx.coroutines.CancellationException) {
            throw cancelled
        } catch (@Suppress("TooGenericExceptionCaught") failure: Exception) {
            null
        }
        if (currentOwner() != startOwner || tokenStore.jwt != active) return Renewal.Abandoned
        if (newJwt.isNullOrBlank()) return tearDown(active, startOwner)
        retired = retired.retire(active, startOwner)
        tokenStore.jwt = newJwt
        return Renewal.Renewed(newJwt)
    }

    private fun tearDown(active: String, startOwner: SessionOwner): Renewal {
        if (currentOwner() == startOwner && tokenStore.jwt == active) {
            tornDown = TornDown(active, startOwner.generation)
            tokenStore.clear()
        }
        return Renewal.Failed
    }

    private fun verdictLocked(
        presented: String?,
        active: String?,
        owner: SessionOwner,
        sentUnderGeneration: Long?,
    ): OwnershipVerdict = RequestOwnership.decide(
        presentedToken = presented,
        activeToken = active,
        current = owner,
        sentUnderGeneration = sentUnderGeneration,
        retired = retired,
        isTransitioning = transition.isTransitioning,
    )
}
