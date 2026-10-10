import XCTest
import UIKit
import Combine
import MeeshySDK
import MeeshyUI
@testable import Meeshy

// **Décision du porteur, 2026-10-09 (#9821)** : une story ne se FIGE que pour
// poser une réaction ou sur la pause demandée par l'utilisateur (appui long).
// Ouvrir les commentaires, les options, composer une réponse (texte, pièce,
// panneau « + », sélecteurs) la laisse JOUER EN BOUCLE : elle ne passe pas à
// la suivante, ne se ferme pas, et repart à son début.

private enum StoryPlaybackHoldSource {
    static func read(_ relative: String) throws -> String {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
        return AppSourceGuard.stripComments(try String(
            contentsOf: root.appendingPathComponent(relative), encoding: .utf8))
    }

    static let views = "Meeshy/Features/Main/Views/"
    static func hold() throws -> String { try read(views + "StoryViewerView+PlaybackHold.swift") }
    static func viewer() throws -> String { try read(views + "StoryViewerView.swift") }
    static func content() throws -> String { try read(views + "StoryViewerView+Content.swift") }
    static func canvas() throws -> String { try read(views + "StoryViewerView+Canvas.swift") }
    static func sidebar() throws -> String { try read(views + "StoryViewerView+Sidebar.swift") }
    static func header() throws -> String { try read(views + "StoryViewerView+Header.swift") }
    static func revealHost() throws -> String { try read(views + "EngagementRevealHost.swift") }

    static func block(_ source: String, from marker: String) throws -> String {
        let start = try XCTUnwrap(source.range(of: marker), "« \(marker) » introuvable")
        var depth = 0
        var index = start.upperBound
        while index < source.endIndex {
            let character = source[index]
            if character == "{" { depth += 1 }
            if character == "}" {
                if depth == 0 { return String(source[start.lowerBound..<index]) }
                depth -= 1
            }
            index = source.index(after: index)
        }
        return String(source[start.lowerBound...])
    }
}

// MARK: - La règle

final class StoryPlaybackHoldRuleTests: XCTestCase {

    func test_nothingHolds_theStoryAdvances() {
        XCTAssertNil(StoryPlaybackHold.resolve(StoryPlaybackCauses()))
    }

    func test_theExplicitPause_freezesTheStory() {
        XCTAssertEqual(StoryPlaybackHold.resolve(StoryPlaybackCauses(explicitPause: true)), .pause)
    }

    func test_reacting_freezesTheStory() {
        XCTAssertEqual(StoryPlaybackHold.resolve(StoryPlaybackCauses(reacting: true)), .pause)
    }

    /// Commentaires, options, composition : la story reste vivante.
    func test_engaging_loopsTheStory() {
        XCTAssertEqual(StoryPlaybackHold.resolve(StoryPlaybackCauses(engaged: true)), .loop)
    }

    /// Répondre en réagissant : la réaction fige, même composeur ouvert.
    func test_aReaction_whileEngaged_stillFreezes() {
        XCTAssertEqual(StoryPlaybackHold.resolve(StoryPlaybackCauses(reacting: true, engaged: true)), .pause)
        XCTAssertEqual(StoryPlaybackHold.resolve(StoryPlaybackCauses(explicitPause: true, engaged: true)), .pause)
    }

    /// Un geste en vol (glissé, parcours du rail, transition) ou un écran qui
    /// recouvre la story tiennent l'horloge : ce ne sont pas des actions SUR
    /// la story, et la laisser boucler sous un écran plein ferait jouer son
    /// son derrière un autre écran.
    func test_gesturesAndCoveringScreens_holdTheClock() {
        XCTAssertEqual(StoryPlaybackHold.resolve(StoryPlaybackCauses(gestureInFlight: true, engaged: true)), .pause)
        XCTAssertEqual(StoryPlaybackHold.resolve(StoryPlaybackCauses(coveredByScreen: true)), .pause)
    }

    /// Le porteur, 2026-10-09 : un APPEL DIRECT ou un ÉVÉNEMENT DU JEU passe
    /// devant la story — elle se fige, même engagée.
    func test_aCallOrAGameMoment_freezesTheStory_evenWhileLooping() {
        XCTAssertEqual(StoryPlaybackHold.resolve(StoryPlaybackCauses(interrupted: true)), .pause)
        XCTAssertEqual(StoryPlaybackHold.resolve(StoryPlaybackCauses(interrupted: true, engaged: true)), .pause)
    }

    /// En boucle, la fin de la story la relance ; sinon on avance.
    func test_theEndOfTheStory_restartsOnlyInALoop() {
        XCTAssertEqual(StoryPlaybackHold.endAction(for: .loop), .restartInPlace)
        XCTAssertEqual(StoryPlaybackHold.endAction(for: nil), .advance)
        XCTAssertEqual(StoryPlaybackHold.endAction(for: .pause), .advance)
    }
}

