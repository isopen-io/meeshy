import Foundation
import Testing
@testable import MeeshySDK

/// LA FICHE PAR CERCLE (#18861, #18869) — ce que `?expand=circle` sert, et sa
/// projection locale pour « Voir comme » quand le serveur ne la sert pas
/// (`resolveProfileCircleViewAs`, `packages/shared/utils/profile-circle-view.ts`).
/// Le décodage ferme : un état illisible est verrouillé, une clé inconnue ne
/// fait pas tomber la fiche.
struct ProfileCircleViewTests {

    private func decode(_ json: String) throws -> ProfileCircleView {
        try JSONDecoder().decode(ProfileCircleView.self, from: Data(json.utf8))
    }

    @Test func decodesTheServedCircle() throws {
        let view = try decode("""
        {"isSelf":false,"level":"FRIEND","sharesCommunity":false,
         "capabilities":{"presence":{"state":"open","circle":"FRIEND","consentRequired":false},
                         "presenceDetailed":{"state":"locked","circle":"CLOSE","consentRequired":false},
                         "locationLive":{"state":"locked","circle":"BLOOD","consentRequired":true}}}
        """)
        #expect(view.level == .friend)
        #expect(view.isSelf == false)
        #expect(view.state(of: .presence) == ProfileCapabilityState(isOpen: true, circle: .friend, consentRequired: false))
        #expect(view.state(of: .presenceDetailed)?.isOpen == false)
        #expect(view.state(of: .locationLive) == ProfileCapabilityState(isOpen: false, circle: .blood, consentRequired: true))
        #expect(view.state(of: .talkie) == nil)
    }

    @Test func anUnreadableStateIsLocked_neverOpen() throws {
        let view = try decode("""
        {"level":"BLOOD","capabilities":{"battery":{"state":"OPEN","circle":"CLOSE"},"talkie":{"circle":"CLOSE"}}}
        """)
        #expect(view.state(of: .battery)?.isOpen == false)
        #expect(view.state(of: .talkie)?.isOpen == false)
    }

    @Test func anUnreadableCircleFallsBackToTheLawFloor() throws {
        let view = try decode("""
        {"level":"PUBLIC","capabilities":{"locationLive":{"state":"locked","circle":"ATOM"}}}
        """)
        #expect(view.state(of: .locationLive)?.circle == .blood)
        #expect(view.state(of: .locationLive)?.consentRequired == true)
    }

    @Test func anUnknownCapabilityKeyIsIgnored() throws {
        let view = try decode("""
        {"level":"CLOSE","capabilities":{"teleport":{"state":"open","circle":"PUBLIC"},
         "talkie":{"state":"open","circle":"CLOSE","consentRequired":true}}}
        """)
        #expect(view.capabilities.count == 1)
        #expect(view.state(of: .talkie)?.isOpen == true)
    }

    @Test func aMissingCapabilityBlockReadsEverythingAbsent() throws {
        let view = try decode(#"{"level":"ACQUAINTANCE"}"#)
        #expect(view.capabilities.isEmpty)
        #expect(view.level == .acquaintance)
    }

    // MARK: - « Voir comme » projeté depuis la loi

    @Test func seenAsPublicOpensOnlyTheRequestAndTheRing() {
        let view = ProfileCircleView.seenAs(.public)
        let open = Set(view.capabilities.filter { $0.value.isOpen }.map { $0.key })
        #expect(open == [.messageRequest, .ring])
        #expect(view.level == .public)
        #expect(view.isSelf == false)
    }

    @Test func seenAsFriendOpensBinaryPresenceButNotTheDetailedOne() {
        let view = ProfileCircleView.seenAs(.friend)
        #expect(view.state(of: .presence)?.isOpen == true)
        #expect(view.state(of: .presenceDetailed)?.isOpen == false)
        #expect(view.state(of: .presenceDetailed)?.circle == .close)
        #expect(view.state(of: .game)?.isOpen == true)
        #expect(view.state(of: .gameSparks)?.isOpen == false)
    }

    @Test func seenAsBloodOpensEveryCapability() {
        let view = ProfileCircleView.seenAs(.blood)
        #expect(view.capabilities.count == ProfileCapability.allCases.count)
        #expect(view.capabilities.values.allSatisfy { $0.isOpen })
    }

    @Test func everyProjectedStateCarriesTheFloorOfItsFeature() {
        let view = ProfileCircleView.seenAs(.acquaintance)
        for capability in ProfileCapability.allCases {
            let state = view.state(of: capability)
            #expect(state?.circle == capability.feature.minimumLevel, "\(capability.rawValue)")
            #expect(state?.consentRequired == capability.feature.requiresConsent, "\(capability.rawValue)")
            #expect(state?.isOpen == (RelationLevel.acquaintance >= capability.feature.minimumLevel), "\(capability.rawValue)")
        }
    }

    @Test func aMinorOwnerRaisesTheRingAboveThePublicReader() {
        let view = ProfileCircleView.seenAs(.acquaintance, ownerMinor: .minor)
        #expect(view.state(of: .ring)?.isOpen == false)
        #expect(view.state(of: .messageRequest)?.isOpen == true)
    }

    @Test func theProjectionMatchesTheServedShape() throws {
        let entries = ProfileCapability.allCases.map { capability -> String in
            let floor = capability.feature.minimumLevel
            let state = RelationLevel.close >= floor ? "open" : "locked"
            let consent = capability.feature.requiresConsent ? "true" : "false"
            return #""\#(capability.rawValue)":{"state":"\#(state)","circle":"\#(floor.rawValue)","consentRequired":\#(consent)}"#
        }
        let json = #"{"isSelf":false,"level":"CLOSE","sharesCommunity":false,"capabilities":{"# + entries.joined(separator: ",") + "}}"
        let served = try decode(json)
        #expect(served == ProfileCircleView.seenAs(.close))
    }
}
