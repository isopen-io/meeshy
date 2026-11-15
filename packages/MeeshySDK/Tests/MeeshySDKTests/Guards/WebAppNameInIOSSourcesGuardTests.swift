import XCTest
import Foundation

final class WebAppNameInIOSSourcesGuardTests: XCTestCase {

    private static let oldName = "web" + "-v2"
    private static let trees = ["apps/ios", "packages/MeeshySDK"]
    private static let skipped = ["/Build/", "/.build/", "/node_modules/", "/DerivedData/"]

    func test_aucunSourceSwiftIOSNeNommeLAncienneAppWeb() throws {
        let root = repoRoot()
        let offenders = try Self.trees.flatMap { try swiftFiles(under: root.appendingPathComponent($0)) }
            .filter { Self.mentionsOldName(try String(contentsOf: $0, encoding: .utf8)) }
            .map { $0.path.replacingOccurrences(of: root.path + "/", with: "") }
            .sorted()
        XCTAssertTrue(
            offenders.isEmpty,
            "L'application web s'appelle apps/web depuis #7668 ; ces fichiers nomment encore l'ancien dossier :\n\(offenders.joined(separator: "\n"))"
        )
    }

    func test_leDetecteurVoitLAncienNomEtIgnoreLeNomCourant() {
        XCTAssertTrue(Self.mentionsOldName("// parité avec " + Self.oldName))
        XCTAssertFalse(Self.mentionsOldName("// parité avec apps/web"))
    }

    func test_leBalayageTrouveDesSourcesSwift() throws {
        let root = repoRoot()
        let count = try Self.trees.flatMap { try swiftFiles(under: root.appendingPathComponent($0)) }.count
        XCTAssertGreaterThan(count, 100, "le balayage ne voit plus de source Swift : la garde passerait à vide")
    }

    private static func mentionsOldName(_ text: String) -> Bool {
        text.contains(oldName)
    }

    private func swiftFiles(under directory: URL) throws -> [URL] {
        guard let walker = FileManager.default.enumerator(
            at: directory,
            includingPropertiesForKeys: nil,
            options: [.skipsHiddenFiles]
        ) else { return [] }
        return walker.compactMap { $0 as? URL }.filter { url in
            url.pathExtension == "swift" && !Self.skipped.contains { url.path.contains($0) }
        }
    }

    private func repoRoot() -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
    }
}
