package me.meeshy.sdk.model.relation

import java.time.Instant
import java.time.format.DateTimeParseException

/**
 * Le verrou de remontée que `GET /relations/:userId` sert (#14910) : `canRaise` et `raiseBlockedUntil` (ISO), tous deux
 * facultatifs. Un serveur qui ne les sert pas laisse le comportement d'avant ; une échéance illisible ne bloque rien.
 */
public data class RelationRaiseGate(
    val canRaise: Boolean? = null,
    val raiseBlockedUntil: String? = null,
) {
    public fun blocks(nowMillis: Long): Boolean {
        if (canRaise == false) return true
        val until = raiseBlockedUntil?.let(::epochMillis) ?: return false
        return until > nowMillis
    }

    private fun epochMillis(iso: String): Long? = try {
        Instant.parse(iso).toEpochMilli()
    } catch (_: DateTimeParseException) {
        null
    }
}
