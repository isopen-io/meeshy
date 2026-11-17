import Foundation
import Testing
@testable import MeeshySDK

/// La face Liens d'un autre (#19444, servie par #19274) : ce que son cercle me tient fermé — un compte par cercle, rien
/// d'autre — et ses communautés ouvertes avec mon appartenance. Lus avec indulgence : une entrée illisible se saute,
/// une forme inattendue vaut « aucune », jamais la perte du profil entier.
struct ProfileLinksReachTests {

    private func user(_ json: String) throws -> MeeshyUser {
        try JSONDecoder().decode(MeeshyUser.self, from: Data(json.utf8))
    }

    @Test func anOldServerServesNeitherLockedAddressesNorOpenCommunities() throws {
        let old = try user(#"{"id":"u2","username":"leo.m"}"#)
        #expect(old.lockedAddresses == nil)
        #expect(old.openCommunities == nil)
    }

    @Test func lockedAddressesKeepOnlyACircleAndACount() throws {
        let served = try user("""
        {"id":"u2","username":"leo.m","lockedAddresses":[
          {"circle":"BLOOD","count":1,"title":"Secret","url":"https://secret.io","glyph":"music"}]}
        """)
        let groups = served.lockedAddresses?.groups ?? []
        #expect(groups == [ServedLockedAddresses.Group(circle: .blood, count: 1)])
        let encoded = String(decoding: try JSONEncoder().encode(served.lockedAddresses), as: UTF8.self)
        #expect(!encoded.contains("secret"))
        #expect(!encoded.contains("music"))
    }

    @Test func anUnknownCircleAPublicCircleOrAnEmptyCountIsSkipped() throws {
        let served = try user("""
        {"id":"u2","username":"leo.m","lockedAddresses":[
          {"circle":"ATOM","count":2},{"circle":"PUBLIC","count":1},{"circle":"CLOSE","count":0},
          {"circle":"FRIEND"},"oops",{"circle":"CLOSE","count":2}]}
        """)
        #expect(served.lockedAddresses?.groups == [ServedLockedAddresses.Group(circle: .close, count: 2)])
    }

    @Test func groupsAreMergedByCircleAndReadFromTheNearestCircleUp() {
        let locked = ServedLockedAddresses([
            .init(circle: .blood, count: 1), .init(circle: .friend, count: 2), .init(circle: .blood, count: 3)
        ])
        #expect(locked.groups == [.init(circle: .friend, count: 2), .init(circle: .blood, count: 4)])
    }

    @Test func aStrangeShapeServesNothingLockedAndNoCommunity() throws {
        let strange = try user(#"{"id":"u2","username":"leo.m","lockedAddresses":{"x":1},"openCommunities":"x"}"#)
        #expect(strange.lockedAddresses?.groups.isEmpty == true)
        #expect(strange.openCommunities?.items.isEmpty == true)
    }

    @Test func openCommunitiesCarryTheirAddressTheirMembersAndMyMembership() throws {
        let served = try user("""
        {"id":"u2","username":"leo.m","openCommunities":[
          {"id":"c1","identifier":"photo-rue","name":"Photo de rue","memberCount":1204,"isMember":false},
          {"id":"c2","identifier":"lusophones","name":"Lusophones","isMember":true},
          {"id":"c3","name":"Sans adresse"},{"id":"c1","identifier":"photo-rue","name":"Doublon"},
          {"id":"c4","identifier":"vide","name":"  "}]}
        """)
        let items = served.openCommunities?.items ?? []
        #expect(items.map(\.id) == ["c1", "c2"])
        #expect(items.first?.memberCount == 1204)
        #expect(items.first?.isReaderMember == false)
        #expect(items.last?.isReaderMember == true)
        #expect(items.first?.displayAddress == "meeshy.me/communities/photo-rue")
    }

    @Test func bothSurviveTheProfileCacheAndAProfileCopy() throws {
        let locked = ServedLockedAddresses([.init(circle: .blood, count: 1)])
        let communities = ServedOpenCommunities([
            ProfileOpenCommunity(id: "c1", identifier: "photo-rue", name: "Photo de rue", memberCount: 12, isMember: true)
        ])
        let original = MeeshyUser(id: "u2", username: "leo.m", lockedAddresses: locked, openCommunities: communities)
        let again = try JSONDecoder().decode(MeeshyUser.self, from: JSONEncoder().encode(original))
        #expect(again.lockedAddresses == locked)
        #expect(again.openCommunities == communities)
        let copy = original.withProfileChanges(displayName: "Léo")
        #expect(copy.lockedAddresses == locked)
        #expect(copy.openCommunities == communities)
        #expect(original.withProfileDecor(nil).openCommunities == communities)
    }
}
