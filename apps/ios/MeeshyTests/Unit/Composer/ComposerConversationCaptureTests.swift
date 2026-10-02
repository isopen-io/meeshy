import XCTest
import MeeshySDK
@testable import Meeshy

/// **La caméra de la barre de composition ouvre le composer plein écran, viseur
/// ARMÉ** (#9123, demande porteur 2026-10-02) : la prise s'édite dans la scène,
/// puis « Terminé » la rend au message en attente.
///
/// L'armement à l'ouverture est une règle d'ORIGINE, distincte de #4851 : il
/// répond au geste explicite « caméra » de l'auteur, et aucune autre porte ne
/// le reçoit — « Ajouter une story » continue d'ouvrir la scène visible.
final class ComposerConversationCaptureTests: XCTestCase {

    private static let autresPortes: [ComposerOrigin] = [
        .storyTray, .feedComposer, .moodChip,
        .repost(ofPostId: "p", sourceFormat: .story),
        .edit(postId: "p", documentFormat: .story),
        .draft(id: "d"), .share,
        .conversationMedia(messageId: "m", attachmentId: "a"),
        .socialMedia(postId: "p", mediaId: "m"),
        .conversationDraftImage
    ]

    func test_profile_conversationCapture_opensTheSceneWithCaptureAndNoFormatChoice() {
        let profil = ComposerProfile.profile(for: .conversationCapture)
        XCTAssertEqual(profil.offeredFormats, [.story])
        XCTAssertEqual(profil.opensWith, .cameraReady)
        XCTAssertTrue(profil.allowsCapture)
        XCTAssertNil(profil.routesToLegacy)
        XCTAssertFalse(ComposerSurfaceRouting.focusesContentOnAppear(opening: profil.opensWith),
                       "Un viseur et un clavier ne s'ouvrent jamais ensemble.")
    }

    func test_armsViewfinderOnOpen_conversationCapture_returnsTrue() {
        XCTAssertTrue(ComposerConversationCapture.armsViewfinderOnOpen(origin: .conversationCapture))
    }

    func test_armsViewfinderOnOpen_everyOtherDoor_returnsFalse() {
        for origine in Self.autresPortes {
            XCTAssertFalse(ComposerConversationCapture.armsViewfinderOnOpen(origin: origine),
                           "\(origine) : le viseur ne s'arme plus au montage (#4851)")
        }
    }

    func test_opensOnPicker_conversationCapture_returnsFalse() {
        XCTAssertFalse(ComposerScenePicking.opensOnPicker(origin: .conversationCapture, compositionIsEmpty: true),
                       "La caméra promet un viseur, pas la photothèque.")
    }

    // MARK: - Ce que « Terminé » rend

    func test_returnAction_untouchedCapture_returnsTheCaptureItself() {
        XCTAssertEqual(ComposerReturnMedia.action(edited: false, returnsCapture: true,
                                                  sceneHoldsMedia: true, sceneHasVideo: false),
                       .returnCapture)
        XCTAssertEqual(ComposerReturnMedia.action(edited: false, returnsCapture: true,
                                                  sceneHoldsMedia: true, sceneHasVideo: true),
                       .returnCapture)
    }

    func test_returnAction_nothingTaken_dismisses() {
        XCTAssertEqual(ComposerReturnMedia.action(edited: false, returnsCapture: true,
                                                  sceneHoldsMedia: false, sceneHasVideo: false),
                       .dismiss)
    }

    func test_returnAction_untouchedRetouche_keepsTheOriginalByDismissing() {
        XCTAssertEqual(ComposerReturnMedia.action(edited: false, returnsCapture: false,
                                                  sceneHoldsMedia: true, sceneHasVideo: false),
                       .dismiss)
    }

