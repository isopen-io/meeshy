package me.meeshy.core.database.crypto

/** Ce que le comptage d'une table durable rend : absente du schéma, un nombre de lignes, ou un comptage qui a échoué. */
internal sealed interface TableCount {
    data object Absent : TableCount
    data class Rows(val count: Long) : TableCount
    data object Unreadable : TableCount
}

/**
 * La copie chiffrée porte les mêmes lignes durables que la base en clair : chaque table compte autant de lignes des deux
 * côtés, ou manque des deux côtés (base d'une version qui ne l'avait pas encore). Un comptage qui échoue, d'un côté ou
 * des deux, ne prouve rien : la copie est refusée, la base en clair reste la source et la migration reprend plus tard.
 */
internal object DurableRowCounts {
    val TABLES: List<String> = listOf(
        "outbox", "media_blob", "tus_upload_checkpoint", "sync_meta", "e2ee_plaintext_erasures", "messages", "conversations",
    )

    fun match(plain: (String) -> TableCount, copy: (String) -> TableCount): Boolean = TABLES.all { table ->
        val source = plain(table)
        val target = copy(table)
        source != TableCount.Unreadable && target != TableCount.Unreadable && source == target
    }
}
