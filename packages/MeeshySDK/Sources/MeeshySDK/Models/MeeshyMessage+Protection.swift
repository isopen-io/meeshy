import Foundation

/// La projection d'un message vers son chrome de protection — **le site UNIQUE
/// où les cinq modes de lecture posent la même question** (#7452).
///
/// Avant ce lot, chaque surface relisait `expiresAt`, `isViewOnce` et
/// `isBlurred` à sa façon : la bulle gardait le badge tant que `expiresAt`
/// existait, la rangée plate le gardait tant que `content.ephemeral` était
/// non-nil, la rivière et le résumé ne regardaient rien. Trois lectures, trois
/// résultats, et deux surfaces muettes.
public extension MeeshyMessage {

    /// Ce que ce message DÉSIGNE de sa protection, ici et maintenant.
    ///
    /// **L'appel STAMPE la réception.** La première fois qu'un message
    /// éphémère est projeté sur cet appareil, sa réception locale est
    /// enregistrée au registre — parce que projeter un message, c'est
    /// précisément l'avoir reçu. `EphemeralReceiptLedger` étant idempotent et
    /// monotone, les projections suivantes (resync REST, changement de mode,
    /// recyclage de cellule) relisent la MÊME date et ne relancent jamais
    /// l'horloge. C'est ce qui rend la règle indépendante du chemin d'arrivée :
    /// socket, REST, restauration GRDB ou drain de la NSE donnent tous la
    /// première fois où cet appareil a vu le message.
    ///
    /// - Parameters:
    ///   - ledger: le registre des réceptions, injectable pour les témoins.
    ///   - now: l'instant de référence, injectable pour les témoins.
    func protection(
        ledger: EphemeralReceiptRecording = EphemeralReceiptLedger.shared,
        now: Date = Date()
    ) -> MessageProtectionDescriptor {
        let declaresEphemeral = effects.flags.contains(.ephemeral)
            || expiresAt != nil
            || (effects.ephemeralDuration ?? 0) > 0

        // Un message ordinaire — l'écrasante majorité — ne touche NI le
        // registre NI les `UserDefaults` : la question ne se pose que pour un
        // éphémère.
        //
        // **MON propre message ne compte pas comme une réception** (contrat
        // #7451 point 6). Le stamper reviendrait à démarrer l'horloge à
        // l'ENVOI — exactement le défaut que ce lot corrige, et le plus
        // trompeur de tous, puisque l'expéditeur verrait un décompte pendant
        // que le destinataire, hors ligne, n'a encore rien reçu. Seule
        // l'échéance SERVIE (la plus tardive des `D(u)`, portée par
        // `message:countdown-started`) peut faire décompter un envoi ; sans
        // elle, l'expéditeur lit « en attente de réception ».
        let localReceivedAt: Date? = (declaresEphemeral && !isMe)
            ? ledger.noteReception(of: id, at: now)
            : nil

        return MessageProtectionDescriptor.resolve(
            flags: effects.flags,
            servedExpiresAt: expiresAt,
            ephemeralDuration: effects.ephemeralDuration,
            localReceivedAt: localReceivedAt,
            now: now
        )
    }
}
