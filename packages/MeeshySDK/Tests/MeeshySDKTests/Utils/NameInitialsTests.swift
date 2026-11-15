import Testing
@testable import MeeshySDK

struct NameInitialsTests {
    @Test func twoWords_takeTheFirstLetterOfEach() {
        #expect(NameInitials.of("Marie Curie") == "MC")
    }

    @Test func threeWords_keepOnlyTheFirstTwo() {
        #expect(NameInitials.of("Jean de La Fontaine") == "JD")
    }

    @Test func lowercaseAndAccents_areUppercasedWithTheirDiacritics() {
        #expect(NameInitials.of("élodie çağ") == "ÉÇ")
    }

    @Test func parenthesizedNickname_keepsOnlyLetters() {
        #expect(NameInitials.of("Théo (foot)") == "TF")
        #expect(NameInitials.of("(foot) Théo") == "FT")
    }

    @Test func emojiAndPunctuationWords_areSkipped() {
        #expect(NameInitials.of("🎉 Nadia") == "N")
        #expect(NameInitials.of("J. Charles N. M.") == "JC")
    }

    @Test func noLetterAtAll_fallsBackToTheFirstCharacter() {
        #expect(NameInitials.of("😀") == "😀")
    }

    @Test func emptyOrBlankName_rendersNothing() {
        #expect(NameInitials.of("") == "")
        #expect(NameInitials.of("   ") == "")
    }
}
