import Combine
import SwiftUI
import XCTest
import MeeshySDK
@testable import MeeshyUI

/// #20531 — la voix d'une personne vit autour du grand avatar de sa fiche : sa forme part du bord extérieur de ce que
/// l'avatar peint (contour, anneau de story ou visage nu), et sa légende ne fait descendre le nom que lorsqu'elle se pose.
@MainActor
final class ProfileHeroVoiceTests: XCTestCase {

    private func illustratedFrame() throws -> AvatarRingDesign {
        let pack = try XCTUnwrap(AvatarRingCatalog.shared.packs.first { $0.slug == "cadres-illustres" })
        return try XCTUnwrap(pack.rings.first { $0.key == "toile-araignee" })
    }

    /// Sous un cadre illustré, le visage est réduit (`contentScale < 1`) : la voix, posée HORS du cadre, part du bord
    /// de sa boîte et s'en écarte de 35 % du rayon de l'avatar, à l'écran, sur le grand comme sur le mini-avatar.
    func test_voiceHalo_illustratedFrame_onScreenBaseIsTheFrameEdge_andAmplitudeIs35PercentOfTheRadius() throws {
        let frame = try illustratedFrame()
        for (size, story) in [(CGFloat(112), CGFloat?(118)), (112, nil), (36, nil)] {
            let layout = AvatarRingLayout.make(frame, avatarSize: size, storyRingSize: story)
            XCTAssertLessThan(layout.contentScale, 1)
            let halo = ProfileHeroPlan.voiceHalo(avatarSize: size, ring: frame, storyRingSize: story)
            XCTAssertEqual(halo.baseRadius, layout.box / 2, accuracy: 0.0001, "\(size)")
            XCTAssertEqual(halo.maxAmplitude, 0.35 * size / 2, accuracy: 0.0001, "\(size)")
        }
    }

    func test_voiceHalo_withoutFrame_followsTheStoryRingOrTheFace() {
        XCTAssertEqual(ProfileHeroPlan.voiceHalo(avatarSize: 112, ring: nil, storyRingSize: 118).baseRadius, 59)
        XCTAssertEqual(ProfileHeroPlan.voiceHalo(avatarSize: 112, ring: nil, storyRingSize: nil).baseRadius, 56)
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

    /// Tant que la légende se pose, le nom descend de sa hauteur : la première carte de la fiche descend d'autant pour
    /// ne jamais passer sous lui. Sans légende, ce qui défile commence où il a toujours commencé.
    func test_contentTop_whileTheCaptionShows_descendsByTheCaption_andNotOtherwise() {
        XCTAssertEqual(ProfileHeroPlan.contentTop(voiceState: .silent), ProfileHeroPlan.contentTop)
        XCTAssertEqual(ProfileHeroPlan.contentTop(voiceState: .voice(captioned: false)), ProfileHeroPlan.contentTop)
        XCTAssertEqual(ProfileHeroPlan.contentTop(voiceState: .voice(captioned: true)),
                       ProfileHeroPlan.contentTop + ProfileHeroPlan.voiceCaptionHeight)
    }

    func test_heroScrollView_readsTheVoiceOnce_forTheHeroAndTheContentTop() throws {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent()
        let code = try String(contentsOf: root.appendingPathComponent(
            "Sources/MeeshyUI/Profile/UserProfileSheet+Header.swift"), encoding: .utf8)
        XCTAssertTrue(code.contains("ProfileHeroPlan.contentTop(voiceState: voiceState)"))
        XCTAssertFalse(code.contains("frame(height: CGFloat(ProfileHeroPlan.contentTop))"))
        XCTAssertEqual(code.components(separatedBy: "ProfileHeroVoiceReader(").count - 1, 1)
    }

    // MARK: - Lu depuis n'importe quel fil

    /// L'itérateur `.values` demande hors du fil principal, et une source `@Published` y rejoue sa valeur courante : un
    /// maillon de l'app isolé au MainActor y piégeait l'ouverture d'une fiche. La fiche s'abonne et lit sur le fil
    /// principal, quelle que soit la source.
    func test_liveStates_mainActorBoundSource_deliversWithoutTrapping() async {
        let source = CurrentValueSubject<Bool, Never>(true)
        let voice = ProfileHeroVoice(
            bubble: { _, _, _ in AnyView(EmptyView()) },
            caption: { _ in AnyView(EmptyView()) },
            states: { _ in
                source
                    .map { speaking -> ProfileHeroVoiceState in
                        MainActor.preconditionIsolated()
                        return speaking ? .voice(captioned: false) : .silent
                    }
                    .eraseToAnyPublisher()
            }
        )
        let states = OffMainVoiceStates(publisher: voice.liveStates("bob"))

        let first = await Task.detached { () -> ProfileHeroVoiceState? in
            for await value in states.publisher.values { return value }
            return nil
        }.value

        XCTAssertEqual(first, .voice(captioned: false))
    }
}

private struct OffMainVoiceStates: @unchecked Sendable {
    let publisher: AnyPublisher<ProfileHeroVoiceState, Never>
}
