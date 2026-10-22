import XCTest
import Foundation
@testable import MeeshySDK

final class LiteralRegexTests: XCTestCase {

    private func matches(_ regex: NSRegularExpression, _ text: String) -> Bool {
        regex.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)) != nil
    }

    func test_compile_motifValide_trouveLaCorrespondance() {
        let regex = LiteralRegex.compile(pattern: #"^a{1,3}$"#)

        XCTAssertTrue(matches(regex, "aa"))
        XCTAssertFalse(matches(regex, "aaaa"))
    }

    func test_compile_motifInvalide_neMatchJamaisEtNePlantePas() {
        let regex = LiteralRegex.compile(pattern: "(")

        XCTAssertFalse(matches(regex, ""))
        XCTAssertFalse(matches(regex, "("))
        XCTAssertFalse(matches(regex, "abc"))
    }

    func test_compile_respecteLesOptions() {
        let sensitive = LiteralRegex.compile(pattern: #"^https?://\S+$"#)
        let insensitive = LiteralRegex.compile(pattern: #"^https?://\S+$"#, options: .caseInsensitive)

        XCTAssertFalse(matches(sensitive, "HTTP://x"))
        XCTAssertTrue(matches(insensitive, "HTTP://x"))
    }

    func test_unmatchable_neMatchRien() {
        XCTAssertFalse(matches(LiteralRegex.unmatchable, ""))
        XCTAssertFalse(matches(LiteralRegex.unmatchable, " "))
        XCTAssertFalse(matches(LiteralRegex.unmatchable, "héllo 👋🏽 世界"))
    }
}
