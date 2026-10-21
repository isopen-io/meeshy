import Foundation
import MeeshySDK

/// Le TRI d'un réveil d'expiration : qui est échu, qui brûle déjà, qui est déjà
/// mort. Pur — l'hôte fournit les échéances, l'horloge et l'état de combustion,
/// et applique ce qui sort (animation, accessibilité, persistance).
enum EphemeralExpiryTriage {

    enum Outcome: Equatable {
        /// Rien n'est échu : les messages entrant dans leur dernière minute.
        case threshold(restamp: [String])
        /// Tout ce qui est échu brûle déjà.
        case alreadyBurning
        /// De quoi retirer : les morts déjà gravés partent sans combustion.
        case expire(alreadyDead: Set<String>, burning: Set<String>)
    }

    /// `ids` vide ⇒ le réveil a simplement sonné : ce sont les `deadlines`,
    /// recalculées à l'instant, qui disent ce qui est échu.
    ///
    /// `isBurning` rend `nil` pour un message absent du fil.
    static func triage(
        ids: [String],
        deadlines: [String: Date],
        elapsed: Set<String>,
        now: Date,
        isBurning: (String) -> Bool?,
        ledger: EphemeralReceiptRecording = EphemeralReceiptLedger.shared
    ) -> Outcome {
        let due = Set(ids)
            .union(deadlines.compactMap { $0.value <= now ? $0.key : nil })
            // #7552 — ce qui est DÉJÀ échu n'a plus d'échéance future : sans
            // cette union, un éphémère expiré hors ligne restait à l'écran.
            .union(elapsed)
        guard !due.isEmpty else {
            return .threshold(restamp: enteringLastMinute(deadlines, now: now))
        }

        // **La destruction se VOIT** (#7467). Le message n'est pas retiré tout
        // de suite : il passe d'abord par l'état EN DESTRUCTION, le temps que
        // la combustion se joue. Retirer sans transition se lit comme un SAUT
        // de liste — le lecteur croit avoir raté un défilement et cherche le
        // message plus haut.
        let fresh = due.filter { isBurning($0) == false }
        guard !fresh.isEmpty else { return .alreadyBurning }

        // #8352 — un mort DÉJÀ gravé (flamme-œil consommée, `message:expired`
        // reçu) que le fil recharge part SANS rejouer sa combustion : elle a
        // déjà été vue, et le serveur peut resservir la ligne à chaque resync.
        let alreadyDead = fresh.filter { ledger.destruction(of: $0) != nil }
        return .expire(alreadyDead: alreadyDead, burning: fresh.subtracting(alreadyDead))
    }

    /// **Le réveil du SEUIL** (#7467) : le passage sous la dernière minute, où
    /// la flamme gagne son compteur.
    private static func enteringLastMinute(_ deadlines: [String: Date], now: Date) -> [String] {
        deadlines.compactMap { id, deadline in
            let remaining = deadline.timeIntervalSince(now)
            return remaining > 0 && remaining <= EphemeralDeadline.countdownThreshold ? id : nil
        }
    }
}
