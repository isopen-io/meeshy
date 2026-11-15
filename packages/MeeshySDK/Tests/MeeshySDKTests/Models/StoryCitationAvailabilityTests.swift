import Foundation
import Testing
@testable import MeeshySDK

/// **Une réponse à une story DISPARUE le dit — et n'ouvre rien** (#7895).
///
/// La passerelle ne sert AUCUN instantané `postReplyTo` quand le message n'en
/// gravait pas et que le post cité n'existe plus : seul `storyReplyToId`
/// voyage. Le web (#7893) rend alors une carte compacte, non tapable,
/// « Story indisponible ». iOS rendait « 📷 Story » et gardait une porte vers
/// une story introuvable — et son cache, lui, perdait la citation entière.
///
/// Le prédicat vit sur `ReplyReference` : les trois modes (Focal, Script,
/// Bulles) et la rivière le lisent, aucun ne le réécrit.
@Suite("Disponibilité d'une story citée")
struct StoryCitationAvailabilityTests {

    private static func decode(_ json: String) throws -> APIMessage {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode(APIMessage.self, from: Data(json.utf8))
    }

    private static func message(storyReplyToId: String?, snapshot: String? = nil) throws -> APIMessage {
        let storyField = storyReplyToId.map { "\"storyReplyToId\": \"\($0)\"," } ?? ""
        let snapshotField = snapshot.map { "\"postReplyTo\": \($0)," } ?? ""
        return try decode("""
        {
          "id": "msg-1", "conversationId": "conv-1", "senderId": "sender-1",
          \(storyField)
          \(snapshotField)
          "content": "Trop beau", "createdAt": "2026-09-25T10:00:00Z",
          "updatedAt": "2026-09-25T10:00:00Z"
        }
        """)
    }

    private static let liveSnapshot = """
    {
      "id": "story-42", "type": "STORY", "reactionCount": 3, "commentCount": 1,
      "createdAt": "2026-09-24T08:00:00.000Z",
      "thumbnailUrl": "https://cdn.example/s42.jpg", "previewText": "Coucher de soleil"
    }
    """

    // MARK: - Le prédicat

    @Test("Sans instantané, la story citée est indisponible et n'ouvre rien")
    func storyWithoutSnapshotIsUnavailable() throws {
        let reply = try #require(try Self.message(storyReplyToId: "story-42").toMessage(currentUserId: "me").replyTo)

        #expect(reply.isStoryReply)
        #expect(reply.isUnavailableStory)
        #expect(reply.messageId == "story-42", "la réponse garde la trace de ce à quoi elle répondait")
        #expect(!reply.opensQuotedTarget, "une porte vers une story introuvable est un contrôle qui ment")
        #expect(reply.previewText.isEmpty, "« 📷 Story » n'est plus le libellé : la vue dit « Story indisponible »")
    }

    @Test("Avec son instantané, la story citée reste disponible et s'ouvre")
    func storyWithSnapshotIsAvailable() throws {
        let reply = try #require(
            try Self.message(storyReplyToId: "story-42", snapshot: Self.liveSnapshot)
                .toMessage(currentUserId: "me").replyTo
        )

