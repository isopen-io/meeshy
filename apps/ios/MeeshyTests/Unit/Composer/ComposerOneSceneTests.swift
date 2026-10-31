import XCTest
import MeeshySDK
@testable import Meeshy

/// #13864 (I1) — la story, le post et le réel se composent dans la MÊME vue, la
/// scène, quelle que soit la porte ; le chevron de « Publier » est le seul état
/// de format ; un post sans scène part avec la charge d'avant.
@MainActor
final class ComposerOneSceneTests: XCTestCase {

    private let sceneFormats: [ComposerFormat] = [.story, .post, .reel]

    /// Les portes qui composent (l'humeur garde sa surface, la modification d'une
    /// story et la citation restent hors de ce lot).
    private let composingDoors: [ComposerOrigin] = [
        .storyTray, .feedComposer, .share,
        .conversationMedia(messageId: "m1", attachmentId: nil),
        .repost(ofPostId: "p1", sourceFormat: .story),
    ]

    private func mounted(_ origin: ComposerOrigin, _ format: ComposerFormat) -> ComposerMountedView {
        let profil = ComposerProfile.profile(for: origin, compositionQualifiesAsReel: true)
        return ComposerMountedView.mounted(
            surface: ComposerSurfaceRouting.surface(opening: profil.opensWith, format: format))
    }

    // MARK: - R1 : une seule vue

    func test_mounted_emptyPostFromTheFeedDoor_isTheScene() {
        XCTAssertEqual(mounted(.feedComposer, .post), .scene,
                       "un post vide ouvert depuis le fil se compose sur la scène, plus sur le document")
    }

    func test_mounted_everyComposingDoorAndSceneFormat_isTheScene() {
        for porte in composingDoors {
            for format in sceneFormats {
                XCTAssertEqual(mounted(porte, format), .scene, "\(porte) en \(format)")
            }
        }
    }

    func test_mounted_switchingStoryPostReel_keepsTheSameView() {
        for porte in composingDoors {
            let vues = Set(sceneFormats.map { String(describing: mounted(porte, $0)) })
            XCTAssertEqual(vues.count, 1, "changer de format sous \(porte) change de vue : \(vues)")
        }
    }

    func test_mounted_moodDoor_keepsItsOwnSurface() {
        XCTAssertEqual(mounted(.moodChip, .status), .mood)
    }

    func test_shareDoor_opensLikeASeededDoor_notTheAtelier() {
        XCTAssertEqual(ComposerProfile.profile(for: .share).opensWith, .mediaSeeded)
    }

    // MARK: - R2 : la table unique des variantes

    func test_variant_sceneFormats_composeOnTheScene_moodDoesNot() {
        XCTAssertTrue(sceneFormats.allSatisfy { ComposerFormatVariant.of($0).composesOnScene })
        XCTAssertFalse(ComposerFormatVariant.of(.status).composesOnScene)
    }

    func test_variant_postAndReel_writeThePostText_storyDoesNot() {
        XCTAssertTrue(ComposerFormatVariant.of(.post).writesPostText)
        XCTAssertTrue(ComposerFormatVariant.of(.reel).writesPostText)
        XCTAssertFalse(ComposerFormatVariant.of(.story).writesPostText)
        XCTAssertFalse(ComposerFormatVariant.of(.status).writesPostText)
    }

    func test_variant_publishTitle_namesTheFormat() {
        XCTAssertEqual(ComposerFormatVariant.of(.story).publishTitle(), ComposerPublishMenuCopy.publishTitle(.story))
        XCTAssertEqual(ComposerFormatVariant.of(.post).publishTitle(), ComposerPublishMenuCopy.publishTitle(.post))
        XCTAssertEqual(ComposerFormatVariant.of(.reel).publishTitle(), ComposerPublishMenuCopy.publishTitle(.reel))
        XCTAssertNotNil(ComposerFormatVariant.of(.post).publishTitle())
        XCTAssertNotEqual(ComposerFormatVariant.of(.story).publishTitle(alsoAsReel: true),
                          ComposerFormatVariant.of(.story).publishTitle())
    }

