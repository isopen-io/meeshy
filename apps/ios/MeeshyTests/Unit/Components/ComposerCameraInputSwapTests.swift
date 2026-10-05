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
