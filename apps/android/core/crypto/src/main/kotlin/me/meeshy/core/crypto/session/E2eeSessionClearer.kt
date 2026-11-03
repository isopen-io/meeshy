package me.meeshy.core.crypto.session

/** Efface les clés de session et les clés d'appareil du compte qui QUITTE l'appareil. */
public fun interface E2eeSessionClearer {
    public suspend fun clearSessions()
}
