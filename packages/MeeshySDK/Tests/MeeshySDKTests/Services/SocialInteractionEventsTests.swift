import Foundation
import Testing
@testable import MeeshySDK

/// #10502, #10503 — une interaction s'émet là où la mutation RÉUSSIT, avec son
/// identifiant de mutation, et ne recompte rien.
@Suite("SocialInteractionEvents — l'interaction d'une mutation réussie")
struct SocialInteractionEventsTests {

    private static let enqueuedAt = Date(timeIntervalSince1970: 1_760_000_000)

    private func record<P: Encodable>(_ kind: OutboxKind, _ payload: P) throws -> OutboxRecord {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        return OutboxRecord(kind: kind, conversationId: "", clientMessageId: "cmid", payload: try encoder.encode(payload), createdAt: Self.enqueuedAt)
    }

    @Test func aDeliveredLike_isAReact_datedFromItsEnqueue_withItsMutationId() throws {
        let event = try #require(SocialInteractionEvents.event(forDelivered: try record(.toggleLikePost, ToggleLikePostPayload(clientMutationId: "m-1", postId: "p1", liked: true))))
        #expect(event.type == "interaction")
        #expect(event.action == "react")
        #expect(event.occurredAt == Self.enqueuedAt)
        #expect(event.target == SocialTarget(kind: .post, id: "p1"))
        guard case .interaction(let interaction) = event.payload else { Issue.record("pas une interaction"); return }
        #expect(interaction.mutationId == "m-1")
    }

    @Test func aDeliveredUnlike_isAnUnreact() throws {
        let event = SocialInteractionEvents.event(forDelivered: try record(.toggleLikePost, ToggleLikePostPayload(clientMutationId: "m", postId: "p1", liked: false)))
        #expect(event?.action == "unreact")
    }

    @Test func aDeliveredBlock_isANegativeOnAProfile() throws {
        let event = SocialInteractionEvents.event(forDelivered: try record(.blockUser, BlockUserPayload(clientMutationId: "m", targetUserId: "u9")))
        #expect(event?.type == "negative")
        #expect(event?.action == "block")
        #expect(event?.target == SocialTarget(kind: .profile, id: "u9"))
    }

    @Test func aMessage_isNoContentInteraction() throws {
        let event = SocialInteractionEvents.event(forDelivered: try record(.markAsRead, ["conversationId": "c"]))
        #expect(event == nil)
    }

    @Test func shareDestination_mapsThePlatform() {
        #expect(SocialInteractionEvents.shareDestination(platform: "system") == .nativeSheet)
        #expect(SocialInteractionEvents.shareDestination(platform: "conversation") == .conversation)
        #expect(SocialInteractionEvents.shareDestination(platform: "whatsapp") == .externalApp)
        #expect(SocialInteractionEvents.shareDestination(platform: nil) == .other)
    }

    @Test func aSuccessfulBookmark_emitsSave_aFailedOne_emitsNothing() async throws {
        let hub = SocialEventsV2Hub()
        let seen = SyncBox<[String]>([])
        hub.install { event in seen.mutate { $0.append(event.action) } }
        let api = MockAPIClient()
        api.stub("/posts/p1/bookmark", result: APIResponse(success: true, data: ["status": "bookmarked"], error: nil))
        let service = PostService(api: api, socialEvents: hub)

        try await service.bookmark(postId: "p1")
        api.stubError("/posts/p2/bookmark", error: MeeshyError.server(statusCode: 500, message: "down"))
        _ = try? await service.bookmark(postId: "p2")

        #expect(seen.value == ["save"])
    }
}
