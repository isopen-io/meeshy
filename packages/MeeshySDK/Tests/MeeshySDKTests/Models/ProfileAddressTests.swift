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

    // MARK: - Ce qu'une fiche me sert

    @Test func aProfileCarriesTheAddressesItServesMe() throws {
        let json = """
        {"id":"u2","username":"leo.m","addresses":[
          {"id":"a","title":"Portfolio","url":"https://leomarchetti.photo","glyph":"site","trackedPath":"/l/tok"}]}
        """
        let user = try JSONDecoder().decode(MeeshyUser.self, from: Data(json.utf8))
        #expect(user.addresses?.items.map(\.title) == ["Portfolio"])
        #expect(user.addresses?.items.first?.circle == nil)
        #expect(user.addresses?.items.first?.trackedPath == "/l/tok")
    }

    @Test func anUnreadableAddressIsSkippedWithoutLosingTheProfile() throws {
        let json = """
        {"id":"u2","username":"leo.m","addresses":[{"title":"sans id"},
          {"id":"b","title":"Tirages","url":"https://leomarchetti.photo/boutique","glyph":"shop"}]}
        """
        let user = try JSONDecoder().decode(MeeshyUser.self, from: Data(json.utf8))
        #expect(user.username == "leo.m")
        #expect(user.addresses?.items.map(\.id) == ["b"])
    }

    @Test func anOldServerOrAStrangeShapeServesNoAddress() throws {
        let old = try JSONDecoder().decode(MeeshyUser.self, from: Data(#"{"id":"u2","username":"leo.m"}"#.utf8))
        #expect(old.addresses == nil)
        let strange = try JSONDecoder().decode(MeeshyUser.self, from: Data(#"{"id":"u2","username":"leo.m","addresses":{"x":1}}"#.utf8))
        #expect(strange.addresses?.items.isEmpty == true)
    }

    @Test func servedAddressesSurviveTheProfileCache() throws {
        let user = MeeshyUser(id: "u2", username: "leo.m",
                              addresses: ServedProfileAddresses([ProfileAddress(id: "a", title: "Site", url: "https://a.io")]))
        let again = try JSONDecoder().decode(MeeshyUser.self, from: JSONEncoder().encode(user))
        #expect(again.addresses == user.addresses)
    }

    @Test func aProfileCopyKeepsItsAddresses() {
        let served = ServedProfileAddresses([ProfileAddress(id: "a", title: "Site", url: "https://a.io")])
        let user = MeeshyUser(id: "u2", username: "leo.m", addresses: served)
        #expect(user.withProfileChanges(displayName: "Léo").addresses == served)
        #expect(user.withProfileDecor(nil).addresses == served)
    }

    @Test func openingGoesThroughTheTrackingLinkWhenClicksAreCounted() {
        let tracked = ProfileAddress(id: "a", title: "Site", url: "https://leomarchetti.photo", trackedPath: "/l/tok")
        let direct = ProfileAddress(id: "b", title: "Site", url: "https://leomarchetti.photo/boutique")
        #expect(tracked.opening(webOrigin: "https://meeshy.me")?.absoluteString == "https://meeshy.me/l/tok")
        #expect(direct.opening(webOrigin: "https://meeshy.me")?.absoluteString == "https://leomarchetti.photo/boutique")
        #expect(tracked.host == "leomarchetti.photo")
    }

    @Test func openingRefusesAnythingButTheWeb() {
        let hostile = ProfileAddress(id: "x", title: "X", url: "javascript:alert(1)", trackedPath: "javascript:alert(1)")
        #expect(hostile.opening(webOrigin: "https://meeshy.me") == nil)
    }
}

