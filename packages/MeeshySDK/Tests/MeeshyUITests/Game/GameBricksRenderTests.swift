import Testing
import SwiftUI
import MeeshySDK
@testable import MeeshyUI

/// Les briques du jeu, rendues hors écran : elles peignent, elles ne peignent
/// pas leur cadre, et leurs ÉTATS ne se confondent pas.
@MainActor
@Suite("Jeu Meeshy — briques MeeshyUI")
struct GameBricksRenderTests {

    private func probe<V: View>(_ view: V, width: CGFloat = 120, height: CGFloat = 120) throws -> GameRenderProbe {
        try #require(GameRenderProbe.render(view, width: width, height: height))
    }

    @Test("la Signature peint trois traits, et frappée ne ressemble pas à gravée")
    func signatureStyles() throws {
        let flat = try probe(SignatureMark(style: .flat, color: .black))
        let struck = try probe(SignatureMark(style: .struck, color: .black))
        let engraved = try probe(SignatureMark(style: .engraved, color: .black))
        #expect(flat.coverage > 0.05)
        #expect(flat.cornerIsTransparent)
        #expect(flat.distance(to: struck) > 0.5)
        #expect(struck.distance(to: engraved) > 0.5)
    }

    @Test("la Meesh : l'avers, le revers et chaque édition se distinguent")
    func coinFacesAndEditions() throws {
        let obverse = try probe(MeeshCoinView(face: .obverse, figures: nil))
        let reverse = try probe(MeeshCoinView(face: .reverse(number: 13, year: 2026), figures: nil))
        let gold = try probe(MeeshCoinView(face: .obverse, edition: .gold, figures: nil))
        let prism = try probe(MeeshCoinView(face: .obverse, edition: .prism, figures: nil))
        #expect(obverse.coverage > 0.6)
        #expect(obverse.cornerIsTransparent)
        #expect(obverse.distance(to: reverse) > 1)
        #expect(obverse.distance(to: gold) > 5)
        #expect(gold.distance(to: prism) > 5)
    }

    @Test("le numéro gravé au revers change la pièce")
    func coinNumberIsEngraved() throws {
        let thirteen = try probe(MeeshCoinView(face: .reverse(number: 13, year: 2026), figures: nil))
        let hundred = try probe(MeeshCoinView(face: .reverse(number: 100, year: 2026), figures: nil))
        #expect(thirteen.distance(to: hundred) > 0.2)
    }

    @Test("les onze blasons se distinguent, chacun peint un écu")
    func blasonsAreAllDistinct() throws {
        let probes = try GloryRank.allCases.map {
            try probe(RankBlasonView(rank: $0, division: $0 == .mythe ? nil : .iii, title: $0.rawValue, figures: nil),
                      width: 150, height: 138)
        }
        #expect(probes.allSatisfy { $0.coverage > 0.1 })
        for (index, lhs) in probes.enumerated() {
            for rhs in probes[(index + 1)...] {
                #expect(lhs.distance(to: rhs) > 0.05)
            }
        }
    }

    @Test("la division se lit aux chevrons : III et I ne se ressemblent pas")
    func divisionChevrons() throws {
        let third = try probe(RankBlasonView(rank: .voix, division: .iii, figures: nil), width: 150, height: 138)
        let first = try probe(RankBlasonView(rank: .voix, division: .i, figures: nil), width: 150, height: 138)
        #expect(third.distance(to: first) > 0.05)
    }

    @Test("la coupe : sa matière et son inscription la distinguent")
    func trophy() throws {
        let gold = try probe(TrophyView(material: .gold, label: "JADE · S41"))
        let platinum = try probe(TrophyView(material: .platinum, label: "JADE · S41"))
        let other = try probe(TrophyView(material: .gold, label: "SAISON 1"))
        #expect(gold.coverage > 0.3)
        #expect(gold.distance(to: platinum) > 3)
        #expect(gold.distance(to: other) > 0.1)
    }

