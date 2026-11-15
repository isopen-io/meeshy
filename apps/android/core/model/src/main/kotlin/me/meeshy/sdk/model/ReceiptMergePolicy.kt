package me.meeshy.sdk.model

/**
 * Les accusés d'UN message envoyé : de quoi dériver la coche ([DeliveryStatusResolver]) sans jamais
 * fabriquer un état « lu » à côté d'eux. [recipientCount] est le dénominateur servi (0 = inconnu).
 */
data class ReceiptCounters(
    val deliveredCount: Int = 0,
    val readCount: Int = 0,
    val recipientCount: Int = 0,
    val deliveredToAllAt: String? = null,
    val readByAllAt: String? = null,
)

/**
 * Fusion « strictement meilleur seulement » des accusés (miroir de `ReadStatusReceipt.merged` iOS) : une
 * coche ne recule jamais, quel que soit le canal le plus lent (réponse REST ancienne, événement rejoué
 * dans le désordre). Le dénominateur positif est ADOPTÉ — c'est lui qui rend la règle tout-ou-rien d'un
 * groupe applicable à une ligne née d'un socket. Pure, sans état.
 */
object ReceiptMergePolicy {

    val ReadStatusSummary.counters: ReceiptCounters
        get() = ReceiptCounters(
            deliveredCount = deliveredCount,
            readCount = readCount,
            recipientCount = totalMembers,
            readByAllAt = readByAllAt,
        )

    fun countersOf(message: ApiMessage): ReceiptCounters = ReceiptCounters(
        deliveredCount = message.deliveredCount,
        readCount = message.readCount,
        recipientCount = message.recipientCount ?: 0,
        deliveredToAllAt = message.deliveredToAllAt,
        readByAllAt = message.readByAllAt,
    )

    fun withCounters(message: ApiMessage, counters: ReceiptCounters): ApiMessage = message.copy(
        deliveredCount = counters.deliveredCount,
        readCount = counters.readCount,
        recipientCount = counters.recipientCount.takeIf { it > 0 } ?: message.recipientCount,
        deliveredToAllAt = counters.deliveredToAllAt,
        readByAllAt = counters.readByAllAt,
    )

    /** [current] porté vers [incoming] champ par champ, seulement quand [incoming] est strictement meilleur. */
    fun merged(current: ReceiptCounters, incoming: ReceiptCounters): ReceiptCounters = ReceiptCounters(
        deliveredCount = maxOf(current.deliveredCount, incoming.deliveredCount),
        readCount = maxOf(current.readCount, incoming.readCount),
        recipientCount = if (incoming.recipientCount > 0) incoming.recipientCount else current.recipientCount,
        deliveredToAllAt = current.deliveredToAllAt ?: incoming.deliveredToAllAt,
        readByAllAt = current.readByAllAt ?: incoming.readByAllAt,
    )

    /** Fusion en lot : l'ordre d'arrivée des [incomings] est sans effet sur le résultat. */
    fun mergedAll(current: ReceiptCounters, incomings: Iterable<ReceiptCounters>): ReceiptCounters =
        incomings.fold(current, ::merged)

    /** Le message avec ses accusés fusionnés ; le MÊME objet quand rien ne progresse. */
    fun applying(message: ApiMessage, incoming: ReceiptCounters): ApiMessage {
        val current = countersOf(message)
        val next = merged(current, incoming)
        return if (next == current) message else withCounters(message, next)
    }

    /** Un résumé qui n'affirme rien (dénominateur nul : chemin d'erreur de la passerelle) ne s'applique pas. */
    fun describes(summary: ReadStatusSummary): Boolean = summary.totalMembers > 0
}
