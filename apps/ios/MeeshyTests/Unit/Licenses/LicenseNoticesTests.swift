import XCTest
@testable import Meeshy

/// Les textes que l'écran Licences doit afficher HORS LIGNE (#14628) : le texte
/// officiel de l'AGPL-3.0 et les avis de libsignal, embarqués par `project.yml`.
final class LicenseNoticesTests: XCTestCase {

    private func plist(_ specifiers: [[String: String]]) throws -> Data {
        try PropertyListSerialization.data(
            fromPropertyList: ["PreferenceSpecifiers": specifiers],
            format: .xml,
            options: 0
        )
    }

    func test_parseAcknowledgments_keepsEveryLicensedEntry_dropsTheHeader() throws {
        let data = try plist([
            ["Title": "Acknowledgements", "FooterText": "libsignal makes use of…", "Type": "PSGroupSpecifier"],
            ["Title": "libsignal-protocol", "License": "GNU Affero General Public License v3.0 only", "FooterText": "AGPL text", "Type": "PSGroupSpecifier"],
            ["Title": "ring 0.17.14", "License": "Apache License 2.0", "FooterText": "Apache text", "Type": "PSGroupSpecifier"]
        ])

        let notices = LicenseNotices.parseAcknowledgments(data)

        XCTAssertEqual(notices.map(\.title), ["libsignal-protocol", "ring 0.17.14"])
        XCTAssertEqual(notices.first?.license, "GNU Affero General Public License v3.0 only")
        XCTAssertEqual(notices.last?.text, "Apache text")
    }

    func test_parseAcknowledgments_withGarbage_returnsNoNotice() {
        XCTAssertEqual(LicenseNotices.parseAcknowledgments(Data("not a plist".utf8)), [])
    }

    func test_agplText_isBundledAndOfficial() throws {
        let text = try XCTUnwrap(LicenseNotices.agplText(), "LICENSES/AGPL-3.0.txt doit être copié dans le bundle (project.yml)")

        XCTAssertTrue(text.hasPrefix("                    GNU AFFERO GENERAL PUBLIC LICENSE\n                       Version 3, 19 November 2007"))
        XCTAssertTrue(text.contains("13. Remote Network Interaction; Use with the GNU General Public License."))
    }

    func test_libsignalNotices_areBundledAndNameLibsignalItself() {
        let notices = LicenseNotices.libsignal()

        XCTAssertGreaterThan(notices.count, 100, "acknowledgments-ios.plist doit être copié dans le bundle (project.yml)")
        XCTAssertTrue(notices.contains { $0.title.contains("libsignal-protocol") && $0.license == "GNU Affero General Public License v3.0 only" })
    }
}
