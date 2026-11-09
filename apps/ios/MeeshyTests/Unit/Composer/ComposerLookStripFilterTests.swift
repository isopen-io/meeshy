import XCTest
import MeeshyUI
@testable import Meeshy

/// **Une seule bande, et des puces qui la trient en direct** (#17267, porteur
/// 2026-11-09 : « la liste affiche et intègre les filtres, effets et cadres en
/// même temps »).
@MainActor
final class ComposerLookStripFilterTests: XCTestCase {

    // MARK: - La liste mêlée

    func test_items_all_startsWithNone_thenMixesTheThreeFamilies() {
        let bande = ComposerLookStripFilterRule.items(ComposerLookStripFilter())
        XCTAssertEqual(bande.first, .untouched, "« Aucun » en tête")
        XCTAssertTrue(bande.contains(.filter(.golden)))
        XCTAssertTrue(bande.contains(.effect(.toad)))
        XCTAssertTrue(bande.contains(.frame(.montage(.classic(.polaroid)))))
        XCTAssertEqual(Set(bande).count, bande.count, "chaque case une fois")
    }

    func test_items_all_dropsTheNoneOfEachFamily() {
        let bande = ComposerLookStripFilterRule.items(ComposerLookStripFilter())
        XCTAssertFalse(bande.contains(.filter(.natural)))
        XCTAssertFalse(bande.contains(.effect(.none)))
        XCTAssertFalse(bande.contains(.frame(.none)))
    }

    func test_items_all_keepsTheRailOrder_filtersThenEffectsThenFrames() throws {
        let bande = ComposerLookStripFilterRule.items(ComposerLookStripFilter())
        let filtre = try XCTUnwrap(bande.firstIndex(of: .filter(.golden)))
        let effet = try XCTUnwrap(bande.firstIndex(of: .effect(.smoothing)))
        let cadre = try XCTUnwrap(bande.firstIndex(of: .frame(.montage(.classic(.polaroid)))))
        XCTAssertLessThan(filtre, effet)
        XCTAssertLessThan(effet, cadre)
    }

    // MARK: - Ce que fait chaque case

    func test_kind_eruptionIsImageWide_theOthersNeedAFace() {
        XCTAssertEqual(ComposerLookStripFilterRule.kind(of: .effect(.volcano)), .imageEffect,
                       "l'Éruption gradue l'image et fait monter la lave sans lire de visage")
        for effet in [CallFaceEffect.smoothing, .toad, .angel, .demon] {
            XCTAssertEqual(ComposerLookStripFilterRule.kind(of: .effect(effet)), .faceEffect, "\(effet)")
        }
    }

    func test_kind_nonesHaveNoKind() {
        for aucun in [ComposerLookStripItem.untouched, .filter(.natural), .effect(.none), .frame(.none)] {
            XCTAssertNil(ComposerLookStripFilterRule.kind(of: aucun))
        }
        XCTAssertEqual(ComposerLookStripFilterRule.kind(of: .filter(.film)), .filter)
        XCTAssertEqual(ComposerLookStripFilterRule.kind(of: .frame(.montage(.classic(.noir)))), .frame)
    }

    // MARK: - Les puces de type

    func test_items_typeChip_keepsOnlyThatKind_withItsOwnNoneFirst() {
        for type in ComposerLookTypeChip.allCases where type != .all {
            let bande = ComposerLookStripFilterRule.items(ComposerLookStripFilter(type: type))
            XCTAssertEqual(bande.first, type.noneItem, "\(type)")
            XCTAssertTrue(bande.dropFirst().allSatisfy { item in
                ComposerLookStripFilterRule.kind(of: item).map(type.admits) ?? false
            }, "\(type)")
        }
    }

    func test_items_imageEffects_isNoneThenEruption() {
        XCTAssertEqual(ComposerLookStripFilterRule.items(ComposerLookStripFilter(type: .imageEffects)),
                       [.effect(.none), .effect(.volcano)])
    }

    func test_items_filters_isTheWholeFilterFamily() {
        XCTAssertEqual(ComposerLookStripFilterRule.items(ComposerLookStripFilter(type: .filters)),
                       ComposerLookStripRule.items(.filters))
    }

    // MARK: - Les puces d'ambiance

