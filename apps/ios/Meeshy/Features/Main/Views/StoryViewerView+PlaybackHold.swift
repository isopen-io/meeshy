import SwiftUI
import UIKit
import MeeshyUI

// MARK: - Pause ou boucle : ce que fait une story retenue (#9821)

/// **Une story retenue se FIGE ou BOUCLE, jamais rien d'autre** (décision du
/// porteur, 2026-10-09). Elle ne se fige — image arrêtée, son coupé — que pour
/// poser une réaction ou sur la pause demandée par l'utilisateur. Ouvrir les
/// commentaires, les options, composer une réponse (texte, pièce, panneau
/// « + », sélecteurs) la laisse JOUER : à sa fin, elle repart à son début au
/// lieu de passer à la suivante ou de fermer le lecteur.
///
/// `nil` : rien ne la retient, elle avance normalement.
nonisolated enum StoryPlaybackHold: Equatable {
    case pause
    case loop

    /// Ce que la fin de la story déclenche.
    enum EndAction: Equatable {
        case advance
        case restartInPlace
    }

    /// Une pause l'emporte sur une boucle : la réaction posée pendant qu'on
    /// compose fige l'image le temps de son vol.
    static func resolve(_ causes: StoryPlaybackCauses) -> StoryPlaybackHold? {
        if causes.explicitPause || causes.reacting || causes.gestureInFlight || causes.coveredByScreen
            || causes.interrupted {
            return .pause
        }
        return causes.engaged ? .loop : nil
    }

    static func endAction(for hold: StoryPlaybackHold?) -> EndAction {
        hold == .loop ? .restartInPlace : .advance
    }
}

/// Les raisons qu'a la story d'être retenue, rangées par effet.
///
/// - `explicitPause` : l'appui long de l'utilisateur.
/// - `reacting` : barre ou sélecteur de réactions ouvert, réaction en vol.
/// - `gestureInFlight` : glissé du lecteur, parcours du rail, transition,
///   fermeture, interlude d'identité — l'horloge attend la fin du geste.
/// - `coveredByScreen` : un écran plein recouvre la story (composeur, citer ou
///   republier en post, lieu plein écran) — elle ne joue pas son son derrière.
/// - `interrupted` : un appel direct (qui sonne ou se tient) ou un événement du
///   jeu (célébration d'un palier, sa carte photo) passe devant elle.
/// - `engaged` : commentaires, composition, menu « … » ouvert, options,
///   langues, légende, transcription, feuilles posées sur la story — elle boucle.
nonisolated struct StoryPlaybackCauses: Equatable {
    var explicitPause = false
    var reacting = false
    var gestureInFlight = false
    var coveredByScreen = false
    var interrupted = false
    var engaged = false
}

extension StoryViewerView {

    /// Un aperçu du centre de notifications / de contrôle n'y figure PAS : la
    /// lecture continue pendant ce genre de coup d'œil (directive 2026-07-14).
    /// Le vrai `.background` ferme le lecteur ailleurs.
    var playbackCauses: StoryPlaybackCauses {
        StoryPlaybackCauses(
            explicitPause: isLongPressPaused,
            reacting: showEmojiStrip || showFullEmojiPicker || reactionFlight != nil,
            gestureInFlight: gestureAxis != 0 || isScrubbingRail || isTransitioning
                || isDismissing || showGroupIntro,
            coveredByScreen: isPaused,
            interrupted: isCallInterrupting || isGameMomentShown,
            engaged: isComposerEngaged || hasComposerContent || showTextEmojiPicker
                || showCommentsOverlay || showLanguageOptions || showFullLanguagePicker
                || isCaptionExpanded || showAudioTranscript
                || showViewersSheet || showExportShareSheet || sharedContentWrapper != nil
                || showReportSheet || selectedProfileUser != nil || optionsMenuWatch.declaredOpen
        )
    }

    var playbackHold: StoryPlaybackHold? { StoryPlaybackHold.resolve(playbackCauses) }

    /// Le minuteur ET le canvas ne s'arrêtent que sur une pause ; en boucle,
    /// ils jouent.
    var shouldPauseTimer: Bool { playbackHold == .pause }

    /// La fin de la story courante : en boucle, la barre repart de zéro et le
    /// canvas est rembobiné (vidéo, audio, animations) ; sinon on avance.
    ///
    /// Le menu « … » n'y compte que s'il couvre ENCORE la scène (#9949) : un
    /// menu refermé d'un toucher à côté peut ne jamais dire sa fermeture.
    func storyDidReachItsEnd() {
        optionsMenuWatch.forgetUnlessShown()
        switch StoryPlaybackHold.endAction(for: playbackHold) {
        case .restartInPlace:
            slideTimer.seek(toFraction: 0)
            storyLoopPass += 1
        case .advance:
            goToNext()
        }
    }
}

// MARK: - Le tour de boucle rembobine le canvas monté

/// Même chemin qu'un parcours du rail ramené au début (#7878) : le canvas
/// recale son horloge, ses vidéos et relance son audio depuis zéro, sans être
/// recréé — aucun rechargement de média, aucun écran de chargement.
struct StoryLoopRestart: ViewModifier {
    let pass: Int
    let scrubber: ScenePlaybackScrubber

    func body(content: Content) -> some View {
        content.adaptiveOnChange(of: pass) { _, _ in
            scrubber.begin()
            scrubber.end(atFraction: 0)
        }
    }
}

