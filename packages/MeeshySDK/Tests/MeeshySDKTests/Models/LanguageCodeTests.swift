import Testing
import Foundation
@testable import MeeshySDK

private struct LangProbe: Codable {
    let lang: LanguageCode
}

struct LanguageCodeTests {

    @Test func test_roundTrip_verbatim_bytesIdentical() throws {
        let json = Data(#"{"lang":"fr-FR"}"#.utf8)
        let decoded = try JSONDecoder().decode(LangProbe.self, from: json)
        #expect(decoded.lang.rawValue == "fr-FR")
        #expect(try JSONEncoder().encode(decoded) == json)
    }

    @Test func test_normalizing_delegatesToSDKNormalizer() {
        #expect(LanguageCode(normalizing: "fr-FR").rawValue == "fr")
        #expect(LanguageCode(normalizing: "eng").rawValue == "en")
        #expect(LanguageCode(normalizing: "iw").rawValue == "he")
        #expect(LanguageCode(normalizing: "fil") == LanguageCode.fallback)
        #expect(LanguageCode(normalizing: nil) == LanguageCode.fallback)
        #expect(LanguageCode(normalizing: "  ") == LanguageCode.fallback)
        #expect(LanguageCode(normalizing: nil, fallback: LanguageCode("en")) == LanguageCode("en"))
    }

    @Test func test_fallback_isFrench() {
        #expect(LanguageCode.fallback.rawValue == "fr")
    }

    @Test func test_matches_usesDedupKey() {
        #expect(LanguageCode("yue-HK").matches(LanguageCode("yue")))
        #expect(LanguageCode("FR").matches(LanguageCode("fr")))
        #expect(!LanguageCode("sv").matches(LanguageCode("sw")))
        #expect(LanguageCode("FR") != LanguageCode("fr"))
    }
}
