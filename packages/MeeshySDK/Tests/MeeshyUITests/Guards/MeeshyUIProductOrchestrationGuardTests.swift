import XCTest
import Foundation

final class MeeshyUIProductOrchestrationGuardTests: XCTestCase {

    private static let cachePatterns = [
        #"CacheCoordinator\.shared"#,
        #"class\s+\w*ViewModel\b"#
    ]

    private static let servicePatterns = [
        #"\b(CommunityService|ShareLinkService|ConversationService|NotificationService)\.shared"#,
        #"AuthManager\.shared"#
    ]

    private static let forbiddenPatterns = cachePatterns + servicePatterns

    private static let governedFolders: [String: [String]] = [
        "Community": forbiddenPatterns,
        "JoinFlow": forbiddenPatterns,
        "Profile": cachePatterns,
        "Notifications": cachePatterns
    ]

    private var sourcesRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Sources/MeeshyUI")
    }

    private func swiftFiles(in folder: String) -> [URL] {
        let base = sourcesRoot.appendingPathComponent(folder)
        let walker = FileManager.default.enumerator(at: base, includingPropertiesForKeys: nil)
        return (walker?.allObjects as? [URL] ?? []).filter { $0.pathExtension == "swift" }
    }

    private func code(of url: URL) throws -> String {
        try String(contentsOf: url, encoding: .utf8)
            .split(separator: "\n", omittingEmptySubsequences: false)
            .filter { !$0.trimmingCharacters(in: .whitespaces).hasPrefix("//") }
            .joined(separator: "\n")
    }

    func test_leDossierNeContientAucunCacheCoordinatorNiViewModel() throws {
        for (folder, patterns) in Self.governedFolders {
            let files = swiftFiles(in: folder)
            XCTAssertGreaterThan(files.count, 0, "\(folder) : le balayage ne voit aucun fichier")
            for url in files {
                let text = try code(of: url)
                for pattern in patterns {
                    let range = NSRange(text.startIndex..., in: text)
                    let regex = try NSRegularExpression(pattern: pattern)
                    XCTAssertNil(
                        regex.firstMatch(in: text, range: range),
                        "\(folder)/\(url.lastPathComponent) : \(pattern) — l'orchestration produit vit dans l'app (apps/ios/Meeshy/Features)"
                    )
                }
            }
        }
    }

    func test_laGardeVoitUnVraiMotifInterdit() throws {
        let sample = "final class FooViewModel: ObservableObject {}\nlet x = CacheCoordinator.shared"
        let hits = try Self.forbiddenPatterns.filter { pattern in
            let regex = try NSRegularExpression(pattern: pattern)
            return regex.firstMatch(in: sample, range: NSRange(sample.startIndex..., in: sample)) != nil
        }
        XCTAssertEqual(hits.count, 2)
    }
}