    func test_items_mood_intersectsWithTheType() {
        let jovialVisage = ComposerLookStripFilter(type: .faceEffects, mood: .jovial)
        XCTAssertEqual(ComposerLookStripFilterRule.items(jovialVisage), [.effect(.none), .effect(.toad)])
        let jovial = ComposerLookStripFilterRule.items(ComposerLookStripFilter(type: .all, mood: .jovial))
        XCTAssertEqual(jovial.first, .untouched)
        XCTAssertTrue(jovial.contains(.effect(.toad)))
        XCTAssertTrue(jovial.dropFirst().allSatisfy { ComposerLookStripFilterRule.mood(of: $0) == .jovial })
    }

    func test_moods_filters_offersNone_becauseNoFilterCarriesAMood() {
        XCTAssertEqual(ComposerLookStripFilterRule.moods(for: .filters), [])
    }

    func test_moods_eachOfferedMood_keepsAtLeastOneCell() {
        for type in ComposerLookTypeChip.allCases {
            for mood in ComposerLookStripFilterRule.moods(for: type) {
                let bande = ComposerLookStripFilterRule.items(ComposerLookStripFilter(type: type, mood: mood))
                XCTAssertGreaterThan(bande.count, 1, "\(type) · \(mood) : jamais une puce qui vide la bande")
            }
        }
    }

    func test_moods_followTheFrameCatalogueOrder() {
        let ambiances = ComposerLookStripFilterRule.moods(for: .all)
        XCTAssertEqual(ambiances, CallFrameMood.allCases.filter { ambiances.contains($0) })
        XCTAssertTrue(ambiances.contains(.jovial))
    }

    func test_selectingType_keepsAMoodItServes_andDropsOneItDoesNot() {
        let jovial = ComposerLookStripFilter(type: .all, mood: .jovial)
        XCTAssertEqual(jovial.selecting(type: .faceEffects), ComposerLookStripFilter(type: .faceEffects, mood: .jovial))
        XCTAssertEqual(jovial.selecting(type: .filters), ComposerLookStripFilter(type: .filters, mood: nil))
    }

    func test_togglingMood_choosesThenClears() {
        let choisi = ComposerLookStripFilter().toggling(mood: .glauque)
        XCTAssertEqual(choisi.mood, .glauque)
        XCTAssertNil(choisi.toggling(mood: .glauque).mood)
        XCTAssertEqual(choisi.toggling(mood: .jovial).mood, .jovial)
    }

    // MARK: - « Aucun » et la case qui porte le choix

    func test_untouched_resetsTheWholeLook_andIsChosenOnlyWhenNothingIs() {
        let courant = ComposerPhotoLook(filter: .warm, frame: .montage(.classic(.noir)), effect: .toad)
        XCTAssertEqual(ComposerLookStripRule.look(of: .untouched, combinedWith: courant), ComposerPhotoLook())
        XCTAssertFalse(ComposerLookStripRule.isChosen(.untouched, in: courant))
        XCTAssertTrue(ComposerLookStripRule.isChosen(.untouched, in: ComposerPhotoLook()))
    }

    func test_chosenIndex_prefersTheLastChosenCell_whenTheListShowsIt() throws {
        let cadre = ComposerLookStripItem.frame(.montage(.classic(.polaroid)))
        let courant = ComposerPhotoLook(filter: .golden, frame: .montage(.classic(.polaroid)))
        let bande = ComposerLookStripFilterRule.items(ComposerLookStripFilter())
        XCTAssertEqual(ComposerLookStripFilterRule.chosenIndex(in: bande, look: courant, focus: cadre),
                       bande.firstIndex(of: cadre))
        XCTAssertEqual(ComposerLookStripFilterRule.chosenIndex(in: bande, look: courant, focus: nil),
                       bande.firstIndex(of: .filter(.golden)), "sans case touchée, la première choisie")
        XCTAssertEqual(ComposerLookStripFilterRule.chosenIndex(in: bande, look: courant, focus: .effect(.toad)),
                       bande.firstIndex(of: .filter(.golden)), "une case touchée qui n'est plus choisie ne compte pas")
    }

    func test_followedIndex_restsOnNone_whenTheChipsHideTheWholeLook() {
        let courant = ComposerPhotoLook(effect: .toad)
        let images = ComposerLookStripFilterRule.items(ComposerLookStripFilter(type: .imageEffects))
        XCTAssertNil(ComposerLookStripFilterRule.chosenIndex(in: images, look: courant, focus: .effect(.toad)))
        XCTAssertEqual(ComposerLookStripFilterRule.followedIndex(in: images, look: courant, focus: .effect(.toad)), 0,
                       "la bande suit « Aucun » sans le choisir : trier ne change pas la prise")
        XCTAssertNil(ComposerLookStripFilterRule.followedIndex(in: [], look: courant, focus: nil))
    }

