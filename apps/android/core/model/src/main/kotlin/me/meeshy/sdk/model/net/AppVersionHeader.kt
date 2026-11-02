package me.meeshy.sdk.model.net

/**
 * La moitié CLIENTE de la porte de version — miroir de `AppVersionHeader` (iOS) et de
 * `compareAppVersions` / `isBelowFloor` (`services/gateway/src/utils/appVersion.ts`).
 *
 * Deux moitiés d'une porte qui compareraient différemment produiraient soit un client qui
 * se croit à jour quand le serveur le refuse, soit un client qui se barre lui-même alors
 * que le serveur le sert. L'algorithme reproduit celui du serveur : trois composantes,
 * jamais quatre ; une composante illisible vaut 0 (c'est `parseInt`, qui lit le PRÉFIXE
 * numérique) ; un plancher vide désarme la porte ; une version absente n'est jamais dessous.
 */
public object AppVersionHeader {
    public const val VERSION_HEADER: String = "X-App-Version"
    public const val PLATFORM_HEADER: String = "X-App-Platform"
    public const val PLATFORM_VALUE: String = "android"

    /** Repli quand le paquet n'a pas de `versionName` : SOUS tout plancher armé. */
    public const val FALLBACK_VERSION: String = "0.0.0"

    private const val COMPONENTS = 3

    public fun compare(lhs: String, rhs: String): Int {
        val a = components(lhs)
        val b = components(rhs)
        for (index in 0 until COMPONENTS) {
            val delta = a.getOrElse(index) { 0 }.compareTo(b.getOrElse(index) { 0 })
            if (delta != 0) return delta
        }
        return 0
    }

    public fun isBelow(version: String?, floor: String): Boolean {
        if (floor.isEmpty()) return false
        if (version.isNullOrEmpty()) return false
        return compare(version, floor) < 0
    }

    private fun components(version: String): List<Long> =
        version.split('.').map { part ->
            val negative = part.startsWith('-')
            val digits = part.removePrefix("-").takeWhile { it in '0'..'9' }
            val value = digits.toLongOrNull() ?: 0L
            if (negative) -value else value
        }
}
