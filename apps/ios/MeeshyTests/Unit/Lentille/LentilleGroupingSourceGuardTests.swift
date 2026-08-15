import XCTest
@testable import Meeshy

/// Garde de source LWS-5 (contrat, critères d'acceptation) : la greffe du
/// sectionnement remplace le CORPS SEUL de `groupConversations` — le pipeline
/// `CombineLatest4` + `debounce(for: .milliseconds(16), …)` (`ConversationListViewModel.swift`)
/// ne bouge pas. Une seule occurrence avant la greffe, une seule après :
/// deux (pipeline dupliqué) ou zéro (debounce supprimé/déplacé) sont toutes
/// deux des régressions que ce test attrape.
final class LentilleGroupingSourceGuardTests: XCTestCase {

    private func viewModelSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Lentille
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent("Meeshy/Features/Main/ViewModels/ConversationListViewModel.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_conversationListViewModel_hasExactlyOneDebounce16msOccurrence() throws {
        let stripped = AppSourceGuard.stripComments(try viewModelSource())
        let needle = "debounce(for: .milliseconds(16"
        let occurrences = stripped.components(separatedBy: needle).count - 1

        XCTAssertEqual(
            occurrences, 1,
            "ConversationListViewModel.swift doit contenir EXACTEMENT une occurrence de " +
            "'\(needle)' — le pipeline CombineLatest4 + debounce 16 ms est gelé (E6/LWS-5) ; " +
            "la greffe de groupConversations ne touche que son CORPS, jamais ce pipeline."
        )
    }

    func test_conversationListViewModel_stillDeclaresGroupConversationsAsNonisolatedPrivateStatic() throws {
        let stripped = AppSourceGuard.stripComments(try viewModelSource())
        XCTAssertTrue(
            stripped.contains("nonisolated private static func groupConversations("),
            "la signature de groupConversations (nonisolated private static) est gelée par le " +
            "contrat LWS-5 — seul son corps est remplacé par un appel au miroir " +
            "LentilleSectionResolver."
        )
    }
}
