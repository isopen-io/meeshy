package me.meeshy.sdk.socket

import me.meeshy.sdk.call.CallActivityGate
import javax.inject.Inject
import javax.inject.Singleton

/**
 * « Un appel est en cours ? » vu de la socket (miroir de `isCallActiveGuard`, iOS) : tant qu'il l'est, la
 * signalisation WebRTC voyage par la socket et rien ne la recrée (arrière-plan, retour au premier plan).
 */
@Singleton
class ActiveCallGuard @Inject constructor(private val gate: CallActivityGate) {
    fun isCallActive(): Boolean = gate.isActive
}
