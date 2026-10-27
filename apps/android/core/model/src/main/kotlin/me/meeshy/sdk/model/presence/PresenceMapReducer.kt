package me.meeshy.sdk.model.presence

import me.meeshy.sdk.model.UserPresence
import me.meeshy.sdk.model.UserStatusEvent
import java.time.Instant

/** La carte de présence d'une session : `userId` -> ce que le serveur a servi (ou la frappe a daté). */
typealias PresenceMap = Map<String, UserPresence>

/**
 * Réduction PURE de la carte de présence unique (miroir de `PresenceManager` iOS) : chaque
 * fonction rend une nouvelle carte, ou LA MÊME instance quand rien ne change (le flux d'état qui la
 * porte ne réémet alors pas). Aucune horloge ni coroutine : l'instant est passé en paramètre.
 *
 * La carte ne contient que ce que le serveur a servi — l'absence d'une entrée veut dire « aucun
 * point », jamais « hors ligne » : rien n'est fabriqué ici.
 */
object PresenceMapReducer {

    /** `user:status` : l'entrée remplace celle de l'utilisateur. */
    fun applyStatus(map: PresenceMap, event: UserStatusEvent): PresenceMap {
        if (event.userId.isBlank()) return map
        val next = UserPresence(isOnline = event.isOnline, lastActiveAt = event.lastActiveAt)
        if (map[event.userId] == next) return map
        return map + (event.userId to next)
    }

    /**
     * `presence:snapshot` : chaque entrée remplace la ligne locale du même utilisateur (corrige un
     * « en ligne » périmé), le DERNIER relevé d'un doublon l'emporte ; les absents sont conservés.
     */
    fun applySnapshot(map: PresenceMap, users: List<UserStatusEvent>): PresenceMap {
        val updates = users
            .filter { it.userId.isNotBlank() }
            .associate { it.userId to UserPresence(isOnline = it.isOnline, lastActiveAt = it.lastActiveAt) }
        if (updates.isEmpty()) return map
        val next = map + updates
        return if (next == map) map else next
    }

    /**
     * Preuve d'activité observée côté client (`typing:start`) : elle DATE l'activité et rien de
     * plus — `lastActiveAt = maintenant`, `isOnline` reste ce que le serveur a dit (faux par défaut).
     * Le pair est vert 60 s puis décroît orange -> gris -> rien. Sa propre activité n'écrit jamais
     * la carte.
     */
    fun noteActivity(map: PresenceMap, userId: String, currentUserId: String?, nowMillis: Long): PresenceMap {
        if (userId.isBlank() || userId == currentUserId) return map
        val known = map[userId]
        return map + (
            userId to UserPresence(
                isOnline = known?.isOnline ?: false,
                lastActiveAt = Instant.ofEpochMilli(nowMillis).toString(),
            )
            )
    }

    /**
     * Coupure du socket : plus personne n'est en ligne AU SENS DU SERVEUR. Chaque entrée passe à
     * `isOnline = false` en gardant son `lastActiveAt` (elle décroît sans s'éteindre d'un coup) ;
     * l'instantané de la reconnexion la remplace.
     */
    fun socketDisconnected(map: PresenceMap): PresenceMap {
        if (map.values.none { it.isOnline }) return map
        return map.mapValues { (_, presence) -> UserPresence(isOnline = false, lastActiveAt = presence.lastActiveAt) }
    }
}
