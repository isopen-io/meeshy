import Foundation
import Testing
@testable import MeeshySDK

/// L'adresse courte d'une fiche (#18862) : `meeshy.me/@pseudo`, servie par le web
/// (`/@$username`) et la passerelle. Un pseudo vide n'a pas d'adresse.
struct ProfileLinkTests {

    @Test func theShortAddressCarriesTheHandle() {
        let link = ProfileLink(username: "aissa")
        #expect(link?.url.absoluteString == "https://meeshy.me/@aissa")
        #expect(link?.displayText == "meeshy.me/@aissa")
    }

    @Test func aLeadingAtIsNotDoubled() {
        #expect(ProfileLink(username: "@aissa")?.url.absoluteString == "https://meeshy.me/@aissa")
    }

    @Test func anEmptyHandleHasNoAddress() {
        #expect(ProfileLink(username: "") == nil)
        #expect(ProfileLink(username: "   ") == nil)
        #expect(ProfileLink(username: nil) == nil)
    }

    @Test func aHandleIsPercentEncoded() {
        #expect(ProfileLink(username: "a b")?.url.absoluteString == "https://meeshy.me/@a%20b")
    }
}
