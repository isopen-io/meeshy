import XCTest

/// **Aucun test ne touche le registre E2EE process-wide directement**
/// (#13211).
///
/// `EndToEndRegimeLedger.shared` et sa mémoire `EndToEndRegimeMemory.shared`
/// sont MONOTONES et vivent pour tout le processus xctest : un test qui les
/// lit ou les écrit laisse une marque que n'importe quel autre test du même
/// processus hérite, même un test qui n'a jamais entendu parler de celui qui
/// a écrit. Le défaut de `ConversationCollaborators` isole déjà l'OMISSION
/// (un test qui ne précise pas `regimeLedger` reçoit un registre neuf sous le
/// harnais de test) ; cette garde interdit l'écriture EXPLICITE du
/// singleton, qui contournerait cet isolement.
final class EndToEndRegimeLedgerSharedGuardTests: XCTestCase {

    private static let forbidden = ["EndToEndRegimeLedger.shared", "EndToEndRegimeMemory.shared"]
    /// Les DEUX exceptions revues qui citent le singleton pour en parler,
    /// jamais pour s'en servir : cette garde elle-même (la liste ci-dessus),
    /// et le témoin d'isolement qui compare une IDENTITÉ pour prouver que le
    /// défaut n'EST PAS ce singleton (`===`, jamais un appel qui le muterait).
    private static let exemptFileNames: Set<String> = [
        "EndToEndRegimeLedgerSharedGuardTests.swift",
        "ConversationCollaboratorsRegimeLedgerIsolationTests.swift",
    ]

    func test_noTestFileReadsOrWritesTheProcessWideRegimeSingleton() throws {
        let offenders = try testSources().compactMap { url -> String? in
            let code = AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
            guard let hit = Self.forbidden.first(where: code.contains) else { return nil }
            return "\(url.lastPathComponent) — \(hit)"
        }

        XCTAssertTrue(
            offenders.isEmpty,
            "Test(s) touchant le registre E2EE process-wide — injecter EndToEndRegimeLedger() à la place :\n"
            + offenders.joined(separator: "\n")
        )
    }

    private func testSources() throws -> [URL] {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Guards
            .deletingLastPathComponent()   // Unit
            .deletingLastPathComponent()   // MeeshyTests
        guard let walker = FileManager.default.enumerator(at: root, includingPropertiesForKeys: nil)
        else { return [] }
        return walker.compactMap { $0 as? URL }
            .filter { $0.pathExtension == "swift" && !Self.exemptFileNames.contains($0.lastPathComponent) }
    }
}
