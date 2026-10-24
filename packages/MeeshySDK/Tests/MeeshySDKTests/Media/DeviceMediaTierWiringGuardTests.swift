import XCTest

/// **Aucun site ne perd le tier en silence (#11281).**
///
/// Un paramètre `mediaTier: DeviceMediaTier = .high` laissait une résolution de
/// conflit garder l'ancienne ligne, compiler, et effacer le tier des stories
/// sans que rien ne rougisse. La loi est désormais : le tier est REQUIS, ou lu
/// de la source unique `DeviceMediaTier.current` — jamais une constante.
///
/// Le compilateur tient les deux paramètres requis ; cette garde tient le
/// retour d'une valeur par défaut, dans le SDK comme dans l'app.
final class DeviceMediaTierWiringGuardTests: XCTestCase {

    private static let repoRoot: URL = {
        var url = URL(fileURLWithPath: #filePath)
        for _ in 0..<6 { url.deleteLastPathComponent() }
        return url
    }()

    private static let scannedDirectories = [
        "packages/MeeshySDK/Sources",
        "apps/ios/Meeshy",
    ]

    private func swiftSources() throws -> [(path: String, text: String)] {
        try Self.scannedDirectories.flatMap { directory -> [(path: String, text: String)] in
            let root = Self.repoRoot.appendingPathComponent(directory)
            let enumerator = try XCTUnwrap(FileManager.default.enumerator(at: root, includingPropertiesForKeys: nil),
                                           "\(directory) introuvable")
            return try enumerator.compactMap { $0 as? URL }
                .filter { $0.pathExtension == "swift" }
                .map { (path: $0.path.replacingOccurrences(of: Self.repoRoot.path + "/", with: ""),
                        text: try String(contentsOf: $0, encoding: .utf8)) }
        }
    }

    func test_noDeclaration_defaultsTheTierToAConstant() throws {
        let pattern = try NSRegularExpression(
            pattern: #":\s*DeviceMediaTier\??\s*=(?!\s*(\.current|DeviceMediaTier\.current)\b)"#
        )
        let sources = try swiftSources()
        XCTAssertFalse(sources.isEmpty)
        let offenders = sources.filter { source in
            let range = NSRange(source.text.startIndex..., in: source.text)
            return pattern.firstMatch(in: source.text, range: range) != nil
        }.map(\.path)
        XCTAssertEqual(offenders, [], "un tier se passe ou se lit de DeviceMediaTier.current, jamais d'un défaut")
    }

    func test_everyCadenceRange_isPosedWithTheDeviceTier() throws {
        let calls = try swiftSources().flatMap { source in
            source.text.split(separator: "\n")
                .filter { $0.contains("StoryPlaybackCadence.frameRateRange(for:") }
                .map { (source.path, String($0)) }
        }
        XCTAssertFalse(calls.isEmpty, "la plage de lecture des stories se pose quelque part")
        for (path, line) in calls {
            XCTAssertTrue(line.contains("mediaTier: DeviceMediaTier.current"), "\(path) : \(line)")
        }
    }

    func test_everyReelPreloadContext_namesTheDeviceTier() throws {
        let sites = try swiftSources().filter { $0.text.contains("ReelPreloadWindow.Context(") }
        XCTAssertFalse(sites.isEmpty, "la fenêtre des réels se construit quelque part")
        for site in sites {
            XCTAssertTrue(site.text.contains("tier: DeviceMediaTier.current"), site.path)
        }
    }
}
