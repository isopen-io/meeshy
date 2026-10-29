package me.meeshy.sdk.model.presence

import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.UserPresence
import me.meeshy.sdk.model.isoToEpochMillisOrNull

/**
 * La présence que la page de conversations a SERVIE, par compte (miroir de la boucle de
 * `PresenceManager.seed(from:)` iOS). La passerelle masque ce que la loi de visibilité ne permet pas
 * (`false` et pas de date) : une ligne qui ne dit rien — absente ou masquée — ne donne rien, ni
 * « hors ligne » inventé, ni entrée qui en cacherait une meilleure. Un même compte vu dans plusieurs
 * conversations garde la présence la plus récente.
 */
fun List<ApiConversation>.servedPresence(): Map<String, UserPresence> {
    val served = HashMap<String, UserPresence>()
    for (conversation in this) {
        for (participant in conversation.participants) {
            val userId = participant.userId?.takeIf { it.isNotBlank() } ?: continue
            val presence = UserPresence.served(participant.isOnline, participant.lastActiveAt)
                ?.takeIf { it.isOnline || !it.lastActiveAt.isNullOrBlank() }
                ?: continue
            val known = served[userId]
            if (known == null || presence.isNewerThan(known)) served[userId] = presence
        }
    }
    return served
}

private fun UserPresence.isNewerThan(other: UserPresence): Boolean {
    val mine = isoToEpochMillisOrNull(lastActiveAt) ?: Long.MIN_VALUE
    val theirs = isoToEpochMillisOrNull(other.lastActiveAt) ?: Long.MIN_VALUE
    return mine > theirs
}

/**
 * La copie à ranger dans le cache : sans la présence servie. La carte de présence est l'unique
 * porteuse (bornée à 24 h, effacée au changement de compte) ; une copie dans les lignes Room serait
 * une seconde mémoire, sans borne ni source, que rien ne relit.
 */
fun ApiConversation.withoutServedPresence(): ApiConversation {
    if (participants.none { it.isOnline != null || it.lastActiveAt != null }) return this
    return copy(participants = participants.map { it.copy(isOnline = null, lastActiveAt = null) })
}