    @Test("le badge : la forme, la matière et l'empreinte se distinguent")
    func badge() throws {
        let hexagon = try probe(GameBadgeView(shape: .accumulation, material: .gold, label: "100"))
        let diamond = try probe(GameBadgeView(shape: .record, material: .gold, label: "100"))
        let silver = try probe(GameBadgeView(shape: .accumulation, material: .silver, label: "100"))
        let imprint = try probe(GameBadgeView(shape: .accumulation, material: .gold, state: .imprint, label: "−37"))
        #expect(hexagon.coverage > 0.3)
        #expect(imprint.coverage < hexagon.coverage / 2)
        #expect(hexagon.distance(to: diamond) > 2)
        #expect(hexagon.distance(to: silver) > 3)
    }

    // MARK: - Les médailles (#9466)

    private func medal(_ family: GameMedalFamily = .content, glyph: GameMedalGlyph = .text, material: GameMaterial = .gold,
                       state: GameMedalView.State = .lit, progress: Double = 0.5, label: String? = "100") throws -> GameRenderProbe {
        try probe(GameMedalView(family: family, glyph: glyph, material: material, state: state, progress: progress, label: label),
                  width: 100, height: 112)
    }

    @Test("la médaille peint sa lunette, ne peint pas son cadre, et la matière la distingue")
    func medalMaterials() throws {
        let probes = try [GameMaterial.copper, .bronze, .silver, .gold, .platinum, .obsidian, .prism].map { try medal(material: $0) }
        #expect(probes.allSatisfy { $0.coverage > 0.3 })
        #expect(probes.allSatisfy { $0.cornerIsTransparent })
        for (index, lhs) in probes.enumerated() {
            for rhs in probes[(index + 1)...] {
                #expect(lhs.distance(to: rhs) > 1)
            }
        }
    }

    @Test("l'émail prend la couleur de la famille : les cinq familles ne se confondent pas")
    func medalFamilies() throws {
        let probes = try GameMedalFamily.allCases.map { try medal($0) }
        for (index, lhs) in probes.enumerated() {
            for rhs in probes[(index + 1)...] {
                #expect(lhs.distance(to: rhs) > 3)
            }
        }
    }

    @Test("les neuf pictogrammes d'axe se distinguent")
    func medalGlyphs() throws {
        let probes = try GameMedalGlyph.allCases.map { try medal(glyph: $0, label: nil) }
        for (index, lhs) in probes.enumerated() {
            for rhs in probes[(index + 1)...] {
                #expect(lhs.distance(to: rhs) > 0.05)
            }
        }
    }

    @Test("l'arc de progression se remplit, et un ruban apparaît à partir de l'Or")
    func medalArcAndRibbon() throws {
        let low = try medal(progress: 0.2)
        let high = try medal(progress: 0.8)
        #expect(low.distance(to: high) > 0.3)
        let silver = try medal(material: .silver, label: "50")
        let gold = try medal(material: .gold, label: "100")
        #expect(gold.coverage > silver.coverage, "le ruban de l'Or ajoute de la matière sous la médaille")
    }

    @Test("l'empreinte d'une médaille éteinte est en creux : bien moins de matière que la médaille allumée")
    func medalImprint() throws {
        let lit = try medal()
        let imprint = try medal(state: .imprint, label: "−37")
        #expect(imprint.coverage < lit.coverage / 2)
        #expect(imprint.distance(to: lit) > 5)
    }

    @Test("le médaillon de collection montre combien de pastilles sont pleines")
    func collectionDots() throws {
        let few = try probe(GameBadgeView(shape: .collection(filled: 1, total: 6), material: .prism))
        let many = try probe(GameBadgeView(shape: .collection(filled: 5, total: 6), material: .prism))
        #expect(few.distance(to: many) > 0.3)
    }

    @Test("l'anneau de niveau : sa barre, son palier et son record se voient")
    func levelRing() throws {
        func ring(_ progress: Double, tier: LevelTierKey = .eclat, record: Double? = nil, prestige: Int = 0) -> LevelRingView {
            LevelRingView(level: 34, progress: progress, tier: tier, prestige: prestige, recordMarker: record)
        }
        let low = try probe(ring(0.2), width: 56, height: 56)
        let high = try probe(ring(0.8), width: 56, height: 56)
        let other = try probe(ring(0.2, tier: .lueur), width: 56, height: 56)
        let marked = try probe(ring(0.2, record: 0.9), width: 56, height: 56)
        #expect(low.distance(to: high) > 1)
        #expect(low.distance(to: other) > 0.5)
        #expect(low.distance(to: marked) > 0.1)
    }