// MARK: - Le câblage

@MainActor
final class StoryPlaybackHoldWiringTests: XCTestCase {

    /// Le minuteur et le canvas ne s'arrêtent que sur une PAUSE.
    func test_theTimerStopsOnlyOnAPause() throws {
        let source = try StoryPlaybackHoldSource.hold()
        XCTAssertTrue(source.contains("var shouldPauseTimer: Bool { playbackHold == .pause }"))
        XCTAssertFalse(try StoryPlaybackHoldSource.content().contains("var shouldPauseTimer: Bool {"),
                       "Un seul agrégat : celui de la règle.")
    }

    /// Chaque cause du lecteur est rangée — réaction et appui long figent,
    /// commentaires, options, composition et feuilles bouclent.
    func test_everyCause_isClassified() throws {
        let causes = try StoryPlaybackHoldSource.block(try StoryPlaybackHoldSource.hold(),
                                                       from: "var playbackCauses: StoryPlaybackCauses {")
        for term in ["explicitPause: isLongPressPaused",
                     "reactionFlight != nil", "showEmojiStrip", "showFullEmojiPicker",
                     "gestureAxis != 0", "isScrubbingRail", "isTransitioning", "isDismissing", "showGroupIntro",
                     "coveredByScreen: isPaused",
                     "interrupted: isCallInterrupting || isGameMomentShown",
                     "isComposerEngaged", "hasComposerContent", "showTextEmojiPicker",
                     "showCommentsOverlay", "showLanguageOptions", "showFullLanguagePicker",
                     "isCaptionExpanded", "showAudioTranscript",
                     "showViewersSheet", "showExportShareSheet", "sharedContentWrapper != nil",
                     "showReportSheet", "selectedProfileUser != nil"] {
            XCTAssertTrue(causes.contains(term), "Cause non rangée : \(term)")
        }
        XCTAssertFalse(causes.contains("scenePhase"), "Un aperçu du centre de notifications ne coupe pas la lecture.")
    }

    /// La fin de la story passe par la règle, jamais directement à la suivante.
    func test_theTimerCompletion_goesThroughTheRule() throws {
        let viewer = try StoryPlaybackHoldSource.viewer()
        XCTAssertTrue(viewer.contains("t.onCompletion = { [self] in\n            storyDidReachItsEnd()"))
        let end = try StoryPlaybackHoldSource.block(try StoryPlaybackHoldSource.hold(),
                                                    from: "func storyDidReachItsEnd() {")
        XCTAssertTrue(end.contains("slideTimer.seek(toFraction: 0)"), "La barre repart de zéro.")
        XCTAssertTrue(end.contains("storyLoopPass += 1"), "Le canvas est rembobiné.")
        XCTAssertTrue(end.contains("goToNext()"))
    }

    /// Un tour de boucle rembobine le canvas monté (vidéo, audio, horloge)
    /// par le pont du parcours au doigt.
    func test_aLoopPass_rewindsTheMountedCanvas() throws {
        XCTAssertTrue(try StoryPlaybackHoldSource.viewer().contains("loopPass: storyLoopPass"))
        XCTAssertTrue(try StoryPlaybackHoldSource.canvas().contains(".storyLoopRestart(pass: loopPass, scrubber: sceneScrubber)"))
        let restart = try StoryPlaybackHoldSource.block(try StoryPlaybackHoldSource.hold(),
                                                        from: "struct StoryLoopRestart: ViewModifier {")
        XCTAssertTrue(restart.contains("scrubber.begin()"))
        XCTAssertTrue(restart.contains("scrubber.end(atFraction: 0)"))
    }

