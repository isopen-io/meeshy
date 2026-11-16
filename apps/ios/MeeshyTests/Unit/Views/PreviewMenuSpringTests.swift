import XCTest
import SwiftUI
import MeeshyUI
@testable import Meeshy

/// Le ressort entre le menu et l'aperçu (#18723) : quand le menu d'appui long
/// s'étend, la carte d'aperçu recule (échelle et remontée de quelques points),
/// et elle revient quand il se réduit. Tout se lit dans la HAUTEUR du menu :
/// aucun drapeau parallèle ne décide du recul.
final class PreviewMenuSpringTests: XCTestCase {

    private let compact: CGFloat = 112
    private let natural: CGFloat = 412

    // MARK: - L'échelle

    func test_scale_atCompactHeight_isOne() {
        XCTAssertEqual(PreviewMenuSpring.scale(forMenuHeight: compact, compact: compact, natural: natural), 1)
    }

    func test_scale_atWidestHeight_isTheWidestScale() {
        XCTAssertEqual(PreviewMenuSpring.scale(forMenuHeight: natural, compact: compact, natural: natural), 0.96, accuracy: 0.0001)
    }

    func test_scale_alongTheMenuHeight_isMonotoneDecreasing() {
        let scales = stride(from: compact, through: natural, by: 10).map {
            PreviewMenuSpring.scale(forMenuHeight: $0, compact: compact, natural: natural)
        }
        for (previous, next) in zip(scales, scales.dropFirst()) {
            XCTAssertLessThanOrEqual(next, previous, "un menu plus haut ne rapproche jamais la carte")
        }
        XCTAssertLessThan(scales.last ?? 1, scales.first ?? 1)
    }

    func test_scale_beyondTheEnds_staysBetweenOneAndTheWidestScale() {
        XCTAssertEqual(PreviewMenuSpring.scale(forMenuHeight: natural + 200, compact: compact, natural: natural), 0.96, accuracy: 0.0001)
        XCTAssertEqual(PreviewMenuSpring.scale(forMenuHeight: compact - 50, compact: compact, natural: natural), 1)
    }

    func test_scale_whenTheMenuCannotGrow_staysOne() {
        XCTAssertEqual(PreviewMenuSpring.scale(forMenuHeight: compact, compact: compact, natural: compact), 1)
        XCTAssertEqual(PreviewMenuSpring.scale(forMenuHeight: 300, compact: compact, natural: compact - 10), 1)
    }

    // MARK: - La remontée

    func test_offset_atCompactHeight_isZero() {
        XCTAssertEqual(PreviewMenuSpring.offset(forMenuHeight: compact, compact: compact, natural: natural), 0)
    }

    func test_offset_atWidestHeight_liftsTheCardAFewPoints() {
        let lift = PreviewMenuSpring.offset(forMenuHeight: natural, compact: compact, natural: natural)
        XCTAssertLessThan(lift, 0, "la carte remonte")
        XCTAssertGreaterThanOrEqual(lift, -16, "de quelques points seulement")
    }

    func test_offset_alongTheMenuHeight_isMonotoneDecreasing_andBounded() {
        let offsets = stride(from: compact - 40, through: natural + 40, by: 10).map {
            PreviewMenuSpring.offset(forMenuHeight: $0, compact: compact, natural: natural)
        }
        for (previous, next) in zip(offsets, offsets.dropFirst()) {
            XCTAssertLessThanOrEqual(next, previous)
        }
        XCTAssertEqual(offsets.first ?? 1, 0)
        XCTAssertEqual(offsets.last ?? 0, PreviewMenuSpring.offset(forMenuHeight: natural, compact: compact, natural: natural))
    }

    // MARK: - La pose servie à la carte

    func test_pose_withMotion_recedesWithoutDimming() {
        let pose = PreviewMenuSpring.pose(forMenuHeight: natural, compact: compact, natural: natural, reduceMotion: false)
        XCTAssertEqual(pose.scale, 0.96, accuracy: 0.0001)
        XCTAssertLessThan(pose.offset, 0)
        XCTAssertEqual(pose.opacity, 1)
    }

