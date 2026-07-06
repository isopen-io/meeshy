package me.meeshy.sdk.model

/**
 * Resolved sender-side delivery state for a message — the vocabulary the bubble
 * footer renders (1 check → 2 grey checks → 2 indigo checks).
 *
 * Port of the iOS `MessageDeliveryStatus` display cycle. [Pending] and [Failed]
 * belong to the local send cycle; [Sent]/[Delivered]/[Read] are the confirmed
 * receipt tiers, resolved all-or-nothing against the recipient count.
 */
enum class DeliveryState { Pending, Sent, Delivered, Read, Failed }

/**
 * Pure, stateless SSOT that turns raw receipt counts into an honest [DeliveryState]
 * — the Android port of the iOS `DeliveryStatusResolver`.
 *
 * The rule is **all-or-nothing (WhatsApp-style)**: in a group the two grey checks
 * (Delivered) appear only once **every** recipient received, and the two indigo
 * checks (Read) only once **every** recipient read. A partial count reports the
 * lower tier — the indicator may temporarily under-report but must **never
 * over-report** ("read by all" when only one person read is a lie).
 *
 * A `recipientCount <= 1` (a 1:1, or an unknown denominator) trusts the counts as
 * a `> 0` threshold — the historical, correct behaviour for direct chats.
 *
 * The unambiguous "all" markers ([deliveredToAllAt]/[readByAllAt]) win over the
 * counts, denominator-independent: a live all-or-nothing event stamps them so the
 * check never regresses under a counts-writer race.
 */
object DeliveryStatusResolver {

    /**
     * Resolve the display status at the point of render.
     *
     * @param base the send-cycle status decided upstream. [DeliveryState.Pending]
     *   and [DeliveryState.Failed] are returned verbatim (the local send cycle owns
     *   them); any other [base] is re-resolved from the receipt counts.
     * @param recipientCount active recipients **excluding the sender**
     *   (`memberCount - 1`). `<= 1` trusts the counts as a `> 0` threshold.
     */
    fun resolve(
        base: DeliveryState,
        deliveredCount: Int,
        readCount: Int,
        recipientCount: Int,
        deliveredToAllAt: String? = null,
        readByAllAt: String? = null,
    ): DeliveryState = when (base) {
        DeliveryState.Pending, DeliveryState.Failed -> base
        else -> fromCounts(
            deliveredCount = deliveredCount,
            readCount = readCount,
            recipientCount = recipientCount,
            deliveredToAllAt = deliveredToAllAt,
            readByAllAt = readByAllAt,
        )
    }

    /**
     * The all-or-nothing counts → tier reduction, shared by [resolve] and any live
     * reducer that applies one summary to a message.
     */
    fun fromCounts(
        deliveredCount: Int,
        readCount: Int,
        recipientCount: Int,
        deliveredToAllAt: String? = null,
        readByAllAt: String? = null,
    ): DeliveryState {
        if (readByAllAt != null) return DeliveryState.Read
        if (deliveredToAllAt != null) return DeliveryState.Delivered
        val delivered = deliveredCount.coerceAtLeast(0)
        val read = readCount.coerceAtLeast(0)
        if (recipientCount <= 1) {
            return when {
                read > 0 -> DeliveryState.Read
                delivered > 0 -> DeliveryState.Delivered
                else -> DeliveryState.Sent
            }
        }
        return when {
            read >= recipientCount -> DeliveryState.Read
            delivered >= recipientCount -> DeliveryState.Delivered
            else -> DeliveryState.Sent
        }
    }
}
