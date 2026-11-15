import XCTest
@testable import Meeshy

/// LES DÉCLINAISONS D'UN CADRE (#12685) — même motif, autre habillage, identifiant à quatre parties
/// que la passerelle accepte déjà ; un identifiant inconnu ne casse rien.
final class CallFrameStyleRuleTests: XCTestCase {
    private func base() throws -> CallFrameDesign {
        try XCTUnwrap(CallFrameCatalogue.all.first { $0.bucket == .duo && $0.styles.isEmpty })
    }

    private func relief(_ scene: [CallFrameSceneLayer] = [CallFrameSceneLayer(id: "matiere", kind: .image, depth: .back, src: "assets/call-frames/test_back.webp",
                                                                             preset: nil, color: nil, amount: nil, maxParticles: nil)]) -> CallFrameStyle {
        CallFrameStyle(id: "relief", name: "Relief", look: CallFrameLookOverride(scene: scene))
    }

    private func declinable() throws -> CallFrameDesign {
        let design = try base()
        return CallFrameDesign(id: design.id, motif: design.motif, mood: design.mood, name: design.name, bucket: design.bucket, look: design.look,
                               credits: design.credits, surfaces: design.surfaces, cost: design.cost, styles: [relief()])
    }

    func test_applying_overridesOnlyTheDeclaredKeys() throws {
        let design = try base()
        let styled = design.look.applying(relief().look)
        XCTAssertEqual(styled.scene.map(\.id), ["matiere"])
        XCTAssertEqual(styled.slot, design.look.slot)
        XCTAssertEqual(styled.ornaments, design.look.ornaments)
    }

    func test_resolve_styledId_isTheBaseUnderItsDeclination() throws {
        let design = try declinable()
        let resolved = try XCTUnwrap(CallFrameStyleRule.resolve(id: "\(design.id).relief", in: [design]))
        XCTAssertEqual(resolved.id, "\(design.id).relief")
        XCTAssertEqual(resolved.styleId, "relief")
        XCTAssertEqual(resolved.motif, design.motif)
        XCTAssertEqual(resolved.look.scene.map(\.id), ["matiere"])
        XCTAssertTrue(CallLiveFrameRule.isFrameId(resolved.id))
    }

    func test_resolve_unknownDeclination_isNil() throws {
        let design = try declinable()
        XCTAssertNil(CallFrameStyleRule.resolve(id: "\(design.id).absent", in: [design]))
        XCTAssertEqual(CallFrameStyleRule.resolve(id: design.id, in: [design])?.id, design.id)
    }

    func test_declinations_baseFirstThenEachStyle_neighbourStopsAtTheEdges() throws {
        let design = try declinable()
        XCTAssertEqual(CallFrameStyleRule.declinations(of: design.id, in: [design]).map(\.id), [design.id, "\(design.id).relief"])
        XCTAssertEqual(CallFrameStyleRule.neighbour(of: design.id, offset: 1, in: [design])?.id, "\(design.id).relief")
        XCTAssertNil(CallFrameStyleRule.neighbour(of: "\(design.id).relief", offset: 1, in: [design]))
        XCTAssertEqual(CallFrameStyleRule.baseId(of: "\(design.id).relief"), design.id)
    }

    func test_reconcile_peopleChange_keepsTheDeclination() throws {
        let duo = try XCTUnwrap(CallFrameCatalogue.all.first { candidate in
            candidate.bucket == .duo && !candidate.styles.isEmpty && CallFrameCatalogue.all.contains { $0.motif == candidate.motif && $0.bucket == .comite }
        })
        let style = try XCTUnwrap(duo.styles.first)
        let reconciled = try XCTUnwrap(CallFrameCatalogue.reconcile(selectedId: "\(duo.id).\(style.id)", people: 3))
        XCTAssertEqual(reconciled.bucket, .comite)
        XCTAssertEqual(reconciled.styleId, style.id)
    }

    func test_featuredFrames_offerTheirReliefDeclination() {
        let featured = Set(CallFrameCatalogue.spotlight.flatMap(\.featured))
        CallFrameCatalogue.all.filter { featured.contains($0.motif) }.forEach { design in
            XCTAssertTrue(design.styles.contains { $0.id == "relief" }, design.id)
        }
    }
}
