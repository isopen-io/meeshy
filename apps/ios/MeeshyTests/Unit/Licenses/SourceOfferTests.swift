import XCTest
@testable import Meeshy

/// L'offre de source de l'écran Licences (AGPL-3.0, section 6, #14628) : le
/// dépôt public au commit EXACT du build, et jamais un commit fabriqué.
final class SourceOfferTests: XCTestCase {

    private let sha = "0123456789abcdef0123456789abcdef01234567"

    func test_url_withFullCommit_pointsAtTheTreeOfThatCommit() {
        let offer = SourceOffer(commit: sha)

        XCTAssertEqual(offer.url.absoluteString, "https://github.com/isopen-io/meeshy/tree/\(sha)")
        XCTAssertEqual(offer.shortCommit, "0123456")
    }

    func test_url_withoutCommit_pointsAtTheRepository() {
        let offer = SourceOffer(commit: nil)

        XCTAssertEqual(offer.url, SourceOffer.repository)
        XCTAssertNil(offer.shortCommit)
    }

    func test_init_withUnexpandedBuildSetting_holdsNoCommit() {
        XCTAssertNil(SourceOffer(commit: "$(MEESHY_SOURCE_COMMIT)").commit)
        XCTAssertNil(SourceOffer(commit: "").commit)
    }

    func test_init_withTwoConcatenatedCommits_holdsNoCommit() {
        XCTAssertNil(SourceOffer(commit: sha + sha).commit, "CI_COMMIT et GITHUB_SHA posés ensemble ne forment pas un commit")
    }

    func test_init_withShortOrNonHexValue_holdsNoCommit() {
        XCTAssertNil(SourceOffer(commit: "0123456").commit)
        XCTAssertNil(SourceOffer(commit: String(repeating: "z", count: 40)).commit)
    }

    func test_init_normalizesCaseAndWhitespace() {
        XCTAssertEqual(SourceOffer(commit: "  \(sha.uppercased())\n").commit, sha)
    }

    func test_infoPlist_declaresTheCommitKey() {
        let value = Bundle.main.object(forInfoDictionaryKey: SourceOffer.infoPlistKey)
        XCTAssertNotNil(value, "l'Info.plist de l'app doit porter \(SourceOffer.infoPlistKey) (réglage MEESHY_SOURCE_COMMIT)")
    }
}
