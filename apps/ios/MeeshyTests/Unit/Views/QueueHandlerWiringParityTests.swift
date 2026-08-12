import XCTest
@testable import Meeshy

/// **Toute file dont le gestionnaire est posé par une racine de navigation doit
/// l'être dans LES DEUX racines.**
///
/// `StoryPublishQueue.processNext()` commence par
/// `guard let publish = onPublish else { … skipping process; return }`. Ce
/// gestionnaire est enregistré par `StoryPublishService.setExecutor`, appelé
/// depuis la racine. Il ne l'était que dans `RootView` (iPhone) : sur iPad la
/// file n'avait aucun gestionnaire, `processNext` abandonnait à chaque passage,
/// et une story publiée depuis un iPad restait en file INDÉFINIMENT.
///
/// Une file sans consommateur ne signale rien — elle accumule en silence. D'où
/// cette garde, qui lit la source : le défaut est une ABSENCE, et un test de
/// comportement ne peut pas observer un drain qui n'a jamais lieu.
@MainActor
final class QueueHandlerWiringParityTests: XCTestCase {

    private func source(_ relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent(relativePath)
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_storyPublishExecutor_isWiredInBothRoots() throws {
        let roots = [
            "Meeshy/Features/Main/Views/RootView.swift",
            "Meeshy/Features/Main/Views/iPadRootView.swift"
        ]

        for path in roots {
            let text = try source(path)
            XCTAssertTrue(
                text.contains("StoryPublishService.shared.setExecutor"),
                "\(path) n'enregistre pas l'exécuteur de publication des stories. " +
                "Sans lui, `StoryPublishQueue` n'a aucun gestionnaire : `processNext` " +
                "rend la main à chaque passage et les stories publiées depuis cette " +
                "racine ne partent JAMAIS."
            )
        }
    }
}