    func test_focusOpening_pointsAtThatFamilysHalfOfTheLook() {
        let courant = ComposerPhotoLook(filter: .film, frame: .montage(.classic(.noir)), effect: .angel)
        XCTAssertEqual(ComposerLookStripFilterRule.focus(opening: .filters, look: courant), .filter(.film))
        XCTAssertEqual(ComposerLookStripFilterRule.focus(opening: .effects, look: courant), .effect(.angel))
        XCTAssertEqual(ComposerLookStripFilterRule.focus(opening: .frames, look: courant),
                       .frame(.montage(.classic(.noir))))
    }

    // MARK: - L'ouverture

    func test_following_opening_resetsTheChips() {
        let trie = ComposerLookStripFilter(type: .frames, mood: .glauque)
        XCTAssertEqual(trie.following(open: nil, to: .filters), ComposerLookStripFilter(),
                       "chaque ouverture repart de « Tout »")
    }

    func test_following_switchingFamilyOrClosing_keepsTheChips() {
        let trie = ComposerLookStripFilter(type: .faceEffects)
        XCTAssertEqual(trie.following(open: .filters, to: .effects), trie)
        XCTAssertEqual(trie.following(open: .effects, to: nil), trie)
    }

    func test_perform_select_stillCombinesTheTouchedCell() {
        let session = ComposerCaptureSession(stage: .armed)
        session.look = ComposerPhotoLook(filter: .golden)
        session.perform(.select, item: .effect(.angel))
        XCTAssertEqual(session.look, ComposerPhotoLook(filter: .golden, effect: .angel))
        session.perform(.select, item: .untouched)
        XCTAssertEqual(session.look, ComposerPhotoLook(), "« Aucun » sous « Tout » rend la prise telle quelle")
    }

    // MARK: - Le câblage

    func test_strip_showsTheMixedList_sortedByTheSessionChips() throws {
        let bande = try Self.code("Meeshy/Features/Composer/ComposerLookStrip.swift")
        XCTAssertTrue(bande.contains("ComposerLookStripFilterRule.items(filter)"))
        XCTAssertTrue(bande.contains(".adaptiveOnChange(of: filter)"), "trier recentre la bande sans choisir")
        XCTAssertTrue(bande.contains("session.look = ComposerLookStripRule.look(of: item, combinedWith: base)"),
                      "la case du centre s'ajoute au look d'avant le défilement")
        XCTAssertFalse(bande.contains("ComposerLookStripRule.items(famille)"), "plus une famille à la fois")
    }

    func test_bottomRow_putsTheChipsRightUnderTheBand_inCaptureAndInRetouch() throws {
        let rangee = try Self.code("Meeshy/Features/Composer/ComposerCaptureBottomRow.swift")
        XCTAssertEqual(rangee.components(separatedBy: "lookChips\n").count - 1, 2, "sous la bande, à la prise et en retouche")
        XCTAssertTrue(rangee.contains("ComposerLookFilterChips(filter: lookFilter)"))
        XCTAssertEqual(rangee.components(separatedBy: "filter: lookFilter").count - 1, 3,
                       "la bande de la prise, celle de la retouche et les puces lisent le même tri")
        XCTAssertEqual(ComposerEditScene.familyRow,
                       max(ComposerEditScene.bandHeight + 2 * ComposerTriggerOutline.outset,
                           3 * MeeshyControlSize.tapTarget + 2 * MeeshySpacing.sm) + ComposerLookStripRule.chipsHeight)
    }

    func test_chips_reuseTheCallFrameMoodChip() throws {
        let puces = try Self.code("Meeshy/Features/Composer/ComposerLookFilterChips.swift")
        XCTAssertTrue(puces.contains("CallFrameMoodChip(title:"), "la puce de verre des cadres de l'appel, pas une copie")
        XCTAssertTrue(puces.contains("CallFrameCopy.moodName(mood)"), "les ambiances gardent leurs mots")
        XCTAssertEqual(ComposerLookStripRule.chipsHeight, 44, "une cible de 44 pt")
    }

    private static func code(_ relative: String) throws -> String {
        let racine = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
        return AppSourceGuard.stripComments(try String(
            contentsOf: racine.appendingPathComponent(relative), encoding: .utf8))
    }
}
