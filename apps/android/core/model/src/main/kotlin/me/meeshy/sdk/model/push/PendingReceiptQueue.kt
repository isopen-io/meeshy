package me.meeshy.sdk.model.push

/**
 * La file persistante des accusés de réception en attente : UNE entrée par conversation (le dernier message
 * accusé l'emporte), plafond [CAP] (les plus anciennes sautent), ordre FIFO ; les échecs d'un rejeu repassent en tête.
 */
public data class PendingReceiptQueue(val entries: List<PushMessageRef> = emptyList()) {

    public val isEmpty: Boolean get() = entries.isEmpty()

    /** Ajoute en queue ; une conversation vide n'entre jamais, une conversation déjà présente est remplacée. */
    public fun enqueue(ref: PushMessageRef): PendingReceiptQueue {
        if (ref.conversationId.isBlank()) return this
        val kept = entries.filterNot { it.conversationId == ref.conversationId }
        return PendingReceiptQueue((kept + ref).takeLast(CAP))
    }

    /**
     * Remet les [failed] en tête, dans leur ordre. Une conversation accusée entre-temps par une entrée plus récente
     * garde cette dernière.
     */
    public fun requeueAtHead(failed: List<PushMessageRef>): PendingReceiptQueue {
        val present = entries.mapTo(HashSet()) { it.conversationId }
        val head = failed
            .filter { it.conversationId.isNotBlank() && it.conversationId !in present }
            .distinctBy { it.conversationId }
        return PendingReceiptQueue((head + entries).take(CAP))
    }

    /** Vide la file et rend ce qu'il faut rejouer, dans l'ordre. */
    public fun drain(): Pair<List<PushMessageRef>, PendingReceiptQueue> = entries to PendingReceiptQueue()

    /** Forme stockée : une ligne `conversationId<TAB>messageId` par entrée. */
    public fun encode(): String = entries.joinToString("\n") { "${it.conversationId}$SEPARATOR${it.messageId}" }

    public companion object {
        public const val CAP: Int = 200
        private const val SEPARATOR = '\t'

        /** Une ligne illisible est purgée, jamais rejouée ; les doublons de conversation se réduisent au dernier. */
        public fun decode(raw: String?): PendingReceiptQueue =
            (raw.orEmpty().lineSequence()).mapNotNull(::parseLine).fold(PendingReceiptQueue()) { queue, ref ->
                queue.enqueue(ref)
            }

        private fun parseLine(line: String): PushMessageRef? {
            val parts = line.split(SEPARATOR)
            if (parts.size != 2) return null
            val (conversationId, messageId) = parts
            if (conversationId.isBlank() || messageId.isBlank()) return null
            return PushMessageRef(conversationId, messageId)
        }
    }
}
