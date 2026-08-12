import XCTest
import AVFoundation
@testable import Meeshy

/// Décisions pures du PiP système (lot C, plan 3a).
///
/// Ces règles vivent hors de `CallManager` parce qu'elles sont indécidables
/// autrement : `PiPCallController.shared` n'est pas injecté, et
/// `AVPictureInPictureController.isPictureInPictureSupported()` est faux sur
/// simulateur — `canActivateSystemPiP` y retourne toujours `false`, donc
/// `attachSystemPiP` sort en no-op avant d'atteindre la moindre décision.
@MainActor
final class CallPiPPolicyTests: XCTestCase {

    // MARK: - C1 · reconfiguration

    /// `PiPCallController.configure()` commence par `tearDown()`, qui appelle
    /// `stopPictureInPicture()`. Reconfigurer pendant qu'une fenêtre flotte la
    /// TUE. Or l'ancre est un `UIViewRepresentable` sans propriété stockée :
    /// chaque bascule de mode d'affichage démonte une ancre et en monte une
    /// autre, donc `sourceChanged` est vrai à chaque bascule.
    func test_shouldReconfigure_whilePiPActive_isRefused_evenOnSourceChange() {
        XCTAssertFalse(
            CallPiPPolicy.shouldReconfigure(isPiPActive: true, sourceChanged: true, trackChanged: false),
            "Une reconfiguration pendant un PiP actif détruit la fenêtre en cours"
        )
        XCTAssertFalse(
            CallPiPPolicy.shouldReconfigure(isPiPActive: true, sourceChanged: false, trackChanged: true)
        )
    }

    func test_shouldReconfigure_whenIdle_followsSourceOrTrackChange() {
        XCTAssertTrue(
            CallPiPPolicy.shouldReconfigure(isPiPActive: false, sourceChanged: true, trackChanged: false)
        )
        XCTAssertTrue(
            CallPiPPolicy.shouldReconfigure(isPiPActive: false, sourceChanged: false, trackChanged: true),
            "Le track distant est recréé sur ICE restart — il faut re-configurer"
        )
    }

    /// Le cas nominal : SwiftUI ré-exécute `updateUIView` à chaque re-render.
    func test_shouldReconfigure_whenNothingChanged_isRefused() {
        XCTAssertFalse(
            CallPiPPolicy.shouldReconfigure(isPiPActive: false, sourceChanged: false, trackChanged: false)
        )
    }

    // MARK: - C2 · mode d'affichage après fermeture du PiP

    /// Le défaut C2. Un appel plein écran quitté fait démarrer le PiP ; au
    /// retour dans l'app, AVKit ferme la fenêtre et l'appel se retrouvait
    /// DÉGRADÉ en pilule alors que l'utilisateur revenait précisément à lui.
    func test_displayModeAfterStop_restoresTheModeInEffectWhenPiPStarted() {
        XCTAssertEqual(
            CallPiPPolicy.displayModeAfterStop(callIsActive: true, isRestoringUI: false, modeAtStart: .fullScreen),
            .fullScreen
        )
    }

    /// Symétrique, et c'est la régression que l'ancre du mode réduit aurait
    /// introduite : un PiP démarré depuis la bulle repartait en pilule, donc
    /// la bulle disparaissait sans que l'utilisateur ait rien demandé.
    func test_displayModeAfterStop_fromBubble_returnsToBubbleNotPill() {
        XCTAssertEqual(
            CallPiPPolicy.displayModeAfterStop(callIsActive: true, isRestoringUI: false, modeAtStart: .bubble),
            .bubble
        )
    }

    func test_displayModeAfterStop_fromPill_returnsToPill() {
        XCTAssertEqual(
            CallPiPPolicy.displayModeAfterStop(callIsActive: true, isRestoringUI: false, modeAtStart: .pip),
            .pip
        )
    }

    /// Tap « revenir » : `onRestoreUI` a DÉJÀ posé `.fullScreen` avant que la
    /// fermeture n'arrive. Repasser dessus rejouerait une transition inutile.
    func test_displayModeAfterStop_whenRestoringUI_touchesNothing() {
        XCTAssertNil(
            CallPiPPolicy.displayModeAfterStop(callIsActive: true, isRestoringUI: true, modeAtStart: .pip)
        )
    }

