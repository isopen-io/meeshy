package me.meeshy.sdk.net

import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
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

    /** La passerelle a REFUSÉ le renouvellement : la session du seul compte actif est démontée. */
    public data object Failed : Renewal

    /**
     * La passerelle n'a pas tranché (hors ligne, panne, délai, limite) : la session et sa sauvegarde restent, rien n'est
     * rejoué, et le prochain besoin d'un jeton la renouvellera (#14078).
     */
    public data object Deferred : Renewal
}

/**
 * Le renouvellement de session EN UN SEUL VOL. Un [Mutex] sérialise les demandes et une
 * mémoire des jetons remplacés ([RetiredTokenRing]) fait que les demandes en attente, parties
 * avec l'ancien jeton, rejouent sous le nouveau SANS rappeler `POST /auth/refresh` : cinq 401
 * simultanés = un seul renouvellement. Le jeton présenté fixe l'identité renouvelée (jamais
 * « le compte du moment »).
 *
 * Seul un REFUS démonte la session : une réponse qui dit non (`null`), un 401 ou un 403 `AGE_BELOW_MINIMUM`
 * ([isRefusal]). Une panne de transport, un 5xx, un proxy, un portail, un délai ou une limite rendent
 * [Renewal.Deferred] : hors ligne, l'appareil reste connecté et sa sauvegarde Block Store (#14058) demeure, comme le
 * Keychain d'iOS (#14078).
 *
 * @param refreshCall l'appel `auth/refresh` pour un jeton de session ; `null` = refusé, une exception = non joint
 *   (sauf un refus HTTP, voir [isRefusal]).
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

    /** Le jeton dont le renouvellement n'a pas abouti : son 401 dit « pas joint », jamais « session expirée ». */
    @Volatile
    private var unreached: TornDown? = null

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

    /**
     * Le garde de [AuthExpiryInterceptor] : sans identité présentée, l'expiration est annoncée s'il reste une
     * session à perdre — une session locale, ou celle qu'un renouvellement vient de démonter. Sans aucune, il n'y
     * a rien à expirer : la restauration d'une session sauvegardée (#14058) se fait refuser sans déconnecter.
     */
    public fun signalsExpiry(request: okhttp3.Request): Boolean {
        val presented = RequestCredential.carriedBy(request)?.token
            ?: return !transition.isTransitioning && holdsASessionToLose()
        if (wentUnreached(presented)) return false
        return owns(presented, request.sentCredential()?.generation)
    }

    private fun wentUnreached(presented: String): Boolean =
        tokenStore.jwt == presented &&
            unreached?.let { it.token == presented && it.generation == transition.generation } == true

    private fun holdsASessionToLose(): Boolean =
        tokenStore.jwt != null || tokenStore.sessionToken != null || tornDown?.generation == transition.generation

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
            if (!isRefusal(failure)) return deferred(active, startOwner)
            null
        }
        if (currentOwner() != startOwner || tokenStore.jwt != active) return Renewal.Abandoned
        if (newJwt.isNullOrBlank()) return tearDown(active, startOwner)
        unreached = null
        retired = retired.retire(active, startOwner)
        tokenStore.jwt = newJwt
        return Renewal.Renewed(newJwt)
    }

    private fun deferred(active: String, startOwner: SessionOwner): Renewal {
        if (currentOwner() != startOwner || tokenStore.jwt != active) return Renewal.Abandoned
        unreached = TornDown(active, startOwner.generation)
        return Renewal.Deferred
    }

    private fun tearDown(active: String, startOwner: SessionOwner): Renewal {
        if (currentOwner() == startOwner && tokenStore.jwt == active) {
            tornDown = TornDown(active, startOwner.generation)
            unreached = null
            tokenStore.clear()
        }
        return Renewal.Failed
    }

    public companion object {
        private const val AGE_BELOW_MINIMUM = "AGE_BELOW_MINIMUM"

        /**
         * La passerelle a-t-elle REFUSÉ ? Elle ne refuse un renouvellement que par un 401 (jeton invalide, session
         * révoquée, compte supprimé) ou un 403 `AGE_BELOW_MINIMUM` (#9927), comme iOS (`AuthManager`, `.auth`). Tout le
         * reste — 404 d'un proxy pendant un redéploiement, 403 ou 407 d'un portail captif, délai, limite, 5xx — n'a pas
         * été tranché par elle.
         */
        public fun isRefusal(failure: Throwable): Boolean {
            if (failure !is retrofit2.HttpException) return false
            return when (failure.code()) {
                401 -> true
                403 -> codeOf(failure) == AGE_BELOW_MINIMUM
                else -> false
            }
        }

        private fun codeOf(failure: retrofit2.HttpException): String? {
            val body = runCatching { failure.response()?.errorBody()?.string() }.getOrNull() ?: return null
            val envelope = runCatching { MeeshyApi.json.parseToJsonElement(body) }.getOrNull() as? JsonObject
            return (envelope?.get("code") as? JsonPrimitive)?.takeIf { it.isString }?.content
        }
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
