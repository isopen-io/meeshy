import XCTest
@testable import Meeshy

/// C3 — le signal « caméra coupée » envoyé au pair doit être piloté par
/// l'INTERRUPTION de la session de capture, jamais par le passage en
/// arrière-plan.
///
/// Ces deux faits ne sont pas observables en test : la source du signal vit
/// dans un handler de `NotificationCenter` sur un singleton non injecté, et
/// aucune caméra n'existe sur simulateur (`RTCCameraVideoCapturer.captureDevices()`
/// renvoie une liste vide, `startLocalVideo` throw `noCameraAvailable` avant
/// même de construire la session). Les deux régressions ci-dessous sont en
/// revanche des mensonges envoyés sur le réseau à un correspondant, donc
/// invisibles en local et coûteuses en production — d'où la garde de source.
@MainActor
final class CameraSuspensionSignalGuardTests: XCTestCase {

    private func source(_ relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent(relativePath)
        return try String(contentsOf: url, encoding: .utf8)
    }

    /// Retire les commentaires : une garde qui lirait la documentation plutôt
    /// que le code passerait au vert sur un fichier dont seul le commentaire a
    /// été mis à jour.
    private func strippingComments(_ swift: String) -> String {
        swift
            .split(separator: "\n", omittingEmptySubsequences: false)
            .map { line -> Substring in
                guard let commentStart = line.range(of: "//") else { return line }
                return line[line.startIndex ..< commentStart.lowerBound]
            }
            .joined(separator: "\n")
    }

    /// Le défaut d'origine : `didEnterBackgroundNotification` annonçait « caméra
    /// coupée » alors que la caméra SURVIT à l'arrière-plan dès qu'un
    /// `AVPictureInPictureController` est actif et que la session porte
    /// `isMultitaskingCameraAccessEnabled`. Le pair perdait donc une vidéo qui
    /// continuait pourtant d'arriver.
    ///
    /// Un prédicat « sauf si le PiP est actif » ne corrigerait rien : il serait
    /// évalué DANS ce handler, or l'auto-start du PiP est déclenché par la même
    /// transition et `willStartPictureInPicture` peut arriver après.
    func test_backgroundObserver_neverEmitsCameraOffToThePeer() throws {
        let code = strippingComments(
            try source("Meeshy/Features/Main/Services/CallManager.swift")
        )
        guard let start = code.range(of: "UIApplication.didEnterBackgroundNotification"),
              let end = code.range(of: "UIApplication.willEnterForegroundNotification") else {
            XCTFail("CallManager doit observer les deux transitions de cycle de vie")
            return
        }
        let handler = String(code[start.upperBound ..< end.lowerBound])
        XCTAssertFalse(
            handler.contains("emitCallToggleVideo"),
            "L'entrée en arrière-plan ne prouve RIEN sur l'état de la caméra : "
            + "avec un PiP système actif elle continue de délivrer des frames. "
            + "Le seul déclencheur légitime est l'interruption de la session de "
            + "capture, republiée par P2PWebRTCClient."
        )
    }

    /// Le retour en avant-plan reste le garde-fou : `AVCaptureSession.h`
    /// documente la fin d'interruption comme survenant « when your app comes
    /// back to foreground », donc un signal de fin peut ne jamais arriver tant
    /// que l'app est en arrière-plan. Sans cette levée, le pair resterait sur
    /// l'avatar jusqu'à la fin de l'appel.
    func test_foregroundObserver_stillLiftsTheSuspension() throws {
        let code = strippingComments(
            try source("Meeshy/Features/Main/Services/CallManager.swift")
        )
        guard let start = code.range(of: "UIApplication.willEnterForegroundNotification") else {
            XCTFail("CallManager doit observer le retour en avant-plan")
            return
        }
        let end = code.index(start.upperBound, offsetBy: 1200, limitedBy: code.endIndex) ?? code.endIndex
        let handler = String(code[start.upperBound ..< end])
        XCTAssertTrue(
            handler.contains("applyCameraSuspension(false"),
            "Le retour en avant-plan doit lever la suspension — c'est le "
            + "garde-fou du cas où la fin d'interruption n'arrive jamais."
        )
    }

    /// `CameraView` instancie une SECONDE `AVCaptureSession` dans le process
    /// (composeur story). Un `object: nil` capterait ses interruptions et
    /// couperait la vidéo d'appel sur un événement sans aucun rapport.
    func test_captureInterruptionObservation_isScopedToTheCallSession() throws {
        let code = strippingComments(
            try source("Meeshy/Features/Main/Services/WebRTC/P2PWebRTCClient.swift")
        )
        guard let start = code.range(of: "AVCaptureSession.wasInterruptedNotification") else {
            XCTFail("P2PWebRTCClient doit observer l'interruption de sa session de capture")
            return
        }
        let end = code.index(start.upperBound, offsetBy: 200, limitedBy: code.endIndex) ?? code.endIndex
        let block = String(code[start.upperBound ..< end])
        XCTAssertTrue(
            block.contains("object: session"),
            "L'observation DOIT être scopée sur la session de capture de l'appel : "
            + "le composeur story fait tourner sa propre AVCaptureSession dans le "
            + "même process."
        )
        XCTAssertFalse(
            block.contains("object: nil"),
            "object: nil capterait les interruptions du composeur story"
        )
    }

    /// L'interruption ne doit pas être filtrée sur `AVCaptureSession.InterruptionReason` :
    /// une session interrompue ne délivre plus de frames quelle qu'en soit la
    /// raison, et l'énumération grandit (iOS 26 y ajoute
    /// `.sensitiveContentMitigationActivated`) — un `switch` sans `default`
    /// exhaustif deviendrait un point de rupture silencieux.
    func test_interruptionHandling_doesNotSwitchOnReason() throws {
        let code = strippingComments(
            try source("Meeshy/Features/Main/Services/WebRTC/P2PWebRTCClient.swift")
        )
        XCTAssertFalse(
            code.contains("AVCaptureSessionInterruptionReasonKey"),
            "Le booléen interrompu/repris suffit et reste juste quelle que soit "
            + "la raison ; lire la raison rouvrirait un point de rupture à chaque "
            + "nouvelle valeur ajoutée par iOS."
        )
    }
}
