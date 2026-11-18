import Foundation
import GRDB

/// **Le balayage unique de l'existant** (#19437) : avant la loi appliquée (`MessageEnrichmentLaw.enforce`), une vue
/// unique ouverte, un message supprimé ou un éphémère échu gardait sur disque ses traductions, ses transcriptions, le
/// nom et la légende de ses pièces, son lieu, son autocollant et ses liens suivis. Au premier lancement qui suit la
/// mise à jour, chaque ligne déjà scellée est jugée une fois et vidée de ce qu'elle ne devait plus garder ; ensuite,
/// l'upsert et les effaceurs tiennent la loi, et la migration ne rejoue pas.
struct MessagesEnrichmentSweepMigration: DatabaseMigration {
    let identifier = "messages_enrichment_sweep_v1"

    func migrate(_ db: Database) throws {
        try MessageEnrichmentLaw.sweep(in: db)
    }
}