    @Test("les dix emblèmes de palier peignent, ne peignent pas leur cadre, et se distinguent")
    func tierEmblemsAreAllDistinct() throws {
        let probes = try LevelTierKey.allCases.map { try probe(TierEmblemView(tier: $0)) }
        #expect(probes.allSatisfy { $0.coverage > 0.03 })
        #expect(probes.allSatisfy { $0.cornerIsTransparent })
        for (index, lhs) in probes.enumerated() {
            for rhs in probes[(index + 1)...] {
                #expect(lhs.distance(to: rhs) > 0.2)
            }
        }
    }

    @Test("le filigrane de l'emblème est transparent : il pèse moins que l'emblème plein")
    func emblemWatermarkIsTransparent() throws {
        let full = try probe(TierEmblemView(tier: .etoile))
        let watermark = try probe(TierEmblemView(tier: .etoile, opacity: 0.18))
        let empty = try probe(Color.clear)
        #expect(watermark.distance(to: empty) < full.distance(to: empty))
        #expect(watermark.distance(to: empty) > 0)
    }

    @Test("l'anneau porte l'emblème du palier : deux paliers de même niveau ne se confondent pas, et le disque central est peint")
    func levelRingCarriesTheTierEmblemAndNumeral() throws {
        func ring(_ tier: LevelTierKey, disc: Color = .white) -> LevelRingView {
            LevelRingView(level: 34, progress: 0.4, tier: tier, discColor: disc)
        }
        let eclat = try probe(ring(.eclat), width: 112, height: 112)
        let rayon = try probe(ring(.rayon), width: 112, height: 112)
        let onBlack = try probe(ring(.eclat, disc: .black), width: 112, height: 112)
        #expect(eclat.distance(to: rayon) > 2)
        #expect(eclat.distance(to: onBlack) > 10)
    }

    @Test("une barre vide ne peint pas d'arc, une barre pleine boucle l'anneau")
    func levelRingExtremes() throws {
        let empty = try probe(LevelRingView(level: 1, progress: 0, tier: .etincelle), width: 56, height: 56)
        let full = try probe(LevelRingView(level: 1, progress: 1, tier: .etincelle), width: 56, height: 56)
        #expect(empty.distance(to: full) > 1)
    }

    @Test("la Flamme grandit avec sa série : les cinq formes se distinguent")
    func flameForms() throws {
        let probes = try FlameFormKey.allCases.map { try probe(FlameView(form: $0, flickers: false), width: 72, height: 72) }
        #expect(probes.allSatisfy { $0.coverage > 0.02 })
        for (index, lhs) in probes.enumerated() {
            for rhs in probes[(index + 1)...] {
                #expect(lhs.distance(to: rhs) > 0.3)
            }
        }
        #expect(probes[0].coverage < probes[2].coverage)
    }

    @Test("le coffre : fermé, ouvert et à mi-course ne se confondent pas")
    func chest() throws {
        let closed = try probe(ChestView(isOpen: false), width: 90, height: 72)
        let open = try probe(ChestView(isOpen: true), width: 90, height: 72)
        let half = try probe(ChestView(openProgress: 0.5), width: 90, height: 72)
        #expect(closed.distance(to: open) > 1)
        #expect(half.distance(to: closed) > 0.3)
        #expect(half.distance(to: open) > 0.3)
    }

    @Test("les matières ont leur encre, et les rangs leur matière")
    func materialsAndRanks() {
        #expect(GloryRank.murmure.material == .copper)
        #expect(GloryRank.passeur.material == .silver)
        #expect(GloryRank.ambassadeur.material == .gold)
        #expect(GloryRank.oracle.material == .platinum)
        #expect(GloryRank.legende.material == .obsidian)
        #expect(GloryRank.mythe.material == .prism)
        #expect(Set(GloryRank.allCases.map(\.material)).count == 7)
    }

    @Test("chaque palier de niveau a sa couleur, Étincelle rouge et Constellation violette")
    func tierColors() {
        let colors = LevelTierKey.allCases.map { LevelTierPalette.color(for: $0) }
        #expect(colors.count == 10)
        #expect(LevelTierPalette.color(for: .etincelle) != LevelTierPalette.color(for: .lueur))
    }
}
