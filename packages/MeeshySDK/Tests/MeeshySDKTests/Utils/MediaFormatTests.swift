import Foundation
import Testing
@testable import MeeshySDK

struct MediaFormatTests {
    private static let appLanguages = ["fr", "en", "de", "es", "it", "pt-BR", "ar"]

    @Test(arguments: appLanguages)
    func bytes_isFoundationDecimalFileStyle_inEveryAppLanguage(_ identifier: String) {
        let locale = Locale(identifier: identifier)
        for count: Int64 in [0, 512, 870_400, 1_048_576, 4_200_000_000] {
            #expect(MediaFormat.bytes(count, locale: locale) == count.formatted(.byteCount(style: .file).locale(locale)))
        }
    }

    @Test func bytes_english_isDecimal_notBinary() {
        #expect(MediaFormat.bytes(870_400, locale: Locale(identifier: "en_US")) == "870 kB")
    }

    @Test func bytes_allowedUnits_keepsTwoNumbersOnOneScale() {
        let locale = Locale(identifier: "en_US")
        #expect(MediaFormat.bytes(12_000, allowedUnits: .mb, locale: locale).hasSuffix("MB"))
    }

    @Test func bytes_memoryStyle_countsInPowersOf1024_soALimitReadsRound() {
        let locale = Locale(identifier: "en_US")
        #expect(MediaFormat.bytes(5 * 1_073_741_824, countStyle: .memory, locale: locale) == "5 GB")
    }
}
