import XCTest

/// **Le sous-échantillonnage ImageIO ne revient pas ailleurs (#11845).**
///
/// `CGImageSourceCreateThumbnailAtIndex(` ne s'appelle que dans l'atome
/// `ImageDownsampler` — sans exception depuis que le préchargeur de vignettes et
/// la boutique de packs y passent (#11923).
final class ImageDownsamplerSingleSiteGuardTests: XCTestCase {

    private static let atom = "packages/MeeshySDK/Sources/MeeshySDK/Media/ImageDownsampler.swift"

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

    func test_onlyTheAtom_callsImageIODirectly() throws {
        let files = try swiftFiles(under: "packages/MeeshySDK/Sources") + swiftFiles(under: "apps/ios/Meeshy")
        XCTAssertGreaterThan(files.count, 1_000, "la garde ne voit plus les sources")
        let offenders = files
            .filter { Self.callsImageIODirectly($0.code) }
            .map { $0.path }
            .filter { $0 != Self.atom }
        XCTAssertEqual(offenders, [], "sous-échantillonner par ImageDownsampler, pas en réécrivant ses options")
    }

    func test_theAtom_stillCallsImageIO() throws {
        let code = try String(contentsOf: Self.repoRoot.appendingPathComponent(Self.atom), encoding: .utf8)
        XCTAssertTrue(Self.callsImageIODirectly(code), "l'atome ne sous-échantillonne plus : la garde ne garde plus rien")
    }
}
