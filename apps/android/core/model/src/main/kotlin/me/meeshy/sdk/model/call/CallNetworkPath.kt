package me.meeshy.sdk.model.call

/**
 * Ce que le système dit du chemin qu'un appel emprunte (iOS `CallNetworkPath`, #8697) : [isExpensive] = réseau à
 * l'usage (cellulaire, point d'accès personnel : pas `NOT_METERED`), [isConstrained] = économie de données du système
 * (Data Saver) activée.
 */
data class CallNetworkPath(val isExpensive: Boolean, val isConstrained: Boolean) {
    companion object {
        val UNRESTRICTED = CallNetworkPath(isExpensive = false, isConstrained = false)
    }
}