    /// Appel terminé pendant le PiP : le panneau de fin d'appel est déjà en
    /// place (cf. C6), le rétablissement ne doit pas l'écraser.
    func test_displayModeAfterStop_whenCallEnded_touchesNothing() {
        XCTAssertNil(
            CallPiPPolicy.displayModeAfterStop(callIsActive: false, isRestoringUI: false, modeAtStart: .pip)
        )
    }

    /// `failedToStartPictureInPictureWithError` appelle `onStop` SANS qu'`onStart`
    /// ait tiré. Avec un mode mémorisé non optionnel, un échec de démarrage
    /// survenant après un PiP ouvert depuis la pilule aurait dégradé en pilule un
    /// appel entre-temps repassé en plein écran.
    func test_displayModeAfterStop_whenPiPNeverStarted_touchesNothing() {
        XCTAssertNil(
            CallPiPPolicy.displayModeAfterStop(callIsActive: true, isRestoringUI: false, modeAtStart: nil)
        )
    }

    // MARK: - C6 · fin d'appel pendant le PiP

    /// Sans ça, raccrocher pendant que la fenêtre flotte laisse l'utilisateur
    /// revenir dans une app SANS panneau de fin d'appel : la pilule et la
    /// bulle se masquent toutes deux sur `callState.isActive`, faux dès
    /// `.ended`, et le `fullScreenCover` exige `displayMode == .fullScreen`.
    func test_shouldRestoreFullScreenBeforeTeardown_whenPiPActiveAndReduced() {
        XCTAssertTrue(
            CallPiPPolicy.shouldRestoreFullScreenBeforeTeardown(isPiPActive: true, currentMode: .pip)
        )
        XCTAssertTrue(
            CallPiPPolicy.shouldRestoreFullScreenBeforeTeardown(isPiPActive: true, currentMode: .bubble)
        )
    }

    /// La garde qui empêche la régression : raccrocher depuis la pilule est le
    /// flux le plus courant. Sans condition sur le PiP, chaque raccrochage
    /// imposerait un modal plein écran.
    func test_shouldRestoreFullScreenBeforeTeardown_withoutPiP_isRefused() {
        XCTAssertFalse(
            CallPiPPolicy.shouldRestoreFullScreenBeforeTeardown(isPiPActive: false, currentMode: .pip)
        )
        XCTAssertFalse(
            CallPiPPolicy.shouldRestoreFullScreenBeforeTeardown(isPiPActive: false, currentMode: .bubble)
        )
    }

    func test_shouldRestoreFullScreenBeforeTeardown_alreadyFullScreen_isNoOp() {
        XCTAssertFalse(
            CallPiPPolicy.shouldRestoreFullScreenBeforeTeardown(isPiPActive: true, currentMode: .fullScreen)
        )
    }

    // MARK: - C7 · mode de session audio

    /// `AVPictureInPictureVideoCallViewController` exige `.videoChat`. Le
    /// prédicat historique était la caméra LOCALE : sur escalade vidéo
    /// unilatérale du correspondant (je reçois sa vidéo, ma caméra reste
    /// éteinte) la session restait en `.voiceChat` et le PiP pouvait refuser
    /// de démarrer, alors même que `canActivateSystemPiP` l'autorisait.
    func test_audioSessionMode_remoteOnlyVideo_isVideoChat() {
        XCTAssertEqual(
            CallAudioSessionPolicy.mode(videoUIActive: true, isiOSAppOnMac: false),
            .videoChat
        )
    }

    func test_audioSessionMode_audioOnly_isVoiceChat() {
        XCTAssertEqual(
            CallAudioSessionPolicy.mode(videoUIActive: false, isiOSAppOnMac: false),
            .voiceChat
        )
    }

    /// Sur iOS-app-on-Mac le voice-processing I/O unit fait taire le micro
    /// (CALL-FIX 2026-06-06) : `.default` le contourne, quel que soit le mode
    /// vidéo. La règle vaut pour les DEUX sites, d'où sa présence ici.
    func test_audioSessionMode_oniOSAppOnMac_isAlwaysDefault() {
        XCTAssertEqual(
            CallAudioSessionPolicy.mode(videoUIActive: true, isiOSAppOnMac: true),
            .default
        )
        XCTAssertEqual(
            CallAudioSessionPolicy.mode(videoUIActive: false, isiOSAppOnMac: true),
            .default
        )
    }
}
