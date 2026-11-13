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
    /**
     * Le niveau auquel la passerelle juge les outils de cercle (#16623) : le lien réel, sauf entre deux comptes de l'équipe
     * (Sang sans lien). `null` = non servi ; aucun rôle n'est lu ni déduit ici.
     */
    val accessLevel: RelationLevel? = null,
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
