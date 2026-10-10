import XCTest
@testable import Meeshy

/// LA NAVIGATION DU MONTAGE (#8742, spec § 2 et § 3) — « Classiques » d'abord, puis les seules
/// ambiances qui servent `n` ; le carrousel d'une puce ; et, quand `n` change, le même motif dans
/// la nouvelle tranche, sinon l'ambiance, sinon le premier classique.
final class CallMontageFrameRuleTests: XCTestCase {
    private let all = CallFrameCatalogue.all

    private func motifServingDuoAndComite() throws -> (duo: CallFrameDesign, comite: CallFrameDesign) {
        for duo in all where duo.bucket == .duo {
            if let comite = all.first(where: { $0.motif == duo.motif && $0.bucket == .comite }) {
                return (duo, comite)
            }
        }
        throw XCTSkip("Aucun motif du catalogue ne sert à la fois le duo et le petit comité")
    }

    private var duoOnly: [CallFrameDesign] {
        all.filter { $0.bucket == .duo }
    }

    // MARK: - Les puces

    func test_chips_duo_startWithClassicsThenEveryMoodServingTwo() {
        let chips = CallMontageFrameRule.chips(forPeople: 2)
        XCTAssertEqual(chips.first, .classics)
        XCTAssertEqual(Array(chips.dropFirst()), CallFrameCatalogue.moods(forPeople: 2).map { CallMontageMoodChip.mood($0) })
    }

    func test_chips_moodWithoutFrameForN_isHidden() {
        let chips = CallMontageFrameRule.chips(forPeople: 3, in: duoOnly)
        XCTAssertEqual(chips, [.classics])
    }

    func test_chips_alone_onlyClassics() {
        XCTAssertEqual(CallMontageFrameRule.chips(forPeople: 1), [.classics])
    }

    func test_chips_followTheCanonicalMoodOrder() {
        let moods = CallMontageFrameRule.chips(forPeople: 4).compactMap { chip -> CallFrameMood? in
            guard case .mood(let mood) = chip else { return nil }
            return mood
        }
        let order = CallFrameMood.allCases.filter { moods.contains($0) }
        XCTAssertEqual(moods, order)
    }

    // MARK: - Le carrousel d'une puce

    func test_items_classics_areTheThirteenMontages() {
        let items = CallMontageFrameRule.items(for: .classics, people: 4)
        XCTAssertEqual(items, CallMontageStyle.allCases.map { CallMontageChoice.classic($0) })
    }

    func test_items_mood_onlyFramesOfThatMoodServingN() throws {
        let mood = try XCTUnwrap(CallFrameCatalogue.moods(forPeople: 5).first)
        let items = CallMontageFrameRule.items(for: .mood(mood), people: 5)
        XCTAssertFalse(items.isEmpty)
        try items.forEach { item in
            guard case .frame(let id) = item else { return XCTFail("un classique dans une ambiance") }
            let design = try XCTUnwrap(CallMontageFrameRule.design(id: id))
            XCTAssertEqual(design.mood, mood)
            XCTAssertTrue(design.serves(people: 5), id)
        }
    }

    func test_chip_ofAFrame_isItsMood_ofAnUnknownFrame_isClassics() throws {
        let frame = try XCTUnwrap(all.first)
        XCTAssertEqual(CallMontageFrameRule.chip(of: .frame(frame.id)), .mood(frame.mood))
        XCTAssertEqual(CallMontageFrameRule.chip(of: .frame("inconnu.motif.duo")), .classics)
        XCTAssertEqual(CallMontageFrameRule.chip(of: .classic(.heart)), .classics)
    }

    // MARK: - n change

    func test_reconcile_classic_isUnchanged() {
        XCTAssertEqual(CallMontageFrameRule.reconcile(.classic(.polaroid), people: 6), .classic(.polaroid))
    }

    func test_reconcile_frameStillServing_isUnchanged() throws {
        let frame = try XCTUnwrap(all.first { $0.serves(people: 4) })
        XCTAssertEqual(CallMontageFrameRule.reconcile(.frame(frame.id), people: 4), .frame(frame.id))
    }

    func test_reconcile_newBucket_sameMotifVariant() throws {
        let pair = try motifServingDuoAndComite()
        XCTAssertEqual(CallMontageFrameRule.reconcile(.frame(pair.duo.id), people: 3), .frame(pair.comite.id))
    }

    func test_reconcile_motifWithoutVariant_firstFrameOfTheSameMood() throws {
        let duo = try XCTUnwrap(all.first { $0.bucket == .duo })
        let sibling = try XCTUnwrap(all.first { $0.mood == duo.mood && $0.bucket == .comite && $0.motif != duo.motif })
        let frames = [duo, sibling]
        XCTAssertEqual(CallMontageFrameRule.reconcile(.frame(duo.id), people: 3, in: frames), .frame(sibling.id))
    }

    func test_reconcile_noFrameForN_fallsBackToTheFirstClassic() throws {
        let duo = try XCTUnwrap(duoOnly.first)
        XCTAssertEqual(CallMontageFrameRule.reconcile(.frame(duo.id), people: 3, in: duoOnly), .classic(.screen))
        XCTAssertEqual(CallMontageFrameRule.fallback, .classic(CallMontageStyle.allCases[0]))
    }

    func test_reconcile_alone_fallsBackToClassics() throws {
        let duo = try XCTUnwrap(duoOnly.first)
        XCTAssertEqual(CallMontageFrameRule.reconcile(.frame(duo.id), people: 1), .classic(.screen))
    }

    // MARK: - Toucher une puce

    func test_entering_mood_withoutMemory_selectsItsFirstFrame() throws {
        let mood = try XCTUnwrap(CallFrameCatalogue.moods(forPeople: 2).first)
        let first = try XCTUnwrap(CallMontageFrameRule.items(for: .mood(mood), people: 2).first)
        XCTAssertEqual(CallMontageFrameRule.entering(.mood(mood), people: 2, remembered: nil), first)
    }

    func test_entering_mood_remembersTheLastChoiceStillServingN() throws {
        let mood = try XCTUnwrap(CallFrameCatalogue.moods(forPeople: 2).first)
        let last = try XCTUnwrap(CallMontageFrameRule.items(for: .mood(mood), people: 2).last)
        XCTAssertEqual(CallMontageFrameRule.entering(.mood(mood), people: 2, remembered: last), last)
    }

    func test_entering_mood_rememberedChoiceNoLongerServing_selectsTheFirstFrame() throws {
        let pair = try motifServingDuoAndComite()
        let first = try XCTUnwrap(CallMontageFrameRule.items(for: .mood(pair.duo.mood), people: 3).first)
        XCTAssertEqual(CallMontageFrameRule.entering(.mood(pair.duo.mood), people: 3, remembered: .frame(pair.duo.id)), first)
    }

    func test_entering_classics_returnsToTheRememberedClassic() {
        XCTAssertEqual(CallMontageFrameRule.entering(.classics, people: 3, remembered: .classic(.film)), .classic(.film))
        XCTAssertEqual(CallMontageFrameRule.entering(.classics, people: 3, remembered: nil), .classic(.screen))
    }
}
