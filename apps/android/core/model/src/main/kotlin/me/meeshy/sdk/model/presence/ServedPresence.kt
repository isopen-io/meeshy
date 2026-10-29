package me.meeshy.sdk.model.presence

import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.UserPresence
import me.meeshy.sdk.model.isoToEpochMillisOrNull

/**
 * Ce qu'une page de conversations a dit de la présence de chacun : [served], ce qu'elle a SERVI
 * (`isOnline` + `lastActiveAt`) ; [masked], ceux qu'elle a MASQUÉS (`false` et pas de date — la loi de
 * visibilité ne permet plus de les voir : ami retiré, `showOnlineStatus` coupé). Un masqué ne sème
 * rien, mais il retire ce que la carte n'avait que du disque.
 */
data class ServedPresencePage(
    val served: Map<String, UserPresence> = emptyMap(),
    val masked: Set<String> = emptySet(),
)

/**
 * La présence que la page de conversations a SERVIE, par compte (miroir de la boucle de
 * `PresenceManager.seed(from:)` iOS). Une ligne qui ne dit rien (champ absent) ne donne rien, ni
 * « hors ligne » inventé, ni entrée qui en cacherait une meilleure ; une ligne masquée nomme son
 * compte dans [ServedPresencePage.masked], sauf si une autre conversation le sert. Un même compte vu
 * dans plusieurs conversations garde la présence la plus récente.
 */
fun List<ApiConversation>.servedPresence(): ServedPresencePage {
    val served = HashMap<String, UserPresence>()
    val masked = HashSet<String>()
    for (conversation in this) {
        for (participant in conversation.participants) {
            val userId = participant.userId?.takeIf { it.isNotBlank() } ?: continue
            val presence = UserPresence.served(participant.isOnline, participant.lastActiveAt) ?: continue
            if (!presence.isOnline && presence.lastActiveAt.isNullOrBlank()) {
                masked += userId
                continue
            }
            val known = served[userId]
            if (known == null || presence.isNewerThan(known)) served[userId] = presence
        }
    }
    return ServedPresencePage(served, masked - served.keys)
}

private fun UserPresence.isNewerThan(other: UserPresence): Boolean {
    val mine = isoToEpochMillisOrNull(lastActiveAt) ?: Long.MIN_VALUE
    val theirs = isoToEpochMillisOrNull(other.lastActiveAt) ?: Long.MIN_VALUE
    return mine > theirs
}

/**
 * La copie à ranger dans le cache : sans la présence servie. La carte de présence est l'unique
 * porteuse (bornée à la vie de son point, effacée au changement de compte) ; une copie dans les lignes Room serait
 * une seconde mémoire, sans borne ni source, que rien ne relit.
 */
fun ApiConversation.withoutServedPresence(): ApiConversation {
    if (participants.none { it.isOnline != null || it.lastActiveAt != null }) return this
    return copy(participants = participants.map { it.copy(isOnline = null, lastActiveAt = null) })
}
