import Foundation
import GRDB
import os

/// **Une ligne qui a renoncé finit par SORTIR de la file** (#5965).
///
/// Mesuré au simulateur le 2026-09-10, compte `recette000102` pointant
/// `gate.staging.meeshy.me` : sept lignes `.exhausted` de la veille — deux
/// `sendMessage` et une `sendReaction` en 404 sur une conversation qui n'existe
/// pas sur cet hôte, une `sendReaction` en 500, deux `blockUser` et une
/// `unblockUser` en 400 « Invalid user ID format » — occupaient la file depuis
/// 25 heures. Aucune n'irait jamais nulle part : leur rejet est DÉFINITIF, et
/// le classement du flusher l'avait correctement reconnu (`attempts = 1`, pas
/// cinq). Ce qui manquait n'était pas un classement mais une SORTIE.
///
/// La seule borne existante était `MessagePersistenceActor.purgeExhaustedOlderThan`
/// — sept jours, et exécutée **au seul démarrage** : une session longue n'en
/// récupère jamais rien. D'où cette seconde borne, courte, rejouée à chaque
/// retour en avant-plan (`bootRecovery()` en est le porteur : c'est le seul
/// point que le boot ET le retour d'arrière-plan traversent tous les deux).
///
/// **Ce qu'elle ne jette pas est la moitié qui compte.**
/// `OutboxKind.isDiscardableWhenTerminal` énumère les genres SANS contenu écrit
/// par l'utilisateur et déjà défaits localement ; tout le reste — un message, un
/// post, une story, un commentaire — est GARDÉ, parce que deux surfaces relisent
/// encore ces lignes-là (la bulle en échec pour rejouer un envoi média, la
/// reprise de brouillon pour reproposer une publication). Jeter la ligne d'un
/// message à médias reviendrait à retirer en silence le seul chemin qui permette
/// encore de l'envoyer.
extension OfflineQueue {

    /// Combien de temps une ligne JETABLE terminale reste en base après avoir
    /// renoncé.
    ///
    /// Plus longue que la fenêtre d'affichage de la pastille (une minute) : le
    /// doigt qui relance une entrée juste avant qu'elle ne sorte du carrousel
    /// doit encore trouver sa ligne. Assez courte pour qu'aucune session ne
    /// puisse accumuler des cadavres — c'était le symptôme.
    public static let discardableTerminalRetention: TimeInterval = 10 * 60

    /// Supprime les lignes terminales JETABLES qui ont renoncé il y a plus de
    /// `retention`, et rend leur nombre.
    ///
    /// L'âge se mesure sur `updatedAt` — l'instant du renoncement — et non sur
    /// `createdAt` : une ligne enfilée hors ligne il y a des heures et qui vient
    /// d'échouer est un échec RÉCENT, que l'utilisateur n'a pas encore vu.
    @discardableResult
    public func purgeDiscardableTerminalRows(
        olderThan retention: TimeInterval = OfflineQueue.discardableTerminalRetention,
        now: Date = Date()
    ) async -> Int {
        guard let pool = outboxPool else { return 0 }
        let cutoff = now.addingTimeInterval(-retention)
        let discardable = OutboxKind.allCases
            .filter(\.isDiscardableWhenTerminal)
            .map(\.rawValue)
        let terminal = [OutboxStatus.exhausted.rawValue, OutboxStatus.failed.rawValue]
        do {
            let deleted = try await pool.write { db in
                try OutboxRecord
                    .filter(terminal.contains(Column("status")))
                    .filter(discardable.contains(Column("kind")))
                    .filter(Column("updatedAt") < cutoff)
                    .deleteAll(db)
            }
            if deleted > 0 {
                await refreshPendingCount()
            }
            return deleted
        } catch {
            // Une file qui garde ses cadavres est dégradée, pas cassée : le
            // prochain retour en avant-plan réessaiera.
            logger.error("Terminal outbox GC skipped, dead rows kept: \(error.localizedDescription, privacy: .public)")
            return 0
        }
    }
}
