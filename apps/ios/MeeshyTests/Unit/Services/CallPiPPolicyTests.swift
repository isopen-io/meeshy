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
            CallPiPPolicy.displayModeAfterStop(callIsActive: true, isRestoringUI: false, modeAtStart: .fullScreen, origin: .automatic, appIsForeground: true),
            .fullScreen
        )
    }

    /// Symétrique, et c'est la régression que l'ancre du mode réduit aurait
    /// introduite : un PiP démarré depuis la bulle repartait en pilule, donc
    /// la bulle disparaissait sans que l'utilisateur ait rien demandé.
    func test_displayModeAfterStop_fromBubble_returnsToBubbleNotPill() {
        XCTAssertEqual(
            CallPiPPolicy.displayModeAfterStop(callIsActive: true, isRestoringUI: false, modeAtStart: .bubble, origin: .automatic, appIsForeground: true),
            .bubble
        )
    }

    func test_displayModeAfterStop_fromPill_returnsToPill() {
        XCTAssertEqual(
            CallPiPPolicy.displayModeAfterStop(callIsActive: true, isRestoringUI: false, modeAtStart: .pip, origin: .automatic, appIsForeground: true),
            .pip
        )
    }

    /// Tap « revenir » : `onRestoreUI` a DÉJÀ posé `.fullScreen` avant que la
    /// fermeture n'arrive. Repasser dessus rejouerait une transition inutile.
    func test_displayModeAfterStop_whenRestoringUI_touchesNothing() {
        XCTAssertNil(
            CallPiPPolicy.displayModeAfterStop(callIsActive: true, isRestoringUI: true, modeAtStart: .pip, origin: .automatic, appIsForeground: true)
        )
    }

    /// Appel terminé pendant le PiP : le panneau de fin d'appel est déjà en
    /// place (cf. C6), le rétablissement ne doit pas l'écraser.
    func test_displayModeAfterStop_whenCallEnded_touchesNothing() {
        XCTAssertNil(
            CallPiPPolicy.displayModeAfterStop(callIsActive: false, isRestoringUI: false, modeAtStart: .pip, origin: .automatic, appIsForeground: true)
        )
    }

    /// `failedToStartPictureInPictureWithError` appelle `onStop` SANS qu'`onStart`
    /// ait tiré. Avec un mode mémorisé non optionnel, un échec de démarrage
    /// survenant après un PiP ouvert depuis la pilule aurait dégradé en pilule un
    /// appel entre-temps repassé en plein écran.
    func test_displayModeAfterStop_whenPiPNeverStarted_touchesNothing() {
        XCTAssertNil(
            CallPiPPolicy.displayModeAfterStop(callIsActive: true, isRestoringUI: false, modeAtStart: nil, origin: .automatic, appIsForeground: true)
        )
    }

    // MARK: - #8435 · entrer en PiP quitte le plein écran

    /// Le plein écran restait présenté DERRIÈRE la fenêtre PiP : ses rendus
    /// vidéo tournaient pour rien. Entrer en PiP ferme le `fullScreenCover`.
    func test_displayModeOnStart_fromFullScreen_returnsReducedMode() {
        XCTAssertEqual(CallPiPPolicy.displayModeOnStart(current: .fullScreen), .pip)
    }

    /// Déjà réduit (pastille, bulle) : rien à fermer, le mode reste le sien.
    func test_displayModeOnStart_alreadyReduced_touchesNothing() {
        XCTAssertNil(CallPiPPolicy.displayModeOnStart(current: .pip))
        XCTAssertNil(CallPiPPolicy.displayModeOnStart(current: .bubble))
    }

    /// Fermer la fenêtre (croix) après un PiP demandé par le bouton ou le
    /// glissé : l'appel reste réduit, le plein écran ne revient pas de force.
    func test_displayModeAfterStop_manualPiPClosed_keepsReducedMode() {
        XCTAssertNil(
            CallPiPPolicy.displayModeAfterStop(
                callIsActive: true, isRestoringUI: false, modeAtStart: .fullScreen,
                origin: .manual, appIsForeground: true
            )
        )
    }

    /// PiP automatique (l'app est passée en arrière-plan), fermé par la croix
    /// DEPUIS une autre app : l'appel reste réduit.
    func test_displayModeAfterStop_automaticPiPClosedInBackground_keepsReducedMode() {
        XCTAssertNil(
            CallPiPPolicy.displayModeAfterStop(
                callIsActive: true, isRestoringUI: false, modeAtStart: .fullScreen,
                origin: .automatic, appIsForeground: false
            )
        )
    }

    /// « Agrandir » : `onRestoreUI` a déjà rouvert le plein écran.
    func test_displayModeAfterStop_manualPiPRestored_touchesNothing() {
        XCTAssertNil(
            CallPiPPolicy.displayModeAfterStop(
                callIsActive: true, isRestoringUI: true, modeAtStart: .fullScreen,
                origin: .manual, appIsForeground: true
            )
        )
    }

    // MARK: - #8435 · le glissé vers le bas

    func test_swipeDownOutcome_duoPastThreeQuartersWithPiP_returnsSystemPiP() {
        XCTAssertEqual(
            CallPiPPolicy.swipeDownOutcome(translation: 240, predictedTranslation: 240, isGroup: false, isEffectsOpen: false, canSystemPiP: true),
            .systemPiP
        )
    }

    /// Audio seul, ou appareil sans PiP : la pastille.
    func test_swipeDownOutcome_duoPastThreeQuartersWithoutPiP_returnsPill() {
        XCTAssertEqual(
            CallPiPPolicy.swipeDownOutcome(translation: 240, predictedTranslation: 240, isGroup: false, isEffectsOpen: false, canSystemPiP: false),
            .pill
        )
    }

    /// Annulable : relâché avant 75 % de la course, sans élan, rien ne part.
    func test_swipeDownOutcome_releasedBeforeThreeQuarters_returnsNone() {
        XCTAssertEqual(
            CallPiPPolicy.swipeDownOutcome(translation: 200, predictedTranslation: 210, isGroup: false, isEffectsOpen: false, canSystemPiP: true),
            .none
        )
        XCTAssertEqual(
            CallPiPPolicy.swipeDownOutcome(translation: -300, predictedTranslation: -400, isGroup: false, isEffectsOpen: false, canSystemPiP: true),
            .none
        )
    }

    /// Un lancer franc vers le bas dit l'intention avant la course entière.
    func test_swipeDownOutcome_flungPastTheCourse_commits() {
        XCTAssertEqual(
            CallPiPPolicy.swipeDownOutcome(translation: 90, predictedTranslation: 420, isGroup: false, isEffectsOpen: false, canSystemPiP: false),
            .pill
        )
    }

    /// La barre d'effets a ses propres glissés (curseurs, carrousel).
    func test_swipeDownOutcome_effectsOpen_returnsNone() {
        XCTAssertEqual(
            CallPiPPolicy.swipeDownOutcome(translation: 280, predictedTranslation: 500, isGroup: false, isEffectsOpen: true, canSystemPiP: true),
            .none
        )
    }

    /// En groupe, la scène a ses propres gestes (vignette à la une, plein écran).
    func test_swipeDownOutcome_group_returnsNone() {
        XCTAssertEqual(
            CallPiPPolicy.swipeDownOutcome(translation: 280, predictedTranslation: 500, isGroup: true, isEffectsOpen: false, canSystemPiP: true),
            .none
        )
    }

    /// L'écran suit le doigt vers le bas, jamais vers le haut, jamais au-delà
    /// de la course — et reste immobile là où le geste ne vaut rien.
    func test_swipeDownOffset_followsFingerWithinTheCourse() {
        XCTAssertEqual(CallPiPPolicy.swipeDownOffset(translation: 120, isGroup: false, isEffectsOpen: false), 120)
        XCTAssertEqual(CallPiPPolicy.swipeDownOffset(translation: -80, isGroup: false, isEffectsOpen: false), 0)
        XCTAssertEqual(CallPiPPolicy.swipeDownOffset(translation: 900, isGroup: false, isEffectsOpen: false), CallPiPPolicy.swipeDownCourse)
        XCTAssertEqual(CallPiPPolicy.swipeDownOffset(translation: 120, isGroup: true, isEffectsOpen: false), 0)
        XCTAssertEqual(CallPiPPolicy.swipeDownOffset(translation: 120, isGroup: false, isEffectsOpen: true), 0)
    }

    /// `PiPCallController.start()` sort en silence quand AVKit ne peut pas
    /// démarrer : le geste ne doit pas rester sans effet.
    func test_shouldFallBackToPill_pipDidNotStartAndStillFullScreen_returnsTrue() {
        XCTAssertTrue(CallPiPPolicy.shouldFallBackToPill(isPiPActive: false, displayMode: .fullScreen))
    }

    func test_shouldFallBackToPill_pipStartedOrAlreadyReduced_returnsFalse() {
        XCTAssertFalse(CallPiPPolicy.shouldFallBackToPill(isPiPActive: true, displayMode: .fullScreen))
        XCTAssertFalse(CallPiPPolicy.shouldFallBackToPill(isPiPActive: false, displayMode: .pip))
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
