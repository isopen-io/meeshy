import XCTest
import SwiftUI
import MeeshyUI
@testable import Meeshy

/// Le décrochage de l'aperçu en ligne déplaçable demande une traction FRANCHE
/// (#18724) : la carte tirée vers le bas résiste et se comprime vers la forme
/// d'une rangée tant qu'elle TIENT ; au-delà de la distance de décrochage, ou
/// lancée franchement, elle DÉCROCHE — une fois, avec une haptique rigide — et
/// ne se rattache plus, même si le doigt remonte viser une section.
final class ConversationPeekPullDownStageTests: XCTestCase {

    private typealias Law = ConversationPeekPullDown

    // MARK: - Tenir, puis décrocher

    func test_stage_belowTheDetachDistance_holdsWithItsProgress() {
        let half = Law.detachDistance / 2
        XCTAssertEqual(Law.stage(translation: half, velocity: 0), .holding(0.5))
        XCTAssertEqual(Law.stage(translation: 0, velocity: 0), .holding(0))
    }

    func test_stage_progress_isMonotoneAndBounded() {
        let samples = stride(from: CGFloat(-40), through: Law.detachDistance - 1, by: 7).map {
            Law.stage(translation: $0, velocity: 0).progress
        }
        XCTAssertEqual(samples, samples.sorted(), "la carte se comprime à mesure qu'on tire, jamais à rebours")
        XCTAssertTrue(samples.allSatisfy { (0...1).contains($0) }, "bornée")
    }

    func test_stage_atTheDetachDistance_isDetached() {
        XCTAssertEqual(Law.stage(translation: Law.detachDistance, velocity: 0), .detached)
        XCTAssertEqual(Law.stage(translation: 600, velocity: 0), .detached)
        XCTAssertEqual(Law.stage(translation: Law.detachDistance, velocity: 0).progress, 1)
    }

    func test_stage_detachDistance_isTheMorphCourse() {
        XCTAssertEqual(Law.detachDistance, 140)
        XCTAssertEqual(Law.detachDistance, Law.morphDistance, "la carte devient ligne au point même où elle décroche")
    }

    func test_stage_aFrankVelocity_detachesBeforeTheDistance() {
        XCTAssertEqual(Law.detachVelocity, 900)
        XCTAssertEqual(Law.stage(translation: Law.flingFloor, velocity: Law.detachVelocity), .detached)
    }

    func test_stage_aFastTremorBelowTheFloor_keepsHolding() {
        XCTAssertNotEqual(Law.stage(translation: Law.flingFloor - 1, velocity: 4_000), .detached,
                          "un tremblement rapide n'est pas une traction")
    }

    func test_stage_aSlowPull_belowTheDistance_keepsHolding() {
        XCTAssertNotEqual(Law.stage(translation: Law.detachDistance - 1, velocity: Law.detachVelocity - 1), .detached)
    }

    func test_stage_anUpwardVelocity_neverDetaches() {
        XCTAssertNotEqual(Law.stage(translation: 80, velocity: -3_000), .detached)
    }

    func test_stage_onceDetached_pullingBackUp_neverReattaches() {
        XCTAssertEqual(Law.stage(translation: -200, velocity: -2_000, isLatched: true), .detached,
                       "hystérésis : la ligne reste ligne pour viser une section au-dessus")
        XCTAssertEqual(Law.stage(translation: 0, velocity: 0, isLatched: true).progress, 1)
    }

    // MARK: - L'haptique de décrochage, une fois

    func test_latches_onTheFirstDetachedStage_only() {
        XCTAssertTrue(Law.latches(wasLatched: false, stage: .detached))
        XCTAssertFalse(Law.latches(wasLatched: true, stage: .detached), "déjà décrochée : aucune seconde haptique")
        XCTAssertFalse(Law.latches(wasLatched: false, stage: .holding(0.9)))
    }

    func test_latches_overAWholeGesture_firesExactlyOnce() {
        var latched = false
        var fired = 0
        for translation in stride(from: CGFloat(0), through: 400, by: 10) {
            let stage = Law.stage(translation: translation, velocity: 0, isLatched: latched)
            if Law.latches(wasLatched: latched, stage: stage) { fired += 1; latched = true }
        }
        for translation in stride(from: CGFloat(400), through: -100, by: -25) {
            let stage = Law.stage(translation: translation, velocity: 0, isLatched: latched)
            if Law.latches(wasLatched: latched, stage: stage) { fired += 1; latched = true }
        }
        XCTAssertEqual(fired, 1)
    }

