import XCTest

/// Issue #11285 — tout lien d'affichage déclare sa plage de cadence.
///
/// La fabrique `WeakDisplayLinkTarget.makeLink(frameRateRange:onTick:)` est
/// le seul constructeur autorisé : un `CADisplayLink(` nu, ou un appel qui
/// s'en remet à la plage par défaut du système, rend la cadence invisible à
/// la revue. Les gardes lisent le code (commentaires retirés) sous `apps/ios`
/// et `packages/MeeshySDK/Sources`.
final class DisplayLinkCadenceSourceGuardTests: XCTestCase {

    private static let repoRoot: URL = {
        var url = URL(fileURLWithPath: #filePath)
        for _ in 0..<6 { url.deleteLastPathComponent() }
        return url
    }()

    private static let scannedRoots = ["apps/ios/Meeshy", "packages/MeeshySDK/Sources"]
    private static let factoryPath = "packages/MeeshySDK/Sources/MeeshyUI/Utilities/WeakDisplayLinkTarget.swift"
    private static let cadenceLawPath = "packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryPlaybackCadence.swift"

    private static func swiftFiles() -> [URL] {
        scannedRoots.flatMap { root -> [URL] in
            guard let enumerator = FileManager.default.enumerator(
                at: repoRoot.appendingPathComponent(root),
                includingPropertiesForKeys: nil
            ) else { return [] }
            return enumerator.compactMap { $0 as? URL }.filter { $0.pathExtension == "swift" }
        }
    }

    private static func relativePath(of url: URL) -> String {
        url.path.replacingOccurrences(of: repoRoot.path + "/", with: "")
    }

    private static func codeText(of url: URL) throws -> String {
        try String(contentsOf: url, encoding: .utf8)
            .components(separatedBy: "\n")
            .filter { !$0.trimmingCharacters(in: .whitespaces).hasPrefix("//") }
            .joined(separator: "\n")
    }

    private static func callSiteFiles() throws -> [(path: String, code: String)] {
        try swiftFiles()
            .map(relativePath(of:))
            .filter { $0 != factoryPath }
            .map { path in
                (path, try codeText(of: repoRoot.appendingPathComponent(path)))
            }
    }

    func test_directCADisplayLinkInit_isOnlyInTheFactory() throws {
        let offenders = try Self.callSiteFiles()
            .filter { $0.code.contains("CADisplayLink(") }
            .map(\.path)
        XCTAssertEqual(offenders, [], "un CADisplayLink( nu n'a pas de plage : passer par WeakDisplayLinkTarget.makeLink")
    }

    func test_everyMakeLinkCall_declaresItsFrameRateRange() throws {
        let sites = try Self.callSiteFiles()
        let calls = sites.reduce(0) { $0 + $1.code.components(separatedBy: "WeakDisplayLinkTarget.makeLink(").count - 1 }
        let declared = sites.reduce(0) { $0 + $1.code.components(separatedBy: "WeakDisplayLinkTarget.makeLink(frameRateRange:").count - 1 }
        let bare = sites.filter { $0.code.contains("WeakDisplayLinkTarget.makeLink {") }.map(\.path)
        XCTAssertGreaterThan(calls, 0)
        XCTAssertEqual(declared, calls, "chaque WeakDisplayLinkTarget.makeLink porte frameRateRange:")
        XCTAssertEqual(bare, [], "aucun makeLink en closure finale sans plage")
    }

    func test_factoryRequiresTheRange_withoutDefault() throws {
        let factory = try Self.codeText(of: Self.repoRoot.appendingPathComponent(Self.factoryPath))
        XCTAssertTrue(factory.contains("static func makeLink(frameRateRange: CAFrameRateRange, onTick"))
        XCTAssertTrue(factory.contains("link.preferredFrameRateRange = frameRateRange"))
        XCTAssertFalse(factory.contains("frameRateRange: CAFrameRateRange = "), "la plage n'a pas de défaut")
    }

    func test_frameRateRangeLiterals_liveOnlyInTheSharedLaws() throws {
        let offenders = try Self.callSiteFiles()
            .filter { $0.path != Self.cadenceLawPath && $0.code.contains("CAFrameRateRange(minimum:") }
            .map(\.path)
        XCTAssertEqual(offenders, [], "une plage s'écrit dans la loi (.clock, .gesture, pinned(fps:)), jamais au site")
    }
}
