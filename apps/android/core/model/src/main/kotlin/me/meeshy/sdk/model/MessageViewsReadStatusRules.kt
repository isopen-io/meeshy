package me.meeshy.sdk.model

/**
 * Règles PURES du statut de lecture de la fiche « Vu par » — miroir de
 * `MessageViewsReadStatusRules.swift`.
 */
object MessageViewsReadStatusRules {

    /** `force` laisse un `read-status:updated` vivant rafraîchir une fiche déjà remplie. */
    fun shouldFetch(hasExisting: Boolean, isLoading: Boolean, force: Boolean, hasServerId: Boolean): Boolean {
        if (!hasServerId || isLoading) return false
        return force || !hasExisting
    }

    /** Stale-while-revalidate : le spinner n'appartient qu'au démarrage à froid. */
    fun showsSpinner(isLoading: Boolean, hasExisting: Boolean): Boolean = isLoading && !hasExisting

    /** Le décompte servi par le read-status (expéditeur EXCLU du dénominateur). */
    data class ReadStatusTally(val recipientCount: Int, val deliveredCount: Int, val readCount: Int)

    /** Ce que le message porte lui-même. */
    data class MessageDeliveryCounts(
        val recipientCount: Int = 0,
        val deliveredCount: Int = 0,
        val readCount: Int = 0,
        val deliveredToAllAt: String? = null,
        val readByAllAt: String? = null,
    )

    /**
     * Palier du badge (-1 échec, 0 envoi, 1 envoyé, 2 distribué, 3 lu), résolu
     * par [DeliveryStatusResolver] comme la coche de la bulle. Le décompte
     * serveur remplace celui du message dès que son dénominateur est connu.
     */
    fun deliveryStatusLevel(
        lifecycle: SendLifecycle,
        message: MessageDeliveryCounts,
        tally: ReadStatusTally? = null,
        showReadReceipts: Boolean = true,
    ): Int {
        when (lifecycle) {
            SendLifecycle.Failed -> return -1
            SendLifecycle.QueuedOffline, SendLifecycle.InFlight -> return 0
            SendLifecycle.Settled -> Unit
        }
        val counts = tally?.takeIf { it.recipientCount > 0 }
            ?.let { MessageDeliveryCounts(it.recipientCount, it.deliveredCount, it.readCount) }
            ?: message
        val tier = DeliveryStatusResolver.resolve(
            deliveredCount = counts.deliveredCount,
            readCount = counts.readCount,
            recipientCount = counts.recipientCount,
            deliveredToAllAt = message.deliveredToAllAt,
            readByAllAt = message.readByAllAt,
            showReadReceipts = showReadReceipts,
        )
        return when (tier) {
            DeliveryTier.Sent -> 1
            DeliveryTier.Delivered -> 2
            DeliveryTier.Read -> 3
        }
    }
}
