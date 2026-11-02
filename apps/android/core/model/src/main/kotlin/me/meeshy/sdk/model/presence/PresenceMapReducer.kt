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
     * la carte. Un « en ligne » servi SANS date (l'Ami, #13928) est tenu par le serveur jusqu'à son
     * `user:status` : le dater le livrerait à la garde anti-stale, qui l'éteindrait cinq minutes plus
     * tard alors que le serveur le sert toujours en ligne. Miroir de `PresenceManager.noteActivity` iOS.
     */
    fun noteActivity(map: PresenceMap, userId: String, currentUserId: String?, nowMillis: Long): PresenceMap {
        if (userId.isBlank() || userId == currentUserId) return map
        val known = map[userId]
        if (known != null && known.isOnline && known.lastActiveAt == null) return map
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

    /**
     * Semis depuis la charge servie par la page de conversations (miroir de `PresenceManager.seed`
     * iOS) : elle n'a d'autorité que sur les INCONNUS. Un utilisateur déjà suivi — par le socket, la
     * frappe ou la relecture du disque — GARDE son entrée ; seules les sources vivantes en
     * remplacent une. Le compte courant et un identifiant vide n'y entrent jamais.
     */
    fun seed(map: PresenceMap, served: Map<String, UserPresence>, currentUserId: String?): PresenceMap {
        val unknown = served.filter { (userId, _) -> userId.isNotBlank() && userId != currentUserId && userId !in map }
        return if (unknown.isEmpty()) map else map + unknown
    }

    /** La carte après un semis, et ceux de ses comptes dont l'entrée ne vient encore que du disque. */
    data class Seeded(val entries: PresenceMap, val restored: Set<String>)

    /**
     * Semis d'une page servie sur une carte dont [restored] ne vient que de la relecture du disque :
     * la page comble les inconnus ET remplace ce qui n'était que relu (le serveur parle maintenant,
     * le disque parlait d'avant). Une ligne masquée RETIRE l'entrée QUELLE QUE SOIT son origine — page
     * précédente, socket, frappe, disque (#13783) : la visibilité a changé, et le serveur n'émet plus
     * rien pour ce compte qui la corrigerait. Seuls [newerThanPage], ceux dont un événement du socket est
     * arrivé APRÈS la réception de la page, gardent la leur : le serveur les a autorisés depuis.
     */
    fun seed(
        map: PresenceMap,
        restored: Set<String>,
        page: ServedPresencePage,
        currentUserId: String?,
        newerThanPage: Set<String> = emptySet(),
    ): Seeded {
        val accepted = page.served.filter { (userId, _) ->
            userId.isNotBlank() && userId != currentUserId && (userId !in map || userId in restored)
        }
        val withdrawn = page.masked.filter { it in map && it !in page.served && it !in newerThanPage }.toSet()
        if (accepted.isEmpty() && withdrawn.isEmpty()) return Seeded(map, restored)
        return Seeded(map - withdrawn + accepted, restored - accepted.keys - withdrawn)
    }

    /**
     * Ce qui n'a été que relu du disque ([readBack]) quitte la carte quand son point s'éteint : aucune
     * source vivante ni page ne l'a confirmé, sa date ne vaut plus rien et ne doit dater aucune fiche.
     * Une entrée vivante n'est jamais touchée ; rien d'éteint rend la MÊME carte.
     */
    fun expireReadBack(map: PresenceMap, readBack: Set<String>, nowMillis: Long): Seeded {
        val expired = readBack.filter { userId -> map[userId]?.let { !PresenceRetention.isRetained(it, nowMillis) } ?: true }.toSet()
        if (expired.isEmpty()) return Seeded(map, readBack)
        val next = map - expired
        return Seeded(if (next.size == map.size) map else next, readBack - expired)
    }

    /**
     * Relecture du disque : elle comble les inconnus et cède à toute entrée vivante déjà posée. [withheld] :
     * ceux qu'une page servie avant la relecture a MASQUÉS — le disque parlait d'avant, ils ne reviennent pas.
     */
    fun restore(map: PresenceMap, restored: PresenceMap, withheld: Set<String> = emptySet()): PresenceMap {
        val unknown = restored.filterKeys { it !in map && it !in withheld }
        return if (unknown.isEmpty()) map else map + unknown
    }
}
