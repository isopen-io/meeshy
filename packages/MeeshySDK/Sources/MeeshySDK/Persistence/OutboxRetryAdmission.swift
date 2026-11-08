import Foundation
import GRDB
import os

private let admissionLog = Logger(subsystem: "me.meeshy.sdk", category: "OutboxRetryAdmission")

/// Qui a le droit d'être RÉARMÉ par une relance manuelle, et le réarmement
/// lui-même (#16749).
///
/// ## Pourquoi un type, et pas quelques lignes dans `retryItem`
///
/// La règle était écrite, nommée et motivée — `StuckPublicationRetry.retryableOutboxId` —
/// et le point d'entrée GÉNÉRIQUE ne l'interrogeait pas. Son `UPDATE` était
/// inconditionnelle :
///
/// ```sql
/// UPDATE outbox SET status = 'pending', attempts = 0, lastError = NULL, … WHERE id = ?
/// ```
///
/// Le doc-comment de `retryItem` DÉCLARAIT pourtant la restriction — « Manually
/// retries an outbox row that has previously failed or exhausted its retry
/// budget ». C'est la forme du cycle 124 : *un champ de service qui DÉCLARE une
/// restriction ne la fait pas respecter*, posée cette fois sur une phrase de
/// documentation.
///
/// Mettre l'admission ici plutôt que dans `OfflineQueue` est la réponse que le
/// cliquet de cohésion commande (`OfflineQueue` pèse déjà le double de son
/// plafond d'unité, et « ajouter à un fichier déjà hors budget est interdit :
/// on extrait d'abord, on ajoute ensuite »). Mais c'est aussi le bon découpage :
/// « cette ligne peut-elle repartir ? » est UNE question, elle a trois
/// appelants d'instantané — `OutboxUIItem`, `UnsentPublication`, le
/// `deliveryStatus` de la bulle — et aucun d'eux ne peut y répondre.
///
/// ## Ce que le prédicat n'est PAS
///
/// Il n'est pas celui de `retryableOutboxId`, et le copier serait une
/// RÉGRESSION. Les deux statuts que cette loi refuse ne sont pas équivalents vus
/// du bouton « Réessayer » :
///
/// | statut | réarmer veut dire |
/// |---|---|
/// | `.inflight` **frais** | un dispatcher le porte ⇒ destructeur — c'est le défaut |
/// | `.inflight` **périmé** | orphelin, et `flush()` le reprend déjà ⇒ doit rester relançable |
/// | `.pending` à `nextAttemptAt` futur | l'utilisateur dit « maintenant » ⇒ légitime |
/// | `.failed` / `.exhausted` | plus rien n'avance tout seul ⇒ la raison d'être de l'écran |
///
/// Un correctif qui refuse TOUT `.pending` et TOUT `.inflight` rendrait
/// « Publications non envoyées » inerte sur une ligne coincée — exactement le
/// piège que cet écran existe pour défaire.
///
/// ## Le dégât que l'absence de garde produisait
///
/// La liste est un INSTANTANÉ pris par `load()`. Une ligne affichée
/// `.failed`/`.exhausted` peut être réclamée par le minuteur de rejeu ou un
/// flush de reconnexion ENTRE le rendu et le tap. Le tap repassait alors ce
/// claim `.inflight` VIVANT en `.pending, attempts = 0` **sous le téléversement
/// TUS en cours**, et le réveil de 250 ms laissait un flusher le réclamer de
/// nouveau : le média partait une seconde fois, puis le premier dispatch
/// SUPPRIMAIT la ligne sous le second, dont l'écriture d'échec tombait alors sur
/// une ligne qui n'existe plus.
enum OutboxRetryAdmission {

    /// Réarme la ligne si — et seulement si — aucun dispatcher ne la porte.
    ///
    /// Rend `true` quand la ligne est repartie, `false` quand un claim FRAIS l'a
    /// retenue. Lève `OfflineQueueError.writeFailed` si la transaction échoue :
    /// la traduction vit ICI plutôt que chez l'appelant, parce que `OfflineQueue`
    /// est deux fois au-dessus de son plafond d'unité et qu'un `do/catch` de sept
    /// lignes y est précisément ce que le cliquet de cohésion refuse.
    ///
    /// La décision est prise par SQLite DANS la transaction d'écriture, jamais
    /// sur un instantané lu avant — c'est le motif de
    /// `OutboxFlusher.claimPending`, introduit pour exactement cette raison du
    /// côté du dispatch. Une lecture suivie d'une écriture laisserait entre les
    /// deux la fenêtre que ce lot ferme.
    ///
    /// La borne de péremption vient de `OutboxFlusher`, par RÉFÉRENCE et non par
    /// recopie : c'est la MÊME fenêtre que celle au-delà de laquelle `flush()`
    /// reprend un claim orphelin, et deux bornes divergentes ouvriraient une
    /// plage où l'un reprend ce que l'autre refuse.
    static func rearm(
        _ outboxId: String,
        in pool: any DatabaseWriter,
        now: Date = Date()
    ) async throws -> Bool {
        let reclaimCutoff = now.addingTimeInterval(-OutboxFlusher.staleInflightReclaimSeconds)
        do {
            return try await pool.write { db -> Bool in
                try db.execute(sql: """
                    UPDATE outbox
                    SET status = ?, attempts = 0, lastError = NULL,
                        updatedAt = ?, nextAttemptAt = ?
                    WHERE id = ?
                      AND (status <> ? OR updatedAt < ?)
                    """, arguments: [
                        OutboxStatus.pending.rawValue,
                        now,
                        now,
                        outboxId,
                        OutboxStatus.inflight.rawValue,
                        reclaimCutoff
                    ])
                return db.changesCount == 1
            }
        } catch {
            admissionLog.error("outbox rearm write failed: \(error.localizedDescription, privacy: .public)")
            throw OfflineQueueError.writeFailed(underlying: error)
        }
    }
}