        #expect(reply.isStoryReply)
        #expect(!reply.isUnavailableStory)
        #expect(reply.opensQuotedTarget)
    }

    @Test("Une citation de message n'est jamais une story indisponible")
    func messageCitationIsNeverAnUnavailableStory() {
        let reply = ReplyReference(messageId: "m-9", authorName: "Ali", previewText: "salut")
        #expect(!reply.isUnavailableStory)
        #expect(reply.opensQuotedTarget)
    }

    @Test("Une citation sans identifiant n'ouvre rien, story ou pas")
    func citationWithoutIdentifierOpensNothing() {
        #expect(!ReplyReference(authorName: "Ali", previewText: "salut").opensQuotedTarget)
    }

    @Test("La fabrique ne marque que la story : une humeur n'est pas une scène")
    func factoryMarksOnlyAStory() {
        let unavailable = ReplyReference.unavailableStory(storyId: "story-7")
        #expect(unavailable.isUnavailableStory)
        #expect(unavailable.moodEmoji == nil)
        #expect(unavailable.storyPublishedAt == nil)
        #expect(unavailable.storyThumbnailUrl == nil)
    }

    // MARK: - Le blob gravé en cache

    @Test("Un blob gravé AVANT le champ se relit comme une story disponible")
    func legacyBlobDecodesAsAvailable() throws {
        let legacy = ReplyReference(messageId: "story-1", authorName: "Story", previewText: "x", isStoryReply: true)
        let data = try JSONEncoder().encode(legacy)
        var object = try #require(try JSONSerialization.jsonObject(with: data) as? [String: Any])
        object.removeValue(forKey: "storyUnavailable")
        let stripped = try JSONSerialization.data(withJSONObject: object)

        let decoded = try JSONDecoder().decode(ReplyReference.self, from: stripped)
        #expect(!decoded.isUnavailableStory)
    }

    @Test("Le cache grave la story indisponible au lieu de perdre la citation")
    func cacheBlobCarriesTheUnavailableStory() throws {
        let blob = MessagePersistenceActor.ingestedReply(
            for: try Self.message(storyReplyToId: "story-42"),
            currentUserId: "me", preferredLanguages: ["fr"], encoder: JSONEncoder()
        )
        let data = try #require(blob.persisted(over: nil))
        let reference = try JSONDecoder().decode(ReplyReference.self, from: data)
        #expect(reference.isUnavailableStory)
        #expect(reference.messageId == "story-42")
    }

    @Test("Le repli « indisponible » n'écrase jamais une citation riche déjà gravée")
    func fallbackNeverOverwritesARichCitation() throws {
        let rich = ReplyReference(
            messageId: "story-42", authorName: "Andre", previewText: "Ma story",
            isStoryReply: true, storyPublishedAt: Date(timeIntervalSince1970: 1_700_000_000),
            storyThumbnailUrl: "https://cdn.example/s42.jpg"
        )
        let existing = try JSONEncoder().encode(rich)
        let blob = MessagePersistenceActor.ingestedReply(
            for: try Self.message(storyReplyToId: "story-42"),
            currentUserId: "me", preferredLanguages: ["fr"], encoder: JSONEncoder()
        )
        #expect(blob.persisted(over: existing) == existing)
    }

    @Test("Un instantané servi remplace le repli « indisponible » gravé plus tôt")
    func servedSnapshotReplacesAnEarlierFallback() throws {
        let earlier = try JSONEncoder().encode(ReplyReference.unavailableStory(storyId: "story-42"))
        let blob = MessagePersistenceActor.ingestedReply(
            for: try Self.message(storyReplyToId: "story-42", snapshot: Self.liveSnapshot),
            currentUserId: "me", preferredLanguages: ["fr"], encoder: JSONEncoder()
        )
        let data = try #require(blob.persisted(over: earlier))
        let reference = try JSONDecoder().decode(ReplyReference.self, from: data)
        #expect(!reference.isUnavailableStory)
        #expect(reference.storyThumbnailUrl == "https://cdn.example/s42.jpg")
    }

    // MARK: - La story SUPPRIMÉE par son auteur (#7950)

    /// La passerelle sert encore l'instantané, vidé de tout ce qui décrit le
    /// contenu, et le marque `deletedAt` (même nom que `replyTo.deletedAt`).
    /// Une vignette laissée à côté du marqueur ne rend pas la carte tapable.
    private static let withdrawnSnapshot = """
    {
      "id": "story-42", "type": "STORY", "reactionCount": 0, "commentCount": 0, "shareCount": 0,
      "createdAt": "2026-09-24T08:00:00.000Z",
      "thumbnailUrl": "https://cdn.example/s42.jpg", "previewText": "",
      "deletedAt": "2026-09-24T09:00:00.000Z"
    }
    """

    @Test("Le marqueur deletedAt se décode sur l'instantané")
    func withdrawnMarkerDecodes() throws {
        let target = try #require(try Self.message(storyReplyToId: "story-42", snapshot: Self.withdrawnSnapshot).postReplyTo)
        #expect(target.deletedAt != nil)
        #expect(try #require(try Self.message(storyReplyToId: "story-42", snapshot: Self.liveSnapshot).postReplyTo).deletedAt == nil)
    }

    @Test("Une story supprimée par son auteur est indisponible et n'ouvre rien, vignette comprise")
    func withdrawnStoryIsUnavailable() throws {
        let reply = try #require(
            try Self.message(storyReplyToId: "story-42", snapshot: Self.withdrawnSnapshot)
                .toMessage(currentUserId: "me").replyTo
        )
        #expect(reply.isUnavailableStory)
        #expect(!reply.opensQuotedTarget)
        #expect(reply.messageId == "story-42")
        #expect(reply.storyThumbnailUrl == nil, "la vignette d'une story retirée ne se peint plus")
    }

    @Test("Une humeur supprimée devient aussi une citation indisponible")
    func withdrawnMoodIsUnavailable() throws {
        let mood = """
        { "id": "mood-1", "type": "STATUS", "reactionCount": 0, "commentCount": 0,
          "createdAt": "2026-09-24T08:00:00.000Z", "previewText": "Grosse fatigue", "moodEmoji": "😴",
          "deletedAt": "2026-09-24T08:30:00.000Z" }
        """
        let reply = try #require(try Self.message(storyReplyToId: "mood-1", snapshot: mood).toMessage(currentUserId: "me").replyTo)
        #expect(reply.isUnavailableStory)
        #expect(reply.moodEmoji == nil)
    }

    @Test("Le cache grave la story supprimée à la place de la citation riche gravée plus tôt")
    func withdrawnSnapshotReplacesARichCachedCitation() throws {
        let rich = try JSONEncoder().encode(ReplyReference(
            messageId: "story-42", authorName: "Story", previewText: "Coucher de soleil",
            isStoryReply: true, storyThumbnailUrl: "https://cdn.example/s42.jpg"
        ))
        let blob = MessagePersistenceActor.ingestedReply(
            for: try Self.message(storyReplyToId: "story-42", snapshot: Self.withdrawnSnapshot),
            currentUserId: "me", preferredLanguages: ["fr"], encoder: JSONEncoder()
        )
        let data = try #require(blob.persisted(over: rich))
        let reference = try JSONDecoder().decode(ReplyReference.self, from: data)
        #expect(reference.isUnavailableStory)
        #expect(reference.storyThumbnailUrl == nil)
    }

    @Test("Un message sans réponse ne grave rien")
    func plainMessageStoresNoCitation() throws {
        let blob = MessagePersistenceActor.ingestedReply(
            for: try Self.message(storyReplyToId: nil),
            currentUserId: "me", preferredLanguages: ["fr"], encoder: JSONEncoder()
        )
        #expect(blob.persisted(over: nil) == nil)
    }
}
