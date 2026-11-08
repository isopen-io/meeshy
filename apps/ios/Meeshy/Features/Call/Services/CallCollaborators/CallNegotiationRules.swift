import Foundation

/// Les règles PURES de la négociation parfaite d'un lien d'appel : qui cède
/// (politesse, §3.4) et quel signal est périmé (époque, §3.5, #9111). Sorties
/// de `CallManager` : elles ne lisent aucun état d'appel, `CallManager`,
/// `CallSdpSignaler` et le maillage de groupe les appliquent.
enum CallNegotiationRules {

    /// Pure, testable epoch rule (§3.5): a signal is stale when its generation
    /// is strictly older than the highest already seen-or-sent. Equal/newer is
    /// accepted (offer, its answer, and the matching ICE share a generation).
    static func isStaleNegotiation(incoming: Int, highWaterMark: Int, isOffer: Bool = false) -> Bool {
        incoming < highWaterMark && !isFreshLinkOffer(incoming: incoming, highWaterMark: highWaterMark, isOffer: isOffer)
    }

    /// #9111 — un lien NEUF compte depuis 1 : la première offre d'un pair revenu
    /// (rechargé, relancé) fait converger la marque au lieu d'être jetée comme
    /// périmée par un compteur resté haut sur l'ancien lien.
    nonisolated static func isFreshLinkOffer(incoming: Int, highWaterMark: Int, isOffer: Bool) -> Bool {
        isOffer && incoming <= 1 && incoming < highWaterMark
    }

    /// Pure, testable politeness rule (W3C perfect negotiation): the
    /// lexicographically-smaller userId is the polite peer. Symmetric — peer A
    /// comparing (idA, idB) and peer B comparing (idB, idA) both reduce to
    /// `min(idA, idB)` and therefore agree without any extra signaling. Returns
    /// `false` (impolite) when an id is missing, so a misconfigured side never
    /// yields blindly. Scales cleanly to SFU later (client always polite).
    static func isPolitePeer(localUserId: String, remoteUserId: String) -> Bool {
        guard !localUserId.isEmpty, !remoteUserId.isEmpty, localUserId != remoteUserId else { return false }
        return localUserId < remoteUserId
    }
}