    func test_returnAction_editedScene_rendersImageOrVideo() {
        XCTAssertEqual(ComposerReturnMedia.action(edited: true, returnsCapture: true,
                                                  sceneHoldsMedia: true, sceneHasVideo: false),
                       .renderImage)
        XCTAssertEqual(ComposerReturnMedia.action(edited: true, returnsCapture: false,
                                                  sceneHoldsMedia: true, sceneHasVideo: true),
                       .renderVideo)
    }

    func test_returnsUneditedCapture_onlyForTheCaptureDoor() {
        XCTAssertTrue(ComposerConversationCapture.returnsUneditedCapture(origin: .conversationCapture))
        for origine in Self.autresPortes {
            XCTAssertFalse(ComposerConversationCapture.returnsUneditedCapture(origin: origine), "\(origine)")
        }
    }

    // MARK: - Câblage

    func test_host_armsTheViewfinderThroughTheOriginRule() throws {
        let code = AppSourceGuard.stripComments(try AppSourceGuard.composerHostSource())
            .components(separatedBy: .whitespacesAndNewlines).joined()
        XCTAssertTrue(code.contains("ComposerConversationCapture.armsViewfinderOnOpen(origin:intent.origin)"),
                      "Le meuble arme le viseur par la règle d'origine, jamais par un littéral.")
        XCTAssertTrue(code.contains("returnSceneMedia()"), "« Terminé » rend un MÉDIA, image ou vidéo.")
    }

    func test_conversationCamera_opensTheSceneViewfinder_notTheOldCameraSheet() throws {
        let code = AppSourceGuard.stripComments(try AppSourceGuard.conversationViewSource())
        XCTAssertFalse(code.contains("CameraView {"),
                       "La caméra de la barre ouvrait l'ancienne CameraView : elle ouvre la scène (#9123).")
        XCTAssertTrue(code.contains("ConversationCaptureSceneEditor("),
                      "La caméra de la barre ouvre le composer, viseur armé.")
    }
}

/// **Une scène qui porte une vidéo repart en VIDÉO dans le message** (#9124) :
/// bakée par `StoryVideoExportService`, sans habillage de marque — elle ne
/// sort pas de Meeshy, elle part dans une conversation.
@MainActor
final class ComposerSceneBakeForMessageTests: XCTestCase {

    private func makeSUT(_ behavior: MockShareExporter.Behavior) -> (ComposerSceneExportController, MockShareExporter, MockFeedbackToast) {
        let exporter = MockShareExporter(behavior: behavior)
        let toasts = MockFeedbackToast()
        let sut = ComposerSceneExportController(exporter: exporter, photoSaver: StubPhotoSaver(),
                                                toasts: toasts, brandIntro: { nil })
        return (sut, exporter, toasts)
    }

    func test_bakeForMessage_success_handsTheBakedFileWithoutBranding() async throws {
        let (sut, exporter, _) = makeSUT(.success)
        var recu: URL?

        sut.bakeForMessage(slide: StorySlide(), inputs: .none) { recu = $0 }
        for _ in 0..<200 where recu == nil { try await Task.sleep(nanoseconds: 10_000_000) }

        XCTAssertEqual(recu, exporter.lastBakedURL)
        XCTAssertEqual(exporter.lastAppendsBrandOutro, false, "Un média de message ne porte pas la carte de fin.")
        XCTAssertNil(exporter.lastIntro)
        XCTAssertEqual(exporter.cleanupCallCount, 0, "Le fichier appartient désormais au message.")
        XCTAssertFalse(sut.isExporting)
    }

    func test_bakeForMessage_failure_toastsAndHandsNothing() async throws {
        let (sut, exporter, toasts) = makeSUT(.failure)
        var appels = 0

        sut.bakeForMessage(slide: StorySlide(), inputs: .none) { _ in appels += 1 }
        for _ in 0..<200 where sut.isExporting { try await Task.sleep(nanoseconds: 10_000_000) }

        XCTAssertEqual(exporter.prepareCallCount, 1)
        XCTAssertEqual(appels, 0)
        XCTAssertEqual(toasts.errorMessages.count, 1)
    }
}