    // MARK: - La résistance

    func test_elasticTranslation_resists_isMonotone_andBounded() {
        let samples = stride(from: CGFloat(0), through: 2_000, by: 20).map(Law.elasticTranslation)
        XCTAssertEqual(samples, samples.sorted(), "monotone")
        XCTAssertTrue(samples.allSatisfy { $0 < Law.elasticReach }, "bornée par la portée de l'élastique")
        XCTAssertLessThan(Law.elasticTranslation(Law.detachDistance), Law.detachDistance / 2,
                          "on tire fort : au décrochage, la carte n'a parcouru qu'une part de la course du doigt")
        XCTAssertEqual(Law.elasticTranslation(-30), 0, "vers le haut, la carte ne monte pas")
    }

    func test_elasticTranslation_resistsMoreAndMore() {
        let first = Law.elasticTranslation(40) - Law.elasticTranslation(0)
        let later = Law.elasticTranslation(140) - Law.elasticTranslation(100)
        XCTAssertGreaterThan(first, later, "chaque point de traction rend moins que le précédent")
    }

    func test_cardOffset_holdingIsElastic_detachedFollowsTheFinger() {
        XCTAssertEqual(Law.cardOffset(translation: 100, isLatched: false), Law.elasticTranslation(100))
        XCTAssertEqual(Law.cardOffset(translation: 100, isLatched: true), 100, "décrochée, la ligne suit le doigt un pour un")
        XCTAssertEqual(Law.cardOffset(translation: -80, isLatched: true), -80, "y compris vers le haut")
    }

    func test_cardOffset_jumpsAtTheDetach_theLineLeapsToTheFinger() {
        let holding = Law.cardOffset(translation: Law.detachDistance, isLatched: false)
        let detached = Law.cardOffset(translation: Law.detachDistance, isLatched: true)
        XCTAssertGreaterThan(detached, holding, "au décrochage, la ligne saute vers le doigt")
    }

    func test_velocity_isProjectedFromThePredictedEnd() {
        XCTAssertEqual(Law.velocity(translation: 50, predictedEndTranslation: 50), 0)
        XCTAssertGreaterThan(Law.velocity(translation: 50, predictedEndTranslation: 600), Law.detachVelocity)
        XCTAssertLessThan(Law.velocity(translation: 50, predictedEndTranslation: 20), 0)
    }

    // MARK: - La forme de ligne

    private let card = CGRect(x: 0, y: 0, width: 300, height: 420)

    func test_rowFrame_hasTheRowSize_centeredAtTheBottomOfTheCard() {
        let row = Law.rowFrame(size: CGSize(width: 393, height: 76), in: card)
        XCTAssertEqual(row.size, CGSize(width: 393, height: 76), "hauteur et largeur de rangée")
        XCTAssertEqual(row.midX, card.midX, accuracy: 0.001)
        XCTAssertEqual(row.maxY, card.maxY, accuracy: 0.001)
    }

    func test_rowFrame_withAGrab_centersTheRowUnderTheFinger() {
        let row = Law.rowFrame(size: CGSize(width: 393, height: 76), in: card, grabY: 180)
        XCTAssertEqual(row.midY, 180, accuracy: 0.001, "la ligne se resserre sous le doigt qui tire")
        XCTAssertEqual(row.midX, card.midX, accuracy: 0.001)
    }

    func test_rowFrame_withAGrabNearAnEdge_staysInsideTheCard() {
        let size = CGSize(width: 393, height: 76)
        XCTAssertEqual(Law.rowFrame(size: size, in: card, grabY: 4).minY, card.minY, accuracy: 0.001)
        XCTAssertEqual(Law.rowFrame(size: size, in: card, grabY: 900).maxY, card.maxY, accuracy: 0.001)
    }

    func test_grabY_isTheGrabInTheRestingCard_whateverItsOffset() {
        let grab = CGPoint(x: 120, y: 500)
        let resting = CGRect(x: 0, y: 240, width: 300, height: 420)
        XCTAssertEqual(Law.grabY(grab, slot: resting, shift: .zero), 260)
        let pulled = resting.offsetBy(dx: 12, dy: 64)
        XCTAssertEqual(Law.grabY(grab, slot: pulled, shift: CGPoint(x: 12, y: 64)), 260,
                       "le point saisi ne glisse pas dans la carte quand elle descend")
        XCTAssertNil(Law.grabY(nil, slot: resting, shift: .zero))
    }

