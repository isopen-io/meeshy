import XCTest
import MeeshySDK
@testable import Meeshy

/// **Ce que la retouche et le viseur rendent au message** (#9124, #9295) : la
/// caméra de la barre prend en plein écran, hors scène, et sa prise rejoint le
/// message comme un média retouché. Le chemin de retour du composer a quitté
/// le dépôt (#11171).
final class ComposerReturnMediaTests: XCTestCase {

    // MARK: - La prise de la caméra se déclare capturée (#9775)

    func test_promoted_capture_declaresCapturedInApp() {
        let prete = MessageAttachment(id: "prise", mimeType: "image/jpeg")

        let posee = PreparationTracking.promoted(prete, capturedInApp: true)

        XCTAssertTrue(posee.capturedInApp, "Une prise de la caméra de la barre part déclarée capturée.")
        XCTAssertEqual(posee.id, "prise")
    }

    func test_promoted_libraryPick_staysUndeclared() {
        let prete = MessageAttachment(id: "galerie", mimeType: "image/jpeg")

        XCTAssertFalse(PreparationTracking.promoted(prete, capturedInApp: false).capturedInApp,
                       "Une image de la galerie a déjà été vue : rien ne la déclare capturée.")
    }

    /// La provenance gouverne la confirmation de la feuille de partage : une
    /// prise posée par la barre la demande avant d'ouvrir le média au-delà de
    /// la conversation.
    func test_capturedPick_requiresPublicationConfirmation() {
        let posee = PreparationTracking.promoted(MessageAttachment(id: "prise", mimeType: "video/mp4"), capturedInApp: true)

        XCTAssertTrue(PublicationTargetRule.needsCaptureConfirmation(capturedInApp: posee.capturedInApp, target: .story))
    }

    // MARK: - La prise du viseur, versée au message

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
        let compact = code.components(separatedBy: .whitespacesAndNewlines).joined()
        XCTAssertTrue(compact.contains("ComposerViewfinder{resultinonCapture(result)}") && compact.contains("onCapture:{stageCapture($0)}"),
                      "La prise rejoint le message par le chemin de pose d'une capture (#9775).")
        XCTAssertTrue(compact.contains("funcstageCapture(_capture:CameraResult){switchComposerReturnedMedia(capture:capture)"),
                      "La prise se pose comme un média retouché, image ou vidéo.")
        XCTAssertTrue(compact.contains("handleCameraCapture(image,capturedInApp:true)"),
                      "Une photo du viseur de la barre part déclarée capturée dans l'app (#9775).")
        XCTAssertTrue(compact.contains("handleCameraVideo(url,capturedInApp:true)"),
                      "Une vidéo du viseur de la barre part déclarée capturée dans l'app (#9775).")
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
        XCTAssertFalse(code.contains("ConversationVideoSceneEditor("),
                       "La vidéo RÉCENTE ouvre la retouche de la caméra, plus la scène (#11133).")
        XCTAssertFalse(code.contains("ConversationRetouchSeriesEditor("),
                       "La série de scènes n'est plus une porte de la conversation (porteur 2026-10-20, #11133).")
        XCTAssertTrue(code.contains("ConversationPieceRetouch("),
                      "La pièce EN ATTENTE ouvre la retouche de la caméra (#11133).")
    }
}
