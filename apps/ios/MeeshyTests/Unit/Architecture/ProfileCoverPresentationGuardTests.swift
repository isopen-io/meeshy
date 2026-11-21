import XCTest
@testable import Meeshy

/// #19674 — la fiche d'un profil s'ouvre en plein écran chez TOUS ses appelants, par le seul modificateur
/// `profileCover` : aucun site ne la présente plus en feuille à détentes, et le retour ramène à l'écran d'origine.
@MainActor
final class ProfileCoverPresentationGuardTests: XCTestCase {

    private static var appRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Architecture
            .deletingLastPathComponent()   // Unit
            .deletingLastPathComponent()   // MeeshyTests
            .deletingLastPathComponent()   // apps/ios
    }

    private func sitesBuildingTheProfile() throws -> [(name: String, code: String)] {
        let root = Self.appRoot.appendingPathComponent("Meeshy")
        let enumerator = FileManager.default.enumerator(at: root, includingPropertiesForKeys: nil)
        let files = (enumerator?.allObjects as? [URL] ?? []).filter { $0.pathExtension == "swift" }
        return try files.compactMap { url in
            let code = AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
            return code.contains("UserProfileSheet(") ? (url.lastPathComponent, code) : nil
        }
    }

    func test_everySiteBuildingTheProfile_presentsItFullScreen() throws {
        let sites = try sitesBuildingTheProfile()
        XCTAssertGreaterThanOrEqual(sites.count, 10, "les appelants de la fiche sont trouvés")
        for site in sites {
            XCTAssertTrue(site.code.contains(".profileCover("), "\(site.name) présente la fiche en plein écran")
        }
    }

    func test_noSite_presentsTheProfileInASheet() throws {
        let sheet = try XCTUnwrap(NSRegularExpression(pattern: #"\.sheet\(item: \$[\w.]*[pP]rofile\w*\)"#))
        for site in try sitesBuildingTheProfile() {
            let range = NSRange(site.code.startIndex..., in: site.code)
            XCTAssertEqual(sheet.numberOfMatches(in: site.code, range: range), 0, "\(site.name) ne présente plus la fiche en feuille")
        }
    }

    /// Le bouton talkie de la planche (`.ptt`) est fait du kit : le médaillon K45 plein de 96 pt, deux ondes qui
    /// s'échappent du bord au repos ; le décompte garde son anneau pendant la parole.
    func test_talkieButton_isTheKitMedallion_withTwoEscapingWaves() throws {
        let url = Self.appRoot.appendingPathComponent("Meeshy/Features/Talkie/ProfileTalkieRow.swift")
        let code = AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
        XCTAssertTrue(code.contains("MeeshyMedallion("))
        XCTAssertTrue(code.contains("decor: live ? .none : .waves(count: 2)"))
        XCTAssertTrue(code.contains("size: .s96"))
        XCTAssertTrue(code.contains("TalkieCountdownRing("))
        XCTAssertFalse(code.contains("TalkieHoldHalo"), "plus de halo maison")
    }
}
