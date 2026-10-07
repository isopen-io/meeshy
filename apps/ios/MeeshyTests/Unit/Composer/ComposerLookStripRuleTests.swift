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

    // MARK: - La case au centre est la case choisie (#9566)

    func test_centeredIndex_isTheCellUnderTheMiddleOfTheBand() {
        let pas = ComposerLookStripRule.pitch
        XCTAssertEqual(ComposerLookStripRule.centeredIndex(scrolled: 0, count: 40), 0)
        XCTAssertEqual(ComposerLookStripRule.centeredIndex(scrolled: pas * 3, count: 40), 3)
        XCTAssertEqual(ComposerLookStripRule.centeredIndex(scrolled: pas * 3 + pas * 0.49, count: 40), 3)
        XCTAssertEqual(ComposerLookStripRule.centeredIndex(scrolled: pas * 3 + pas * 0.51, count: 40), 4,
                       "passé la moitié de l'écart, c'est la suivante")
        XCTAssertEqual(ComposerLookStripRule.centeredIndex(scrolled: -80, count: 40), 0, "le rebond de tête reste sur la première")
        XCTAssertEqual(ComposerLookStripRule.centeredIndex(scrolled: pas * 90, count: 40), 39, "celui de queue sur la dernière")
        XCTAssertNil(ComposerLookStripRule.centeredIndex(scrolled: 0, count: 0))
    }

    func test_follow_theScrollChoosesTheCentredCell_onceAndOnlyWhenTheLookMayChange() {
        var suivi = ComposerLookStripFollow()
        suivi.begin(chosen: 0)
        XCTAssertNil(suivi.centered(on: 0, chosen: 0, selects: true), "déjà choisie : rien à choisir")
        XCTAssertEqual(suivi.centered(on: 1, chosen: 0, selects: true), 1, "la case arrivée au centre est choisie")
        XCTAssertNil(suivi.centered(on: 1, chosen: 1, selects: true))
        XCTAssertNil(suivi.centered(on: 2, chosen: 1, selects: false), "un look figé par la prise ne change pas au défilement")
    }

    func test_follow_aBandOpenedOnAChosenCell_doesNotChooseTheFirstOne() {
        var suivi = ComposerLookStripFollow()
        suivi.begin(chosen: 5)
        XCTAssertNil(suivi.centered(on: 0, chosen: 5, selects: true),
                     "la bande s'ouvre en tête avant de rejoindre la case choisie : « Aucun » ne l'écrase pas")
        XCTAssertNil(suivi.centered(on: 3, chosen: 5, selects: true))
        XCTAssertNil(suivi.centered(on: 5, chosen: 5, selects: true))
        XCTAssertEqual(suivi.centered(on: 6, chosen: 5, selects: true), 6, "arrivée, la bande suit de nouveau le doigt")
    }

    func test_follow_aTappedCell_scrollsToTheCentre_withoutChoosingTheCellsItCrosses() {
        var suivi = ComposerLookStripFollow()
        suivi.begin(chosen: 0)
        _ = suivi.centered(on: 0, chosen: 0, selects: true)
        XCTAssertEqual(suivi.chose(4), 4, "la case touchée rejoint le centre")
        XCTAssertNil(suivi.centered(on: 1, chosen: 4, selects: true))
        XCTAssertNil(suivi.centered(on: 3, chosen: 4, selects: true))
        XCTAssertNil(suivi.centered(on: 4, chosen: 4, selects: true))
        XCTAssertNil(suivi.chose(4), "un choix né du défilement est déjà au centre : rien ne défile contre le doigt")
    }

    func test_follow_aProgrammedScrollCutShort_choosesWhereTheBandRests() {
        var suivi = ComposerLookStripFollow()
        suivi.begin(chosen: 0)
        _ = suivi.centered(on: 0, chosen: 0, selects: true)
        _ = suivi.chose(9)
        XCTAssertNil(suivi.centered(on: 2, chosen: 9, selects: true))
        XCTAssertEqual(suivi.settled(chosen: 9, selects: true), 2, "le doigt a repris la bande : elle choisit où elle s'arrête")
        XCTAssertNil(suivi.settled(chosen: 2, selects: true))
        XCTAssertEqual(suivi.centered(on: 3, chosen: 2, selects: true), 3)
    }

    func test_paintedIndices_recording_onlyTheChosen_orNothingWhenCut() {
        XCTAssertEqual(ComposerLookStripRule.paintedIndices(visible: 0...7, count: 40, cells: 1, chosen: 5, recording: true), [5])
        XCTAssertEqual(ComposerLookStripRule.paintedIndices(visible: 0...7, count: 40, cells: 0, chosen: 5, recording: false), [])
    }
}
