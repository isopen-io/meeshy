import XCTest
@testable import MeeshySDK

final class StoryPublishQueueItemTests: XCTestCase {
    func test_codableRoundTrip_preservesVisibilityUserIds() throws {
        let item = StoryPublishQueueItem(
            visibility: "ONLY",
            slidesPayload: Data([1, 2, 3]),
            visibilityUserIds: ["a", "b"]
        )
        let data = try JSONEncoder().encode(item)
        let decoded = try JSONDecoder().decode(StoryPublishQueueItem.self, from: data)
        XCTAssertEqual(decoded.visibilityUserIds, ["a", "b"])
    }

    func test_decodeLegacyItem_withoutVisibilityUserIds_defaultsNil() throws {
        // A row persisted before this field existed must still decode.
        let legacy = #"{"id":"1","tempStoryId":"pending_1","visibility":"PUBLIC","slidesPayload":"AQID","createdAt":0,"retryCount":0}"#
            .data(using: .utf8)!
        let decoded = try JSONDecoder().decode(StoryPublishQueueItem.self, from: legacy)
        XCTAssertNil(decoded.visibilityUserIds)
        XCTAssertEqual(decoded.visibility, "PUBLIC")
    }

    // MARK: - WS5.1 — originalLanguage (Prisme Linguistique) persistence

    func test_codableRoundTrip_preservesOriginalLanguage() throws {
        // The Prisme source language MUST survive the disk round-trip so the
        // gateway can route NLLB-200/TTS when the queued story flushes.
        let item = StoryPublishQueueItem(
            visibility: "FRIENDS",
            slidesPayload: Data([1, 2, 3]),
            originalLanguage: "es"
        )
        let data = try JSONEncoder().encode(item)
        let decoded = try JSONDecoder().decode(StoryPublishQueueItem.self, from: data)
        XCTAssertEqual(decoded.originalLanguage, "es")
    }

    func test_decodeLegacyItem_withoutOriginalLanguage_defaultsNil() throws {
        // Rows persisted before the field existed must decode to nil (today's
        // behaviour) — additive, back-compatible schema change.
        let legacy = #"{"id":"1","tempStoryId":"pending_1","visibility":"PUBLIC","slidesPayload":"AQID","createdAt":0,"retryCount":0}"#
            .data(using: .utf8)!
        let decoded = try JSONDecoder().decode(StoryPublishQueueItem.self, from: legacy)
        XCTAssertNil(decoded.originalLanguage)
    }

    // MARK: - Cycle brouillon/publication (2026-08-02) — draftId

    func test_codableRoundTrip_preservesDraftId() throws {
        // Le brouillon SURVIT au hand-off : l'item de file porte son id pour
        // que le succès serveur (et lui seul) le supprime, et que l'échec
        // permanent le ramène en brouillon.
        let item = StoryPublishQueueItem(
            visibility: "PUBLIC",
            slidesPayload: Data([1, 2, 3]),
            draftId: "draft-abc"
        )
        let data = try JSONEncoder().encode(item)
        let decoded = try JSONDecoder().decode(StoryPublishQueueItem.self, from: data)
        XCTAssertEqual(decoded.draftId, "draft-abc")
    }

    func test_decodeLegacyItem_withoutDraftId_defaultsNil() throws {
        // Items persistés avant le champ : chemin legacy inchangé (reprise
        // MANUELLE depuis « Mes stories »), jamais de crash de décodage.
        let legacy = #"{"id":"1","tempStoryId":"pending_1","visibility":"PUBLIC","slidesPayload":"AQID","createdAt":0,"retryCount":0}"#
            .data(using: .utf8)!
        let decoded = try JSONDecoder().decode(StoryPublishQueueItem.self, from: legacy)
        XCTAssertNil(decoded.draftId)
    }
}
