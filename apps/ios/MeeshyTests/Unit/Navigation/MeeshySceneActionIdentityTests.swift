import XCTest
@testable import Meeshy

/// Ouvrir une conversation figeait l'app (0x8BADF00D et cpu_resource, iPhone 18
/// Pro Max sous iOS 27, #11131 puis #11238) : une vue publiait à la barre de
/// menus une action neuve, jamais égale à la précédente, à chaque rendu ; la
/// barre se reconstruisait, l'émetteur se réévaluait, et une nouvelle action
/// repartait, sans fin, dans la même transaction.
///
/// Une action publiée a donc TOUJOURS un propriétaire, le relais de son
/// émetteur, et c'est lui qui fait son égalité. La boucle ne se reproduit pas
/// dans un hôte de test (elle passe par `UIKitMainMenuController`) : la loi du
/// relais se prouve ici, et la garde interdit qu'une action naisse ailleurs.
@MainActor
final class MeeshySceneActionIdentityTests: XCTestCase {

    func test_actionsOfTheSameRelay_areEqual_soARenderPublishesNoChange() {
        let relay = SceneActionRelay()
        XCTAssertEqual(relay.action, relay.action)
    }

    func test_actionsOfTwoRelays_differ_soTheMenuFollowsTheFocusedOne() {
        XCTAssertNotEqual(SceneActionRelay().action, SceneActionRelay().action)
    }

    func test_theRelay_performsTheLatestClosure() {
        let relay = SceneActionRelay()
        var sent: [String] = []
        relay.perform = { sent.append("ancien") }
        let published = relay.action
        relay.perform = { sent.append("récent") }
        published.perform()
        XCTAssertEqual(sent, ["récent"])
    }

    /// Construire une `MeeshySceneAction` ailleurs que dans le relais, c'est
    /// rouvrir la porte à une action neuve par rendu : la nouvelle conversation,
    /// la recherche et la fermeture de fenêtre publiaient encore la leur ainsi.
    func test_aSceneAction_isOnlyEverBuiltByTheRelay() throws {
        let constructions = try appSources().flatMap { file in
            AppSourceGuard.strippedLines(file.code)
                .filter { $0.range(of: #"(?<!: )(?<!-> )\bMeeshySceneAction\s*[({]|\bMeeshySceneAction\.init\b"#, options: .regularExpression) != nil }
                .map { "\(file.name): \($0.trimmingCharacters(in: .whitespaces))" }
        }
        XCTAssertEqual(constructions.count, 1, "actions construites hors du relais :\n\(constructions.joined(separator: "\n"))")
        XCTAssertTrue(constructions.first?.hasPrefix("SceneCommandFocus.swift: MeeshySceneAction(owner: self)") == true,
                      constructions.joined(separator: "\n"))
    }

    private func appSources() throws -> [(name: String, code: String)] {
        let appRoot = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy")
        let files = FileManager.default.enumerator(at: appRoot, includingPropertiesForKeys: nil)?
            .compactMap { $0 as? URL }
            .filter { $0.pathExtension == "swift" } ?? []
        XCTAssertFalse(files.isEmpty, "sources de l'app introuvables depuis \(appRoot.path)")
        return try files.map { (name: $0.lastPathComponent, code: try String(contentsOf: $0, encoding: .utf8)) }
    }
}
