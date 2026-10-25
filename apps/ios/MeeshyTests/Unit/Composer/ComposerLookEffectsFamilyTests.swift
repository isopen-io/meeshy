import CoreImage
import XCTest
@testable import Meeshy

/// **« Effets » entre Filtres et Cadres, et la famille choisie descend au niveau
/// de son rail** (#10311, directive porteur 2026-10-12).
@MainActor
final class ComposerLookEffectsFamilyTests: XCTestCase {

    // MARK: - Filtres · Effets · Cadres

    func test_families_areFiltersThenEffectsThenFrames() {
        XCTAssertEqual(ComposerLookFamily.allCases, [.filters, .effects, .frames])
    }

    func test_effectsBand_startsWithNone_andOffersTheCallEffects() {
        let bande = ComposerLookStripRule.items(.effects)
        XCTAssertEqual(bande, CallFaceEffect.allCases.map { ComposerLookStripItem.effect($0) })
        XCTAssertEqual(bande.first, .effect(.none), "« Aucun » en tête : on revient à la prise nue d'un toucher")
    }

    func test_effectsFamily_wearsTheCallWord_andItsOwnPictogram() {
        XCTAssertEqual(ComposerCaptureCopy.familyName(.effects), CallControlsCopy.effectsCaption, "le mot de l'appel")
        let pictos = ComposerLookFamily.allCases.map(ComposerCaptureCopy.familySymbol)
        XCTAssertEqual(Set(pictos).count, pictos.count, "trois familles, trois pictogrammes")
        XCTAssertEqual(ComposerCaptureCopy.itemName(.effect(.toad)), CallEffectsCopy.name(.toad))
    }

    // MARK: - Filtre, effet et cadre se combinent

    func test_choosingAnEffect_keepsTheFilterAndTheFrame() throws {
        let cadre = try XCTUnwrap(Self.firstRealFrame())
        let avant = ComposerPhotoLook(filter: .warm, frame: cadre)
        let apres = ComposerLookStripRule.look(of: .effect(.angel), combinedWith: avant)
        XCTAssertEqual(apres, ComposerPhotoLook(filter: .warm, frame: cadre, effect: .angel))
        XCTAssertTrue(ComposerLookStripRule.isChosen(.effect(.angel), in: apres))
    }

    func test_choosingAFilterOrAFrame_keepsTheEffect() throws {
        let cadre = try XCTUnwrap(Self.firstRealFrame())
        let avant = ComposerPhotoLook(effect: .demon)
        XCTAssertEqual(ComposerLookStripRule.look(of: .filter(.cool), combinedWith: avant).effect, .demon)
        XCTAssertEqual(ComposerLookStripRule.look(of: .frame(cadre), combinedWith: avant).effect, .demon)
    }

    func test_anEffect_touchesTheLook_andIsPaintedLive() {
        let regard = ComposerPhotoLook(effect: .volcano)
        XCTAssertFalse(regard.isUntouched, "une prise avec effet ne part pas brute")
        XCTAssertTrue(ComposerLiveLookRule.rendersLive(regard))
        XCTAssertEqual(regard.withoutFrame.effect, .volcano, "le temps que le cadre cuise, l'effet reste")
        XCTAssertNotEqual(regard.captureFrameId, ComposerPhotoLook().captureFrameId,
                          "un autre effet est une autre version dans Photos")
    }

    // MARK: - Le peintre unique pose l'effet partout

    func test_apply_withoutEffect_returnsTheSameImage() {
        let image = CIImage(color: .red).cropped(to: CGRect(x: 0, y: 0, width: 90, height: 160))
        let rendu = ComposerFaceEffects.live.apply(.none, to: image, probing: image, still: true)
        XCTAssertTrue(rendu === image, "sans effet, rien n'est calculé")
    }

    func test_probeSize_keepsProportions_inEvenPixels_neverLargerThanTheSource() {
        XCTAssertEqual(ComposerFaceEffects.probeSize(of: CGSize(width: 1080, height: 1920)), CGSize(width: 360, height: 640))
        XCTAssertEqual(ComposerFaceEffects.probeSize(of: CGSize(width: 162, height: 288)), CGSize(width: 162, height: 288))
        XCTAssertEqual(ComposerFaceEffects.probeSize(of: .zero), .zero)
    }

    func test_painter_photoAndExport_carryTheEffect() throws {
        let peintre = try Self.code("Meeshy/Features/Main/Composer/ComposerLookPainter.swift")
        XCTAssertTrue(peintre.contains("faces.apply(look.effect, to: tonifiee, probing: source, still: still)"))
        XCTAssertTrue(peintre.contains("canvas: toile, declared: espace, still: true, overlay: overlay)"), "la photo cherche son visage sur elle")
        let export = try Self.code("Meeshy/Features/Main/Composer/ComposerLookVideoExporter.swift")
        XCTAssertTrue(export.contains("let visages = ComposerFaceEffects.export()"))
        XCTAssertTrue(export.contains("faces: visages)"), "la vidéo qui part porte l'effet vu à l'aperçu")
    }

    // MARK: - La famille ouverte descend au niveau de son rail

    func test_editScene_anOpenFamily_takesThePlaceOfTheToolsRow() {
        XCTAssertEqual(ComposerEditScene.bottomReserve([.band]), ComposerEditScene.familyRow + ComposerEditScene.gap * 2,
                       "la bande ne s'empile plus au-dessus des outils")
        XCTAssertGreaterThanOrEqual(ComposerEditScene.familyRow,
                                    ComposerEditScene.bandHeight + 2 * ComposerTriggerOutline.outset)
    }

    func test_bottomRow_editing_putsTheBandBesideItsRail_neverAbove() throws {
        let bas = try Self.code("Meeshy/Features/Main/Composer/ComposerCaptureBottomRow.swift")
        XCTAssertTrue(bas.contains("if session.openFamily != nil {\n                familyRow"))
        let rangee = try XCTUnwrap(bas.range(of: "private var familyRow: some View {"))
        let fin = try XCTUnwrap(bas.range(of: "private func mediaTrack", range: rangee.upperBound..<bas.endIndex))
        let corps = String(bas[rangee.upperBound..<fin.lowerBound])
        XCTAssertTrue(corps.contains("HStack("), "le rail et la bande sur la même rangée")
        let rail = try XCTUnwrap(corps.range(of: "ComposerLookRail("))
        let bande = try XCTUnwrap(corps.range(of: "ComposerLookStrip("))
        XCTAssertLessThan(rail.lowerBound, bande.lowerBound, "le rail à gauche, la bande à sa droite")
        let panneaux = try XCTUnwrap(bas.range(of: "private var editPanelsAndTools: some View {"))
        let finPanneaux = try XCTUnwrap(bas.range(of: "private var familyRow", range: panneaux.upperBound..<bas.endIndex))
        XCTAssertFalse(bas[panneaux.upperBound..<finPanneaux.lowerBound].contains("ComposerLookStrip("),
                       "plus de bande en panneau flottant au-dessus du rail")
    }

    private static func firstRealFrame() -> ComposerPhotoFrame? {
        ComposerLookStripRule.items(.frames).lazy.compactMap { item -> ComposerPhotoFrame? in
            guard case .frame(let cadre) = item, cadre != ComposerPhotoFrame.none else { return nil }
            return cadre
        }.first
    }

    private static func code(_ relative: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent(relative)
        return try String(contentsOf: url, encoding: .utf8)
    }
}