    /// Les feuilles posées SUR la story (envoyer, partager, vues) bouclent :
    /// elles ne doivent plus écrire la pause des écrans pleins.
    func test_sheetsOverTheStory_doNotWriteTheCoverPause() throws {
        let sidebar = try StoryPlaybackHoldSource.sidebar()
        let header = try StoryPlaybackHoldSource.header()
        let forbidden: [(String, String)] = [
            (sidebar, #"pauseTimer\(\)\s*showViewersSheet = true"#),
            (sidebar, #"pauseTimer\(\)\s*showExportShareSheet = true"#),
            (sidebar, #"pauseTimer\(\)\s*if let story = currentStory, let group = currentGroup \{\s*EngagementTracker"#),
            (header, #"pauseTimer\(\)\s*EngagementTracker\.shared\.recordAction\(\.shared"#),
        ]
        for (source, pattern) in forbidden {
            XCTAssertNil(source.range(of: pattern, options: .regularExpression),
                         "Une feuille posée sur la story ne la fige plus : \(pattern)")
        }
    }
}

// MARK: - Un appel direct et un événement du jeu figent la story (#9821)

@MainActor
final class StoryPlaybackInterruptionTests: XCTestCase {

    /// Un appel ENTRANT qui sonne interrompt déjà les lecteurs à timeline.
    func test_anIncomingRingingCall_interruptsPlayback() {
        XCTAssertEqual(CallPlaybackInterruptionRule.transition(for: .ringing(isOutgoing: false)), true)
        XCTAssertEqual(CallPlaybackInterruptionRule.transition(for: .connected), true)
        XCTAssertEqual(CallPlaybackInterruptionRule.transition(for: .idle), false)
    }

    /// Même une story qui BOUCLE (minuteur non pausé) ne court plus pendant
    /// l'appel : l'horloge reste figée, la fin n'arrive pas.
    func test_aCall_freezesTheSlideClock_evenWhenNotPaused() {
        let interruption = PlaybackInterruption()
        let timer = StoryReaderTimerController(useDisplayLink: false, interruption: interruption)
        var completions = 0
        timer.onCompletion = { completions += 1 }
        timer.setCurrentSlide(id: "s1", duration: 6)
        timer.markContentReady(slideId: "s1")
        timer._advanceClockForTesting(by: 2)
        interruption.begin()
        timer._advanceClockForTesting(by: 10)
        XCTAssertEqual(timer.progress, 2.0 / 6.0, accuracy: 0.0001)
        XCTAssertEqual(completions, 0)
        interruption.end()
        timer._advanceClockForTesting(by: 4)
        XCTAssertEqual(completions, 1)
    }

    func test_theGameMomentSignal_followsTheCelebration() {
        let presence = GameMomentPresence()
        XCTAssertFalse(presence.isPresented)
        presence.update(isPresented: true)
        XCTAssertTrue(presence.isPresented)
        presence.update(isPresented: false)
        XCTAssertFalse(presence.isPresented)
    }

    /// La célébration se DÉCLARE, et le lecteur écoute les deux signaux.
    func test_theViewer_listensToTheCallAndTheGameMoment() throws {
        XCTAssertTrue(try StoryPlaybackHoldSource.revealHost()
            .contains("GameMomentPresence.shared.update(isPresented: présent)"))
        XCTAssertTrue(try StoryPlaybackHoldSource.viewer()
            .contains(".storyPlaybackInterruptions(callInterrupting: $isCallInterrupting, gameMomentShown: $isGameMomentShown)"))
        let modifier = try StoryPlaybackHoldSource.block(try StoryPlaybackHoldSource.hold(),
                                                         from: "struct StoryPlaybackInterruptions: ViewModifier {")
        XCTAssertTrue(modifier.contains("PlaybackInterruption.shared.$isActive"))
        XCTAssertTrue(modifier.contains("GameMomentPresence.shared.$isPresented"))
    }
}

// MARK: - Le menu « … » ouvert fait BOUCLER la story (#9821, recette 2026-10-10)

/// Recette au simulateur du 2026-10-10 : menu « … » ouvert, la story AVANÇAIT
/// (18 → 30 → 43 %), passait à la suivante, puis le lecteur se FERMAIT sous le
/// menu encore ouvert. Un `Menu` SwiftUI n'a aucun état observable : il
/// n'était donc rangé dans AUCUNE cause, et la fin de la story avançait.
@MainActor
final class StoryOptionsMenuLoopTests: XCTestCase {

    /// Le menu ouvert est une cause de BOUCLE : à la fin, la story repart à son
    /// début, elle ne passe pas à la suivante et ne ferme pas le lecteur.
    func test_theOpenOptionsMenu_loopsTheStory() throws {
        let causes = try StoryPlaybackHoldSource.block(try StoryPlaybackHoldSource.hold(),
                                                       from: "var playbackCauses: StoryPlaybackCauses {")
        let engaged = try XCTUnwrap(causes.range(of: "engaged:"))
        XCTAssertTrue(causes[engaged.upperBound...].contains("optionsMenuWatch.declaredOpen"),
                      "Le menu « … » ouvert doit être une cause de boucle, pas de pause.")
        let hold = StoryPlaybackHold.resolve(StoryPlaybackCauses(engaged: true))
        XCTAssertEqual(hold, .loop)
        XCTAssertEqual(StoryPlaybackHold.endAction(for: hold), .restartInPlace)
    }

    /// Le menu DÉCLARE son ouverture : le bouton « … » de l'en-tête la remonte
    /// au lecteur, qui la tient dans son état.
    func test_theHeaderMenu_declaresItsPresentation_toTheViewer() throws {
        let header = try StoryPlaybackHoldSource.header()
        XCTAssertTrue(header.contains("FullscreenMoreMenu(onPresentationChange: optionsMenuPresenceChange)"))
        XCTAssertTrue(header.contains("@Environment(\\.storyOptionsMenuPresenceChange) private var optionsMenuPresenceChange"))
        XCTAssertTrue(try StoryPlaybackHoldSource.viewer().contains(".storyOptionsMenuPresence(optionsMenuWatch)"))
    }

    /// Le bouton partagé de MeeshyUI sait dire qu'il est ouvert : le contenu
    /// d'un `Menu` n'apparaît qu'à son ouverture et disparaît à sa fermeture.
    func test_theSharedMoreMenu_reportsOpeningAndClosing() throws {
        let menu = try StoryPlaybackHoldSource.read(
            "../../packages/MeeshySDK/Sources/MeeshyUI/Fullscreen/FullscreenChromeButton.swift")
        let body = try StoryPlaybackHoldSource.block(menu, from: "public struct FullscreenMoreMenu<Content: View>: View {")
        XCTAssertTrue(body.contains(".onAppear { onPresentationChange?(true) }"))
        XCTAssertTrue(body.contains(".onDisappear { onPresentationChange?(false) }"))
    }
}

// MARK: - Refermé d'un toucher à côté, le menu relâche la story (#9949)

/// Recette du 2026-10-10 : menu « … » refermé d'un toucher sur la scène, la
/// story bouclait sans fin. Le contenu d'un `Menu` ne reçoit pas toujours son
/// `onDisappear` : la déclaration d'ouverture ne suffit donc pas à tenir la
/// boucle. À la fin de la story, le lecteur VÉRIFIE que quelque chose couvre
/// encore la scène ; sinon il oublie le menu et avance.
@MainActor
final class StoryOptionsMenuReleaseTests: XCTestCase {

    func test_aDeclaredMenuThatStillCoversTheScene_isShown() {
        XCTAssertTrue(StoryOptionsMenuPresence.isShown(declaredOpen: true, sceneCovered: true))
    }

    func test_aDeclaredMenuThatNoLongerCoversTheScene_isReleased() {
        XCTAssertFalse(StoryOptionsMenuPresence.isShown(declaredOpen: true, sceneCovered: false))
    }

    func test_withoutAProbe_theMenuNeverHoldsTheStory() {
        XCTAssertFalse(StoryOptionsMenuPresence.isShown(declaredOpen: true, sceneCovered: nil))
    }

    func test_aMenuNeverDeclared_isNotShown_evenIfSomethingCoversTheScene() {
        XCTAssertFalse(StoryOptionsMenuPresence.isShown(declaredOpen: false, sceneCovered: true))
    }

    func test_theWatch_forgetsAMenuClosedWithoutSignal_atTheEndOfTheStory() {
        let scene = SceneUnderTest()
        let watch = StoryOptionsMenuWatch()
        watch.probe = scene.probe
        watch.declare(true)

        watch.forgetUnlessShown()

        XCTAssertFalse(watch.declaredOpen, "Rien ne couvre la scène : la déclaration orpheline est oubliée.")
    }

    func test_theWatch_keepsTheLoop_whileTheMenuCoversTheScene() {
        let scene = SceneUnderTest()
        let watch = StoryOptionsMenuWatch()
        watch.probe = scene.probe
        watch.declare(true)
        scene.coverWithAWindowLevelView()

        watch.forgetUnlessShown()

        XCTAssertTrue(watch.declaredOpen, "Le menu couvre la scène : la story boucle encore.")
    }

    func test_theViewer_resolvesItsEnd_onTheVerifiedMenu() throws {
        let end = try StoryPlaybackHoldSource.block(try StoryPlaybackHoldSource.hold(),
                                                    from: "func storyDidReachItsEnd() {")
        let check = try XCTUnwrap(end.range(of: "optionsMenuWatch.forgetUnlessShown()"))
        let resolve = try XCTUnwrap(end.range(of: "playbackHold"))
        XCTAssertLessThan(check.lowerBound, resolve.lowerBound,
                          "La vérification précède la décision de fin.")
    }

    /// Une fenêtre réelle : la sonde est posée dans la vue du contrôleur, un
    /// menu ouvert pose son conteneur AU-DESSUS, au niveau de la fenêtre.
    private final class SceneUnderTest {
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 300, height: 600))
        let probe = UIView(frame: CGRect(x: 0, y: 0, width: 300, height: 600))

        init() {
            let controller = UIViewController()
            window.rootViewController = controller
            window.isHidden = false
            controller.view.frame = window.bounds
            probe.isUserInteractionEnabled = false
            controller.view.addSubview(probe)
        }

        func coverWithAWindowLevelView() {
            window.addSubview(UIView(frame: window.bounds))
        }
    }
}
