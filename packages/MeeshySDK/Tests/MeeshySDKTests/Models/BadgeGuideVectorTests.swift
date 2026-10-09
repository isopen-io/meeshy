import Foundation
import Testing
@testable import MeeshySDK

/// Rejeu iOS du guide d'un badge (#9639) — `BadgeGuideResolver` rejoue les
/// vecteurs du domicile TypeScript (`badgeGuide`,
/// `packages/shared/utils/game/badge-guide.ts`), lus DANS LE DÉPÔT
/// (`packages/shared/fixtures/reading-modes/badge-guide.vectors.json`). Sur
/// divergence, c'est le TS qui a raison : le miroir bouge, jamais le vecteur.
struct BadgeGuideVectorTests {

    private struct VectorCase: Decodable {
        let label: String
        let input: Input
        let expected: Expected

        struct Served: Decodable {
            let threshold: Int
            let reachedAt: String
        }

        struct Input: Decodable {
            let axisKey: String
            let count: Double
            let served: [Served]
        }

        struct Rung: Decodable, Equatable {
            let threshold: Int
            let material: String
            let ribbon: Bool
            let reached: Bool
            let reachedAt: String?
        }

        struct Reached: Decodable, Equatable {
            let threshold: Int
            let material: String
            let reason: String
            let reachedAt: String?
        }

        struct Next: Decodable, Equatable {
            let threshold: Int
            let material: String
            let missing: Int
        }

        struct Expected: Decodable {
            let axisKey: String
            let family: String
            let count: Int
            let rungs: [Rung]
            let stars: Int
            let reached: Reached?
            let next: Next?
        }

        enum CodingKeys: String, CodingKey {
            case label = "_label"
            case input
            case expected
        }
    }

    private static var vectorsURL: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("shared/fixtures/reading-modes/badge-guide.vectors.json")
    }

    private static func loadVectors() throws -> [VectorCase] {
        try JSONDecoder().decode([VectorCase].self, from: Data(contentsOf: vectorsURL))
    }

    @Test("le fichier existe et porte ses cas — jamais de vert silencieux")
    func fileIsNotEmpty() throws {
        #expect(try Self.loadVectors().count >= 20)
    }

    @Test("chaque vecteur rend, sur la loi Swift, exactement le guide de la loi TypeScript")
    func everyVectorMatches() throws {
        for vector in try Self.loadVectors() {
            let axis = try #require(EngagementAxisKey(rawValue: vector.input.axisKey), "\(vector.label)")
            let count = vector.input.count.isFinite ? Int(vector.input.count.rounded(.towardZero)) : 0
            let guide = BadgeGuideResolver.resolve(
                axis: axis,
                count: count,
                served: vector.input.served.map { BadgeServedTier(threshold: $0.threshold, reachedAt: $0.reachedAt) }
            )
            let expected = vector.expected
            #expect(guide.axis.rawValue == expected.axisKey, "\(vector.label)")
            #expect(guide.family.rawValue == expected.family, "\(vector.label)")
            #expect(guide.count == expected.count, "\(vector.label)")
            #expect(guide.stars == expected.stars, "\(vector.label)")
            #expect(guide.rungs.map { VectorCase.Rung(threshold: $0.threshold, material: $0.material.rawValue, ribbon: $0.ribbon, reached: $0.reached, reachedAt: $0.reachedAt) } == expected.rungs, "\(vector.label)")
            #expect(guide.reached.map { VectorCase.Reached(threshold: $0.threshold, material: $0.material.rawValue, reason: $0.reason.rawValue, reachedAt: $0.reachedAt) } == expected.reached, "\(vector.label)")
            #expect(guide.next.map { VectorCase.Next(threshold: $0.threshold, material: $0.material.rawValue, missing: $0.missing) } == expected.next, "\(vector.label)")
        }
    }

    @Test("les badges se rangent par famille dans l'ordre déclaré, puis l'ordre du catalogue")
    func groupsFollowTheDeclaredOrder() {
        let guides = EngagementAxisKey.allCases.reversed().map { BadgeGuideResolver.resolve(axis: $0, count: 3, served: []) }
        let groups = BadgeGuideResolver.byFamily(guides)
        #expect(groups.map(\.family) == EngagementAxisFamily.allCases)
        #expect(groups.flatMap { $0.guides.map(\.axis) } == EngagementAxisKey.allCases)
        #expect(BadgeGuideResolver.byFamily([BadgeGuideResolver.resolve(axis: .sticker, count: 1, served: [])]).map(\.family) == [.tool])
    }

    @Test("la progression résolue d'un axe donne le même guide que ses paliers datés")
    func progressGivesTheSameGuide() {
        let tiers = EngagementCatalog.badgeThresholds.map { EngagementTier(threshold: $0, reached: $0 <= 120, reachedAt: $0 == 100 ? "2026-10-01T08:00:00.000Z" : nil) }
        let guide = BadgeGuideResolver.resolve(axis: .audioComment, value: 120, tiers: tiers)
        #expect(guide == BadgeGuideResolver.resolve(axis: .audioComment, count: 120, served: [BadgeServedTier(threshold: 100, reachedAt: "2026-10-01T08:00:00.000Z")]))
        #expect(guide.reached?.material == .or)
        #expect(BadgeGuideResolver.starsMax == 7)
    }
}
