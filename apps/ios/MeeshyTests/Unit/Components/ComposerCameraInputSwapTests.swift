import XCTest
@testable import Meeshy

/// **Basculer d'objectif ne laisse jamais la session sans image** (#9464).
@MainActor
final class ComposerCameraInputSwapTests: XCTestCase {

    private final class FakeGraph: ComposerCaptureInputGraph {
        var inputs: [String] = []
        var refused: Set<String> = []
        var journal: [String] = []

        func beginConfiguration() { journal.append("begin") }
        func commitConfiguration() { journal.append("commit") }
        func removeInput(_ input: String) {
            journal.append("remove \(input)")
            inputs.removeAll { $0 == input }
        }
        func canAddInput(_ input: String) -> Bool { !refused.contains(input) && !inputs.contains(input) }
        func addInput(_ input: String) {
            journal.append("add \(input)")
            inputs.append(input)
        }
    }

    private func makeGraph(holding input: String? = "arrière", refusing: Set<String> = []) -> FakeGraph {
        let graph = FakeGraph()
        graph.inputs = input.map { [$0] } ?? []
        graph.refused = refusing
        return graph
    }

    func test_swap_newInputAccepted_replacesTheOldOneInsideOneConfiguration() {
        let graph = makeGraph()
        let issue = ComposerCameraInputSwap.swap(in: graph, replacing: "arrière", with: "avant")
        XCTAssertEqual(issue, .swapped)
        XCTAssertEqual(graph.inputs, ["avant"])
        XCTAssertEqual(graph.journal, ["begin", "remove arrière", "add avant", "commit"])
    }

    func test_swap_newInputRefused_putsTheOldOneBack() {
        let graph = makeGraph(refusing: ["avant"])
        let issue = ComposerCameraInputSwap.swap(in: graph, replacing: "arrière", with: "avant")
        XCTAssertEqual(issue, .kept, "la position reste celle de l'ancienne entrée")
        XCTAssertEqual(graph.inputs, ["arrière"], "la session garde son entrée vidéo : aucun écran noir")
    }

    func test_swap_inputFactoryFailed_neverTouchesTheSession() {
        let graph = makeGraph()
        let issue = ComposerCameraInputSwap.swap(in: graph, replacing: "arrière", with: nil)
        XCTAssertEqual(issue, .kept)
        XCTAssertEqual(graph.inputs, ["arrière"])
        XCTAssertTrue(graph.journal.isEmpty, "une entrée qui n'a pas pu naître ne retire rien")
    }

    func test_swap_firstInput_addsIt() {
        let graph = makeGraph(holding: nil)
        XCTAssertEqual(ComposerCameraInputSwap.swap(in: graph, replacing: nil, with: "arrière"), .swapped)
        XCTAssertEqual(graph.inputs, ["arrière"])
    }

    func test_swap_firstInputRefused_reportsNone() {
        let graph = makeGraph(holding: nil, refusing: ["arrière"])
        XCTAssertEqual(ComposerCameraInputSwap.swap(in: graph, replacing: nil, with: "arrière"), .none)
        XCTAssertTrue(graph.inputs.isEmpty)
    }

    // MARK: - #9778 : UNE reconfiguration par bascule

    /// Orienter les connexions et ouvrir l'objectif APRÈS la validation
    /// relançait, session tournante, une reconfiguration implicite par réglage
    /// — sur la caméra arrière virtuelle (trois capteurs), la bascule vers
    /// l'arrière payait chacune (599–976 ms contre 337–399 vers l'avant).
    func test_swap_configuresTheNewInput_insideTheSameTransaction() {
        let graph = makeGraph()
        let issue = ComposerCameraInputSwap.swap(in: graph, replacing: "arrière", with: "avant") { issue in
            graph.journal.append("configure \(issue)")
        }
        XCTAssertEqual(issue, .swapped)
        XCTAssertEqual(graph.journal, ["begin", "remove arrière", "add avant", "configure swapped", "commit"],
                       "les réglages partent avec la bascule, dans la même validation")
    }

    func test_swap_refused_configuresTheOldInputPutBack_beforeTheCommit() {
        let graph = makeGraph(refusing: ["avant"])
        _ = ComposerCameraInputSwap.swap(in: graph, replacing: "arrière", with: "avant") { issue in
            graph.journal.append("configure \(issue)")
        }
        XCTAssertEqual(graph.journal, ["begin", "remove arrière", "add arrière", "configure kept", "commit"])
    }

    func test_swap_inputFactoryFailed_configuresNothing() {
        let graph = makeGraph()
        var configure = 0
        _ = ComposerCameraInputSwap.swap(in: graph, replacing: "arrière", with: nil) { _ in configure += 1 }
        XCTAssertEqual(configure, 0)
    }

    func test_camera_orientsAndOpensTheLensInsideTheSwap_andOnlyReassertsTheZoomAfter() throws {
        let camera = try Self.code("Meeshy/Features/Main/Components/CameraModel.swift")
        let debut = try XCTUnwrap(camera.range(of: "ComposerCameraInputSwap.swap(in: session, replacing: ancienne, with: nouvelle) { issue in"))
        let fin = try XCTUnwrap(camera.range(of: "return InstalledCamera(", range: debut.upperBound..<camera.endIndex))
        let bascule = String(camera[debut.upperBound..<fin.lowerBound])
        let validation = try XCTUnwrap(bascule.range(of: "\n        }\n"), "la fermeture de la transaction")
        let dedans = String(bascule[..<validation.lowerBound])
        XCTAssertTrue(dedans.contains("orient(outputs, for: objectif)"), "les connexions s'orientent AVANT la validation")
        XCTAssertTrue(dedans.contains("openLens(device"), "l'objectif s'ouvre (zoom, lumière, netteté) AVANT la validation")
        let apres = String(bascule[validation.upperBound...])
        XCTAssertFalse(apres.contains("orient("), "plus aucune orientation après la validation")
        XCTAssertTrue(apres.contains("ComposerCameraSwitchRule.needsZoomReassert("),
                      "après, le zoom seul se ré-affirme — et seulement si la validation l'a remis à zéro")
    }

    func test_camera_switchesThroughTheSafeSwap() throws {
        let camera = try Self.code("Meeshy/Features/Main/Components/CameraModel.swift")
        XCTAssertTrue(camera.contains("ComposerCameraInputSwap.swap("))
        XCTAssertFalse(camera.contains(".forEach { session.removeInput($0) }"),
                       "retirer l'entrée AVANT de savoir si la nouvelle entre laissait l'écran noir")
    }

    private static func code(_ relative: String) throws -> String {
        let racine = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
        return AppSourceGuard.stripComments(try String(
            contentsOf: racine.appendingPathComponent(relative), encoding: .utf8))
    }
}
