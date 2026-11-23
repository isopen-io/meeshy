import Foundation
import Testing
@testable import MeeshySDK

/// **Ce que le bloc visuel de la carte montre rejoue les vecteurs PARTAGÉS**
/// (#20211, #20233, #20234) —
/// `packages/shared/fixtures/content-card-visual/content-card-visual.vectors.json`,
/// que le web (`contentCardVisualOf`) et Android (`ContentCardVisualRule`)
/// rejouent aussi : diaporama, image de garde, son, scène ou rien, sur le même
/// post servi.
struct ContentCardVisualVectorTests {

    private struct MalformedVector: Error {
        let label: String
    }

    private static var vectorsURL: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("shared/fixtures/content-card-visual/content-card-visual.vectors.json")
    }

    private static func loadVectors() throws -> [[String: Any]] {
        let data = try Data(contentsOf: vectorsURL)
        return try #require(JSONSerialization.jsonObject(with: data) as? [[String: Any]])
    }

    private static func card(of vector: [String: Any]) throws -> ContentCard {
        let post = try #require(vector["post"])
        let data = try JSONSerialization.data(withJSONObject: post)
        return ContentCard(post: try MeeshyCoders.decoder(.api).decode(APIPost.self, from: data), preferredLanguages: [])
    }

    private static func page(_ raw: [String: Any], in card: ContentCard, label: String) throws -> ContentCard.Page {
        if let index = raw["scene"] as? Int { return .scene(index) }
        guard let id = raw["mediaId"] as? String, let media = try media(id, kind: raw["mediaKind"] as? String, in: card) else {
            throw MalformedVector(label: label)
        }
        return .media(media)
    }

    private static func media(_ id: String, kind: String?, in card: ContentCard) throws -> ContentCard.Media? {
        guard case .slideshow(let pages) = card.visual else {
            if case .media(let media) = card.visual, media.id == id, kindName(media.kind) == kind { return media }
            return nil
        }
        return pages.compactMap { page -> ContentCard.Media? in
            if case .media(let media) = page, media.id == id, kindName(media.kind) == kind { return media }
            return nil
        }.first
    }

    private static func kindName(_ kind: ContentCard.Media.Kind) -> String {
        switch kind {
        case .image: "image"
        case .video: "video"
        }
    }

    private static func expectedVisual(of vector: [String: Any], card: ContentCard) throws -> ContentCard.Visual? {
        let label = vector["_label"] as? String ?? "?"
        let expected = try #require(vector["expected"] as? [String: Any])
        switch expected["kind"] as? String {
        case "none":
            return ContentCard.Visual.none
        case "media":
            guard let id = expected["mediaId"] as? String else { throw MalformedVector(label: label) }
            return try media(id, kind: expected["mediaKind"] as? String, in: card).map(ContentCard.Visual.media)
        case "slideshow":
            guard let pages = expected["pages"] as? [[String: Any]] else { throw MalformedVector(label: label) }
            return .slideshow(try pages.map { try page($0, in: card, label: label) })
        case "sound":
            guard let id = expected["attachmentId"] as? String, let url = expected["url"] as? String else {
                throw MalformedVector(label: label)
            }
            return .sound(ContentCard.Sound(attachmentId: id, url: url, durationSeconds: expected["durationSeconds"] as? Int))
        case "scene":
            guard let index = expected["index"] as? Int else { throw MalformedVector(label: label) }
            return .scene(index)
        default:
            throw MalformedVector(label: label)
        }
    }

    @Test func vectors_areLoaded_andCoverEveryVisual() throws {
        let vectors = try Self.loadVectors()
        #expect(vectors.count >= 14)
        let kinds = Set(vectors.compactMap { ($0["expected"] as? [String: Any])?["kind"] as? String })
        #expect(kinds == ["none", "media", "slideshow", "sound", "scene"])
    }

    @Test func visual_replaysEverySharedVector() throws {
        for vector in try Self.loadVectors() {
            let label = vector["_label"] as? String ?? "?"
            let card = try Self.card(of: vector)
            #expect(card.visual == (try Self.expectedVisual(of: vector, card: card)), "cas « \(label) »")
            if let carrierId = (vector["expected"] as? [String: Any])?["carrierId"] as? String {
                #expect(card.scene?.carrierId == carrierId, "cas « \(label) »")
            }
        }
    }
}
