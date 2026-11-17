import Foundation
import Testing
@testable import MeeshySDK

/// Mes adresses (#18871, servies par #18863) : la ligne telle que `/users/me/addresses` la rend au
/// propriétaire, et la prévalidation qui reprend la règle de `packages/shared/utils/profile-addresses.ts`.
struct ProfileAddressTests {

    private func decode(_ json: String) throws -> ProfileAddress {
        try JSONDecoder().decode(ProfileAddress.self, from: Data(json.utf8))
    }

    @Test func theOwnerRowCarriesTheCircleTheClicksAndTheTrackedPath() throws {
        let address = try decode("""
        {"id":"a1","title":"Musique","url":"https://soundcloud.com/aissa","glyph":"music","circle":"FRIEND",
         "position":1,"isShown":true,"clicks":42,"trackedPath":"/l/abc"}
        """)
        #expect(address.id == "a1")
        #expect(address.title == "Musique")
        #expect(address.glyph == .music)
        #expect(address.circle == .friend)
        #expect(address.position == 1)
        #expect(address.isShown)
        #expect(address.clicks == 42)
        #expect(address.trackedPath == "/l/abc")
    }

    @Test func anUnknownGlyphFallsBackToSiteAndAnUnreadableCircleIsNotPublic() throws {
        let address = try decode(#"{"id":"a1","title":"X","url":"https://x.io","glyph":"rocket","circle":"ATOM"}"#)
        #expect(address.glyph == .site)
        #expect(address.circle == nil)
        #expect(address.isShown)
        #expect(address.clicks == nil)
    }

    @Test func aReaderRowWithoutCircleNorPositionStillDecodes() throws {
        let address = try decode(#"{"id":"a2","title":"Site","url":"https://aissandiaye.studio/","glyph":"site"}"#)
        #expect(address.circle == nil)
        #expect(address.position == 0)
    }

    @Test func theDisplayedAddressDropsTheSchemeAndTheTrailingSlash() throws {
        let site = try decode(#"{"id":"a","title":"Site","url":"https://aissandiaye.studio/","glyph":"site"}"#)
        let music = try decode(#"{"id":"b","title":"Musique","url":"http://soundcloud.com/aissa","glyph":"music"}"#)
        #expect(site.displayURL == "aissandiaye.studio")
        #expect(music.displayURL == "soundcloud.com/aissa")
    }

    @Test func aRowSurvivesTheCacheRoundTrip() throws {
        let address = try decode(#"{"id":"a","title":"Site","url":"https://a.io","glyph":"shop","circle":"CLOSE","clicks":3}"#)
        let data = try JSONEncoder().encode(address)
        let again = try JSONDecoder().decode(ProfileAddress.self, from: data)
        #expect(again == address)
    }

    @Test func theTitleIsTrimmedAndRefusedWhenEmptyTooLongOrMarkedUp() {
        #expect(ProfileAddressRules.normalizedTitle("  Musique ") == "Musique")
        #expect(ProfileAddressRules.normalizedTitle("   ") == nil)
        #expect(ProfileAddressRules.normalizedTitle(String(repeating: "a", count: 25)) == nil)
        #expect(ProfileAddressRules.normalizedTitle(String(repeating: "é", count: 24)) == String(repeating: "é", count: 24))
        #expect(ProfileAddressRules.normalizedTitle("<b>") == nil)
    }

    @Test func aBareDomainBecomesHttps() {
        #expect(ProfileAddressRules.normalizedURL("aissandiaye.studio") == "https://aissandiaye.studio")
        #expect(ProfileAddressRules.normalizedURL(" http://soundcloud.com/aissa ") == "http://soundcloud.com/aissa")
    }

    @Test func onlyAPublicHttpSiteWithoutCredentialsPasses() {
        #expect(ProfileAddressRules.normalizedURL("javascript:alert(1)") == nil)
        #expect(ProfileAddressRules.normalizedURL("ftp://files.example.com") == nil)
        #expect(ProfileAddressRules.normalizedURL("https://user:pw@example.com") == nil)
        #expect(ProfileAddressRules.normalizedURL("https://192.168.1.10") == nil)
        #expect(ProfileAddressRules.normalizedURL("https://localhost") == nil)
        #expect(ProfileAddressRules.normalizedURL("https://nas.local") == nil)
        #expect(ProfileAddressRules.normalizedURL("https://intranet") == nil)
        #expect(ProfileAddressRules.normalizedURL("https://exa mple.com") == nil)
        #expect(ProfileAddressRules.normalizedURL("") == nil)
    }

    @Test func aHostWithAPortIsNotReadAsAScheme() {
        #expect(ProfileAddressRules.normalizedURL("example.com:8080/page") == "https://example.com:8080/page")
    }

    @Test func theDraftSendsOnlyWhatItCarries() throws {
        let draft = ProfileAddressDraft(url: "https://a.io", title: "Site", glyph: .shop, circle: .close,
                                        isShown: true, countClicks: false)
        let json = try JSONSerialization.jsonObject(with: JSONEncoder().encode(draft)) as? [String: Any]
        #expect(json?["url"] as? String == "https://a.io")
        #expect(json?["glyph"] as? String == "shop")
        #expect(json?["circle"] as? String == "CLOSE")
        #expect(json?["countClicks"] as? Bool == false)

        let partial = ProfileAddressDraft(isShown: false)
        let sparse = try JSONSerialization.jsonObject(with: JSONEncoder().encode(partial)) as? [String: Any]
        #expect(sparse?.keys.sorted() == ["isShown"])
    }
}