    func test_detachedLine_landsUnderTheFinger() {
        let grabY: CGFloat = 180
        let row = Law.rowFrame(size: CGSize(width: 393, height: 76), in: card, grabY: grabY)
        let finger = grabY + Law.detachDistance
        let painted = row.midY + Law.cardOffset(translation: Law.detachDistance, isLatched: true)
        XCTAssertEqual(painted, finger, accuracy: 0.001, "décrochée, la ligne saute SOUS le doigt, pas à côté")
    }

    func test_rowSize_isThePressedRow_orAListRowOfTheCardWidth() {
        let source = CGRect(x: 0, y: 300, width: 393, height: 76)
        XCTAssertEqual(Law.rowSize(source: source, cardWidth: 300), source.size)
        XCTAssertEqual(Law.rowSize(source: nil, cardWidth: 300), CGSize(width: 300, height: Law.fallbackRowHeight))
    }

    func test_compressed_zeroIsTheCard_oneIsTheRow_monotoneBetween() {
        let row = Law.rowFrame(size: CGSize(width: 393, height: 76), in: card)
        XCTAssertEqual(Law.compressed(card, toward: row, detach: 0), card)
        XCTAssertEqual(Law.compressed(card, toward: row, detach: 1), row)
        let heights = stride(from: CGFloat(0), through: 1, by: 0.1).map { Law.compressed(card, toward: row, detach: $0).height }
        XCTAssertEqual(heights, heights.sorted(by: >), "la carte se comprime vers la ligne")
        XCTAssertEqual(Law.compressed(card, toward: row, detach: 1.4), row, "bornée : un ressort ne la tasse pas au-delà")
    }

    func test_faceProgress_detachBringsTheRowFaceBack() {
        XCTAssertEqual(Law.faceProgress(morph: 1, detach: 0), 1, "au repos, l'aperçu")
        XCTAssertEqual(Law.faceProgress(morph: 1, detach: 1), 0, "décrochée, la face de la rangée : avatar et titre")
        XCTAssertEqual(Law.faceProgress(morph: 0.3, detach: 0), 0.3, "pendant la naissance, la loi du morphisme reste maître")
        XCTAssertEqual(ConversationPreviewMorph.opacity(of: .rowFace, progress: Law.faceProgress(morph: 1, detach: 1)), 1)
        XCTAssertEqual(ConversationPreviewMorph.opacity(of: .preview, progress: Law.faceProgress(morph: 1, detach: 1)), 0)
    }

    // MARK: - Le mouvement

    @MainActor
    func test_follow_springsTheDetachedLine_only_andNeverUnderReduceMotion() {
        XCTAssertEqual(ConversationPeekDetachMotion.follow(isLatched: true, reduceMotion: false), MeeshyAnimation.peekDetach,
                       "le saut et le suivi de la ligne décrochée sont un jeton")
        XCTAssertNil(ConversationPeekDetachMotion.follow(isLatched: false, reduceMotion: false), "tenue : la carte suit le doigt à l'image")
        XCTAssertNil(ConversationPeekDetachMotion.follow(isLatched: true, reduceMotion: true), "réduit : aucun ressort")
    }

    // MARK: - Les verdicts du lâcher, inchangés

    func test_release_keepsItsVerdicts() {
        XCTAssertEqual(Law.release(predictedEndTranslation: 0, isLatched: true), .drop, "la ligne décrochée se dépose")
        XCTAssertEqual(Law.release(predictedEndTranslation: 20, isLatched: false), .restore)
        XCTAssertEqual(Law.release(predictedEndTranslation: 320, isLatched: false), .dismiss)
    }

    func test_release_aDetachedLineThrownDown_closesThePreview() {
        XCTAssertEqual(Law.release(predictedEndTranslation: 600, isLatched: true, velocity: Law.detachVelocity), .dismiss,
                       "un coup vers le bas reste le geste évident qui ferme (#17258) : jamais un dépôt au hasard")
        XCTAssertEqual(Law.release(predictedEndTranslation: 600, isLatched: true, velocity: Law.detachVelocity - 1), .drop,
                       "une main qui ralentit sur sa cible dépose")
        XCTAssertEqual(Law.release(predictedEndTranslation: -200, isLatched: true, velocity: -3_000), .drop,
                       "remonter viser une section dépose")
    }

    // MARK: - Gardes de montage

    private func overlays() throws -> String {
        AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Main/Views/ConversationListView+Overlays.swift"))
    }

