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
        // **Le NOM, jamais la SIGNATURE** (2026-09-06). Ce marqueur épinglait
        // `(_ uiView: UIView, context: Context)`. Le paramètre est devenu
        // `PreviewHost` — un type d'hôte plus précis —, et la garde a cessé de
        // trouver son bloc : elle a rougi en accusant le fichier d'« avoir
        // changé de forme », alors qu'elle ne mesurait plus rien. Une garde
        // aveugle est pire que rouge, parce qu'un `DispatchQueue.main.async`
        // réintroduit dans ce corps serait passé inaperçu.
        let marker = "func updateUIView("
        guard let start = src.range(of: marker) else {
            XCTFail("`func updateUIView(` introuvable dans CameraView.swift — la garde ne mesure plus rien.")
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
        // **Le hop n'a pas été REMPLACÉ, il a été SUPPRIMÉ** (2026-09-06).
        //
        // Cette garde exigeait `Task { @MainActor in }`. Il n'y a plus rien à
        // faire sauter : `updateUIView` ne pose plus la frame du tout. L'hôte
        // est devenu un `PreviewHost` dont le `layerClass` EST la couche de
        // prévisualisation — le layout la dimensionne, comme n'importe quelle
        // vue. Le corps ne fait plus que réassigner la session quand elle change.
        //
        // > La meilleure façon de ne pas se tromper de fil n'est pas de sauter
        // > correctement, c'est de n'avoir rien à y faire. Une garde qui exige
        // > le hop interdit la solution qui le rend inutile.
        //
        // Ce qui reste gardé — et c'est l'essentiel de #3641 — est l'assertion
        // NÉGATIVE ci-dessus : pas de `DispatchQueue.main.async` brut. Elle vaut
        // toujours, et elle vaudra encore si un hop redevient nécessaire.
        XCTAssertTrue(
            body.contains("previewLayer.session"),
            "updateUIView doit rester le site qui réassigne la SESSION : c'est la seule chose qui change " +
            "après le montage, et la perdre laisserait le viseur sur une session morte au ré-armement."
        )
        XCTAssertFalse(
            body.contains(".frame ="),
            "et il ne doit PAS reposer la frame à la main : `PreviewHost.layerClass` s'en charge, et la " +
            "reposer ici rouvrirait le hop que ce lot supprime."
        )
    }
}
