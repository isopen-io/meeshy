import XCTest

/// Le mode vitrine n'existe PAS dans l'app publiée (#8855).
final class VitrineSourceGuardTests: XCTestCase {
    private var depot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
    }

    func test_everyVitrineSource_isWrappedInDebug() throws {
        let dossier = depot.appendingPathComponent("apps/ios/Meeshy/Features/Vitrine")
        let fichiers = try FileManager.default.contentsOfDirectory(at: dossier, includingPropertiesForKeys: nil)
            .filter { $0.pathExtension == "swift" }
        XCTAssertFalse(fichiers.isEmpty)
        for fichier in fichiers {
            let lignes = try String(contentsOf: fichier, encoding: .utf8)
                .components(separatedBy: .newlines)
                .map { $0.trimmingCharacters(in: .whitespaces) }
                .filter { !$0.isEmpty }
            XCTAssertEqual(lignes.first, "#if DEBUG", "\(fichier.lastPathComponent) ne commence pas par #if DEBUG")
            XCTAssertEqual(lignes.last, "#endif", "\(fichier.lastPathComponent) ne finit pas par #endif")
        }
    }
}
