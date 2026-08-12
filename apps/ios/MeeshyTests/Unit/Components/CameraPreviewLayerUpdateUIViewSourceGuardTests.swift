import XCTest

/// Dette Swift concurrency (backlog item 4, `tasks/ios-debt-routine-progress.md`) —
/// `CameraPreviewLayer.updateUIView(_:context:)` (SwiftUI `UIViewRepresentable`) sautait sur main
/// via `DispatchQueue.main.async` brut, sans aucune raison de timing documentée (contrairement à
/// `ConversationFirstRenderWarmup.swift`/`Router.swift`, qui commentent explicitement pourquoi un
/// délai de runloop est nécessaire). Ce hop ne mutate qu'une propriété CALayer non-`@Published`
/// (`previewLayer?.frame`), donc aucun risque « Publishing changes from within view updates » ne
/// justifiait le report — l'idiome structuré `Task { @MainActor in }` déjà utilisé pour la même
/// catégorie de hop ailleurs dans ce fichier (`CameraModel.fileOutput(_:didFinishRecordingTo:...)`,
/// `CameraModel.photoOutput(_:didFinishProcessingPhoto:...)`) s'applique ici à l'identique.
///
/// Source-only : `updateUIView` n'est invoqué que par le moteur de layout SwiftUI sur un vrai
/// `UIViewRepresentable` monté dans une hiérarchie de vues — pas exerçable directement en XCTest.
/// Même technique que `DiscoverTabSMSComposerCoordinatorSourceGuardTests` (hop non exerçable
/// behaviorally, gardé au niveau source).
final class CameraPreviewLayerUpdateUIViewSourceGuardTests: XCTestCase {

    private func source() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Components
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent("Meeshy/Features/Main/Components/CameraView.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    /// Isole le corps de `updateUIView(_:context:)` plutôt que de grepper le fichier entier — une
    /// future occurrence non liée de `DispatchQueue.main.async` ailleurs dans `CameraView.swift` ne
    /// doit ni faire échouer ni masquer cette garde précise.
    private func updateUIViewBody(in src: String) throws -> String {
        let marker = "func updateUIView(_ uiView: UIView, context: Context) {"
        guard let start = src.range(of: marker) else {
            XCTFail("Signature de updateUIView introuvable — CameraView.swift a changé de forme.")
            throw XCTSkip("marker")
        }
        guard let end = src.range(of: "\n    func makeCoordinator()", range: start.upperBound..<src.endIndex) else {
            XCTFail("Fin du corps de updateUIView introuvable — CameraView.swift a changé de forme.")
            throw XCTSkip("marker")
        }
        return String(src[start.upperBound..<end.lowerBound])
    }

    func test_updateUIView_hopsToMainActorViaStructuredTask() throws {
        let stripped = AppSourceGuard.stripComments(try source())
        let body = try updateUIViewBody(in: stripped)

        XCTAssertFalse(
            body.contains("DispatchQueue.main.async"),
            "updateUIView ne doit plus sauter sur main via GCD brut — `Task { @MainActor in }` est " +
            "l'idiome déjà utilisé pour cette catégorie de hop dans ce même fichier " +
            "(CameraModel.fileOutput/photoOutput delegates)."
        )
        XCTAssertTrue(
            body.contains("Task { @MainActor in"),
            "updateUIView doit sauter sur MainActor via une Task structurée pour poser la frame du " +
            "preview layer."
        )
    }
}
