import Foundation

/// Resolves the delivery indicator (✓ sent → ✓✓ delivered → ✓✓ read) that the
/// SENDER sees for one of their own messages, applying WhatsApp-style
/// **all-or-nothing** group semantics.
///
/// ## Why this exists
/// The raw `MeeshyMessage.deliveryStatus` baked at ingestion promotes a message
/// to `.delivered` / `.read` as soon as a *single* recipient receives / reads it
/// (`deliveredCount > 0` / `readCount > 0`). That is correct for a 1:1
/// conversation — there is only one recipient — but **misleading in a group**:
/// the sender would see the indigo "read" double-check the instant one of ten
/// members opens the conversation, even though nobody else has. The indicator
/// must EXACTLY represent the real state of *all* the other interlocutors.
///
/// ## The rule
/// - `recipientCount <= 1` (direct conversation, or an unknown denominator):
///   the stored status is already accurate for the single peer — trust it. This
///   also preserves the live state-machine path, which advances the status
///   without necessarily propagating per-recipient counts.
/// - `recipientCount > 1` (group): the delivered / read tier is derived purely
///   from the recipient counts. The double-gray "delivered" lights up only once
///   EVERY recipient has received the message; the indigo "read" only once EVERY
///   recipient has read it. A partial state stays at the lower indicator.
///
/// The send lifecycle (`.sending` / `.invisible` / `.clock` / `.slow` /
/// `.failed`) is independent of how many peers have received the message and is
/// always returned verbatim.
///
/// Stateless and pure — a rule engine, safe to call from `body`.
public enum DeliveryStatusResolver {

    /// Resolves the indicator for a single own-message.
    ///
    /// - Parameters:
    ///   - status: the message's stored `deliveryStatus` (carries the send
    ///     lifecycle and a best-effort delivered/read promotion).
    ///   - deliveredCount: distinct recipients who have received the message.
    ///   - readCount: distinct recipients who have read the message.
    ///   - recipientCount: total recipients expected to receive it — the active
    ///     conversation members EXCLUDING the sender. `0` or `1` means a direct
    ///     conversation (or an unknown denominator) and the stored status is
    ///     trusted as-is.
    ///   - deliveredToAllAt / readByAllAt: unambiguous "every recipient has
    ///     received / read" markers stamped by the live all-or-nothing update
    ///     path. That path advances `state` without carrying per-row counters,
    ///     so without these a real-time group delivery/read would transiently
    ///     regress to a single check until the sibling counters write lands.
    ///     Non-nil takes precedence over the count comparison. The gateway
    ///     currently leaves these null (the cursor-based read model no longer
    ///     computes them), so at cold-start the per-message counts are
    ///     authoritative and the markers carry only locally-confirmed state.

    /// **« On ne lit pas ce qu'on n'a pas reçu »** — l'invariant logique qui
    /// lie les deux compteurs.
    ///
    /// Le gateway les servait par des chemins ASYMÉTRIQUES : la date de lecture
    /// acceptait un repli sur le curseur, celle de réception non. Un
    /// participant qui marque LU sans avoir jamais émis d'accusé de livraison
    /// comptait donc comme lecteur sans compter comme destinataire — d'où
    /// `Distribué 0` en face de `Lu 2` sur un même message (capture user
    /// 2026-08-24), et une bulle bloquée à UNE coche : le palier « lu » exige
    /// `readCount >= recipientCount`, et celui juste en dessous réclamait un
    /// `deliveredCount` que personne n'avait incrémenté.
    ///
    /// La source est corrigée (`resolveReceivedAt`, gateway). Ce plancher n'est
    /// pas un pansement posé dessus : un cache local, un événement partiel ou un
    /// serveur plus ancien peuvent encore tendre `delivered < read`, et
    /// l'indicateur doit rester juste. Il ne GONFLE rien — il ne fait jamais
    /// dépasser le nombre de lecteurs réellement observés.
    static func effectiveDeliveredCount(deliveredCount: Int, readCount: Int) -> Int {
        max(deliveredCount, readCount)
    }

    public static func resolve(
        status: MeeshyMessage.DeliveryStatus,
        deliveredCount: Int,
        readCount: Int,
        recipientCount: Int,
        deliveredToAllAt: Date? = nil,
        readByAllAt: Date? = nil,
        showReadReceipts: Bool = true
    ) -> MeeshyMessage.DeliveryStatus {
        // Réciprocité : qui ne partage pas ses accusés ne voit pas ceux des
        // autres. Booléen OPAQUE — ce résolveur est pur, lire
        // `UserPreferencesManager` ici violerait la pureté du SDK et le rendrait
        // intestable ; l'app lit la préférence et la transmet.
        //
        // Le défaut `true` est délibéré : les appelants de PERSISTANCE
        // (`ConversationSyncEngine`, `ConversationSocketHandler`) ne passent pas
        // ce paramètre, et dégrader leur état corromprait ce qui est stocké. Seul
        // le site d'AFFICHAGE transmet la préférence.
        //
        // Voir `docs/superpowers/specs/2026-07-24-read-exactness-design.md`.
        let degradeRead: (MeeshyMessage.DeliveryStatus) -> MeeshyMessage.DeliveryStatus = { resolved in
            guard !showReadReceipts, resolved == .read else { return resolved }
            return .delivered
        }
        // The pre-delivery send lifecycle is authoritative and independent of
        // how many peers have received the message — never reinterpret it.
        switch status {
        case .sending, .invisible, .clock, .slow, .failed:
            return status
        case .sent, .delivered, .read:
            break
        }

        // Direct conversation or unknown denominator: the stored status already
        // reflects the single peer accurately (the 1:1 "any recipient ⇒ done"
        // computation is correct there), so trust it. Also keeps the live
        // state-machine path — which promotes status without writing counts —
        // working for direct chats.
        guard recipientCount > 1 else { return degradeRead(status) }

        // Group: the indicator must represent EVERY recipient. Trust the
        // unambiguous "all" markers first (count-blind live path), then the
        // per-message counters (authoritative at cold-start).
        if readByAllAt != nil || readCount >= recipientCount { return degradeRead(.read) }
        let delivered = effectiveDeliveredCount(deliveredCount: deliveredCount, readCount: readCount)
        if deliveredToAllAt != nil || delivered >= recipientCount { return .delivered }
        return .sent
    }

    /// Status implied purely by recipient counts, with no send-lifecycle
    /// context. Used by the live read-status reducer, which applies one
    /// conversation-level summary to many of the sender's messages.
    ///
    /// `recipientCount == 0` (unknown denominator) preserves the legacy
    /// "any > 0" behaviour so 1:1 live updates — where the summary may report
    /// the single peer — still advance.
    public static func fromCounts(
        deliveredCount: Int,
        readCount: Int,
        recipientCount: Int
    ) -> MeeshyMessage.DeliveryStatus {
        guard recipientCount > 0 else {
            if readCount > 0 { return .read }
            if deliveredCount > 0 { return .delivered }
            return .sent
        }
        if readCount >= recipientCount { return .read }
        let delivered = effectiveDeliveredCount(deliveredCount: deliveredCount, readCount: readCount)
        if delivered >= recipientCount { return .delivered }
        return .sent
    }
}
