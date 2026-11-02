import XCTest
@testable import Meeshy

/// LA MISE EN AVANT DES CADRES (#12683) — sept ambiances ouvertes d'office, chacune avec ses
/// vedettes ; « Plus d'ambiances » montre tout le catalogue, dans son ordre d'avant ; rien n'est retiré.
final class CallFrameSpotlightRuleTests: XCTestCase {
    private let all = CallFrameCatalogue.all
    private let spotlight = CallFrameCatalogue.spotlight

    private func moods(of chips: [CallMontageMoodChip]) -> [CallFrameMood] {
        chips.compactMap { chip in
            guard case .mood(let mood) = chip else { return nil }
            return mood
        }
    }

    // MARK: - Le catalogue livré

    func test_spotlight_opensSevenMoods_eachWithThreeToFiveFeaturedMotifsOfItsOwn() {
        XCTAssertEqual(spotlight.map(\.mood), [.signature, .jovial, .feerique, .futuriste, .horsNorme, .glauque, .morbide])
        spotlight.forEach { entry in
            XCTAssertTrue((3...5).contains(entry.featured.count), "\(entry.mood)")
            entry.featured.forEach { motif in
                XCTAssertTrue(all.contains { $0.motif == motif && $0.mood == entry.mood }, motif)
            }
        }
    }

    func test_newMotifs_prisonAndTombe_serveEveryGroupSize() {
        ["glauque.prison", "morbide.tombe"].forEach { motif in
            XCTAssertEqual(Set(all.filter { $0.motif == motif }.map(\.bucket)), Set(CallFrameBucket.allCases), motif)
        }
    }

    // MARK: - Les ambiances

    func test_moods_spotlight_followTheSpotlightOrder() {
        let shown = CallFrameSpotlightRule.moods(forPeople: 2, scope: .spotlight)
        XCTAssertEqual(shown, spotlight.map(\.mood).filter { CallFrameCatalogue.moods(forPeople: 2).contains($0) })
    }

    func test_moods_all_isTheCanonicalCatalogueOrder() {
        XCTAssertEqual(CallFrameSpotlightRule.moods(forPeople: 2, scope: .all), CallFrameCatalogue.moods(forPeople: 2))
    }

    func test_moods_spotlightWithoutAnyServedMood_fallsBackToTheCatalogue() {
        let corporateOnly = all.filter { $0.mood == .corporate }
        XCTAssertEqual(CallFrameSpotlightRule.moods(forPeople: 2, scope: .spotlight, in: corporateOnly), [.corporate])
    }

    // MARK: - Les cadres d'une ambiance

    func test_frames_spotlight_areTheFeaturedMotifsInTheirOrder() throws {
        let entry = try XCTUnwrap(spotlight.first { $0.mood == .jovial })
        let frames = CallFrameSpotlightRule.frames(forPeople: 2, mood: .jovial, scope: .spotlight)
        let expected = entry.featured.filter { motif in all.contains { $0.motif == motif && $0.serves(people: 2) } }
        XCTAssertEqual(frames.map(\.motif), expected)
    }

    func test_frames_all_isEveryFrameOfTheMoodInCatalogueOrder() {
        let frames = CallFrameSpotlightRule.frames(forPeople: 2, mood: .jovial, scope: .all)
        XCTAssertEqual(frames, CallFrameCatalogue.frames(forPeople: 2, mood: .jovial))
    }

    func test_frames_spotlightWithoutAFeaturedFrameForN_showsTheWholeMood() {
        let spotlight = [CallFrameSpotlight(mood: .jovial, featured: ["jovial.absent"])]
        let frames = CallFrameSpotlightRule.frames(forPeople: 2, mood: .jovial, scope: .spotlight, spotlight: spotlight)
        XCTAssertEqual(frames, CallFrameCatalogue.frames(forPeople: 2, mood: .jovial))
    }

    // MARK: - La portée montrée

    func test_scope_featuredChoice_keepsTheSpotlight() throws {
        let featured = try XCTUnwrap(CallFrameSpotlightRule.frames(forPeople: 2, mood: .jovial, scope: .spotlight).first)
        XCTAssertEqual(CallFrameSpotlightRule.scope(showing: featured.id, people: 2, requested: .spotlight), .spotlight)
    }

    func test_scope_choiceOutsideTheSpotlight_opensTheCatalogue() throws {
        let hidden = try XCTUnwrap(CallFrameCatalogue.frames(forPeople: 2, mood: .corporate).first)
        XCTAssertEqual(CallFrameSpotlightRule.scope(showing: hidden.id, people: 2, requested: .spotlight), .all)
    }

    func test_scope_requestedAll_staysAll() throws {
        let featured = try XCTUnwrap(CallFrameSpotlightRule.frames(forPeople: 2, mood: .jovial, scope: .spotlight).first)
        XCTAssertEqual(CallFrameSpotlightRule.scope(showing: featured.id, people: 2, requested: .all), .all)
    }

    func test_hidesFrames_trueWhileTheSpotlightLeavesFramesBehind() {
        XCTAssertTrue(CallFrameSpotlightRule.hidesFrames(forPeople: 2))
        XCTAssertFalse(CallFrameSpotlightRule.hidesFrames(forPeople: 2, spotlight: []))
    }

    // MARK: - Le Montage

    func test_montageChips_spotlight_classicsThenTheOpenedMoods() {
        let chips = CallMontageFrameRule.chips(forPeople: 2, scope: .spotlight)
        XCTAssertEqual(chips.first, .classics)
        XCTAssertEqual(moods(of: chips), CallFrameSpotlightRule.moods(forPeople: 2, scope: .spotlight))
    }

    func test_montageChips_defaultScope_isUnchanged() {
        XCTAssertEqual(moods(of: CallMontageFrameRule.chips(forPeople: 2)), CallFrameCatalogue.moods(forPeople: 2))
    }

    func test_montageEntering_spotlightMood_landsOnItsFirstFeaturedFrame() throws {
        let first = try XCTUnwrap(CallFrameSpotlightRule.frames(forPeople: 2, mood: .morbide, scope: .spotlight).first)
        XCTAssertEqual(CallMontageFrameRule.entering(.mood(.morbide), people: 2, remembered: nil, scope: .spotlight), .frame(first.id))
    }
}
