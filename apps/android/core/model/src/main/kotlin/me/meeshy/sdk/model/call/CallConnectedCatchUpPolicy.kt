package me.meeshy.sdk.model.call

/**
 * Le « connecté » se lit aussi par NIVEAU, pas seulement par front — port de iOS
 * `CallReliabilityPolicy.shouldCatchUpConnected` (#8270).
 *
 * Le front « connecté » du pair ne tombe que sur une TRANSITION d'état. Un restart ICE sur une paire qui
 * porte encore le média ne quitte jamais `CONNECTED` : aucun front ne revient, et un front tombé pendant
 * que la FSM sonne encore est jeté. La FSM restait alors sur « Connexion… » / « Reconnexion… » alors que le
 * média passait. Une FSM encore en négociation dont le pair se dit déjà connecté rattrape.
 */
object CallConnectedCatchUpPolicy {
    fun shouldCatchUp(callState: CallState, peerConnected: Boolean): Boolean {
        if (!peerConnected) return false
        return when (callState) {
            is CallState.Connecting, is CallState.Reconnecting -> true
            is CallState.Idle, is CallState.Ringing, is CallState.Offering, is CallState.Connected, is CallState.Ended -> false
        }
    }
}
