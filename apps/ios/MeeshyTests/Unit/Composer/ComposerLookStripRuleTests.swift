import XCTest
@testable import Meeshy

/// **La bande combine, et ne peint que ce qui se voit** (#9351, spec § 3.1 / § 5).
@MainActor
final class ComposerLookStripRuleTests: XCTestCase {

    func test_items_filters_startWithNone() {
        XCTAssertEqual(ComposerLookStripRule.items(.filters).first, .filter(.natural))
        XCTAssertEqual(ComposerLookStripRule.items(.filters).count, VideoFilterPreset.allCases.count)
    }

    func test_items_frames_noneThenClassicsThenCatalog_withoutDuplicates() {
        let cadres = ComposerLookStripRule.items(.frames)
        XCTAssertEqual(cadres.first, .frame(.none))
        XCTAssertTrue(cadres.contains(.frame(.montage(.classic(.polaroid)))))
        XCTAssertEqual(Set(cadres).count, cadres.count)
        XCTAssertEqual(cadres.filter { $0 == .frame(.none) }.count, 1, "« Aucun » une seule fois, en tête")
    }

    func test_look_choosingAFilterKeepsTheFrame_andAFrameKeepsTheFilter() {
        let courant = ComposerPhotoLook(filter: .warm, frame: .montage(.classic(.noir)))
        XCTAssertEqual(ComposerLookStripRule.look(of: .filter(.cool), combinedWith: courant),
                       ComposerPhotoLook(filter: .cool, frame: .montage(.classic(.noir))))
        XCTAssertEqual(ComposerLookStripRule.look(of: .frame(.none), combinedWith: courant),
                       ComposerPhotoLook(filter: .warm, frame: .none))
    }

    func test_isChosen_readsTheMatchingHalfOfThePair() {
        let courant = ComposerPhotoLook(filter: .vivid, frame: .montage(.classic(.film)))
        XCTAssertTrue(ComposerLookStripRule.isChosen(.filter(.vivid), in: courant))
        XCTAssertTrue(ComposerLookStripRule.isChosen(.frame(.montage(.classic(.film))), in: courant))
        XCTAssertFalse(ComposerLookStripRule.isChosen(.filter(.natural), in: courant))
    }

    func test_chosenIndex_findsTheFramedCell_inEachFamily() {
        let courant = ComposerPhotoLook(filter: .cool, frame: .montage(.classic(.polaroid)))
        let filtres = ComposerLookStripRule.items(.filters)
        let cadres = ComposerLookStripRule.items(.frames)
        XCTAssertEqual(ComposerLookStripRule.chosenIndex(in: filtres, look: courant), filtres.firstIndex(of: .filter(.cool)))
        XCTAssertEqual(ComposerLookStripRule.chosenIndex(in: cadres, look: courant),
                       cadres.firstIndex(of: .frame(.montage(.classic(.polaroid)))))
        XCTAssertEqual(ComposerLookStripRule.chosenIndex(in: cadres, look: ComposerPhotoLook()), 0, "« Aucun » encadré par défaut")
    }

    func test_visibleRange_fromTheScrollOffset() {
        let pas = ComposerLookStripRule.pitch
        XCTAssertEqual(ComposerLookStripRule.visibleRange(offset: pas * 3, width: pas * 4 - 1, count: 40), 3...6)
        XCTAssertEqual(ComposerLookStripRule.visibleRange(offset: pas * 38, width: pas * 10, count: 40), 38...39)
        XCTAssertNil(ComposerLookStripRule.visibleRange(offset: 0, width: 0, count: 40))
        XCTAssertNil(ComposerLookStripRule.visibleRange(offset: 0, width: 300, count: 0))
    }

    func test_paintedIndices_visiblePlusOne_cappedByTheThermalBudget_keepingTheChosen() {
        XCTAssertEqual(ComposerLookStripRule.paintedIndices(visible: 3...6, count: 40, cells: 8, chosen: 4, recording: false),
                       [2, 3, 4, 5, 6, 7])
        let serrees = ComposerLookStripRule.paintedIndices(visible: 3...10, count: 40, cells: 5, chosen: 2, recording: false)
        XCTAssertEqual(serrees.count, 5)
        XCTAssertTrue(serrees.contains(2), "la miniature choisie vit toujours")
        XCTAssertEqual(ComposerLookStripRule.paintedIndices(visible: 3...10, count: 40, cells: 5, chosen: 2, recording: false),
                       serrees, "le même défilement peint les mêmes cases")
    }

    func test_paintedIndices_recording_onlyTheChosen_orNothingWhenCut() {
        XCTAssertEqual(ComposerLookStripRule.paintedIndices(visible: 0...7, count: 40, cells: 1, chosen: 5, recording: true), [5])
        XCTAssertEqual(ComposerLookStripRule.paintedIndices(visible: 0...7, count: 40, cells: 0, chosen: 5, recording: false), [])
    }
}