    func test_variant_layouts_onlyForAPostOfTwoScenesOrMore() {
        XCTAssertTrue(ComposerFormatVariant.of(.post).offersLayouts(sceneCount: 2))
        XCTAssertFalse(ComposerFormatVariant.of(.post).offersLayouts(sceneCount: 1))
        XCTAssertFalse(ComposerFormatVariant.of(.story).offersLayouts(sceneCount: 3))
        XCTAssertFalse(ComposerFormatVariant.of(.reel).offersLayouts(sceneCount: 3))
    }

    func test_railDoors_postTextIsOfferedInPostAndReel_mentionPlaceHashtagNeverMove() {
        let enPost = ComposerRailDoor.offered(served: ComposerSceneCapabilities.doors, format: .post, allowsCapture: true)
        let enReel = ComposerRailDoor.offered(served: ComposerSceneCapabilities.doors, format: .reel, allowsCapture: true)
        let enStory = ComposerRailDoor.offered(served: ComposerSceneCapabilities.doors, format: .story, allowsCapture: true)
        XCTAssertTrue(enPost.contains(.content))
        XCTAssertTrue(enReel.contains(.content))
        XCTAssertFalse(enStory.contains(.content))
        let publication: [ComposerRailDoor] = [.mention, .hashtag, .place]
        XCTAssertEqual(enPost.filter(publication.contains), enStory.filter(publication.contains))
        XCTAssertEqual(enReel.filter(publication.contains), enStory.filter(publication.contains))
    }

    func test_publishMenu_layouts_followTheVariantTable() {
        let menu = ComposerPublishMenuRule.entries(candidates: [.post, .story, .reel], offered: [.post, .story, .reel],
                                                   carriesMoreThanText: true, slideCount: 3, layoutsTravel: true)
        XCTAssertFalse(menu.first { $0.format == .post }?.layouts.isEmpty ?? true)
        XCTAssertTrue(menu.first { $0.format == .story }?.layouts.isEmpty ?? false)
        XCTAssertTrue(menu.first { $0.format == .reel }?.layouts.isEmpty ?? false)
    }

    // MARK: - R1 : un seul état de format

    func test_formatState_choosingAtTheChevron_writesTheFormat() {
        let etat = ComposerFormatState.opening(.post)
            .choosing(ComposerPublishChoice(format: .story, layout: nil))
        XCTAssertEqual(etat.format, .story)
        XCTAssertEqual(etat.selectedFormat(offered: [.post, .story]), .story,
                       "choisir « Story » au chevron change le format qui gouverne la vue, les rails et la garde")
    }

    func test_formatState_choosingALayout_keepsItWithThePost() {
        let etat = ComposerFormatState.opening(.story)
            .choosing(ComposerPublishChoice(format: .post, layout: .hero))
        XCTAssertEqual(etat.choice, ComposerPublishChoice(format: .post, layout: .hero))
    }

    func test_formatState_formatNoLongerOffered_fallsBackToTheDoorsFirstFormat() {
        let etat = ComposerFormatState.opening(.post).choosing(ComposerPublishChoice(format: .reel, layout: nil))
        XCTAssertEqual(etat.selectedFormat(offered: [.post, .story]), .post)
    }

    func test_formatState_armedChoice_alwaysPublishesTheFormatThatGoverns() {
        let offres: [[ComposerFormat]] = [[.post, .story], [.post, .story, .reel], [.story, .post], [.post]]
        let choix: [ComposerPublishChoice] = [
            .init(format: .post, layout: nil), .init(format: .post, layout: .wave),
            .init(format: .story, layout: nil), .init(format: .story, layout: nil, alsoAsReel: true),
            .init(format: .reel, layout: nil),
        ]
        for offert in offres {
            for scenes in [1, 3] {
                let menu = ComposerPublishMenuRule.menu(candidates: [.post, .story, .reel], offered: offert,
                                                        carriesMoreThanText: true, slideCount: scenes,
                                                        layoutsTravel: true)
                for c in choix {
                    let etat = ComposerFormatState.opening(offert[0]).choosing(c)
                    let arme = etat.armedChoice(offered: offert, entries: menu, companionReelOffered: true)
                    XCTAssertEqual(arme.format, etat.selectedFormat(offered: offert),
                                   "\(c) sous \(offert), \(scenes) scènes : « Publier » et la vue divergent")
                }
            }
        }
    }

