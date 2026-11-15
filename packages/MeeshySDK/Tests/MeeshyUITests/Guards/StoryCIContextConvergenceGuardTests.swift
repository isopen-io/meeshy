import XCTest

/// **Un seul `CIContext` pour le domaine story du SDK** (#9873).
///
/// Six contextes vivaient dans `Sources/MeeshyUI` : le filtre de slide, les
/// réglages d'image, les réglages vidéo, l'éditeur d'image (un par ouverture),
/// la transition fondue et le contexte partagé du canvas. Chacun porte son cache
/// d'intermédiaires et ses espaces de couleur : un curseur réglé dans l'un ne
/// rendait pas forcément ce que l'export, rendu dans un autre, publiait.
///
/// Le seul propriétaire est `StoryRenderingContext` ; tout le reste emprunte
/// `StoryRenderingContext.shared.ciContext`. La garde balaie TOUT le module
/// (commentaires retirés) : nommer les fichiers un par un laisserait passer le
/// prochain.
final class StoryCIContextConvergenceGuardTests: XCTestCase {

    private static let owner = "Story/Canvas/StoryRenderingContext.swift"

    private func meeshyUISources() throws -> [(path: String, code: String)] {
        let root = ComposerSourceGuard.packageRoot.appendingPathComponent("Sources/MeeshyUI")
        let walker = try XCTUnwrap(FileManager.default.enumerator(at: root, includingPropertiesForKeys: nil),
                                   "Sources/MeeshyUI introuvable")
        return try walker.compactMap { $0 as? URL }
            .filter { $0.pathExtension == "swift" }
            .map { url in
                (url.path.replacingOccurrences(of: root.path + "/", with: ""),
                 ComposerSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8)))
            }
    }

    func test_onlyStoryRenderingContext_buildsACIContext() throws {
        let owners = try meeshyUISources()
            .filter { $0.code.contains("CIContext(") }
            .map(\.path)
            .sorted()
        XCTAssertEqual(owners, [Self.owner],
                       "un CIContext se construit dans StoryRenderingContext seul ; ailleurs, StoryRenderingContext.shared.ciContext")
    }

    func test_theSharedContext_isStillBuilt() throws {
        let code = try XCTUnwrap(meeshyUISources().first { $0.path == Self.owner }?.code)
        XCTAssertTrue(code.contains("CIContext(mtlDevice:"), "le contexte partagé reste adossé à Metal")
    }
}
