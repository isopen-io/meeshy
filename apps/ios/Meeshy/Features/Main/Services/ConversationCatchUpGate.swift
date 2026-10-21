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

    /// Référence FAIBLE au lecteur parti : sa libération l'efface d'elle-même.
    /// Un `ObjectIdentifier` seul survivait au modèle — l'ensemble grossissait
    /// d'une entrée par conversation quittée, et un modèle neuf alloué à la
    /// même adresse passait pour « parti » (rattrapage de reconnexion sauté).
    private final class DepartedReader {
        nonisolated deinit {}
        weak var reader: AnyObject?
        init(_ reader: AnyObject) { self.reader = reader }
    }

    private var flights: [String: Flight] = [:]
    private var departed: [ObjectIdentifier: DepartedReader] = [:]

    nonisolated deinit {}

    func depart(_ reader: AnyObject) {
        departed = departed.filter { $0.value.reader != nil }
        departed[ObjectIdentifier(reader)] = DepartedReader(reader)
    }

    func arrive(_ reader: AnyObject) {
        departed[ObjectIdentifier(reader)] = nil
    }

    func isPresent(_ reader: AnyObject) -> Bool {
        departed[ObjectIdentifier(reader)]?.reader !== reader
    }

    /// Lecteurs encore vivants marqués partis (tests).
    var departedCount: Int { departed.values.filter { $0.reader != nil }.count }

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
