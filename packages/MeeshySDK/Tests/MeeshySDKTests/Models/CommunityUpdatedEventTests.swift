import Foundation
import Testing
@testable import MeeshySDK

/// `community:updated` (#18439) — décodé depuis la charge RÉELLE de l'émetteur
/// (`services/gateway/src/services/community-updated-broadcast.ts`), puis
/// appliqué à ce que l'appareil tient déjà.
struct CommunityUpdatedEventTests {

    private static func gatewayPayload(
        communityId: String = "c1",
        name: String = "Les Bâtisseurs &amp; Cie",
        updatedAt: String = "2026-11-15T10:00:00.000Z"
    ) -> [String: Any] {
        [
            "communityId": communityId,
            "identifier": "mshy_batisseurs",
            "name": name,
            "description": NSNull(),
            "avatar": "/api/v1/attachments/file/u1/avatar.jpg",
            "banner": NSNull(),
            "isPrivate": true,
            "memberCount": 12,
            "updatedAt": updatedAt,
        ]
    }

    private static func decode(_ payload: [String: Any]) throws -> CommunityUpdatedEvent {
        try JSONDecoder().decode(CommunityUpdatedEvent.self, from: JSONSerialization.data(withJSONObject: payload))
    }

    private static func held(
        id: String = "c1", updatedAt: Date = Date(timeIntervalSince1970: 1_763_190_000)
    ) -> MeeshyCommunity {
        MeeshyCommunity(
            id: id, identifier: "mshy_old", name: "Ancien nom", description: "Ancienne",
            avatar: "/api/v1/attachments/file/u1/old.jpg", avatarThumbHash: "old-hash",
            banner: "/api/v1/attachments/file/u1/banner.jpg", bannerThumbHash: "banner-hash",
            isPrivate: false, createdBy: "u-creator", createdAt: Date(timeIntervalSince1970: 1_700_000_000),
            updatedAt: updatedAt, memberCount: 3, conversationCount: 4, emoji: "🏗️",
            onlineMemberCount: 2
        )
    }

    @Test func decodesEveryKeyTheGatewayEmits() throws {
        let event = try Self.decode(Self.gatewayPayload())

        #expect(event.communityId == "c1")
        #expect(event.identifier == "mshy_batisseurs")
        #expect(event.name == "Les Bâtisseurs &amp; Cie")
        #expect(event.description == nil)
        #expect(event.avatar == "/api/v1/attachments/file/u1/avatar.jpg")
        #expect(event.banner == nil)
        #expect(event.isPrivate)
        #expect(event.memberCount == 12)
        #expect(event.writtenAt == ISO8601DateFormatter().date(from: "2026-11-15T10:00:00Z"))
    }

    @Test func rewritesThePublicIdentityAndKeepsWhatTheEventDoesNotCarry() throws {
        let event = try Self.decode(Self.gatewayPayload())

        let updated = try #require(Self.held().applying(event))

        #expect(updated.name == "Les Bâtisseurs &amp; Cie", "même chemin que la réponse HTTP : rien de décodé à part")
        #expect(updated.identifier == "mshy_batisseurs")
        #expect(updated.description == nil)
        #expect(updated.isPrivate)
        #expect(updated.memberCount == 12)
        #expect(updated.banner == nil)
        #expect(updated.conversationCount == 4)
        #expect(updated.emoji == "🏗️")
        #expect(updated.onlineMemberCount == 2, "« N en ligne » ne voyage pas avec l'identité")
        #expect(updated.createdBy == "u-creator")
    }

    @Test func forgetsTheBlurOfAnImageThatChangedOnly() throws {
        var payload = Self.gatewayPayload()
        payload["banner"] = "/api/v1/attachments/file/u1/banner.jpg"

        let updated = try #require(Self.held().applying(try Self.decode(payload)))

        #expect(updated.avatarThumbHash == nil, "l'avatar a changé : son empreinte décrirait l'ancien")
        #expect(updated.bannerThumbHash == "banner-hash", "la bannière n'a pas changé")
    }

    @Test func leavesAnotherCommunityUntouched() throws {
        let event = try Self.decode(Self.gatewayPayload(communityId: "c2"))

        #expect(Self.held().applying(event) == nil)
    }

    @Test func anOlderEventNeverRewindsTheHeldCopy() throws {
        let held = Self.held(updatedAt: try #require(ISO8601DateFormatter().date(from: "2026-11-15T12:00:00Z")))
        let event = try Self.decode(Self.gatewayPayload(updatedAt: "2026-11-15T10:00:00.000Z"))

        #expect(held.applying(event) == nil)
    }

    @Test func appliesToTheCachedApiRowAndKeepsTheReadersRole() throws {
        let row: APICommunity = try JSONDecoder.meeshyTestDecoder.decode(APICommunity.self, from: Data("""
        {"id":"c1","identifier":"mshy_old","name":"Ancien nom","isPrivate":false,"createdBy":"u-creator",
         "createdAt":"2026-09-01T10:00:00.000Z","updatedAt":"2026-09-02T10:00:00.000Z",
         "memberCount":3,"conversationCount":4,"currentUserRole":"moderator","onlineMemberCount":2}
        """.utf8))
        let event = try Self.decode(Self.gatewayPayload())

        let updated = try #require(row.applying(event))

        #expect(updated.name == "Les Bâtisseurs &amp; Cie")
        #expect(updated.isPrivate)
        #expect(updated.toCommunity().memberCount == 12)
        #expect(updated.toCommunity().conversationCount == 4)
        #expect(updated.currentUserRole == "moderator")
        #expect(updated.onlineMemberCount == 2)
        #expect(updated.createdBy == "u-creator")
    }
}

private extension JSONDecoder {
    static var meeshyTestDecoder: JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let raw = try container.decode(String.self)
            let formatter = ISO8601DateFormatter()
            formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            guard let date = formatter.date(from: raw) else {
                throw DecodingError.dataCorruptedError(in: container, debugDescription: raw)
            }
            return date
        }
        return decoder
    }
}
