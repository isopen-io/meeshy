import Foundation
import Testing
@testable import MeeshySDK

/// Rejeu iOS de `packages/shared/design/packs/frame-offer-vectors.json` (#10156, L4) : la loi de proposition
/// des cadres de gloire, PRODUITE par `packages/shared/utils/game/glory-frames.ts` — le MÊME fichier que
/// vitest rejoue, lu, jamais copié. Sur divergence, le TS a raison : le miroir bouge, jamais le vecteur.
@Suite("Cadres de gloire — la loi de proposition rejouée sur les vecteurs partagés")
struct GloryFrameOfferVectorTests {

    private struct RawFrame: Decodable {
        let id: String
        let usage: FrameUsage
        let collection: String
        let appliesTo: GloryFrameAppliesTo
        let option: String?
        let hidden: Bool
    }

    private struct RawPack: Decodable {
        let slug: String
        let atmosphere: String?
        let collections: [String]
        let frames: [RawFrame]
    }

    private struct Ref: Decodable, Equatable {
        let pack: String
        let frameId: String
    }

    private struct Other: Decodable, Equatable {
        let pack: String
        let atmosphere: String?
        let installed: Bool
        let frames: [Ref]
    }

    private struct Expected: Decodable, Equatable {
        let needsAtmosphere: Bool
        let suggested: [Ref]
        let others: [Other]
        let reinstall: String?
        let preselected: Ref?
    }

    private struct Input: Decodable {
        let stepId: String
        let atmosphere: String?
        let lastChosen: String?
        let installed: [String]
        let rarity: GameGlory.AchievementRarity?
    }

    private struct Case: Decodable {
        let name: String
        let input: Input
        let expected: Expected
    }

    private struct Vectors: Decodable {
        let catalog: [RawPack]
        let cases: [Case]
    }

    /// `packages/MeeshySDK/Tests/MeeshySDKTests/Game/…` : **5** composants à retirer pour atteindre `packages/`.
    private static func vectors() throws -> Vectors {
        var url = URL(fileURLWithPath: #filePath)
        for _ in 0..<5 { url.deleteLastPathComponent() }
        let data = try Data(contentsOf: url.appendingPathComponent("shared/design/packs/frame-offer-vectors.json"))
        return try JSONDecoder().decode(Vectors.self, from: data)
    }

    private static func catalog(_ raw: [RawPack]) -> [GloryFrameOfferPack] {
        raw.map { pack in
            GloryFrameOfferPack(slug: pack.slug, atmosphere: pack.atmosphere, collections: pack.collections, frames: pack.frames.map { frame in
                GloryFrameOfferFrame(id: frame.id, usage: frame.usage, placement: GloryFramePlacement(
                    collection: frame.collection, appliesTo: frame.appliesTo, option: frame.option, motifs: [], hidden: frame.hidden))
            })
        }
    }

    private static func project(_ offer: GloryFramesOffer) -> Expected {
        let refs: ([GloryFrameRef]) -> [Ref] = { $0.map { Ref(pack: $0.pack, frameId: $0.frameId) } }
        return Expected(
            needsAtmosphere: offer.needsAtmosphere,
            suggested: refs(offer.suggested),
            others: offer.others.map { Other(pack: $0.pack, atmosphere: $0.atmosphere, installed: $0.installed, frames: refs($0.frames)) },
            reinstall: offer.reinstall,
            preselected: offer.preselected.map { Ref(pack: $0.pack, frameId: $0.frameId) })
    }

    @Test("chaque cas du fichier, rejoué par le miroir Swift, rend la sortie de la loi TS")
    func everyVectorMatches() throws {
        let vectors = try Self.vectors()
        #expect(vectors.cases.count >= 30)
        let catalog = Self.catalog(vectors.catalog)
        for vector in vectors.cases {
            let offer = GameGloryFrames.framesFor(stepId: vector.input.stepId, atmosphere: vector.input.atmosphere,
                                                  lastChosen: vector.input.lastChosen, catalog: catalog,
                                                  installed: Set(vector.input.installed), rarity: vector.input.rarity)
            #expect(Self.project(offer) == vector.expected, "\(vector.name)")
        }
    }

    @Test("un cadre de contrat sans placement ne se propose jamais")
    func framesWithoutPlacementAreNotOffered() throws {
        let sha = String(repeating: "ab", count: 32)
        let thumb = try JSONDecoder().decode(PackAssetRef.self, from: Data(#"{"src":"\#(sha.prefix(16)).webp","bytes":1,"sha256":"\#(sha)"}"#.utf8))
        let frame = GloryFramePackFrame(id: "exemple-savane.ambassadeur-4", usage: .rank(.ambassadeur, division: .iv), thumb: thumb, nameKey: "k.name")
        #expect(GloryFrameOfferFrame(frame) == nil)
    }
}
