import Foundation
import Testing
@testable import MeeshySDK

/// CE QU'UN LECTEUR PEUT FAIRE D'UNE CONVERSATION (#11209) — le miroir Swift
/// rejoue `packages/shared/fixtures/action-policy/conversation-actions.vectors.json`,
/// la grille type × profil que `conversationActionsFor` a PRODUITE.
struct ConversationActionPolicyVectorTests {

    private struct Vector: Decodable {
        let label: String
        let input: Input
        let expected: Expected

        enum CodingKeys: String, CodingKey {
            case label = "_label"
            case input
            case expected
        }
    }

    private struct Input: Decodable {
        let conversation: WireConversation
        let viewer: WireViewer

        var policyInput: ConversationActionPolicy.Input {
            ConversationActionPolicy.Input(conversation: conversation.conversation, viewer: viewer.authority)
        }
    }

    private struct Expected: Decodable, Equatable {
        let rename: Bool
        let invite: Bool
        let leave: Bool
        let deleteForAll: Bool
        let hide: Bool
        let report: Bool
        let manageMembers: Bool
        let adminOpen: Bool
        let call: Bool
        let videoCall: Bool
        let e2eeBadge: Bool
    }

    private static func project(_ actions: ConversationActionPolicy.Actions) -> Expected {
        Expected(
            rename: actions.rename,
            invite: actions.invite,
            leave: actions.leave,
            deleteForAll: actions.deleteForAll,
            hide: actions.hide,
            report: actions.report,
            manageMembers: actions.manageMembers,
            adminOpen: actions.adminOpen,
            call: actions.call,
            videoCall: actions.videoCall,
            e2eeBadge: actions.e2eeBadge
        )
    }

    private func vectors() throws -> [Vector] {
        try ActionPolicyVectorFixtures.load("conversation-actions.vectors.json", as: Vector.self)
    }

    @Test func theSharedFileCarriesCases_neverZero() throws {
        #expect(try vectors().count > 20)
    }

    @Test func everySharedVectorGivesTheSameVerdicts() throws {
        for vector in try vectors() {
            let actual = Self.project(ConversationActionPolicy.actions(for: vector.input.policyInput))
            #expect(actual == vector.expected, "\(vector.label)")
        }
    }

    @Test func theGridCoversEveryConversationTypeForEveryProfile() throws {
        let labels = Set(try vectors().map(\.label))
        let types = ["direct", "group", "public", "global", "broadcast", "secret"]
        let profiles = ["membre", "moderator", "admin", "creator", "admin-plateforme-membre", "audit", "analyst", "rang-inconnu", "invite"]
        for type in types {
            for profile in profiles {
                #expect(labels.contains("\(type)-\(profile)"), "\(type)-\(profile)")
            }
        }
    }
}
