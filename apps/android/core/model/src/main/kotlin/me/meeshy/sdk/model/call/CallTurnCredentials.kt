package me.meeshy.sdk.model.call

/** Ce que l'appel fait de ses identifiants TURN une fois sa connexion configurée. */
sealed interface TurnCredentialsStart {
    /** Aucun serveur utilisable : `call:request-ice-servers` tout de suite, sans attendre l'échéance. */
    data object RequestNow : TurnCredentialsStart

    /** Le renouvellement s'arme à l'échéance du jeu servi. */
    data class Schedule(val delayMs: Long) : TurnCredentialsStart
}

/** Ce que devient ICE quand des identifiants frais viennent d'être posés — iOS `TurnRefreshIceAction` (#8074). */
enum class TurnRefreshIceAction {
    /** Aucune négociation encore, ICE déjà en cours, ou appel fini : la nouvelle configuration suffit. */
    Inert,

    /** Une reconnexion est en vol : sa relance repart tout de suite avec les identifiants frais. */
    RearmReconnect,

    /** L'appel est établi : une relance ICE discrète re-collecte les relais, la paire en service porte le média. */
    RestartIce,
}

/**
 * Les identifiants TURN d'un appel en cours (#13773) — iOS `CallTurnCredentials` + `CallReliabilityPolicy` +
 * `TurnCredentialRefreshPolicy`. Ils se renouvellent à 80 % de leur durée de vie par `call:request-ice-servers` ;
 * la réponse `call:ice-servers-refreshed` est posée par `setConfiguration` puis réarme l'échéance sur son TTL. Sans
 * réponse en [RETRY_TIMEOUT_MS], la demande repart, [MAX_RETRIES] fois au plus, puis le cycle suivant s'arme au
 * plancher. Le serveur dit le TTL dans l'ACK de `call:initiate` et dans chaque jeu rafraîchi ; l'ACK de
 * `call:join` ne le dit pas, et le défaut de la passerelle ([DEFAULT_TTL_SECONDS]) vaut alors.
 */
object CallTurnCredentialsLaw {
    /** `TURN_CREDENTIAL_TTL` par défaut de la passerelle — iOS `turnDefaultCredentialTTLSeconds`. */
    const val DEFAULT_TTL_SECONDS: Long = 86_400L

    /** iOS `turnMinRefreshDelaySeconds` : un TTL dégénéré arme au plancher, jamais ne désarme. */
    const val MIN_REFRESH_DELAY_MS: Long = 30_000L

    /** iOS `turnRefreshRetryTimeoutSeconds` : la demande n'a pas d'ACK, son silence se garde. */
    const val RETRY_TIMEOUT_MS: Long = 8_000L

    /** iOS `turnRefreshMaxRetries`. */
    const val MAX_RETRIES: Int = 3

    private const val REFRESH_FRACTION_PER_MILLE: Long = 800L

    /** L'échéance du renouvellement : 80 % du TTL servi, jamais sous le plancher ; un TTL absent vaut le défaut. */
    fun refreshDelayMs(ttlSeconds: Long?): Long {
        val ttl = ttlSeconds ?: DEFAULT_TTL_SECONDS
        return maxOf(MIN_REFRESH_DELAY_MS, ttl * REFRESH_FRACTION_PER_MILLE)
    }

    /** iOS `armTurnCredentialsAfterConfigure` : un jeu vide (repli STUN seul) demande des identifiants tout de suite. */
    fun afterConfigure(iceServers: List<SocketIceServer>, ttlSeconds: Long? = null): TurnCredentialsStart =
        if (iceServers.isEmpty()) TurnCredentialsStart.RequestNow
        else TurnCredentialsStart.Schedule(refreshDelayMs(ttlSeconds))

    /** Après [attempt] relances sans réponse, la demande repart-elle ? */
    fun shouldRetry(attempt: Int): Boolean = attempt < MAX_RETRIES

    /** iOS `TurnCredentialRefreshPolicy.iceAction(after:)`. */
    fun iceAction(state: CallState): TurnRefreshIceAction = when (state) {
        is CallState.Reconnecting -> TurnRefreshIceAction.RearmReconnect
        CallState.Connected -> TurnRefreshIceAction.RestartIce
        CallState.Idle, is CallState.Ringing, CallState.Offering, CallState.Connecting, is CallState.Ended ->
            TurnRefreshIceAction.Inert
    }
}
