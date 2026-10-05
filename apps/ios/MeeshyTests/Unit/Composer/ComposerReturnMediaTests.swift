import XCTest
import MeeshySDK
@testable import Meeshy

/// **Ce que « Terminé » rend au message** (#8416, #9124) — et la caméra de la
/// barre, qui prend en plein écran, hors scène (#9295). Son ancienne porte du
/// composer, viseur armé à l'ouverture (#9123), a été retirée (#9298).
final class ComposerReturnMediaTests: XCTestCase {

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

    func test_returnsUntouchedMedia_everyOtherDoor_returnsFalse() {
        let portes: [ComposerOrigin] = [
            .storyTray, .feedComposer, .moodChip,
            .repost(ofPostId: "p", sourceFormat: .story),
            .edit(postId: "p", documentFormat: .story),
            .draft(id: "d"), .share,
            .conversationMedia(messageId: "m", attachmentId: "a"),
            .socialMedia(postId: "p", mediaId: "m")
        ]
        for origine in portes {
            XCTAssertFalse(ComposerReturnMedia.returnsUntouchedMedia(origin: origine), "\(origine)")
        }
    }

    /// Un média rendu au message ne reprend NI n'écrase le brouillon de
    /// création : la caméra de la barre ouvrait la story autosauvegardée.
    func test_autosaveOpening_returnsToConversation_isDisabled() {
        XCTAssertEqual(ComposerAutosaveOpening.decide(opensOnAtelier: false, isHydrated: false,
                                                      resumesDraft: false, isSeeded: false,
                                                      opensOnMood: false, returnsToConversation: true),
                       .disabled)
        XCTAssertEqual(ComposerAutosaveOpening.decide(opensOnAtelier: false, isHydrated: false,
                                                      resumesDraft: false, isSeeded: true,
                                                      opensOnMood: false, returnsToConversation: true),
                       .disabled)
    }

    /// **Une pièce NON encore en attente** (« Éditer » de la bande des médias
    /// récents, #9124) repart telle quelle si l'auteur n'y touche pas : sans
    /// cela, « Terminé » refermait sans rien poser dans le message.
    func test_returnsUntouchedMedia_unstagedDraftMedia_returnsTrue() {
        XCTAssertTrue(ComposerReturnMedia.returnsUntouchedMedia(origin: .conversationDraftMedia(staged: false)))
        XCTAssertFalse(ComposerReturnMedia.returnsUntouchedMedia(origin: .conversationDraftMedia(staged: true)))
    }

    // MARK: - Câblage

    func test_host_returnsTheSceneMediaThroughTheReturnRule() throws {
        let code = AppSourceGuard.stripComments(try AppSourceGuard.composerHostSource())
            .components(separatedBy: .whitespacesAndNewlines).joined()
        XCTAssertTrue(code.contains("ComposerReturnMedia.returnsUntouchedMedia(origin:intent.origin)"),
                      "Le meuble lit la règle d'origine, jamais un littéral.")
        XCTAssertTrue(code.contains("returnSceneMedia()"), "« Terminé » rend un MÉDIA, image ou vidéo.")
        XCTAssertTrue(code.contains("returnsToConversation:returnsToConversation"),
                      "Le brouillon de création reste hors de la retouche.")
    }

    /// **#9295 (directive porteur 2026-10-04) — la caméra de la barre prend en
    /// PLEIN ÉCRAN, hors scène.** Elle ouvre le viseur du composeur servi seul,
    /// jamais l'ancienne `CameraView`, jamais le composer viseur armé (#9123).
    func test_conversationCamera_opensTheFullScreenViewfinder_notTheScene() throws {
        let code = AppSourceGuard.stripComments(try AppSourceGuard.conversationViewSource())
        XCTAssertFalse(code.contains("CameraView {"),
                       "La caméra de la barre ouvrait l'ancienne CameraView.")
        XCTAssertFalse(code.contains("ConversationCaptureSceneEditor("),
                       "La prise ne passe plus par la scène (#9295).")
        XCTAssertTrue(code.contains("ComposerViewfinder {"),
                      "La caméra de la barre ouvre le viseur plein écran.")
        XCTAssertTrue(code.contains("stageSceneMedia(ComposerReturnedMedia(capture: result))"),
                      "La prise rejoint le message par le chemin de pose d'une scène terminée.")
    }

    @MainActor
    func test_returnedMedia_fromAPhotoCapture_isTheImage() {
        let image = UIImage()
        guard case .image(let rendue) = ComposerReturnedMedia(capture: .photo(image, data: Data([0xFF]))) else {
            return XCTFail("une photo se pose en image")
        }
        XCTAssertTrue(rendue === image)
    }

    @MainActor
    func test_returnedMedia_fromAVideoCapture_isTheSameFile() {
        let url = URL(fileURLWithPath: "/tmp/prise.mov")
        guard case .video(let rendu) = ComposerReturnedMedia(capture: .video(url)) else {
            return XCTFail("une vidéo se pose en vidéo")
        }
        XCTAssertEqual(rendu, url)
    }

    /// **Une vidéo prise ou jointe s'édite dans la SCÈNE** (#9124) : plus
    /// aucune couverture `MeeshyVideoEditorView` dans la conversation.
    func test_conversationVideos_openTheScene_notTheOldVideoEditor() throws {
        let code = AppSourceGuard.stripComments(try AppSourceGuard.conversationViewSource())
        XCTAssertFalse(code.contains("MeeshyVideoEditorView("),
                       "La vidéo en attente et la vidéo récente s'éditent dans la scène (#9124).")
        XCTAssertEqual(code.components(separatedBy: "ConversationVideoSceneEditor(").count - 1, 1,
                       "La vidéo RÉCENTE ouvre la scène.")
        XCTAssertTrue(code.contains("ConversationRetouchSeriesEditor("),
                      "La vidéo EN ATTENTE ouvre toutes les pièces du message en scènes (#9126).")
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
