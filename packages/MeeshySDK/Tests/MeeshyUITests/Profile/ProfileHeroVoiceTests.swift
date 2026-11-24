import XCTest
@testable import MeeshyUI

/// #20531 — la voix d'une personne vit autour du grand avatar de sa fiche : sa forme part du bord extérieur de ce que
/// l'avatar peint (contour, anneau de story ou visage nu), et sa légende ne fait descendre le nom que lorsqu'elle se pose.
@MainActor
final class ProfileHeroVoiceTests: XCTestCase {

    func test_voiceOuterRadius_bareAvatar_isItsRadius() {
        XCTAssertEqual(ProfileHeroPlan.voiceOuterRadius(avatarSize: 112, hasRing: false, storyRingSize: nil), 56)
    }

    func test_voiceOuterRadius_storyRing_isTheRingsRadius() {
        XCTAssertEqual(ProfileHeroPlan.voiceOuterRadius(avatarSize: 112, hasRing: false, storyRingSize: 118), 59)
    }

    func test_voiceOuterRadius_decoratedAvatar_isTheDecoratedBoxEdge_seenFromTheScaledFace() {
        let decorated = AvatarRingGeometry.decoratedSide(avatarSize: 112) / 2
        XCTAssertEqual(ProfileHeroPlan.voiceOuterRadius(avatarSize: 112, hasRing: true, storyRingSize: nil),
                       decorated, accuracy: 0.0001)
        let scale = AvatarRingGeometry.avatarScale(avatarSize: 112, storyRingSize: 118)
        XCTAssertEqual(ProfileHeroPlan.voiceOuterRadius(avatarSize: 112, hasRing: true, storyRingSize: 118) * scale,
                       decorated, accuracy: 0.0001)
    }

    func test_voiceAmplitude_is35PercentOfTheAvatarRadius_onTheHeroAndTheMiniAvatar() {
        XCTAssertEqual(ProfileHeroPlan.voiceAmplitude(avatarSize: 112), 19.6, accuracy: 0.0001)
        XCTAssertEqual(ProfileHeroPlan.voiceAmplitude(avatarSize: 36), 6.3, accuracy: 0.0001)
    }

    func test_titleDrop_onlyWhileTheCaptionShows() {
        XCTAssertEqual(ProfileHeroPlan.voiceTitleDrop(.silent), 0)
        XCTAssertEqual(ProfileHeroPlan.voiceTitleDrop(.voice(captioned: false)), 0)
        XCTAssertEqual(ProfileHeroPlan.voiceTitleDrop(.voice(captioned: true)), ProfileHeroPlan.voiceCaptionHeight)
    }

    func test_state_activeAndCaptioned() {
        XCTAssertFalse(ProfileHeroVoiceState.silent.isActive)
        XCTAssertTrue(ProfileHeroVoiceState.voice(captioned: false).isActive)
        XCTAssertFalse(ProfileHeroVoiceState.voice(captioned: false).showsCaption)
        XCTAssertTrue(ProfileHeroVoiceState.voice(captioned: true).showsCaption)
    }

    func test_titleGap_withACaption_descendsByTheCaption() {
        XCTAssertEqual(MeeshyCollapsingHeroRecipe.titleGap(avatarSpill: 0, avatarCaption: 22),
                       MeeshyCollapsingHeroRecipe.titleGap(avatarSpill: 0) + 22)
        XCTAssertEqual(MeeshyCollapsingHeroRecipe.titleGap(avatarSpill: 0, avatarCaption: 0),
                       MeeshyCollapsingHeroRecipe.titleGap(avatarSpill: 0))
    }
}
