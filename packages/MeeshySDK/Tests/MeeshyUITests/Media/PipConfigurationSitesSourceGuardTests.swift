import XCTest

/// #11041, décision porteur e (2026-10-20) — chaque site qui configure une
/// fenêtre PiP passe par `PipPresentationLaw` : seul le plein écran en ouvre
/// une. Un nouveau site qui appellerait `configurePip` sans la loi armerait
/// le PiP automatique d'une vidéo inline (bulle, fil, page de post, profil,
/// commentaire).
final class PipConfigurationSitesSourceGuardTests: XCTestCase {

    /// Les surfaces autorisées à appeler `configurePip`, et ce par quoi leur
    /// décision passe par la loi.
    private static let sites: [String: String] = [
        "MeeshyVideoSurface.swift": "enablesPip",
        "ReelsPlayerView+Video.swift": "PipPresentationLaw.mayConfigurePip",
        "VideoLegacySupport.swift": "PipPresentationLaw.mayConfigurePip",
    ]

    private static var repositoryRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
    }

    private static func swiftFiles(under relativePath: String) -> [URL] {
        let root = repositoryRoot.appendingPathComponent(relativePath)
        guard let walker = FileManager.default.enumerator(at: root, includingPropertiesForKeys: nil) else { return [] }
        return walker.compactMap { $0 as? URL }.filter { $0.pathExtension == "swift" }
    }

    private static var allSources: [URL] {
        swiftFiles(under: "packages/MeeshySDK/Sources") + swiftFiles(under: "apps/ios/Meeshy")
    }

    private static func code(of file: URL) -> String {
        guard let text = try? String(contentsOf: file, encoding: .utf8) else { return "" }
        return text.components(separatedBy: .newlines)
            .map { $0.components(separatedBy: "//").first ?? "" }
            .joined(separator: "\n")
    }

    func test_theGuardSeesTheSources() {
        XCTAssertGreaterThan(Self.swiftFiles(under: "packages/MeeshySDK/Sources").count, 100)
        XCTAssertGreaterThan(Self.swiftFiles(under: "apps/ios/Meeshy").count, 100)
    }

    func test_onlyTheKnownSurfacesConfigurePip() {
        let callers = Self.allSources
            .filter { file in
                Self.code(of: file).components(separatedBy: .newlines)
                    .contains { $0.contains("configurePip(playerLayer:") && !$0.contains("func configurePip") }
            }
            .map(\.lastPathComponent)
        XCTAssertEqual(Set(callers), Set(Self.sites.keys), "\(callers)")
    }

    func test_everySurfaceDecidesThroughTheLaw() {
        let byName = Dictionary(Self.allSources.map { ($0.lastPathComponent, $0) }, uniquingKeysWith: { first, _ in first })
        for (name, marker) in Self.sites {
            guard let file = byName[name] else { return XCTFail("\(name) introuvable") }
            XCTAssertTrue(Self.code(of: file).contains(marker), "\(name) ne passe pas par \(marker)")
        }
    }

    /// `MeeshyVideoSurface` reçoit `enablesPip` de ses renderers : chacun le
    /// calcule par `surfaceEnablesPip(style:controls:)`, qui applique la loi.
    func test_everyVideoSurfaceThatAsksForPip_derivesItFromItsStyle() {
        let offenders = Self.allSources.flatMap { file in
            Self.code(of: file).components(separatedBy: .newlines)
                .filter { $0.contains("enablesPip:") && !$0.contains("var enablesPip") }
                .filter { !$0.contains("surfaceEnablesPip(style:") }
                .map { "\(file.lastPathComponent): \($0.trimmingCharacters(in: .whitespaces))" }
        }
        XCTAssertTrue(offenders.isEmpty, "\(offenders)")
    }
}
