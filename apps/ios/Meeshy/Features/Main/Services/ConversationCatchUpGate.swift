import Foundation
import MeeshySDK

/// Le rattrapage `listAfter` d'une conversation, UN par conversation (#10830).
///
/// Mesuré en production le 2026-10-16 : à chaque reprise de socket, un même
/// appareil envoyait 19 `GET …/messages?after=…` IDENTIQUES dans la même
/// milliseconde pour une conversation, 9 pour une autre. Chaque écran de
/// conversation quitté laissait son `ConversationViewModel` en vie, avec son
/// `ConversationSocketHandler` toujours abonné à `didReconnect` et au retour
/// au premier plan — reproduit au simulateur : cinq ouvertures, cinq
/// requêtes au retour au premier plan, aucune `deinit`. La fenêtre de
/// coalescence de deux secondes du handler ne dédoublonnait que SES propres
/// déclencheurs ; N handlers, N rattrapages.
///
/// Deux portes, parce que deux défauts :
/// - **le lecteur PARTI ne rattrape plus** : l'écran quitté par navigation
///   se déclare (`depart`), et le `.task` qui le ramène le réarme (`arrive`).
///   Un modèle retenu au-delà de son écran ne parle donc plus au réseau.
/// - **un rattrapage en vol se REJOINT** : tant qu'une lecture couvre déjà ce
///   curseur (elle part d'un instant antérieur ou égal), un second appel
///   attend sa réponse au lieu d'en poser une autre. Un curseur PLUS ancien
///   que celui en vol repart seul — rejoindre la lecture en vol lui ferait
///   perdre le trou entre les deux.
@MainActor
final class ConversationCatchUpGate {
    static let shared = ConversationCatchUpGate()

    private struct Flight {
        let cursor: Date
        let task: Task<[APIMessage], Error>
    }

    private var flights: [String: Flight] = [:]
    private var departed: Set<ObjectIdentifier> = []

    nonisolated deinit {}

    func depart(_ reader: AnyObject) {
        departed.insert(ObjectIdentifier(reader))
    }

    func arrive(_ reader: AnyObject) {
        departed.remove(ObjectIdentifier(reader))
    }

    func isPresent(_ reader: AnyObject) -> Bool {
        !departed.contains(ObjectIdentifier(reader))
    }

    func pages(
        conversationId: String,
        after cursor: Date,
        fetch: @escaping @MainActor () async throws -> [APIMessage]
    ) async throws -> [APIMessage] {
        if let flight = flights[conversationId], flight.cursor <= cursor {
            return try await flight.task.value
        }
        let task = Task { @MainActor in try await fetch() }
        flights[conversationId] = Flight(cursor: cursor, task: task)
        defer {
            if flights[conversationId]?.task == task { flights[conversationId] = nil }
        }
        return try await task.value
    }
}
