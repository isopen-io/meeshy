import XCTest
@testable import Meeshy
import MeeshySDK
import MeeshyUI

/// La carte de Mee et Meo (#9379) : elle reçoit tout de la loi, et ses figures sont
/// les VRAIS films du pack de stickers — un identifiant absent du catalogue ferait une carte muette.
@MainActor
final class GameGuideCardTests: XCTestCase {

    func test_everyFilmTheCardMayShow_existsInTheStickerCatalog() {
        for speaker in GuideSpeaker.allCases {
            for mood in GuideMood.allCases {
                let figures = GameGuideCard.figures(speaker: speaker, mood: mood)
                for id in [figures.meeFilmID, figures.meoFilmID].compactMap({ $0 }) {
                    XCTAssertNotNil(MeeStickerCatalog.sticker(forTemplateID: MeeStickerCatalog.templatePrefix + id), "\(speaker)/\(mood) : \(id) absent du catalogue")
                }
            }
        }
    }

    func test_aSingleSpeakerShowsOneFigure_theDuoShowsBoth() {
        let mee = GameGuideCard.figures(speaker: .mee, mood: .guide)
        let meo = GameGuideCard.figures(speaker: .meo, mood: .guide)
        let duo = GameGuideCard.figures(speaker: .duo, mood: .proud)
        XCTAssertNotNil(mee.meeFilmID); XCTAssertNil(mee.meoFilmID)
        XCTAssertNil(meo.meeFilmID); XCTAssertNotNil(meo.meoFilmID)
        XCTAssertNotNil(duo.meeFilmID); XCTAssertNotNil(duo.meoFilmID)
    }

    func test_aStepCard_isFull_carriesItsPositionAndTheOnboardingKey() {
        let step = GameGuide.onboardingSteps[2]
        let card = GameGuideCard.ofStep(step)
        XCTAssertEqual(card.key, "onboarding.levels")
        XCTAssertEqual(card.step, GuideCard.Step(index: 3, total: 7))
        XCTAssertEqual(card.presentation, .full)
        XCTAssertFalse(card.photo)
    }

    func test_aMomentCard_carriesTheLawsSpeakerAndPresentation() {
        let moment = GameGuide.moment(for: .newRank(rank: .voix, division: .ii, glory: 1700, gloryMissing: 466), seen: ["new-rank"])
        let card = GameGuideCard.ofMoment(moment)
        XCTAssertEqual(card.key, "new-rank")
        XCTAssertEqual(card.speaker, .duo)
        XCTAssertEqual(card.presentation, .short, "déjà vu : une ligne")
        XCTAssertNil(card.step)
    }

    func test_onlyTheGrandMomentsOfferAPhoto() {
        XCTAssertEqual(GameGuideCard.photoMoments, [.newRank, .newTier, .level100, .firstMint, .treasuryTier])
        XCTAssertTrue(GameGuideCard.ofMoment(GameGuide.moment(for: .newRank(rank: .echo, division: .iii, glory: 500, gloryMissing: 10), seen: [])).photo)
        XCTAssertFalse(GameGuideCard.ofMoment(GameGuide.moment(for: .priceRises(nextPrice: 1294), seen: [])).photo)
    }
}