    private func body(of function: String, until next: String, in source: String) throws -> Substring {
        let start = try XCTUnwrap(source.range(of: "func \(function)"), "\(function) introuvable")
        let end = try XCTUnwrap(source.range(of: "func \(next)", range: start.upperBound..<source.endIndex))
        return source[start.lowerBound..<end.lowerBound]
    }

    func test_chipDrag_latchesThroughTheStageLaw_withOneRigidHaptic() throws {
        let drag = try body(of: "handleCardChipDrag", until: "endCardChipDrag", in: try overlays())
        XCTAssertTrue(drag.contains("ConversationPeekPullDown.latches(wasLatched: chipModeLatched"), "le décrochage passe par la loi")
        XCTAssertTrue(drag.contains("ConversationPeekPullDown.stage(translation:"))
        XCTAssertEqual(drag.components(separatedBy: "HapticFeedback.rigid()").count - 1, 1, "une haptique rigide, une seule")
        XCTAssertFalse(drag.contains("HapticFeedback.light()"), "le décrochage se sent : rigide, plus léger")
        XCTAssertFalse(drag.contains("dragMorphProgress >= 1"), "le seuil est celui de la loi, vitesse comprise")
    }

    func test_chipDrag_restore_isATokenSpring_cancellable() throws {
        let release = try body(of: "endCardChipDrag", until: "updateChipDropTarget", in: try overlays())
        XCTAssertTrue(release.contains("ConversationPeekDetachMotion.animateReturn"), "le retour en aperçu est un jeton, réduit en fondu")
        XCTAssertFalse(release.contains(".spring("), "aucun ressort littéral")
        let source = try overlays()
        XCTAssertTrue(source.contains("MeeshyAnimation.peekDetachReturn"))
        XCTAssertTrue(source.contains("MeeshyMotion.reducedFade"))
    }

    func test_peekCard_compressesTowardTheRow_neverByAUniformScale() throws {
        let source = try overlays()
        XCTAssertTrue(source.contains("detach: dragMorphProgress"), "la carte reçoit la progression de la traction")
        XCTAssertFalse(source.contains("scaleEffect(1 - 0.45"), "plus de pastille par échelle : la carte devient une ligne")
        XCTAssertTrue(source.contains("ConversationPeekCardDrag("), "la carte suit le doigt avec résistance")
        XCTAssertTrue(source.contains("ConversationPeekPullDown.cardOffset(translation:"))
        XCTAssertTrue(source.contains("ConversationPeekPullDown.cardFrame("),
                      "le cadre se comprime vers la ligne par la loi que le centrage de l'aperçu lit aussi (`cardFrame` → `compressed`)")
        XCTAssertTrue(source.contains("ConversationPeekPullDown.faceProgress("), "la face de la rangée revient")
    }

    func test_chipDrag_recordsTheGrab_andTheCardCompressesUnderIt() throws {
        let source = try overlays()
        let drag = try body(of: "handleCardChipDrag", until: "endCardChipDrag", in: source)
        XCTAssertTrue(drag.contains("chipGrabPoint = value.startLocation"), "le point saisi est retenu")
        XCTAssertTrue(source.contains("grab: chipGrabPoint"), "la carte le reçoit")
        XCTAssertTrue(source.contains("ConversationPeekPullDown.grabY("), "et y resserre la ligne")
        XCTAssertTrue(source.contains(".coordinateSpace(name: ConversationPeekCardDrag.restSpace)"),
                      "mesuré depuis la carte au repos, hors du décalage du geste")
    }

    func test_chipDrag_latchIsATokenSpring_veilAndMenuFollowIt() throws {
        let drag = try body(of: "handleCardChipDrag", until: "endCardChipDrag", in: try overlays())
        XCTAssertTrue(drag.contains("meeshyWithAnimation(MeeshyAnimation.peekDetach"),
                      "un décrochage lancé n'éteint pas voile et menu d'un coup : ils suivent le saut")
        XCTAssertFalse(drag.contains("withAnimation(."), "aucun ressort nu")
    }

    func test_chipDrag_release_readsTheReleaseVelocity() throws {
        let release = try body(of: "endCardChipDrag", until: "updateChipDropTarget", in: try overlays())
        XCTAssertTrue(release.contains("velocity: value.peekPullVelocity"))
    }

    func test_veilAndMenu_fadeWithTheTraction() throws {
        let source = try overlays()
        XCTAssertTrue(source.contains("Double(1 - dragMorphProgress)"), "le voile s'efface à mesure")
        XCTAssertTrue(source.contains("opacity: Double(1 - dragMorphProgress)"), "le menu aussi")
    }
}
