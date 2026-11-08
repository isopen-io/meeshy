package me.meeshy.sdk.model.call

/** Verdict d'un tick en `Connecting` ; le temps écoulé est en secondes. */
sealed interface ConnectingStep {
    data object Waiting : ConnectingStep
    data class RestartIce(val elapsedSeconds: Double) : ConnectingStep
    data class Fail(val elapsedSeconds: Double) : ConnectingStep
}

/** Un tick en `Connecting` : le verdict et la chronologie suivante. */
data class ConnectingTick(val step: ConnectingStep, val watchdog: CallReliabilityWatchdog)

/**
 * Les horloges du moniteur de fiabilité — port de iOS `CallReliabilityWatchdog` (#11522). Valeur immuable,
 * avancée une fois par tick pour l'état où se trouve l'appel :
 *
 *  - `Connecting` : l'horloge ICE/DTLS démarre quand l'offre distante est en main (un appelé qui attend
 *    encore l'offre la remet à zéro : la minuterie d'offre tient cette phase), reçoit UN restart ICE puis échoue ;
 *  - `Connected` : la détection du lien à moitié ouvert, clé sur l'époque de connexion ;
 *  - `Offering` / `Connected` remettent tout à zéro ; tout autre état ne fait que lâcher les horloges
 *    (le restart de connexion dépensé le reste).
 */
data class CallReliabilityWatchdog(
    val connectingSinceMs: Long? = null,
    val didAttemptConnectingRestart: Boolean = false,
    val halfOpen: HalfOpenMonitorState = HalfOpenMonitorState(),
) {
    fun offering(): CallReliabilityWatchdog = connectingCaughtUp()

    fun connected(): CallReliabilityWatchdog = connectingCaughtUp()

    fun otherState(): CallReliabilityWatchdog = copy(connectingSinceMs = null)

    fun connectingCaughtUp(): CallReliabilityWatchdog =
        copy(connectingSinceMs = null, didAttemptConnectingRestart = false)

    fun withHalfOpen(next: HalfOpenMonitorState): CallReliabilityWatchdog = copy(halfOpen = next)

    /** Un tick en `Connecting`, après que le rattrapage par niveau n'a pas tiré. */
    fun connecting(
        nowMs: Long,
        failAfterSeconds: Double = CallQualityThresholds.CONNECTING_FAIL_SECONDS,
        awaitingRemoteOffer: Boolean,
    ): ConnectingTick {
        if (awaitingRemoteOffer) return ConnectingTick(ConnectingStep.Waiting, connectingCaughtUp())
        val since = connectingSinceMs ?: nowMs
        val armed = copy(connectingSinceMs = since)
        val elapsed = (nowMs - since) / MS_PER_SECOND
        return when (
            CallReliabilityPolicy.evaluateConnecting(
                secondsInConnecting = elapsed,
                didAttemptRestart = didAttemptConnectingRestart,
                failAfterSeconds = failAfterSeconds,
            )
        ) {
            ConnectingOutcome.Waiting -> ConnectingTick(ConnectingStep.Waiting, armed)
            ConnectingOutcome.RestartIce ->
                ConnectingTick(ConnectingStep.RestartIce(elapsed), armed.copy(didAttemptConnectingRestart = true))
            ConnectingOutcome.Fail -> ConnectingTick(ConnectingStep.Fail(elapsed), armed)
        }
    }

    private companion object {
        const val MS_PER_SECOND = 1_000.0
    }
}
