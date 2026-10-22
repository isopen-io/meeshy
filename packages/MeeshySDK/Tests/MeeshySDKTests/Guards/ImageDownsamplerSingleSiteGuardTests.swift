import XCTest

/// **Le sous-échantillonnage ImageIO ne revient pas ailleurs (#11845).**
///
/// `CGImageSourceCreateThumbnailAtIndex(` ne s'appelle que dans l'atome
/// `ImageDownsampler` — sauf les sites DÉCLARÉS ci-dessous, chacun avec la
/// raison qui le tient à part.
final class ImageDownsamplerSingleSiteGuardTests: XCTestCase {

    private static let atom = "packages/MeeshySDK/Sources/MeeshySDK/Media/ImageDownsampler.swift"

    /// Ces deux sites ne posent PAS la transformée EXIF : les migrer changerait
    /// l'orientation de leurs pixels, ce que #11845 interdit. Suivi : #11923.
    private static let declaredApart = [
        "packages/MeeshySDK/Sources/MeeshySDK/Cache/ThumbnailPrefetcher.swift",
        "packages/MeeshySDK/Sources/MeeshyUI/Packs/PackShopView.swift",
    ]

    private static var repoRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Tests/MeeshySDKTests/Guards
            .deletingLastPathComponent()   // .../Tests/MeeshySDKTests
            .deletingLastPathComponent()   // .../Tests
            .deletingLastPathComponent()   // .../MeeshySDK
            .deletingLastPathComponent()   // .../packages
            .deletingLastPathComponent()   // racine du dépôt
    }

    private func swiftFiles(under relative: String) throws -> [(path: String, code: String)] {
        let root = Self.repoRoot.appendingPathComponent(relative)
        let enumerator = try XCTUnwrap(FileManager.default.enumerator(at: root, includingPropertiesForKeys: nil))
        return try enumerator.compactMap { $0 as? URL }
            .filter { $0.pathExtension == "swift" }
            .map { url in
                (path: relative + (url.path.components(separatedBy: relative).last ?? ""),
                 code: try String(contentsOf: url, encoding: .utf8))
            }
    }

    private static func callsImageIODirectly(_ code: String) -> Bool {
        code.components(separatedBy: "\n")
            .filter { !$0.trimmingCharacters(in: .whitespaces).hasPrefix("//") }
            .contains { $0.contains("CGImageSourceCreateThumbnailAtIndex(") }
    }

    func test_onlyTheAtom_andTheDeclaredSites_callImageIODirectly() throws {
        let files = try swiftFiles(under: "packages/MeeshySDK/Sources") + swiftFiles(under: "apps/ios/Meeshy")
        XCTAssertGreaterThan(files.count, 1_000, "la garde ne voit plus les sources")
        let offenders = files
            .filter { Self.callsImageIODirectly($0.code) }
            .map { $0.path }
            .filter { $0 != Self.atom && !Self.declaredApart.contains($0) }
        XCTAssertEqual(offenders, [], "sous-échantillonner par ImageDownsampler, pas en réécrivant ses options")
    }

    func test_theAtomAndTheDeclaredSites_stillExist() throws {
        for path in [Self.atom] + Self.declaredApart {
            let code = try String(contentsOf: Self.repoRoot.appendingPathComponent(path), encoding: .utf8)
            XCTAssertTrue(Self.callsImageIODirectly(code), "\(path) ne sous-échantillonne plus : le retirer de la liste")
        }
    }
}
