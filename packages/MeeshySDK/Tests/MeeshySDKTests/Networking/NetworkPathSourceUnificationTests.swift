import XCTest
import Combine
@testable import MeeshySDK

/// Les deux moniteurs réseau du SDK lisent la MÊME source amont.
///
/// Ils démarraient chacun leur propre `NWPathMonitor` : deux vérités pour une
/// seule question, qui ont divergé en production — la pastille affichait
/// « Hors ligne » (lecture de `NetworkMonitor`) pendant que le videur d'outbox
/// consultait `NetworkConditionMonitor`. Ces tests verrouillent l'invariant
/// qui rend cette divergence impossible.
@MainActor
final class NetworkPathSourceUnificationTests: XCTestCase {

    private var cancellables: Set<AnyCancellable> = []

    override func tearDown() {
        cancellables.removeAll()
        super.tearDown()
    }

    // MARK: - Invariant central : les deux lectures s'accordent

    func test_bothMonitors_agreeOnOfflineness_forEverySnapshot() {
        let snapshots: [NetworkPathSnapshot] = [
            NetworkPathSnapshot(isSatisfied: false),
            NetworkPathSnapshot(isSatisfied: true, usesWiFi: true),
            NetworkPathSnapshot(isSatisfied: true, isConstrained: true, usesCellular: true),
            NetworkPathSnapshot(isSatisfied: true, isExpensive: true, usesCellular: true),
            NetworkPathSnapshot(isSatisfied: true, usesWired: true),
            NetworkPathSnapshot(isSatisfied: false, usesWiFi: true)
        ]

        for snapshot in snapshots {
            let binaire = !snapshot.isSatisfied
            let qualitatif = NetworkConditionMonitor.resolve(snapshot: snapshot) == .offline
            XCTAssertEqual(
                binaire, qualitatif,
                "Les deux moniteurs doivent répondre pareil à « suis-je hors ligne ? » " +
                "pour \(snapshot). Une divergence, c'est une pastille qui ment sur " +
                "l'état d'une file — ou une file bloquée sans que rien ne l'indique."
            )
        }
    }

    // MARK: - Amorçage : plus de naissance « hors ligne » fabriquée

    /// `NetworkConditionMonitor.condition` valait `.offline` à la construction
    /// et le restait jusqu'au premier rappel du système. Le gate réseau du
    /// videur d'outbox lit cette valeur : toute mutation enfilée dans cette
    /// fenêtre était rejetée, sans reprise armée.
    func test_conditionMonitor_seedsFromSource_notFromAFabricatedOffline() {
        let source = NetworkPathSource.makeForTesting()
        source.publish(NetworkPathSnapshot(isSatisfied: true, usesWiFi: true))

        let monitor = NetworkConditionMonitor(source: source)

        XCTAssertEqual(monitor.condition, .wifi,
                       "L'état initial doit venir de la source, pas d'un `.offline` codé en dur.")
        XCTAssertTrue(monitor.isOnline)
    }

    // MARK: - « Je ne sais pas encore » n'est pas « hors ligne »

    /// Avant le premier rappel du système, `NWPathMonitor` rend un chemin
    /// INSATISFAIT qui veut dire « non évalué ». Le lire comme un état réel
    /// déclarait l'appareil hors ligne au lancement — et bloquait tout envoi.
    ///
    /// Le défaut est optimiste sur la connectivité (une tentative qui échoue
    /// vite repart en file ; un blocage, lui, dure) et pessimiste sur la qualité
    /// (croire à tort qu'on est en WiFi consomme le forfait de l'utilisateur).
    func test_unknownPath_isOnlineButLowQuality() {
        let unknown = NetworkPathSource.unknownPath

        XCTAssertTrue(unknown.isSatisfied,
                      "Un chemin non évalué ne doit pas bloquer les envois.")
        XCTAssertEqual(NetworkConditionMonitor.resolve(snapshot: unknown), .badCellular,
                       "…mais il ne doit pas non plus autoriser l'auto-téléchargement de médias lourds.")
    }

    func test_freshSource_startsOnline_soNothingIsBlockedAtLaunch() {
        let monitor = NetworkMonitor(source: NetworkPathSource.makeForTesting())
        XCTAssertFalse(monitor.isOffline)
    }

    func test_networkMonitor_seedsFromSource() {
        let source = NetworkPathSource.makeForTesting()
        source.publish(NetworkPathSnapshot(isSatisfied: false))

        let monitor = NetworkMonitor(source: source)

        XCTAssertTrue(monitor.isOffline, "L'état initial doit venir de la source.")
    }

    // MARK: - Propagation

    func test_sourceUpdate_reachesBothMonitors() async {
        let source = NetworkPathSource.makeForTesting()
        source.publish(NetworkPathSnapshot(isSatisfied: true, usesWiFi: true))
        let binaire = NetworkMonitor(source: source)
        let qualitatif = NetworkConditionMonitor(source: source)

        source.publish(NetworkPathSnapshot(isSatisfied: false))
        try? await Task.sleep(nanoseconds: 300_000_000)

        XCTAssertTrue(binaire.isOffline)
        XCTAssertEqual(qualitatif.condition, .offline)
    }

    // MARK: - Type d'interface

    func test_connectionType_derivesFromTheSameSnapshot() {
        XCTAssertEqual(NetworkMonitor.connectionType(for: .init(isSatisfied: true, usesWiFi: true)), .wifi)
        XCTAssertEqual(NetworkMonitor.connectionType(for: .init(isSatisfied: true, usesCellular: true)), .cellular)
        XCTAssertEqual(NetworkMonitor.connectionType(for: .init(isSatisfied: true, usesWired: true)), .wired)
        XCTAssertEqual(NetworkMonitor.connectionType(for: .init(isSatisfied: false)), .unknown)
    }
}
