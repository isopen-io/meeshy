import Foundation
import Testing
@testable import MeeshySDK

/// **Le mode de chiffrement se choisit à la création** (directive porteur du
/// 2026-11-01) — miroir des témoins de
/// `packages/shared/utils/conversation-creation-encryption.test.ts`.
struct ConversationCreationEncryptionTests {

    private func makeOffer(
        platformRole: String? = "USER",
        conversationType: String = "direct",
        endToEndSupported: Bool = true
    ) -> ConversationCreationEncryption.Offer {
        ConversationCreationEncryption.offer(
            platformRole: platformRole, conversationType: conversationType, endToEndSupported: endToEndSupported
        )
    }

    private func modes(_ offer: ConversationCreationEncryption.Offer) -> [ConversationCreationEncryption.Mode] {
        offer.choices.map(\.mode)
    }

    @Test func offer_ordinaryUser_choosesServerOrHybrid_serverByDefault() {
        let offer = makeOffer(platformRole: "USER")

        #expect(offer.choices == [
            .init(mode: .server, available: true, unavailability: nil),
            .init(mode: .hybrid, available: true, unavailability: nil),
        ])
        #expect(offer.defaultMode == .server)
    }

    @Test func modes_noUnencryptedChoiceExists() {
        #expect(ConversationCreationEncryption.Mode.allCases.map(\.rawValue) == ["server", "hybrid", "e2ee"])
    }

    @Test(arguments: ["ANALYST", "AUDIT", "MODERATOR", "ADMIN", "BIGBOSS", "analyst"])
    func offer_staffRole_seesEndToEnd_preselectedInADirect(platformRole: String) {
        let offer = makeOffer(platformRole: platformRole)

        #expect(offer.choices.last == ConversationCreationEncryption.Choice(mode: .e2ee, available: true, unavailability: nil))
        #expect(offer.defaultMode == .e2ee)
    }

    @Test(arguments: ["USER", "AGENT", "", "nonsense", nil] as [String?])
    func offer_lowerOrUnknownRole_neverSeesEndToEnd(platformRole: String?) {
        #expect(!modes(makeOffer(platformRole: platformRole)).contains(.e2ee))
        #expect(!ConversationCreationEncryption.mayChooseEndToEnd(platformRole: platformRole))
    }

    @Test func offer_inAGroup_endToEndIsSoon_defaultStaysServer() {
        let offer = makeOffer(platformRole: "ADMIN", conversationType: "group")

        #expect(offer.choices.last == ConversationCreationEncryption.Choice(mode: .e2ee, available: false, unavailability: .groupsNotYet))
        #expect(offer.defaultMode == .server)
    }

    @Test func offer_onAClientWithoutEndToEnd_endToEndIsSoon_defaultStaysServer() {
        let offer = makeOffer(platformRole: "ADMIN", endToEndSupported: false)

        #expect(offer.choices.last == ConversationCreationEncryption.Choice(mode: .e2ee, available: false, unavailability: .clientNotYet))
        #expect(offer.defaultMode == .server)
    }

    @Test func offer_defaultIsAlwaysAnAvailableChoice() {
        for role in ["USER", "ANALYST", "ADMIN"] {
            for type in ["direct", "group", "public"] {
                for supported in [true, false] {
                    let offer = makeOffer(platformRole: role, conversationType: type, endToEndSupported: supported)
                    #expect(offer.isAvailable(offer.defaultMode), "\(role) \(type) \(supported)")
                }
            }
        }
    }

    @Test func implicitMode_isServer_evenForARoleThatMayChooseEndToEnd() {
        #expect(ConversationCreationEncryption.implicitMode == .server)
    }

    @Test func unavailability_wireValuesMirrorTheSharedRule() {
        #expect(ConversationCreationEncryption.Unavailability.groupsNotYet.rawValue == "groups-not-yet")
        #expect(ConversationCreationEncryption.Unavailability.clientNotYet.rawValue == "client-not-yet")
    }

    @Test func mode_readsOnlyTheThreeModes() {
        #expect(["server", "hybrid", "e2ee"].allSatisfy { ConversationCreationEncryption.Mode(rawValue: $0) != nil })
        #expect(["", "none", "E2EE"].allSatisfy { ConversationCreationEncryption.Mode(rawValue: $0) == nil })
    }

    @Test func createConversationRequest_carriesTheChosenMode_andOmitsItOtherwise() throws {
        let chosen = try JSONSerialization.jsonObject(with: JSONEncoder().encode(
            CreateConversationRequest(type: "direct", participantIds: ["u"], encryptionMode: .e2ee)
        )) as? [String: Any]
        let implicit = try JSONSerialization.jsonObject(with: JSONEncoder().encode(
            CreateConversationRequest(type: "direct", participantIds: ["u"])
        )) as? [String: Any]

        #expect(chosen?["encryptionMode"] as? String == "e2ee")
        #expect(implicit?["encryptionMode"] == nil, "une création hors de l'écran ne choisit rien : la passerelle pose Serveur")
    }
}