    func test_pose_underReduceMotion_neitherScalesNorMoves_onlyDims() {
        let widest = PreviewMenuSpring.pose(forMenuHeight: natural, compact: compact, natural: natural, reduceMotion: true)
        XCTAssertEqual(widest.scale, 1)
        XCTAssertEqual(widest.offset, 0)
        XCTAssertLessThan(widest.opacity, 1)
        XCTAssertGreaterThan(widest.opacity, 0.8, "un retrait discret, jamais une carte éteinte")
        let rest = PreviewMenuSpring.pose(forMenuHeight: compact, compact: compact, natural: natural, reduceMotion: true)
        XCTAssertEqual(rest, PreviewMenuSpring.Pose.rest)
    }

    // MARK: - Le ressort : au lâcher, jamais sous le doigt

    func test_animation_whileTheFingerIsDown_isNone() {
        XCTAssertNil(PreviewMenuSpring.animation(reduceMotion: false, isTracking: true, isMorphing: false, inherited: .default),
                     "la carte suit le geste sans ressort")
        XCTAssertNil(PreviewMenuSpring.animation(reduceMotion: true, isTracking: true, isMorphing: false, inherited: .default))
    }

    func test_animation_atRelease_isTheFrankElasticToken() {
        XCTAssertEqual(PreviewMenuSpring.animation(reduceMotion: false, isTracking: false, isMorphing: false, inherited: nil),
                       MeeshyAnimation.menuSpring)
        XCTAssertEqual(PreviewMenuSpring.animation(reduceMotion: false, isTracking: false, isMorphing: false, inherited: .linear),
                       MeeshyAnimation.menuSpring, "le cran conclu ne dicte pas son ressort à la carte")
    }

    func test_animation_underReduceMotion_isTheShortFade() {
        XCTAssertEqual(PreviewMenuSpring.animation(reduceMotion: true, isTracking: false, isMorphing: false, inherited: nil),
                       MeeshyMotion.reducedFade)
    }

    func test_animation_whileTheCardMorphsWithItsRow_followsTheMorphTransaction() {
        let morphReturn = MeeshyAnimation.previewMorphReturn
        XCTAssertEqual(PreviewMenuSpring.animation(reduceMotion: false, isTracking: false, isMorphing: true, inherited: morphReturn),
                       morphReturn, "la carte rejoint sa rangée au rythme du retour, jamais après lui")
        XCTAssertNil(PreviewMenuSpring.animation(reduceMotion: false, isTracking: false, isMorphing: true, inherited: nil),
                     "posée sur la ligne sans animation, la carte s'y pose aussi")
    }

    // MARK: - Sur la ligne, la carte n'a pas reculé

    func test_onRow_atMorphZero_isRest() {
        let receded = PreviewMenuSpring.pose(forMenuHeight: natural, compact: compact, natural: natural, reduceMotion: false)
        XCTAssertEqual(receded.onRow(morphProgress: 0), PreviewMenuSpring.Pose.rest,
                       "la carte qui redevient la ligne la rejoint à sa taille et à sa place")
    }

    func test_onRow_atMorphOne_isThePoseItself() {
        let receded = PreviewMenuSpring.pose(forMenuHeight: natural, compact: compact, natural: natural, reduceMotion: false)
        XCTAssertEqual(receded.onRow(morphProgress: 1), receded)
    }

    func test_onRow_halfway_liesBetweenRestAndThePose_andClamps() {
        let receded = PreviewMenuSpring.pose(forMenuHeight: natural, compact: compact, natural: natural, reduceMotion: false)
        let halfway = receded.onRow(morphProgress: 0.5)
        XCTAssertEqual(halfway.scale, 0.98, accuracy: 0.0001)
        XCTAssertEqual(halfway.offset, receded.offset / 2, accuracy: 0.0001)
        XCTAssertEqual(receded.onRow(morphProgress: -1), PreviewMenuSpring.Pose.rest)
        XCTAssertEqual(receded.onRow(morphProgress: 2), receded)
        let dimmed = PreviewMenuSpring.pose(forMenuHeight: natural, compact: compact, natural: natural, reduceMotion: true)
        XCTAssertEqual(dimmed.onRow(morphProgress: 0).opacity, 1)
    }