    func test_reelAutoSwitch_armReel_writesTheFormat_disarm_returnsToTheDoor() {
        let arme = ComposerReelAutoSwitch.applying(.armReel, to: .init(), format: .opening(.post), door: .post)
        XCTAssertEqual(arme.format.format, .reel)
        XCTAssertEqual(arme.state, .init(authorChose: false, autoArmed: true))
        let rendu = ComposerReelAutoSwitch.applying(.disarm, to: arme.state, format: arme.format, door: .post)
        XCTAssertEqual(rendu.format, .opening(.post))
        XCTAssertEqual(rendu.state, .init())
    }

    // MARK: - R3 : la charge d'un post texte seul ne change pas

    func test_publishesScene_textOnlyPost_carriesNoScene() {
        XCTAssertFalse(ComposerStoryCanvas.publishesScene(format: .post, documentHasScene: false))
        XCTAssertFalse(ComposerStoryCanvas.publishesScene(format: .reel, documentHasScene: false))
        XCTAssertTrue(ComposerStoryCanvas.publishesScene(format: .post, documentHasScene: true))
        XCTAssertTrue(ComposerStoryCanvas.publishesScene(format: .story, documentHasScene: false))
    }

    func test_draft_textOnlyPostComposedOnTheScene_isTheTextPostOfBefore() {
        let slides = [StorySlide(order: 0)]
        let effets = ComposerStoryCanvas.publishedSlide(
            format: .post,
            sceneIsPresent: ComposerStoryCanvas.publishesScene(format: .post, documentHasScene: false),
            slides: slides)
        XCTAssertNil(effets)
        XCTAssertEqual(textDraft(storyEffects: effets), textDraft(storyEffects: nil))
    }

    func test_draft_postWithAScene_carriesTheExistingScenePayload() {
        var slide = StorySlide(order: 0)
        slide.effects.background = "#123456"
        let effets = ComposerStoryCanvas.publishedSlide(
            format: .post,
            sceneIsPresent: ComposerStoryCanvas.publishesScene(format: .post, documentHasScene: true),
            slides: [slide])
        XCTAssertEqual(effets?.background, "#123456")
    }

    // MARK: - Un ancien brouillon du document se rouvre dans la scène

    func test_reopen_documentEraTextDraft_opensOnTheSceneWithItsText() throws {
        let etat = ComposerAutosaveState(
            format: .post, text: "Mon post d'avant", background: nil,
            visibility: PostVisibility.public.rawValue, visibilityUserIds: [], language: "fr", location: nil,
            references: [], editingPostId: nil, slides: [StorySlide(id: "s1")], currentSlideIndex: 0,
            porters: .empty, images: [:], slideImages: [:], videos: [:], audios: [:], stickerAnimations: [:])
        let relu = try XCTUnwrap(ComposerAutosaveCodec.state(from: ComposerAutosaveRestored(
            snapshot: ComposerAutosaveCodec.write(from: etat).snapshot,
            urlByFile: [:], bitmapByFile: [:], blobByFile: [:])))

        XCTAssertEqual(relu.text, "Mon post d'avant")
        XCTAssertEqual(mounted(.feedComposer, relu.format), .scene)
        XCTAssertFalse(ComposerStoryCanvas.publishesScene(
            format: relu.format,
            documentHasScene: ComposerScenePresence.hasScene(backgroundHex: relu.background,
                                                             foundedSlides: relu.porters.slideIdByMediaURL.count,
                                                             sceneObjectCount: 0)),
                       "rouvert dans la scène, il repart comme le post texte qu'il était")
    }

    private func textDraft(storyEffects: StoryEffects?) -> ComposerDocumentDraft {
        ComposerDocumentDraft.document(
            format: .post, forcePlainPost: true, text: "Bonjour", visibility: .public,
            visibilityUserIds: [], repostOfId: nil, localMedia: [], location: nil,
            discoverabilityPrecision: nil, originalLanguage: "fr", mobileTranscription: nil, references: [],
            storyEffects: storyEffects, mediaCaptions: [:], mediaAlts: [:], mediaObjectIds: [:],
            allowSoundExtraction: nil)
    }
}