// MARK: - Ce qui passe devant la story : un appel, un événement du jeu

/// Deux signaux d'app, lus dès le montage (`@Published` livre sa valeur
/// courante) : un appel qui sonne déjà quand on ouvre la story la fige aussi.
struct StoryPlaybackInterruptions: ViewModifier {
    @Binding var callInterrupting: Bool
    @Binding var gameMomentShown: Bool

    func body(content: Content) -> some View {
        content
            .onReceive(PlaybackInterruption.shared.$isActive.removeDuplicates()) { callInterrupting = $0 }
            .onReceive(GameMomentPresence.shared.$isPresented.removeDuplicates()) { gameMomentShown = $0 }
    }
}

extension View {
    func storyPlaybackInterruptions(callInterrupting: Binding<Bool>, gameMomentShown: Binding<Bool>) -> some View {
        modifier(StoryPlaybackInterruptions(callInterrupting: callInterrupting, gameMomentShown: gameMomentShown))
    }

    func storyLoopRestart(pass: Int, scrubber: ScenePlaybackScrubber) -> some View {
        modifier(StoryLoopRestart(pass: pass, scrubber: scrubber))
    }
}

// MARK: - Le menu « … » ouvert : une cause de boucle (#9821)

/// Un `Menu` SwiftUI n'a aucun état observable. L'en-tête, reconstruit à
/// chaque tick de la barre, ne peut pas le tenir : il le REMONTE au lecteur
/// par l'environnement, comme il demande le composer (`meeshyComposeSeedRequest`).
/// `nil` hors du lecteur (aperçu du composer) : rien à retenir.
private struct StoryOptionsMenuPresenceKey: EnvironmentKey {
    static let defaultValue: ((Bool) -> Void)? = nil
}

extension EnvironmentValues {
    var storyOptionsMenuPresenceChange: ((Bool) -> Void)? {
        get { self[StoryOptionsMenuPresenceKey.self] }
        set { self[StoryOptionsMenuPresenceKey.self] = newValue }
    }
}

extension View {
    func storyOptionsMenuPresence(_ watch: StoryOptionsMenuWatch) -> some View {
        environment(\.storyOptionsMenuPresenceChange, { watch.declare($0) })
            .background(StorySceneCoverProbe(watch: watch).allowsHitTesting(false))
    }
}

// MARK: - Le menu ne retient la story que tant qu'il est RÉELLEMENT présenté (#9949)

/// Le contenu d'un `Menu` ne reçoit pas son `onDisappear` à coup sûr quand on
/// le referme d'un toucher à côté (recette du 2026-10-10, iOS 26) : la story
/// bouclait alors sans fin. La déclaration d'ouverture ne suffit donc pas ; à
/// la fin de la story, le lecteur vérifie qu'un menu couvre ENCORE la scène.
/// Sans sonde, ou si rien ne la couvre, le menu ne retient rien : la règle ne
/// bloque jamais la story — au pire, elle avance sous un menu ouvert.
nonisolated enum StoryOptionsMenuPresence {
    static func isShown(declaredOpen: Bool, sceneCovered: Bool?) -> Bool {
        declaredOpen && sceneCovered == true
    }
}

/// Une référence stable (`@State`) : l'en-tête, reconstruit à chaque tick, y
/// déclare l'ouverture ; la fin de la story la vérifie. Rien n'est affiché
/// d'après elle, elle n'a donc pas à être observée.
final class StoryOptionsMenuWatch {
    private(set) var declaredOpen = false
    weak var probe: UIView?

    func declare(_ open: Bool) { declaredOpen = open }

    /// Vérifie la déclaration contre la scène, et oublie une déclaration
    /// orpheline (menu refermé sans signal).
    func forgetUnlessShown() {
        let shown = StoryOptionsMenuPresence.isShown(
            declaredOpen: declaredOpen,
            sceneCovered: probe.flatMap(StorySceneCover.isCovered)
        )
        if !shown { declaredOpen = false }
    }
}

/// Un menu présenté pose son conteneur AU-DESSUS du contrôleur qui porte la
/// story, au niveau de la fenêtre : c'est lui qui reçoit le toucher qui le
/// referme. Au centre de la sonde, la fenêtre désigne donc une vue étrangère
/// au contrôleur tant que le menu est là.
enum StorySceneCover {
    static func isCovered(_ probe: UIView) -> Bool? {
        guard let window = probe.window, let owner = owningView(of: probe) else { return nil }
        let center = probe.convert(CGPoint(x: probe.bounds.midX, y: probe.bounds.midY), to: window)
        guard let hit = window.hitTest(center, with: nil) else { return false }
        return !hit.isDescendant(of: owner)
    }

    private static func owningView(of view: UIView) -> UIView? {
        var responder: UIResponder? = view.next
        while let current = responder {
            if let controller = current as? UIViewController { return controller.view }
            responder = current.next
        }
        return nil
    }
}

/// La sonde, posée derrière le lecteur : elle ne reçoit aucun toucher.
private struct StorySceneCoverProbe: UIViewRepresentable {
    let watch: StoryOptionsMenuWatch

    func makeUIView(context: Context) -> UIView {
        let view = UIView()
        view.isUserInteractionEnabled = false
        view.backgroundColor = .clear
        watch.probe = view
        return view
    }

    func updateUIView(_ uiView: UIView, context: Context) {
        watch.probe = uiView
    }
}
