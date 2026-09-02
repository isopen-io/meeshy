import XCTest
@testable import Meeshy

/// **Démarrer un enregistrement vidéo FAISAIT PLANTER l'app** (mesuré au
/// simulateur iPhone 16 Pro, 2026-09-02, build `d87e1e81a1`).
///
/// ```
/// *** Terminating app due to uncaught exception 'NSInvalidArgumentException',
/// reason: '*** -[AVCaptureMovieFileOutput startRecordingToOutputFileURL:
/// recordingDelegate:] No active/enabled connections'
///   3  Meeshy  CameraModel.startSegment()
///   4  Meeshy  CameraModel.startRecording()
///   5  Meeshy  CameraView.videoRecordButton
/// ```
///
/// `startSegment()` appelait `startRecording(to:recordingDelegate:)` **sans
/// condition**. AVFoundation ne rend pas d'erreur dans ce cas : il lève une
/// exception Objective-C, qu'aucun `do/catch` Swift ne rattrape. Le seul
/// résultat possible est la mort du processus.
///
/// ## Pourquoi ce n'est pas « un défaut de simulateur »
///
/// Le simulateur n'a pas de caméra, donc jamais de connexion vidéo — c'est ce
/// qui rend le défaut REPRODUCTIBLE à 100 %, pas ce qui le cause. Sur un
/// appareil réel, la même absence se produit quand la session n'a pas encore
/// démarré (le doigt bat le viseur), quand une autre app a préempté la caméra,
/// quand l'entrée vidéo a échoué à s'ajouter, ou pendant la transaction d'un
/// changement de caméra. Le défaut est rare sur l'appareil, et sa conséquence
/// y est la même.
///
/// > **Une garde qui manque ne se voit pas dans le cas nominal.** Le chemin
/// > vidéo était vert partout — sept témoins sur le raccord des segments, deux
/// > sur le changement de caméra en cours d'enregistrement — parce qu'aucun ne
/// > pouvait poser la question qui tue : « et si la connexion n'existe pas ? »
final class CameraRecordingReadinessTests: XCTestCase {

    // MARK: - La règle

    func test_toutEstEnPlace_lEnregistrementPeutCommencer() {
        XCTAssertTrue(CameraRecordingReadiness.mayStartRecording(
            sessionIsRunning: true, hasVideoConnection: true,
            connectionIsActive: true, connectionIsEnabled: true))
    }

    /// Le cas MESURÉ : simulateur, appareil sans caméra, entrée vidéo non
    /// ajoutée. C'est celui qui tuait le processus.
    func test_aucuneConnexionVideo_refuse() {
        XCTAssertFalse(CameraRecordingReadiness.mayStartRecording(
            sessionIsRunning: true, hasVideoConnection: false,
            connectionIsActive: false, connectionIsEnabled: false))
    }

    /// La connexion EXISTE mais ne porte rien — caméra préemptée par une autre
    /// app, ou session pas encore en régime. C'est le cas qu'un simple
    /// `connection != nil` aurait laissé passer.
    func test_uneConnexionINACTIVE_refuse_memeSiElleExiste() {
        XCTAssertFalse(CameraRecordingReadiness.mayStartRecording(
            sessionIsRunning: true, hasVideoConnection: true,
            connectionIsActive: false, connectionIsEnabled: true))
    }

    /// La connexion est active mais DÉSACTIVÉE — l'état transitoire d'un
    /// changement de caméra, que ce modèle traverse à chaque bascule.
    func test_uneConnexionDESACTIVEE_refuse() {
        XCTAssertFalse(CameraRecordingReadiness.mayStartRecording(
            sessionIsRunning: true, hasVideoConnection: true,
            connectionIsActive: true, connectionIsEnabled: false))
    }

    /// **Le doigt qui bat le viseur.** La session démarre en tâche de fond ;
    /// toucher le bouton avant qu'elle ne tourne est un geste ordinaire, pas
    /// une manipulation.
    func test_uneSessionArretee_refuse() {
        XCTAssertFalse(CameraRecordingReadiness.mayStartRecording(
            sessionIsRunning: false, hasVideoConnection: true,
            connectionIsActive: true, connectionIsEnabled: true))
    }

    // MARK: - Le CÂBLAGE, faute de pouvoir monter une caméra en test

    private func cameraViewSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Components/CameraView.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    /// **La règle est CONSULTÉE, et le seul appel à `startRecording(to:` en
    /// dépend.** Une garde posée ailleurs que devant l'appel laisserait
    /// exactement le chemin qui a tué le processus.
    func test_leSeulAppelAAVFoundation_estGardeParLaRegle() throws {
        let source = try cameraViewSource()
        XCTAssertTrue(source.contains("CameraRecordingReadiness.mayStartRecording"),
                      "Le modèle doit demander à la règle avant d'appeler AVFoundation.")
        let appels = source.components(separatedBy: "videoOutput.startRecording(to:").count - 1
        XCTAssertEqual(appels, 1,
                       "Un second site d'appel devrait porter sa propre garde — la garde suit l'appel, pas la fonction.")
        guard let debut = source.range(of: "private func startSegment()"),
              let fin = source.range(of: "videoOutput.startRecording(to:",
                                     range: debut.upperBound..<source.endIndex) else {
            return XCTFail("startSegment() ne contient plus l'appel gardé.")
        }
        let corps = String(source[debut.upperBound..<fin.lowerBound])
        XCTAssertTrue(corps.contains("videoRecordingIsPossible") || corps.contains("mayStartRecording"),
                      "La garde doit précéder l'appel DANS startSegment(), pas seulement exister dans le fichier.")
    }

    /// **Un segment refusé ne laisse pas un enregistrement FANTÔME.** Après un
    /// changement de caméra, le modèle rouvre un segment ; si la connexion a
    /// disparu entre-temps, `isRecordingVideo` resterait vrai et le chrono
    /// continuerait de compter une vidéo que rien n'écrit.
    func test_unSegmentRefuseApresBascule_termineLEnregistrement() throws {
        let source = try cameraViewSource()
        XCTAssertTrue(source.contains("@discardableResult"),
                      "startSegment() doit RENDRE son verdict pour que l'appelant en tienne compte.")
        XCTAssertTrue(source.contains("endRecordingWithoutOutput"),
                      "Le refus d'un segment doit avoir une sortie NOMMÉE, pas un return muet.")
    }
}
