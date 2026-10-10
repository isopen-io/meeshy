import Foundation
#if canImport(ActivityKit)
import ActivityKit
#endif

/// **Ce que la Live Activity d'envoi montre** (#9680) — l'état d'un envoi LONG
/// (média, story, publication) tant qu'il est dans la file.
///
/// Compilé dans les DEUX cibles (`project.yml`) : l'app l'écrit, l'extension
/// de widgets le peint. Une seule définition tient les deux bouts du fil — un
/// miroir recopié dériverait sans qu'aucun décodage ne rougisse (ActivityKit
/// rend simplement une activité vide).
///
/// Le texte arrive LOCALISÉ par l'app (`SyncPillLabels`, la même formulation
/// que la pastille) : l'îlot et la pastille disent la même chose avec les
/// mêmes mots.
nonisolated struct OutboxActivitySnapshot: Codable, Hashable, Sendable {
    enum Phase: String, Codable, Hashable, Sendable {
        case sending
        case waitingForNetwork
        case sent
        case failed
    }

    var phase: Phase
    /// Envois longs encore dans la file (en attente ou en vol).
    var remaining: Int
    /// Libellé court de l'envoi en tête de file (« Envoi d'image »), ou de
    /// l'issue (« Envoyé », « Envoi non abouti »).
    var label: String
    /// Symbole SF de l'envoi en tête de file.
    var symbol: String
}

#if canImport(ActivityKit)
@available(iOS 16.1, *)
nonisolated struct OutboxActivityAttributes: ActivityAttributes {
    typealias ContentState = OutboxActivitySnapshot
}
#endif
