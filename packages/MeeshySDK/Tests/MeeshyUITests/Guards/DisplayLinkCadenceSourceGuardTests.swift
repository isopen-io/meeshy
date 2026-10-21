import XCTest

/// Issue #11285 — tout lien d'affichage déclare sa plage de cadence.
///
/// La fabrique `WeakDisplayLinkTarget.makeLink(frameRateRange:onTick:)` est
/// le seul constructeur autorisé : un `CADisplayLink(` nu, ou un appel qui
/// s'en remet à la plage par défaut du système, rend la cadence invisible à
/// la revue. Les gardes lisent le code (commentaires retirés, blancs
/// effacés pour qu'une signature ou un appel écrit sur plusieurs lignes se
/// lise comme sur une seule) sous `apps/ios/Meeshy` et
/// `packages/MeeshySDK/Sources`.
final class DisplayLinkCadenceSourceGuardTests: XCTestCase {

    private static let repoRoot: URL = {
        var url = URL(fileURLWithPath: #filePath)
        for _ in 0..<6 { url.deleteLastPathComponent() }
        return url
    }()

    private static let scannedRoots = ["apps/ios/Meeshy", "packages/MeeshySDK/Sources"]
    private static let factoryPath = "packages/MeeshySDK/Sources/MeeshyUI/Utilities/WeakDisplayLinkTarget.swift"
    private static let cadenceLawPath = "packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryPlaybackCadence.swift"

    private static func swiftFiles(under root: String) -> [URL] {
        guard let enumerator = FileManager.default.enumerator(
            at: repoRoot.appendingPathComponent(root),
            includingPropertiesForKeys: nil
        ) else { return [] }
        return enumerator.compactMap { $0 as? URL }.filter { $0.pathExtension == "swift" }
    }

    private static func compactCode(of url: URL) throws -> String {
        try String(contentsOf: url, encoding: .utf8)
            .components(separatedBy: .newlines)
            .map { $0.components(separatedBy: "//").first ?? "" }
            .joined()
            .filter { !$0.isWhitespace }
    }

    private static func isFile(_ url: URL, _ relativePath: String) -> Bool {
        url.standardizedFileURL.path.hasSuffix("/" + relativePath)
    }

    private static func callSiteFiles() throws -> [(name: String, code: String)] {
        try scannedRoots
            .flatMap(swiftFiles(under:))
            .filter { !isFile($0, factoryPath) }
            .map { ($0.lastPathComponent, try compactCode(of: $0)) }
    }

    func test_theGuardSeesTheSources() {
        XCTAssertGreaterThan(Self.swiftFiles(under: "apps/ios/Meeshy").count, 100)
        XCTAssertGreaterThan(Self.swiftFiles(under: "packages/MeeshySDK/Sources").count, 100)
        XCTAssertTrue(FileManager.default.fileExists(atPath: Self.repoRoot.appendingPathComponent(Self.factoryPath).path))
        XCTAssertTrue(FileManager.default.fileExists(atPath: Self.repoRoot.appendingPathComponent(Self.cadenceLawPath).path))
    }

    func test_directCADisplayLinkInit_isOnlyInTheFactory() throws {
        let offenders = try Self.callSiteFiles()
            .filter { $0.code.contains("CADisplayLink(") }
            .map(\.name)
        XCTAssertEqual(offenders, [], "un CADisplayLink( nu n'a pas de plage : passer par WeakDisplayLinkTarget.makeLink")
    }

    func test_everyMakeLinkCall_declaresItsFrameRateRange() throws {
        let sites = try Self.callSiteFiles()
        let calls = sites.reduce(0) { $0 + $1.code.components(separatedBy: "WeakDisplayLinkTarget.makeLink(").count - 1 }
        let declared = sites.reduce(0) {
            $0 + $1.code.components(separatedBy: "WeakDisplayLinkTarget.makeLink(frameRateRange:").count - 1
        }
        let bare = sites.filter { $0.code.contains("WeakDisplayLinkTarget.makeLink{") }.map(\.name)
        XCTAssertGreaterThan(calls, 0)
        XCTAssertEqual(declared, calls, "chaque WeakDisplayLinkTarget.makeLink porte frameRateRange:")
        XCTAssertEqual(bare, [], "aucun makeLink en closure finale sans plage")
    }

    func test_factoryRequiresTheRange_withoutDefault() throws {
        let factory = try Self.compactCode(of: Self.repoRoot.appendingPathComponent(Self.factoryPath))
        XCTAssertTrue(factory.contains("staticfuncmakeLink(frameRateRange:CAFrameRateRange,onTick:"),
                      "la fabrique prend la plage en premier paramètre")
        XCTAssertTrue(factory.contains("link.preferredFrameRateRange=frameRateRange"), "la fabrique pose la plage")
        XCTAssertFalse(factory.contains("frameRateRange:CAFrameRateRange="), "la plage n'a pas de défaut")
    }

    func test_frameRateRangeLiterals_liveOnlyInTheSharedLaws() throws {
        let lawName = URL(fileURLWithPath: Self.cadenceLawPath).lastPathComponent
        let offenders = try Self.callSiteFiles()
            .filter { $0.name != lawName && $0.code.contains("CAFrameRateRange(minimum:") }
            .map(\.name)
        XCTAssertEqual(offenders, [], "une plage s'écrit dans la loi (.clock, .gesture, pinned(fps:)), jamais au site")
    }
}
