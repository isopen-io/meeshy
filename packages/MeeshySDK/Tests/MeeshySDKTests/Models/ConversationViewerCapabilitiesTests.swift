import Foundation
import Testing
@testable import MeeshySDK

/// #14690 — `viewerCapabilities.canMakeObsolete`, servi par la liste, le détail et
/// `conversation:new`, calculé pour le LECTEUR. Absent ou illisible : `nil`, jamais `false`.
struct ConversationViewerCapabilitiesTests {

    private func apiConversation(_ extra: String) throws -> APIConversation {
        let json = #"{"id":"c1","type":"direct","createdAt":"2026-11-01T00:00:00Z"\#(extra)}"#
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode(APIConversation.self, from: Data(json.utf8))
    }

    @Test func test_decode_servedCapability_reachesTheDomainModel() throws {
        let api = try apiConversation(#","viewerCapabilities":{"canMakeObsolete":false}"#)
        #expect(api.viewerCapabilities == ConversationViewerCapabilities(canMakeObsolete: false))
        #expect(api.toConversation(currentUserId: "me").viewerCapabilities?.canMakeObsolete == false)
    }

    @Test func test_decode_absentCapability_isNil() throws {
        let api = try apiConversation("")
        #expect(api.viewerCapabilities == nil)
        #expect(api.toConversation(currentUserId: "me").viewerCapabilities?.canMakeObsolete == nil)
    }

    @Test func test_decode_unreadableCapability_neverDropsTheConversation() throws {
        #expect(try apiConversation(#","viewerCapabilities":{"canMakeObsolete":"oui"}"#).viewerCapabilities?.canMakeObsolete == nil)
        #expect(try apiConversation(#","viewerCapabilities":"oui""#).viewerCapabilities?.canMakeObsolete == nil)
        #expect(try apiConversation(#","viewerCapabilities":null"#).viewerCapabilities?.canMakeObsolete == nil)
    }

    @Test func test_conversationCache_roundTrip_keepsTheServedCapability() throws {
        var conversation = MeeshyConversation(id: "c1", identifier: "c1", type: .direct, lastMessageAt: Date(timeIntervalSince1970: 1_700_000_000))
        conversation.viewerCapabilities = ConversationViewerCapabilities(canMakeObsolete: false)
        let decoded = try JSONDecoder().decode(MeeshyConversation.self, from: JSONEncoder().encode(conversation))
        #expect(decoded.viewerCapabilities?.canMakeObsolete == false)
    }

    @Test func test_conversationCache_roundTrip_keepsAnAbsentCapabilityAbsent() throws {
        let conversation = MeeshyConversation(id: "c1", identifier: "c1", type: .direct, lastMessageAt: Date(timeIntervalSince1970: 1_700_000_000))
        let decoded = try JSONDecoder().decode(MeeshyConversation.self, from: JSONEncoder().encode(conversation))
        #expect(decoded.viewerCapabilities == nil)
    }
}
