package me.meeshy.sdk.model

/** The delivery tier the sender sees for their own message. */
enum class DeliveryTier { Sent, Delivered, Read }

/**
 * Resolves the delivery indicator (✓ sent → ✓✓ delivered → ✓✓ read) that the
 * SENDER sees for one of their own messages, applying WhatsApp-style
 * **all-or-nothing** group semantics. Port of the iOS `DeliveryStatusResolver`.
 *
 * The raw per-message counters promote a message to delivered / read as soon as
 * a *single* recipient receives / reads it. That is correct for a 1:1
 * conversation — there is only one recipient — but **misleading in a group**:
 * the sender would see the "read" double-check the instant one of ten members
 * opens the conversation, even though nobody else has. In a group the indicator
 * must EXACTLY represent the state of *all* the other interlocutors.
 *
 * The send lifecycle (pending / failed) is decided upstream; this resolver only
 * concerns the received/read promotion. Stateless and pure.
 */
object DeliveryStatusResolver {

    /**
     * @param deliveredCount distinct recipients who have received the message.
     * @param readCount distinct recipients who have read the message.
     * @param recipientCount total recipients expected to receive it — the active
     *   conversation members EXCLUDING the sender. `0` or `1` means a direct
     *   conversation (or an unknown denominator): the counts already reflect the
     *   single peer, so the "any recipient ⇒ done" computation is trusted.
     * @param deliveredToAllAt / readByAllAt unambiguous "every recipient has
     *   received / read" markers. Non-null takes precedence over the count
     *   comparison so a live all-or-nothing update never transiently regresses to
     *   a single check while the sibling counters are still propagating.
     */
    fun resolve(
        deliveredCount: Int,
        readCount: Int,
        recipientCount: Int,
        deliveredToAllAt: String? = null,
        readByAllAt: String? = null,
    ): DeliveryTier {
        if (recipientCount > 1) {
            // Group: the indicator must represent EVERY recipient. Trust the
            // unambiguous "all" markers first, then the per-message counters.
            return when {
                readByAllAt != null || readCount >= recipientCount -> DeliveryTier.Read
                deliveredToAllAt != null || deliveredCount >= recipientCount -> DeliveryTier.Delivered
                else -> DeliveryTier.Sent
            }
        }
        // Direct conversation or unknown denominator: any recipient ⇒ done.
        return when {
            readByAllAt != null || readCount > 0 -> DeliveryTier.Read
            deliveredToAllAt != null || deliveredCount > 0 -> DeliveryTier.Delivered
            else -> DeliveryTier.Sent
        }
    }
}
