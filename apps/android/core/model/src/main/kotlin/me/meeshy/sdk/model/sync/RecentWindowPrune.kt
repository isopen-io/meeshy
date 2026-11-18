package me.meeshy.sdk.model.sync

/**
 * Ce qu'une page de la fenêtre récente peut dire SUPPRIMÉ par son absence (#18915, #19046) — règle pure.
 *
 * La passerelle ordonne `(createdAt desc, id desc)` et coupe à sa limite (`messages-list.ts`). Une ligne détenue que la
 * page ne sert pas n'est partie que si elle se classe AU-DESSUS de cette coupe, et seulement si elle était détenue AVANT
 * la requête : la page a été construite avant toute ligne écrite pendant son vol.
 */
object RecentWindowPrune {

    /** Une ligne serveur détenue : sa clé primaire, son id serveur une fois connu, son instant serveur. */
    data class Held(val id: String, val serverId: String?, val createdAt: Long)

    /** Un message servi : son id, l'id client qu'il renvoie, son instant serveur (`null` : illisible). */
    data class Served(val id: String, val clientMessageId: String?, val createdAt: Long?)

    /**
     * Les clés des lignes de [held] que la page déclare parties :
     * - seulement celles détenues AVANT la requête ([heldBefore], par identité — F3) : une ligne écrite pendant le vol
     *   (socket, accusé de mon envoi, rejeu de la file) est inconnue de la page quel que soit son instant, une ligne datée en
     *   avance comprise — aucune comparaison d'horloges ;
     * - seulement celles classées AU-DESSUS de la coupe dans l'ordre TOTAL de la passerelle (F2) : une ligne de la même
     *   milliseconde que la plus ancienne servie, d'id inférieur, peut être celle que la limite a coupée — vivante ; son
     *   rang est son id serveur, jamais la clé locale d'une bulle réconciliée ;
     * - jamais une ligne que la page sert, sous aucune de ses clés (id, id serveur, `cid_`) ;
     * - aucune si un instant servi est illisible : il ne prouverait rien de la coupe (fail-closed) ;
     * - [reachesOldest] : la page sert TOUT l'historique (`pagination.hasMore == false`, #19423) — plus rien n'existe sous
     *   sa coupe, et une ligne détenue plus ancienne que la plus ancienne servie est partie elle aussi.
     * Une page vide déclare parties toutes les lignes détenues avant elle.
     */
    fun gone(held: List<Held>, heldBefore: Set<String>, page: List<Served>, reachesOldest: Boolean = false): List<String> {
        val instants = page.map { it.createdAt ?: return emptyList() }
        val served = page.flatMapTo(HashSet()) { listOfNotNull(it.id, it.clientMessageId) }
        val cut = page.zip(instants).minWithOrNull(compareBy<Pair<Served, Long>>({ it.second }, { it.first.id }))
        return held
            .filter { row -> row.id in heldBefore && row.id !in served && row.serverId !in served && (reachesOldest || ranksAbove(row, cut)) }
            .map { it.id }
    }

    private fun ranksAbove(row: Held, cut: Pair<Served, Long>?): Boolean {
        val (oldest, at) = cut ?: return true
        return row.createdAt > at || (row.createdAt == at && (row.serverId ?: row.id) > oldest.id)
    }
}
