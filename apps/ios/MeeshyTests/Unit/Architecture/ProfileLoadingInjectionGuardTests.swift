import XCTest

final class ProfileLoadingInjectionGuardTests: XCTestCase {

    private var repoRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
    }

    private func source(_ relativePath: String) throws -> String {
        try String(contentsOf: repoRoot.appendingPathComponent(relativePath), encoding: .utf8)
    }

    func test_laRacineInjecteLeChargeurDeProfil() throws {
        let app = try source("apps/ios/Meeshy/MeeshyApp.swift")

        let game = try XCTUnwrap(app.range(of: ".environment(\\.profileGameSection"))
        let loading = try XCTUnwrap(app.range(of: ".environment(\\.profileLoading, LiveProfileLoading())"))
        XCTAssertLessThan(game.lowerBound, loading.lowerBound)
        let between = app[game.lowerBound..<loading.lowerBound]
        XCTAssertFalse(between.contains("} else if"), "le chargeur doit être posé sur la même chaîne que le jeu")
    }

    func test_liveProfileLoading_estLeSeulPorteurDuCacheProfil() throws {
        let folders = ["apps/ios/Meeshy/Features/Profile", "packages/MeeshySDK/Sources/MeeshyUI/Profile"]
        var carriers: [String] = []
        for folder in folders {
            let base = repoRoot.appendingPathComponent(folder)
            let walker = FileManager.default.enumerator(at: base, includingPropertiesForKeys: nil)
            let files = (walker?.allObjects as? [URL] ?? []).filter { $0.pathExtension == "swift" }
            XCTAssertFalse(files.isEmpty, folder)
            for url in files {
                let text = try String(contentsOf: url, encoding: .utf8)
                if text.contains("CacheCoordinator.shared.profiles") { carriers.append(url.lastPathComponent) }
            }
        }
        XCTAssertEqual(carriers, ["LiveProfileLoading.swift"])
    }
}
