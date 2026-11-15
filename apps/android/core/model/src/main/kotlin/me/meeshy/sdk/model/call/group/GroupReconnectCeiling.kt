package me.meeshy.sdk.model.call.group

/** Ce que la passerelle apprend quand CET appareil renonce à un appel décroché — iOS `CallTeardownSignal`. */
enum class CallTeardownSignal { End, Leave }

/**
 * Le plafond de reconnexion ICE est atteint — iOS `CallResumePolicy.teardownSignal(.reconnectCeiling)`. `call:end`
 * termine l'appel pour TOUT LE MONDE : dans un groupe qui continue sans moi, on QUITTE (`call:leave`) au lieu de le
 * raccrocher pour les autres. Un duo garde son comportement : la fin de l'appel.
 */
object GroupReconnectCeiling {
    fun teardownSignal(isGroupCall: Boolean): CallTeardownSignal =
        if (isGroupCall) CallTeardownSignal.Leave else CallTeardownSignal.End
}
