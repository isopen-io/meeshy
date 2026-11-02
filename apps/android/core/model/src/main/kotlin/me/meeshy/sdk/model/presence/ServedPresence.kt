package me.meeshy.sdk.model.presence

import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.UserPresence
import me.meeshy.sdk.model.isoToEpochMillisOrNull

/**
 * Ce qu'une page de conversations a dit de la présence de chacun : [served], ce qu'elle a SERVI
 * (`isOnline` + `lastActiveAt`) ; [masked], ceux qu'elle a MASQUÉS (`false` et pas de date — la loi de
 * visibilité ne permet plus de les voir : ami retiré, `showOnlineStatus` coupé). Un masqué ne sème
 * rien, mais il retire ce que la carte savait de lui, sauf ce que le socket a dit après la réception de
 * la page. Deux marques de la carte ([me.meeshy.sdk.socket.ServedPresenceSink.receipt]), `null` = l'instant
 * où la page est semée : [receipt], prise à l'ARRIVÉE de la réponse — ce qu'elle masque parle de là ;
 * [requested], prise à la DEMANDE — ce qu'elle sert parle de là, jamais plus tard (#13798) : une réponse
 * demandée avant un masque ne le défait pas, même si elle arrive après lui.
 */
data class ServedPresencePage(
    val served: Map<String, UserPresence> = emptyMap(),
    val masked: Set<String> = emptySet(),
    val receipt: Long? = null,
    val requested: Long? = null,
)

/**
 * Ce que les pages d'un parcours disent ENSEMBLE, sans leurs marques : un compte servi par l'une n'est
 * masqué par aucune, et la présence la plus récente d'un compte servi deux fois l'emporte.
 */
fun List<ServedPresencePage>.combined(): ServedPresencePage {
    val served = HashMap<String, UserPresence>()
    for (page in this) {
        for ((userId, presence) in page.served) {
            val known = served[userId]
            if (known == null || presence.isNewerThan(known)) served[userId] = presence
        }
    }
    return ServedPresencePage(served, flatMapTo(HashSet()) { it.masked } - served.keys)
}

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