    // MARK: - La hauteur la plus large ne dépend pas du panneau affiché

    func test_widestMenuHeight_isTheSameWhateverThePanel() {
        let root = layout(natural: 260)
        let move = layout(natural: 600)
        XCTAssertEqual(root.widestMenuHeight, move.widestMenuHeight, "un sous-panneau plus haut fait reculer la carte, il ne déplace pas la référence")
        XCTAssertGreaterThanOrEqual(root.widestMenuHeight, root.expandedMenuHeight)
        XCTAssertEqual(move.widestMenuHeight, move.expandedMenuHeight)
    }

    func test_widestMenuHeight_neverFallsUnderTheCompactHeight() {
        let cramped = ConversationPeekLayout(availableHeight: 200, availableWidth: 393, compactMenuHeight: 112, naturalMenuHeight: 400)
        XCTAssertGreaterThanOrEqual(cramped.widestMenuHeight, cramped.compactMenuHeight)
    }

    private func layout(natural: CGFloat) -> ConversationPeekLayout {
        ConversationPeekLayout(availableHeight: 760, availableWidth: 393, compactMenuHeight: compact, naturalMenuHeight: natural)
    }
}

/// La carte DÉRIVE de la hauteur du menu : la garde lit la source de l'aperçu,
/// pour qu'aucun état parallèle (un booléen « menu ouvert », une copie animée
/// de l'échelle) ne vienne doubler la hauteur que le menu rend vraiment.
final class PreviewMenuSpringSourceGuardTests: XCTestCase {

    private var peekSource: String {
        get throws {
            let url = URL(fileURLWithPath: #filePath)
                .deletingLastPathComponent()  // Views
                .deletingLastPathComponent()  // Unit
                .deletingLastPathComponent()  // MeeshyTests
                .deletingLastPathComponent()  // ios
                .appendingPathComponent("Meeshy/Features/Main/Views/ConversationLongPressPeek.swift")
            return try String(contentsOf: url, encoding: .utf8)
                .components(separatedBy: "\n")
                .map { line in line.range(of: "//").map { String(line[..<$0.lowerBound]) } ?? line }
                .joined(separator: "\n")
        }
    }

    func test_peekCard_readsTheCurrentMenuHeight() throws {
        let source = try peekSource
        XCTAssertTrue(
            source.contains("PreviewMenuSpring.pose(forMenuHeight: layout.menuHeight(progress: progress)"),
            "la pose de la carte se lit dans la hauteur COURANTE du menu"
        )
        XCTAssertTrue(source.contains("compact: layout.compactMenuHeight"))
        XCTAssertTrue(source.contains("natural: layout.widestMenuHeight"))
    }

    func test_peekCard_springsOnlyAfterTheFingerLifts() throws {
        XCTAssertTrue(try peekSource.contains("isTracking: gestureStart != nil"), "sous le doigt, la carte suit sans ressort")
    }

    func test_peekCard_returnsToRestWithTheRowMorph() throws {
        let source = try peekSource
        XCTAssertTrue(source.contains(".onRow(morphProgress: morphProgress)"),
                      "la carte qui redevient la ligne lâche son recul, sinon elle atterrit à côté de la rangée")
        XCTAssertTrue(source.contains("isMorphing: morphProgress < 1"),
                      "pendant le morphisme, la pose suit la transaction de la ligne")
    }

    func test_peekCard_keepsNoParallelState() throws {
        let declared = try peekSource
            .components(separatedBy: "\n")
            .filter { $0.contains("@State") }
            .compactMap { line -> String? in
                guard let name = line.components(separatedBy: " var ").last?.components(separatedBy: ":").first else { return nil }
                return name.trimmingCharacters(in: .whitespaces)
            }
        XCTAssertEqual(
            Set(declared),
            ["detent", "progress", "gestureStart", "cardRoute", "leadHeight", "contentHeight"],
            "le recul de la carte ne se range dans aucun état : il se dérive de la hauteur du menu"
        )
    }
}
