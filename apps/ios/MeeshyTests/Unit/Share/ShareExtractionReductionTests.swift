import XCTest

final class ShareExtractionReductionTests: XCTestCase {

    private func media(_ name: String) -> ShareStagedMedia {
        ShareStagedMedia(relPath: "share/\(name).jpg", ext: "jpg", mime: "image/jpeg", bytes: 10)
    }

    func test_content_firstNonEmptyTextAndURL_inProviderOrder_win() throws {
        let first = try XCTUnwrap(URL(string: "https://meeshy.me/a"))
        let second = try XCTUnwrap(URL(string: "https://meeshy.me/b"))
        let payloads: [ShareProviderPayload] = [.text(""), .url(first), .text("b"), .url(second)]

        let reduced = ShareExtractionReduction.content(from: payloads)

        XCTAssertEqual(reduced.text, "b")
        XCTAssertEqual(reduced.url, first)
    }

    func test_content_withNothingUsable_isEmpty() {
        let reduced = ShareExtractionReduction.content(from: [.text(nil), .url(nil), .text("")])

        XCTAssertNil(reduced.text)
        XCTAssertNil(reduced.url)
    }

    func test_staging_sortsByIndex_andReportsTheFirstFailureByIndex() {
        let results = [
            ShareStagingResult(index: 2, outcome: .success(media("m2"))),
            ShareStagingResult(index: 0, outcome: .success(media("m0"))),
            ShareStagingResult(index: 1, outcome: .failure(.copyFailed("e1"))),
            ShareStagingResult(index: 3, outcome: .failure(.copyFailed("e3"))),
        ]

        let reduced = ShareExtractionReduction.staging(from: results)

        XCTAssertEqual(reduced.media, [media("m0"), media("m2")])
        XCTAssertEqual(reduced.failure, .copyFailed("e1"))
    }

    func test_staging_withoutResults_isEmptyWithoutFailure() {
        let reduced = ShareExtractionReduction.staging(from: [])

        XCTAssertEqual(reduced.media, [])
        XCTAssertNil(reduced.failure)
    }
}
