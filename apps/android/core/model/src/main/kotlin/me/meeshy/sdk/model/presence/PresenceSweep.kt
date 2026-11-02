package me.meeshy.sdk.model.presence

/**
 * Les marques que la carte tient par compte (#13798), toutes données par le MÊME compteur du process (un
 * ordinal, jamais une heure) : [heard], le dernier événement du SERVEUR reçu par le socket — `user:status`,
 * `presence:snapshot`, jamais la frappe ni `viewing:*`, qui datent une activité sans rien autoriser ;
 * [seeded], la demande de la page qui a servi le compte ; [masked], l'arrivée de la dernière page qui l'a
 * masqué, gardée même quand l'entrée est partie — c'est elle qui empêche une page plus ancienne de le ressemer.
 */
data class PresenceMarks(
    val heard: Map<String, Long> = emptyMap(),
    val seeded: Map<String, Long> = emptyMap(),
    val masked: Map<String, Long> = emptyMap(),
) {
    /** Le serveur a parlé de [users] par le socket sous la marque [mark] : il les autorise depuis, aucun masque d'avant ne tient. */
    fun heard(users: Collection<String>, mark: Long): PresenceMarks {
        val spoken = users.toSet()
        return copy(heard = heard + spoken.associateWith { mark }, masked = masked - spoken)
    }

    /** [heard] et [seeded] suivent la carte ; [masked] survit à l'entrée qu'il a retirée. */
    fun keptFor(entries: PresenceMap): PresenceMarks =
        copy(heard = heard.filterKeys { it in entries }, seeded = seeded.filterKeys { it in entries })
}

/**
 * Le semis d'un PARCOURS de pages de conversations, dans l'ordre où le serveur a parlé (#13798). Chaque
 * page parle depuis ses marques ([ServedPresencePage.requested] pour ce qu'elle sert,
 * [ServedPresencePage.receipt] pour ce qu'elle masque ; sans marque, depuis [nowMark], l'instant du semis) :
 * - un compte masqué est retiré, sauf si le serveur en a parlé APRÈS la dernière page du parcours qui le masque —
 *   par le socket ([PresenceMarks.heard]) ou par une page plus récente qui l'a servi ([PresenceMarks.seeded]) ;
 *   une page masquante masque donc ce qu'elle devait masquer, même si d'autres pages du parcours sont arrivées après ;
 * - un compte servi n'est admis que si la première page du parcours qui le sert a été DEMANDÉE après le dernier
 *   masque connu : un parcours plus ancien qui finit après un plus récent ne ressème rien que ce dernier a masqué.
 * Pour le reste, la loi est celle de [PresenceMapReducer.seed] : inconnus et relus du disque seulement, jamais le
 * compte courant.
 */
object PresenceSweep {

    /** La carte, ce qui n'est encore que relu, les marques, et les comptes servis que l'ordre a ADMIS. */
    data class Swept(val entries: PresenceMap, val restored: Set<String>, val marks: PresenceMarks, val admitted: Set<String>)

    fun seed(
        map: PresenceMap,
        restored: Set<String>,
        pages: List<ServedPresencePage>,
        currentUserId: String?,
        marks: PresenceMarks,
        nowMark: Long,
    ): Swept {
        val combined = pages.combined()
        val servedAt = combined.served.keys.associateWith { userId ->
            pages.filter { userId in it.served }.minOf { it.requested ?: it.receipt ?: nowMark }
        }
        val maskedAt = combined.masked.associateWith { userId ->
            pages.filter { userId in it.masked }.maxOf { it.receipt ?: nowMark }
        }
        val admitted = combined.served.filterKeys { userId ->
            marks.masked[userId]?.let { servedAt.getValue(userId) > it } ?: true
        }
        val spared = maskedAt.filter { (userId, at) ->
            (marks.heard[userId] ?: Long.MIN_VALUE) > at || (marks.seeded[userId] ?: Long.MIN_VALUE) > at
        }.keys
        val seeded = PresenceMapReducer.seed(map, restored, combined.copy(served = admitted), currentUserId, spared)
        val next = PresenceMarks(
            heard = marks.heard,
            seeded = marks.seeded + admitted.keys.associateWith { maxOf(marks.seeded[it] ?: Long.MIN_VALUE, servedAt.getValue(it)) },
            masked = marks.masked - admitted.keys + maskedAt.mapValues { (userId, at) -> maxOf(marks.masked[userId] ?: Long.MIN_VALUE, at) },
        ).keptFor(seeded.entries)
        return Swept(seeded.entries, seeded.restored, next, admitted.keys)
    }
}
