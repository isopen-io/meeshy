import SwiftUI
import UIKit
import PhotosUI
import UniformTypeIdentifiers
import MeeshySDK
import MeeshyUI

// MARK: - StoryViewerView canvas components
//
// Dedicated View structs extracted from StoryViewerView so the deeply nested
// story canvas (viewer content + story card) no longer composes into
// StoryViewerView.body's opaque type. That monolithic type exceeded the Swift
// type-checker budget and triggered a type-metadata instantiation crash on
// low-memory devices. Real structs (vs AnyView) break the type while
// preserving SwiftUI structural identity.

// MARK: - Story Gesture Overlay

/// Tap-left / tap-right navigation overlay plus the long-press pause gesture.
/// Extracted from `StoryViewerView.gestureOverlay(geometry:)` so its subtree
/// is its own type-metadata unit.
///
/// ## Sémantique gestuelle (source de vérité unique : `isPaused`)
/// - **Tap court (< 200 ms) sur story en lecture** : navigation prev/next
///   selon le côté tappé (gauche/droite).
/// - **Long-press ≥ 200 ms** : pause la story (`isPaused = true`). Le timer
///   de progression et le player de background vidéo s'arrêtent ensemble.
///   Le chrome bascule en mode immersif. **Le relâchement ne reprend
///   PAS** — la story reste en pause.
/// - **Tap court sur story en pause** : reprend la lecture (`isPaused =
///   false`), rétablit le chrome. Pas de navigation.
/// - **Drag horizontal/vertical au-delà du `dragSlopPixels`** : geste annulé
///   et laissé au drag gesture parent (swipe-down pour dismiss).
struct StoryGestureOverlayView: View {
    let geometry: GeometryProxy
    let isComposerEngaged: Bool
    /// **Source de vérité du toggle long-press**. Le hold confirmé le pose
    /// à `true`, le tap suivant le remet à `false`. Le parent observe ce
    /// drapeau pour gater le timer (`shouldPauseTimer`) ET poster les
    /// notifications canvas (`.storyPlayerPause` / `.storyPlayerResume`).
    @Binding var isLongPressPaused: Bool
    let onDismissComposer: () -> Void
    let onPrevious: () -> Void
    let onNext: () -> Void
    /// Callback de basculement du chrome — invoqué quand le seuil 200 ms est
    /// franchi (touch-and-hold confirmé) et quand le tap de reprise remet la
    /// story en lecture, avec `visible: Bool` qui suit la sémantique :
    /// - en mode normal (`isFullscreenStorySession == false`) : `false` à la
    ///   pause (cache pour immersion), `true` à la reprise (rétablit chrome).
    /// - en mode plein écran (`isFullscreenStorySession == true`) : inverse.
    /// Le parent applique l'animation et coupe le clavier au besoin.
    let onChromeVisibilityChange: (Bool) -> Void
    /// Double tap dans la bande centrale → bascule pause / lecture.
    let onTogglePause: () -> Void
    /// `true` quand une surface du reader est ouverte (strip de langues, barre
    /// d'emojis, overlay de commentaires, sélecteurs plein écran). Le prochain
    /// toucher la referme AU LIEU de naviguer — sinon l'utilisateur avance dans
    /// la story en croyant simplement fermer ce qu'il vient d'ouvrir
    /// (directive user 2026-07-25).
    let hasActiveFeature: Bool
    /// Ferme la surface ouverte. Appelé à la place de toute autre action.
    let onDismissActiveFeature: () -> Void
    /// État de session « plein écran » lu depuis le parent. Détermine le
    /// sens du toggle du chrome (voir doc ci-dessus).
    let isFullscreenStorySession: Bool
    /// Compteur incrémenté par le parent sur les chemins gestuels NON NOMINAUX
    /// (snap-back, transition de groupe, sortie du lecteur). SwiftUI n'appelle
    /// PAS `onEnded` quand un recognizer concurrent emporte la séquence : sans
    /// ce signal, `touchStartTime` resterait non-nil et cette vue traiterait
    /// tous les touchers suivants comme « drag en cours » (plus aucun tap, plus
    /// aucun hold). Chaque incrément purge l'état transient du toucher.
    let gestureResetToken: Int
    /// Signal MONTANT vers le drag parent : « ce toucher a servi à refermer une
    /// surface du reader ».
    ///
    /// POURQUOI IL EXISTE : cette vue referme la surface active dès le
    /// TOUCH-DOWN (branche `hasActiveFeature` ci-dessous), alors que
    /// `unifiedDragGesture` exige 15 pt de déplacement avant son premier
    /// `onChanged` — donc avant sa photographie `hadActiveFeatureAtDragStart`,
    /// qui vaut déjà `false`. Un glissement bas de plus de 120 pt parti du
    /// canvas concluait alors `.dismissViewer` : l'utilisateur voulait refermer
    /// son strip et PERDAIT la story. Ce drapeau rend au parent l'information
    /// que lui seul avait perdue.
    ///
    /// CYCLE DE VIE : remis à `false` au touch-down de CHAQUE toucher reçu ici
    /// (jamais hérité du toucher précédent), posé à `true` juste avant
    /// `onDismissActiveFeature()`. Le parent le consomme et le remet à `false`
    /// dans le `onEnded` de son drag, et `resetGestureTracking()` le purge sur
    /// les chemins où ce `onEnded` n'arrive jamais.
    @Binding var readerFeatureConsumedByTouch: Bool

    /// Seuil au-delà duquel un touch sur l'écran cesse d'être un tap de
    /// navigation prev/next et devient un hold (toggle pause + hide chrome).
    ///
    /// 0,45 s — proche du seuil d'un long-press iOS (0,5 s). À 0,2 s, valeur
    /// posée le 2026-05-21, la navigation par tap devenait inatteignable : un
    /// tap humain POSÉ (par opposition à un flick sec) dure couramment 150 à
    /// 300 ms, donc franchissait le seuil et armait le hold. L'utilisateur
    /// visait la story suivante et obtenait une pause avec le chrome masqué
    /// (report user 2026-07-27 : « le tap sur la partie gauche et droite ne
    /// permet plus d'aller vers l'arrière ni vers la story suivante »).
    private let holdThresholdSeconds: TimeInterval = 0.45
    /// Fenêtre pendant laquelle deux taps centrés comptent pour un double tap.
    private let doubleTapWindowSeconds: TimeInterval = 0.3
    /// Marge horizontale/verticale autorisée avant qu'un drag soit considéré
    /// comme un swipe (et donc ignoré par cet overlay — laissé au drag
    /// gesture parent qui gère le dismiss).
    ///
    /// 24 px ≈ 8 pt, l'ordre de grandeur de la tolérance d'un tap iOS. À 14 px
    /// (moins de 5 pt), le tremblement naturel du doigt suffisait à requalifier
    /// un tap en drag : le geste était rendu au parent et la navigation
    /// annulée sans que rien ne le signale.
    private let dragSlopPixels: CGFloat = 24

    @State private var touchStartTime: Date? = nil
    @State private var touchStartLocation: CGPoint = .zero
    /// `true` dès que le seuil 200 ms est franchi : la story est passée en
    /// pause via long-press, le release ne doit ni naviguer ni reprendre.
    @State private var holdActive: Bool = false
    /// `Task` armée au touchDown pour fire le hold à `holdThresholdSeconds`.
    /// Annulée si le doigt bouge trop, est relâché tôt, ou si le composer
    /// devient engaged en cours de geste.
    @State private var holdArmingTask: Task<Void, Never>? = nil
    /// `true` si le touch courant est le tap de reprise : `isLongPressPaused`
    /// était `true` au touch-down, on l'a remis à `false`, et le release
    /// doit être consommé (pas de nav, pas de hold).
    @State private var isResumingTap: Bool = false
    /// `true` dès que le doigt a franchi `dragSlopPixels` pendant CE toucher.
    /// Le parent reconnaît maintenant `unifiedDragGesture` EN PARALLÈLE de ce
    /// recognizer : sans ce drapeau, un swipe rapide parti d'une bande latérale
    /// commiterait à la fois une navigation de story (notre touch-up) et un
    /// changement de groupe (le drag parent). Le toucher qui a bougé cesse donc
    /// d'être un tap — pour la navigation comme pour la fenêtre de double tap
    /// (`isCleanTap`), sans quoi deux flicks enchaînés au centre mettaient la
    /// story en pause en plus de changer de groupe.
    @State private var didExceedSlop: Bool = false
    /// Horodatage du dernier tap consommé dans la bande centrale. Sert à
    /// reconnaître un double tap SANS recognizer concurrent : `TapGesture(count: 2)`
    /// aurait imposé au tap simple d'attendre son échec, ajoutant ~250 ms au
    /// geste de navigation. Ici les bords naviguent toujours immédiatement.
    @State private var lastCenterTapTime: Date? = nil

    /// Surveille les transitions d'état de la scène pour annuler un hold
    /// armé si l'app passe inactive (incoming call, lock, app-switcher) —
    /// sinon `Task.sleep(200ms)` continue à courir et au retour foreground
    /// la Task fire, posant `isLongPressPaused = true` sans cause visible
    /// pour l'utilisateur.
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        Color.clear
            .contentShape(Rectangle())
            .accessibilityElement()
            .accessibilityLabel(String(localized: "story.viewer.label", defaultValue: "Lecteur de stories", bundle: .main))
            .accessibilityHint(String(localized: "story.viewer.navigation.hint", defaultValue: "Toucher à gauche pour la story précédente, à droite pour la suivante, maintenir pour mettre en pause", bundle: .main))
            // `DragGesture(minimumDistance: 0)` capture LE PREMIER touch-down
            // ainsi que le release. C'est le seul moyen fiable en SwiftUI de
            // distinguer un tap court d'un hold long sur la même hit-area —
            // `simultaneousGesture(LongPressGesture)` perdait toujours la
            // course contre `onTapGesture` car le tap fire au release tant
            // qu'aucun mouvement significatif n'a eu lieu, et le release
            // arrive bien avant la fin du holdThreshold.
            // ATTENTION — ce `simultaneousGesture` N'ARBITRE PAS avec le parent.
            // En SwiftUI, `simultaneousGesture` posé sur une vue ne règle la
            // simultanéité qu'avec les gestes déclarés par CETTE vue-là ; il n'a
            // aucun effet sur un geste monté par un ANCÊTRE. Et un `.gesture()`
            // d'ancêtre est de priorité INFÉRIEURE à tout geste de son sous-arbre :
            // ce `DragGesture(minimumDistance: 0)`, qui reconnaît dès le touch-down
            // et ne relâche jamais son recognizer, subordonnait donc définitivement
            // le `unifiedDragGesture` parent — swipes morts pendant la story.
            // La précédence vraie se décide au POINT D'ATTACHE PARENT, qui monte
            // désormais `unifiedDragGesture` en `.simultaneousGesture` (cf.
            // StoryViewerView.viewerContent). Ne pas y repasser à `.gesture`.
            .simultaneousGesture(
                DragGesture(minimumDistance: 0, coordinateSpace: .local)
                    .onChanged { value in
                        guard !isComposerEngaged else { return }

                        if touchStartTime == nil {
                            // ===== TOUCH DOWN =====
                            touchStartTime = Date()
                            touchStartLocation = value.startLocation
                            holdActive = false
                            // Repart d'un toucher « immobile » : le drapeau est
                            // aussi purgé ici (et pas seulement au relâchement)
                            // car `onEnded` peut ne jamais arriver si un
                            // recognizer concurrent emporte la séquence.
                            didExceedSlop = false
                            holdArmingTask?.cancel()
                            // Nouveau toucher = photographie neuve pour le drag
                            // parent. Écrit seulement s'il reste quelque chose à
                            // purger : une assignation @State invalide la vue
                            // même à valeur égale, et ce chemin passe à CHAQUE
                            // touch-down.
                            if readerFeatureConsumedByTouch { readerFeatureConsumedByTouch = false }

                            // Une surface ouverte se ferme au premier toucher, où
                            // qu'il tombe, et rien d'autre ne se produit :
                            // `isResumingTap` neutralise le relâchement pour que
                            // la story n'avance pas par la même occasion.
                            if hasActiveFeature {
                                isResumingTap = true
                                // Le drag parent ne saura plus, à son `onEnded`,
                                // qu'une surface était ouverte au début de CE
                                // toucher : on la lui signale ici, sinon un
                                // glissement bas conclut `.dismissViewer` et
                                // l'utilisateur perd la story en croyant fermer
                                // son strip.
                                readerFeatureConsumedByTouch = true
                                onDismissActiveFeature()
                                return
                            }

                            let ctx = StoryGestureContext(
                                holdActive: false,
                                isPaused: isLongPressPaused,
                                isResumingTap: false,
                                isComposerEngaged: isComposerEngaged
                            )
                            switch StoryGestureDecisions.decideTouchDown(
                                context: ctx,
                                touchStartX: value.startLocation.x,
                                width: geometry.size.width
                            ) {
                            case .resumeFromPause:
                                // Story en pause via long-press précédent.
                                // Ce tap REPREND la lecture — pas de hold,
                                // pas de nav au release.
                                isResumingTap = true
                                isLongPressPaused = false
                                onChromeVisibilityChange(!isFullscreenStorySession)
                                HapticFeedback.light()
                            case .none:
                                // Arme le long-press. Il est un TOGGLE (spec
                                // 2026-07-25) : il met en pause et masque les
                                // contrôleurs, et un second long-press rend la
                                // lecture ET les contrôleurs.
                                isResumingTap = false
                                holdArmingTask = Task { @MainActor in
                                    try? await Task.sleep(for: .milliseconds(Int(holdThresholdSeconds * 1000)))
                                    if Task.isCancelled { return }
                                    if isComposerEngaged { return }
                                    // Garde contre le wake-up Task après un
                                    // backgrounding : si l'app est sortie
                                    // de foreground pendant l'attente, on
                                    // ne déclenche pas un freeze invisible.
                                    guard UIApplication.shared.applicationState == .active else { return }
                                    if isLongPressPaused {
                                        holdActive = false
                                        isLongPressPaused = false
                                        onChromeVisibilityChange(!isFullscreenStorySession)
                                    } else {
                                        holdActive = true
                                        isLongPressPaused = true
                                        onChromeVisibilityChange(isFullscreenStorySession)
                                    }
                                }
                            default:
                                break  // touchDown ne produit pas d'autres actions
                            }
                        } else {
                            // ===== DRAG IN PROGRESS =====
                            // Le doigt bouge : si on dépasse le slop, on
                            // annule le geste (laissé au drag parent).
                            let dx = value.location.x - touchStartLocation.x
                            let dy = value.location.y - touchStartLocation.y
                            if abs(dx) > dragSlopPixels || abs(dy) > dragSlopPixels {
                                // Franchi une fois = franchi pour tout le
                                // toucher : revenir sous le seuil ne rend pas
                                // au doigt le droit de naviguer d'une story.
                                // C'est le drag parent (seuils 60 / 120 pt) qui
                                // porte l'annulation « je reglisse en arrière ».
                                didExceedSlop = true
                                holdArmingTask?.cancel()
                                if holdActive {
                                    // Hold confirmé puis drag : on **annule
                                    // la pause** — l'utilisateur swipe, on
                                    // rend la main au drag parent.
                                    holdActive = false
                                    isLongPressPaused = false
                                    onChromeVisibilityChange(!isFullscreenStorySession)
                                }
                                // Drag pendant un tap de reprise : la
                                // reprise est déjà actée, on garde
                                // `isResumingTap` pour neutraliser le release.
                            }
                        }
                    }
                    .onEnded { value in
                        defer {
                            touchStartTime = nil
                            didExceedSlop = false
                            holdArmingTask?.cancel()
                            holdArmingTask = nil
                        }
                        // Toucher déjà purgé (jeton `gestureResetToken`, ou
                        // `onChanged` sorti avant de l'ouvrir) : il n'y a plus
                        // rien à conclure, et surtout pas un `elapsed` de 0
                        // fabriqué par le `?? 0` ci-dessous, qui ferait passer
                        // le relâchement pour un tap de navigation. Le composer
                        // est l'exception : il n'ouvre JAMAIS de toucher (garde
                        // en tête de `onChanged`) et garde son chemin de dismiss.
                        guard touchStartTime != nil || isComposerEngaged else { return }
                        let elapsed = touchStartTime.map { Date().timeIntervalSince($0) } ?? 0
                        // Le relâchement porte sa PROPRE translation, et elle fait
                        // autorité au même titre que l'accumulateur d'`onChanged` :
                        // sur un flick très court relâché aussitôt (événements
                        // coalescés, frame sautée), aucun tick n'a franchi le slop
                        // et `didExceedSlop` vaut encore `false`. L'enfant concluait
                        // alors navigatePrevious/navigateNext pendant que le drag
                        // parent commitait un changement de groupe — deux actions
                        // pour un seul geste. Un toucher immobile a une translation
                        // nulle : aucun tap ne peut être requalifié par cette lecture.
                        let movedAtEnd = abs(value.translation.width) > dragSlopPixels
                            || abs(value.translation.height) > dragSlopPixels
                        let ctx = StoryGestureContext(
                            holdActive: holdActive,
                            isPaused: isLongPressPaused,
                            isResumingTap: isResumingTap,
                            isComposerEngaged: isComposerEngaged,
                            didExceedSlop: didExceedSlop || movedAtEnd
                        )
                        // Double tap dans la bande centrale : deux relâchements
                        // rapprochés au même endroit. Évalué AVANT la décision
                        // de tap simple, qui reste `.none` au centre — donc
                        // aucun effet de bord à annuler si le second tap arrive.
                        //
                        // `didExceedSlop` gate AUSSI la fenêtre de double tap : il
                        // mesure le déplacement À L'INTÉRIEUR du toucher courant, pas
                        // la distance entre deux taps successifs (celle-là n'est
                        // jamais évaluée — seul l'écart de TEMPS l'est). Un vrai
                        // second tap est immobile et ne franchit donc jamais le slop,
                        // tandis que deux flicks horizontaux enchaînés dans la bande
                        // centrale — le geste courant pour défiler les groupes —
                        // alimentaient la fenêtre et déclenchaient `onTogglePause()` :
                        // l'utilisateur changeait de groupe ET mettait la story en
                        // pause, chrome masqué, sans avoir tapé une seule fois.
                        let isCleanTap = !ctx.holdActive && !ctx.isResumingTap
                            && !ctx.isComposerEngaged && !ctx.didExceedSlop
                            && elapsed < holdThresholdSeconds
                        if isCleanTap,
                           StoryGestureDecisions.decideDoubleTap(
                               context: ctx,
                               touchStartX: value.startLocation.x,
                               width: geometry.size.width) == .togglePause {
                            let now = Date()
                            if let previous = lastCenterTapTime,
                               now.timeIntervalSince(previous) <= doubleTapWindowSeconds {
                                lastCenterTapTime = nil
                                HapticFeedback.medium()
                                onTogglePause()
                                return
                            }
                            lastCenterTapTime = now
                        }

                        switch StoryGestureDecisions.decideTouchUp(
                            context: ctx,
                            touchStartX: value.startLocation.x,
                            width: geometry.size.width,
                            elapsed: elapsed,
                            holdThreshold: holdThresholdSeconds
                        ) {
                        case .dismissComposer:
                            onDismissComposer()
                        case .none:
                            // Tap de reprise OU race rare seuil-franchi-sans-hold.
                            // Dans les deux cas, on consomme les flags transients
                            // et on ne navigue pas.
                            isResumingTap = false
                        case .confirmLongPressPause:
                            // Hold confirmé : la story reste en pause
                            // (`isLongPressPaused = true` déjà posé par
                            // la Task). Pas de nav, pas de reprise auto.
                            holdActive = false
                            HapticFeedback.medium()
                        case .navigatePrevious:
                            // Tick UNIQUE par navigation manuelle — les
                            // chemins goToNext/goToPrevious et le onChange
                            // de slide ne vibrent plus (l'auto-advance passe
                            // par eux et doit rester silencieux).
                            HapticFeedback.light()
                            onPrevious()
                        case .navigateNext:
                            HapticFeedback.light()
                            onNext()
                        case .togglePause:
                            break  // décidé sur le double tap, pas au touchUp
                        case .resumeFromPause:
                            break  // décidé au touchDown, pas au touchUp
                        }
                    }
            )
            // Annule un hold armé si la scène devient inactive — évite que
            // `Task.sleep(200ms)` continue à courir en background et fire au
            // retour foreground, paus​ant la story sans cause visible.
            .adaptiveOnChange(of: scenePhase) { _, newPhase in
                if newPhase != .active {
                    holdArmingTask?.cancel()
                    holdArmingTask = nil
                    if holdActive {
                        holdActive = false
                        isLongPressPaused = false
                    }
                }
            }
            // Filet anti-état-collant : le parent bump ce jeton quand un chemin
            // gestuel non nominal s'est produit (snap-back, transition de groupe,
            // sortie du lecteur). Notre `onEnded` n'ayant PAS été appelé dans ces
            // cas — SwiftUI le saute quand un recognizer concurrent emporte la
            // séquence —, `touchStartTime` resterait posé et la branche
            // « DRAG IN PROGRESS » avalerait tous les touchers suivants.
            .adaptiveOnChange(of: gestureResetToken) { _, _ in
                holdArmingTask?.cancel()
                holdArmingTask = nil
                touchStartTime = nil
                didExceedSlop = false
                holdActive = false
                isResumingTap = false
            }
            // Exclude the bottom composer zone from tap targets
            .padding(.bottom, 120 + geometry.safeAreaInsets.bottom)
    }
}

// MARK: - Story Gesture Decisions (pure, testable)

/// État d'un toucher en cours sur l'overlay story — capture le minimum
/// nécessaire pour décider quoi faire au touch-down et au touch-up sans
/// avoir besoin du contexte SwiftUI (`@State`, `View`).
///
/// Utilisé par `StoryGestureOverlayView` à travers `StoryGestureDecisions`
/// pour rendre le comportement testable en XCTest.
struct StoryGestureContext: Equatable {
    /// `true` si le toucher en cours est un long-press confirmé (≥ 200 ms).
    var holdActive: Bool
    /// `true` si la story est en pause (source de vérité : long-press
    /// posé `true`, tap suivant pose `false`).
    var isPaused: Bool
    /// `true` si le tap en cours est le tap de reprise (touch-down a remis
    /// `isPaused = false`) — son release doit être consommé sans nav.
    var isResumingTap: Bool
    /// `true` si le composer est focused / engaged — toutes les actions
    /// gestuelles sont court-circuitées dans ce cas.
    var isComposerEngaged: Bool
    /// `true` si le doigt a franchi le slop de tap pendant ce toucher. Le drag
    /// parent (`unifiedDragGesture`) est reconnu EN PARALLÈLE depuis le fix de
    /// précédence : sans ce drapeau, un swipe rapide parti d'une bande latérale
    /// validerait à la fois une navigation de story et un changement de groupe.
    /// Défaut `false` = « toucher immobile », le cas historique — les contextes
    /// existants (dont ceux des tests) restent valides sans être modifiés.
    var didExceedSlop: Bool = false
}

/// Action à appliquer suite à un événement gestuel sur l'overlay story.
/// Pure value type — pas d'effet de bord ; le caller (la View) traduit
/// l'action en appels aux callbacks.
enum StoryGestureAction: Equatable {
    /// Rien à faire (no-op de cohérence : seuil franchi sans suite, etc.).
    case none
    /// Le composer était engagé : on délègue à `onDismissComposer`.
    case dismissComposer
    /// Touch-down sur story en pause → reprend la lecture (pose `isPaused
    /// = false`) et arme `isResumingTap = true` pour neutraliser le release.
    case resumeFromPause
    /// Touch-up d'un long-press confirmé : la story reste en pause
    /// (`isPaused` est resté `true`), pas de nav.
    case confirmLongPressPause
    /// Tap court → navigation slide précédente (bande gauche).
    case navigatePrevious
    /// Tap court → navigation slide suivante (bande droite).
    case navigateNext
    /// Double tap dans la bande centrale → bascule pause / lecture.
    case togglePause
}

/// Bande horizontale sous le doigt, au touch-down.
///
/// La navigation par tap est le geste le plus fréquent d'une story : elle doit
/// rester IMMÉDIATE. Un double tap actif sur tout l'écran forcerait le tap
/// simple à attendre l'échec du double tap (~250 ms) et rendrait la navigation
/// molle. On réserve donc une bande centrale au double tap, et les bords
/// naviguent sans délai (décision utilisateur 2026-07-25).
///
/// Le long-press reste un raccourci de pause disponible sur toute la surface.
enum StoryTapZone: Equatable {
    case previous
    case center
    case next

    /// Fraction de largeur occupée par CHAQUE bande de navigation.
    static let edgeFraction: CGFloat = 0.30

    static func zone(forX x: CGFloat, width: CGFloat) -> StoryTapZone {
        // Largeur dégénérée : pas de division, on garde le comportement
        // historique du bord (`.next`).
        guard width > 0 else { return .next }
        let edge = width * edgeFraction
        if x < edge { return .previous }
        if x >= width - edge { return .next }
        return .center
    }
}

/// Action verticale résolue au relâchement d'un drag vertical.
enum StoryVerticalGestureAction: Equatable {
    /// Sous le seuil : la vue revient à sa position initiale.
    case cancel
    /// Swipe haut en mode fenêtré → passe en plein écran.
    case enterFullscreen
    /// Swipe bas en plein écran → revient en mode fenêtré (ne quitte PAS).
    case exitFullscreen
    /// Swipe bas en mode fenêtré → quitte la story.
    case dismissViewer
    /// Rien à faire (swipe haut alors qu'on est déjà en plein écran).
    case none
    /// Une surface du lecteur est ouverte : le geste lui revient. Elle se
    /// referme, et RIEN d'autre ne se produit — parité avec la garde du
    /// toucher (`StoryReaderCanvas`, touch-down sur `hasActiveFeature`).
    case dismissActiveFeature
}

/// Décide du sort d'un drag vertical selon l'état plein écran.
///
/// Le swipe bas porte DEUX sens selon le contexte ; la règle « sortir du plein
/// écran » prime sur « quitter la story » (spec 2026-07-25), sinon il serait
/// impossible de revenir en mode fenêtré au doigt.
enum StoryVerticalGestureDecisions {

    /// - Parameters:
    ///   - translationY: translation verticale courante (positif = vers le bas).
    ///   - predictedY: translation projetée par l'inertie — permet de valider
    ///     un flick court mais rapide.
    ///   - isFullscreen: état plein écran au moment du relâchement.
    ///   - threshold: distance de validation en points.
    ///   - hasActiveFeature: une surface du lecteur est ouverte (strip de
    ///     langues, barre d'emojis, overlay de commentaires, transcription).
    ///     Elle CONSOMME alors tout geste vertical franchissant le seuil, dans
    ///     les deux sens : sans cette garde, un swipe bas fermait le lecteur et
    ///     l'utilisateur perdait la story EN PLUS de son overlay, alors qu'il
    ///     voulait seulement refermer ce dernier. Parité avec la garde du
    ///     toucher, où le premier contact referme la surface et rien d'autre.
    static func decide(translationY: CGFloat,
                       predictedY: CGFloat,
                       isFullscreen: Bool,
                       threshold: CGFloat,
                       hasActiveFeature: Bool = false) -> StoryVerticalGestureAction {
        let predictionThreshold = threshold * 2.5

        let goesDown = translationY > threshold || predictedY > predictionThreshold
        let goesUp = translationY < -threshold || predictedY < -predictionThreshold

        // Sous le seuil, on ne referme rien : un micro-mouvement ne doit pas
        // escamoter une surface que l'utilisateur est peut-être en train de lire.
        if hasActiveFeature { return (goesDown || goesUp) ? .dismissActiveFeature : .cancel }

        if goesDown { return isFullscreen ? .exitFullscreen : .dismissViewer }
        if goesUp { return isFullscreen ? .none : .enterFullscreen }
        return .cancel
    }
}

/// Namespace de fonctions pures qui décident des transitions de l'overlay
/// gestuel story. Découplé de SwiftUI pour être unit-testable.
///
/// **Sémantique** : `isPaused` est l'unique source de vérité du toggle
/// long-press. La story est en pause ⇔ `isPaused == true` ⇔ timer arrêté
/// + tout média (bg vidéo, audios, effets) en pause.
enum StoryGestureDecisions {

    /// Décide quoi faire au TOUCH-DOWN d'un nouveau geste sur l'overlay.
    ///
    /// Un toucher **sur les bords** reprend une lecture en pause : la
    /// navigation gauche/droite doit rester immédiate en toutes circonstances.
    /// Dans la **bande centrale**, on ne reprend PAS — cette bande appartient au
    /// double tap, dont le premier relâchement relancerait sinon la story avant
    /// que le second n'arrive, rendant impossible le « double tap relance »
    /// (spec 2026-07-25).
    static func decideTouchDown(context: StoryGestureContext,
                                touchStartX: CGFloat,
                                width: CGFloat) -> StoryGestureAction {
        if context.isComposerEngaged { return .none }
        guard context.isPaused else { return .none }
        return StoryTapZone.zone(forX: touchStartX, width: width) == .center
            ? .none
            : .resumeFromPause
    }

    /// Décide quoi faire au TOUCH-UP (.onEnded) d'un geste.
    ///
    /// - Parameters:
    ///   - context: état courant du toucher.
    ///   - touchStartX: coordonnée X du touch-down (pour décider la bande).
    ///   - width: largeur du viewport.
    ///   - elapsed: durée écoulée depuis le touch-down (s).
    ///   - holdThreshold: seuil long-press en secondes.
    ///
    /// La bande centrale ne navigue PAS : elle est réservée au double tap
    /// (pause). Sans cela, le premier tap d'un double tap ferait avancer la
    /// story avant l'arrivée du second.
    static func decideTouchUp(
        context: StoryGestureContext,
        touchStartX: CGFloat,
        width: CGFloat,
        elapsed: TimeInterval,
        holdThreshold: TimeInterval
    ) -> StoryGestureAction {
        if context.isComposerEngaged { return .dismissComposer }
        if context.isResumingTap { return .none }
        if context.holdActive { return .confirmLongPressPause }
        // Le doigt a bougé : ce n'était pas un tap. Le geste appartient au drag
        // parent, qui décidera seul du changement de groupe / du plein écran.
        // Sans cette porte, un swipe parti d'une bande latérale naviguait d'une
        // story ET changeait de groupe — les deux recognizers étant désormais
        // simultanés. Placé APRÈS `holdActive` : un hold confirmé puis relâché
        // garde son contrat (`confirmLongPressPause`), inchangé.
        if context.didExceedSlop { return .none }
        // Race rare : seuil franchi mais le tick `onChanged` n'a pas posé
        // `holdActive = true` à temps. On évite la nav surprise.
        if elapsed >= holdThreshold { return .none }
        switch StoryTapZone.zone(forX: touchStartX, width: width) {
        case .previous: return .navigatePrevious
        case .next: return .navigateNext
        case .center: return .none
        }
    }

    /// Décide quoi faire sur un DOUBLE TAP.
    ///
    /// Actif uniquement dans la bande centrale : sur les bords, les deux taps
    /// ont déjà navigué immédiatement, il n'y a plus rien à décider.
    static func decideDoubleTap(
        context: StoryGestureContext,
        touchStartX: CGFloat,
        width: CGFloat
    ) -> StoryGestureAction {
        if context.isComposerEngaged { return .dismissComposer }
        guard StoryTapZone.zone(forX: touchStartX, width: width) == .center else { return .none }
        return .togglePause
    }
}

// MARK: - Story Composer Bar

/// **UNIQUE composer** du story viewer (réutilisé en mode story-reply ET
/// en mode comment-reply). Extrait de `StoryViewerView.storyComposerBar`
/// pour que le wiring `UniversalComposerBar` soit son propre type-metadata
/// unit.
///
/// Spec user 2026-05-28 : « Il faut avoir qu'une seule zone de saisie de
/// commentaire ». L'overlay commentaires affiche uniquement la LISTE +
/// actions reply/like ; le composer reste celui-ci, toujours présent en bas
/// de l'écran. Quand l'utilisateur tape « Répondre » sur un commentaire,
/// `replyingToStoryComment` est set → une banner « Réponse à X » apparaît
/// au-dessus de la rangée de saisie de CE composer (pas dans un second
/// composer).
struct StoryComposerBarView: View {
    let accentColor: String
    let storyId: String?

    @Binding var composerLanguage: String
    @Binding var commentEffects: MessageEffects
    @Binding var commentBlurEnabled: Bool
    @Binding var isComposerEngaged: Bool
    @Binding var showTextEmojiPicker: Bool
    @Binding var hasComposerContent: Bool
    @Binding var emojiToInject: String
    @Binding var composerFocusTrigger: Bool
    @Binding var storyDrafts: [String: StoryDraft]
    @Binding var replyingToStoryComment: FeedComment?

    /// `parentId` non-nil quand l'utilisateur répond à un commentaire (via
    /// `replyingToStoryComment` set par l'overlay). Sinon nil → commentaire
    /// top-level sur la story. `pendingMedia` non-nil = commentaire avec UN média.
    /// `place` non-nil = un lieu a été choisi via le picker et voyage jusqu'à
    /// l'envoi, exactement comme n'importe quel autre message/commentaire.
    let sendComment: (_ text: String, _ effectFlags: Int?, _ parentId: String?, _ pendingMedia: PendingCommentMedia?, _ place: SharedPlace?) -> Void

    // Comment attachments + real voice capture (parity with feed/reels composer).
    @State private var commentAttachments: [ComposerAttachment] = []
    @State private var showCommentPhotoPicker: Bool = false
    @State private var commentPhotoItems: [PhotosPickerItem] = []
    @State private var showCommentFilePicker: Bool = false
    @State private var showCommentLocationPicker: Bool = false
    @State private var pendingPlace: SharedPlace? = nil
    /// Focus réel du champ du composer — pilote l'insertion d'un texte déposé
    /// (au curseur quand le champ a le focus, sinon à la fin via `emojiToInject`).
    @State private var composerIsFocused: Bool = false
    @StateObject private var audioRecorder = AudioRecorderManager()

    /// Accent RÉSOLU du composer : celui du commentaire auquel on répond,
    /// sinon celui de la story.
    private var composerAccent: String {
        replyingToStoryComment?.authorColor ?? accentColor
    }

    /// Second arrêt du dégradé servi au composer. Dérivé de `composerAccent`
    /// par la formule de palette du SDK (`secondary = shiftHue(primary, +30°)`) :
    /// sans lui, le composer retombe sur son défaut de marque et le bouton
    /// d'envoi rend un dégradé hybride accent → indigo.
    private var composerSecondaryColor: String {
        DynamicColorGenerator.hueShiftedHex(composerAccent, degrees: 30)
    }

    var body: some View {
        UniversalComposerBar(
            style: .dark,
            mode: .comment,
            onIngest: { ingests in handleComposerIngest(ingests) },
            accentColor: composerAccent,
            secondaryColor: composerSecondaryColor,
            forceShowAttachment: true,
            forceShowVoice: true,
            selectedLanguage: composerLanguage,
            onLanguageChange: { composerLanguage = $0 },
            onFocusChange: { focused in
                composerIsFocused = focused
                if focused {
                    isComposerEngaged = true
                    // Keyboard opening → dismiss emoji panel
                    if showTextEmojiPicker {
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                            showTextEmojiPicker = false
                        }
                    }
                } else {
                    // Only disengage if emoji panel isn't showing
                    if !showTextEmojiPicker {
                        isComposerEngaged = false
                    }
                }
            },
            onSendMessage: { text, attachments, _ in submitStoryComment(text: text, attachments: attachments) },
            onLocationRequest: { showCommentLocationPicker = true },
            replyBanner: replyingToStoryComment.map { reply in
                AnyView(
                    HStack(spacing: 8) {
                        RoundedRectangle(cornerRadius: 2)
                            .fill(Color(hex: reply.authorColor))
                            .frame(width: 3, height: 30)

                        VStack(alignment: .leading, spacing: 1) {
                            HStack(spacing: 4) {
                                Image(systemName: "arrowshape.turn.up.left.fill")
                                    .font(MeeshyFont.relative(9, weight: .semibold))
                                    .foregroundColor(Color(hex: reply.authorColor))
                                Text(String(localized: "story.viewer.replyTo", defaultValue: "R\u{00E9}ponse \u{00E0} \(reply.author)", bundle: .main))
                                    .font(MeeshyFont.relative(11, weight: .semibold))
                                    .foregroundColor(Color(hex: reply.authorColor))
                            }
                            Text(reply.displayContent)
                                .font(MeeshyFont.relative(11))
                                .foregroundColor(.white.opacity(0.6))
                                .lineLimit(1)
                        }

                        Spacer()

                        Button {
                            withAnimation(.spring(response: 0.25, dampingFraction: 0.8)) {
                                replyingToStoryComment = nil
                            }
                        } label: {
                            Image(systemName: "xmark")
                                // Doctrine 82i : glyphe de chrome dans un cadre tap fixe 22×22 → figé.
                                .font(.system(size: 9, weight: .bold))
                                .foregroundColor(.white.opacity(0.6))
                                .frame(width: 22, height: 22)
                                .background(Circle().fill(Color.white.opacity(0.12)))
                        }
                        .accessibilityLabel(String(localized: "story.viewer.reply.cancel", defaultValue: "Annuler la réponse", bundle: .main))
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(Color(hex: reply.authorColor).opacity(0.18))
                    .overlay(
                        Rectangle()
                            .fill(Color(hex: reply.authorColor).opacity(0.35))
                            .frame(height: 0.5),
                        alignment: .bottom
                    )
                )
            },
            customAttachmentsPreview: (commentAttachments.isEmpty && pendingPlace == nil)
                ? nil
                : AnyView(CommentAttachmentsTray(attachments: commentAttachments, onRemove: { id in
                    commentAttachments.removeAll { $0.id == id }
                  }, place: pendingPlace, onRemovePlace: { pendingPlace = nil })),
            onStartRecording: { audioRecorder.startRecording(); HapticFeedback.medium() },
            onStopRecordingToAttachment: { stopRecordingToAttachment() },
            onSendRecording: { if stopRecordingToAttachment() { submitStoryComment(text: "", attachments: commentAttachments) } },
            onCancelRecording: { audioRecorder.cancelRecording() },
            externalIsRecording: audioRecorder.isRecording,
            externalRecordingDuration: audioRecorder.duration,
            externalAudioLevels: audioRecorder.audioLevels,
            externalHasContent: !commentAttachments.isEmpty || audioRecorder.isRecording || pendingPlace != nil,
            onPhotoLibrary: { showCommentPhotoPicker = true },
            onFilePicker: { showCommentFilePicker = true },
            onShowAttachments: {
                // Attachment carousel opening → dismiss the emoji panel so the
                // two bottom surfaces never stack.
                if showTextEmojiPicker {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                        showTextEmojiPicker = false
                    }
                }
            },
            onRequestTextEmoji: {
                isComposerEngaged = true
                // Dismiss keyboard first, then show emoji panel
                UIApplication.shared.sendAction(
                    #selector(UIResponder.resignFirstResponder),
                    to: nil, from: nil, for: nil
                )
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                    withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
                        showTextEmojiPicker = true
                    }
                }
            },
            injectedEmoji: $emojiToInject,
            isBlurEnabled: $commentBlurEnabled,
            pendingEffects: $commentEffects,
            storyId: storyId,
            onSaveDraft: { storyId, text, attachments in
                if text.isEmpty && attachments.isEmpty {
                    storyDrafts.removeValue(forKey: storyId)
                } else {
                    storyDrafts[storyId] = StoryDraft(text: text, attachments: attachments)
                }
            },
            getDraft: { storyId in
                guard let draft = storyDrafts[storyId] else { return nil }
                return (text: draft.text, attachments: draft.attachments)
            },
            onAnyInteraction: {
                // No-op: shouldPauseTimer handles all pause logic based on UI state
            },
            focusTrigger: $composerFocusTrigger,
            onRecordingChange: { recording in
                isComposerEngaged = recording
            },
            onHasContentChange: { hasContent in
                hasComposerContent = hasContent
            }
        )
        .photosPicker(
            isPresented: $showCommentPhotoPicker,
            selection: $commentPhotoItems,
            maxSelectionCount: 1,
            matching: .any(of: [.images, .videos])
        )
        .fileImporter(
            isPresented: $showCommentFilePicker,
            allowedContentTypes: [.item],
            allowsMultipleSelection: false
        ) { result in
            if case .success(let urls) = result {
                commentAttachments = CommentComposerStaging.fileAttachments(from: urls)
            }
        }
        .sheet(isPresented: $showCommentLocationPicker) {
            LocationPickerView(accentColor: accentColor) { place in
                pendingPlace = place
                showCommentLocationPicker = false
            }
        }
        .adaptiveOnChange(of: commentPhotoItems) { _, items in
            Task {
                commentAttachments = await CommentComposerStaging.photoAttachments(from: items)
                await MainActor.run { commentPhotoItems = [] }
            }
        }
    }

    /// Dépôt / collage arrivé par la bande du composer (`onIngest`). Un dépôt
    /// est une interaction utilisateur : il engage le composer
    /// (`isComposerEngaged`), ce qui met le minuteur de story en pause via
    /// `shouldPauseTimer` — exactement comme la saisie le fait déjà par le
    /// focus ; le tap sur la story (`dismissComposer`) le relâche. Textes
    /// fusionnés en UNE insertion (au curseur si focus ; sinon en fin de champ
    /// via le canal `injectedEmoji` — cette surface n'a pas de binding texte),
    /// fichiers routés vers le staging commentaire existant (spec 2026-07-30).
    private func handleComposerIngest(_ ingests: [ComposerIngest]) {
        isComposerEngaged = true
        if let block = CommentComposerIngestion.mergedText(from: ingests) {
            if !(composerIsFocused && CommentComposerIngestion.insertAtCursor(block)) {
                emojiToInject = block
            }
        }
        CommentComposerIngestion.stageFiles(
            CommentComposerIngestion.files(from: ingests),
            accentColor: accentColor
        ) { staged in
            withAnimation(.spring(response: 0.25, dampingFraction: 0.8)) {
                commentAttachments.append(contentsOf: staged)
            }
        }
    }

    /// Construit le média éventuel (un seul) + appelle le `sendComment` injecté avec
    /// le pendingMedia. Capture `parentId` AVANT de clear le reply context.
    /// Une réponse à une story part comme un message : elle porte donc le lieu
    /// choisi exactement comme n'importe quel autre message (une story est un
    /// post de type STORY côté gateway — même route `/posts/:id/comments`).
    private func submitStoryComment(text: String, attachments: [ComposerAttachment]) {
        let media = CommentComposerStaging.firstPendingMedia(in: attachments)
        commentAttachments.removeAll()
        let place = pendingPlace
        pendingPlace = nil
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty || media != nil || place != nil else { return }
        let effects = commentEffects
        let blur = commentBlurEnabled
        commentEffects = .none
        commentBlurEnabled = false
        let flags = effects.flags.rawValue | (blur ? MessageEffectFlags.blurred.rawValue : 0)
        let effectFlags = flags > 0 ? Int(flags) : nil
        // Réponse plate à 2 niveaux : répondre à une réponse rattache au MÊME parent
        // racine (sinon la réponse-de-réponse atterrissait dans un bucket jamais rendu
        // → commentaire invisible). L'auteur ciblé est notifié via la @mention injectée
        // à l'ouverture de la réponse (cf. makeStoryCommentRow).
        let parentId = replyingToStoryComment?.parentId ?? replyingToStoryComment?.id
        replyingToStoryComment = nil
        sendComment(trimmed, effectFlags, parentId, media, place)
    }

    @discardableResult
    private func stopRecordingToAttachment() -> Bool {
        guard audioRecorder.duration > 0.5 else {
            audioRecorder.cancelRecording()
            return false
        }
        let duration = audioRecorder.duration
        guard let url = audioRecorder.stopRecording() else { return false }
        commentAttachments.append(CommentComposerStaging.voiceAttachment(duration: duration, url: url))
        return true
    }
}

// MARK: - Story Card

/// Cache à 1 entrée du `StorySlide` renderable de la slide courante.
/// `toRenderableSlide` résout les traductions (Prisme) et hydrate les durées
/// média — l'appeler 3× par évaluation de body (representable + check fond
/// média + backdrop), à chaque tick de barre pendant la lecture, recompose
/// l'intégralité du slide pour rien. Classe boxée en `@State` : survit aux
/// re-créations de la struct ; invalidée par fingerprint (id + chaîne de
/// langues + counts de traductions par textObject — couvre les merges de
/// traductions temps réel `story:translation-updated`).
@MainActor
final class RenderableSlideCache {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    private var key: String = ""
    private var cached: StorySlide?

    func slide(for story: StoryItem, chain: [String]) -> StorySlide {
        let translationCounts = (story.storyEffects?.textObjects ?? [])
            .map { String($0.translations?.count ?? 0) }
            .joined(separator: ".")
        let newKey = "\(story.id)|\(chain.joined(separator: ","))|\(translationCounts)"
        if newKey == key, let cached { return cached }
        let slide = story.toRenderableSlide(preferredLanguages: chain)
        key = newKey
        cached = slide
        return slide
    }
}

/// The full story canvas: background, pixel-perfect reader, voice caption,
/// audio badge, translation badge, scrims, gesture overlay, progress bars,
/// header, action sidebar, big-reaction overlay, comments overlay, composer
/// and the full emoji / language pickers.
///
/// Extracted from `StoryViewerView.storyCard(geometry:)` (formerly an
/// `AnyView`) so its ~10-layer `ZStack` is its own type-metadata unit.
struct StoryCardView: View {
    let geometry: GeometryProxy

    /// Cf. doc de `RenderableSlideCache` — partagé par les 3 lecteurs du
    /// slide renderable dans ce body (representable, fond média, backdrop).
    @State private var renderableSlideCache = RenderableSlideCache()

    // Story content
    let currentStory: StoryItem?
    let outgoingStory: StoryItem?
    let currentGroup: StoryGroup?
    let currentStoryIndex: Int
    let resolvedViewerLanguage: String?
    let resolvedViewerLanguageChain: [String]
    let preloadedImages: [String: UIImage]
    let preloadedVideoURLs: [String: URL]
    let preloadedAudioURLs: [String: URL]
    let currentVoiceCaption: String?
    /// La légende est-elle dépliée ? **L'état vit chez le PARENT**, pas ici :
    /// déplier doit SUSPENDRE la story — sinon elle avance pendant qu'on lit —
    /// et une carte de contenu n'a pas à décider de l'horloge de lecture.
    let isCaptionExpanded: Bool
    let onCaptionExpansionToggled: () -> Void
    let isContentTranslated: Bool
    let isOwnStory: Bool
    let quickEmojis: [String]

    // Animation drivers (written by parent transition funcs)
    let progress: CGFloat
    let currentSlideDuration: TimeInterval
    let outgoingOpacity: Double
    let closingScale: CGFloat
    let contentOpacity: Double
    let textSlideOffset: CGFloat
    let openingScale: CGFloat
    /// Fraction de la LARGEUR du canvas dont l'ouverture `.slide` décale
    /// horizontalement — même unité et même sens que
    /// `StoryRenderer.slideTransitionTravelFraction`.
    let openingSlideFraction: CGFloat
    let isRevealActive: Bool
    /// Réaction en vol tuile → cœur (remplace la big reaction 100 pt) — écrit
    /// par cette vue (Layer 9 : arrivée, fin de vol) et lu (préférence du
    /// cœur → `heartFrame`), d'où le `@Binding`.
    @Binding var reactionFlight: StoryReactionFlight?
    /// Cadre du bouton cœur dans `StoryScrubSpace`, publié par le Sidebar via
    /// `StoryHeartFrameKey` et capté ici (`.onPreferenceChange`) — cible du vol.
    @Binding var heartFrame: CGRect
    /// Tique à l'arrivée du vol (Layer 9 `onArrived`) — d'où le `@Binding`
    /// (avant : simple `let`, jamais muté depuis cette vue).
    @Binding var heartBouncePulse: Int

    // Sidebar inputs
    let storyReactionCount: Int
    let storyCurrentUserHasReacted: Bool
    let storyCommentCount: Int
    /// Voir `StoryViewerView.storyCommentCountReconciledPulse` — forwarded
    /// verbatim, ne tique QUE sur la réconciliation d'ouverture, jamais sur
    /// une activité temps réel.
    let storyCommentCountReconciledPulse: Int
    let storyShareCount: Int
    let storyViewCount: Int
    let storyRepostCount: Int
    let isStoryCommentsEmpty: Bool
    let storyHasAudibleSound: Bool
    let storyHasTranslatableContent: Bool
    /// Annonce du fond (B3.3-5) — résolveur unique partagé avec la carte de
    /// post et le plein écran réel (E1). Remplace `storyHasBackgroundAudio` +
    /// `headerBackgroundAudioDisplay` : primitive Equatable descendue en
    /// `let` depuis `StoryViewerView.backgroundSoundAnnouncement`, même
    /// règle que `storyHasAudibleSound` juste au-dessus.
    let backgroundSoundAnnouncement: BackgroundAudioAnnouncement
    /// Présence d'une transcription affichable — pilote l'entrée « Transcription »
    /// du menu « … ». Même règle de descente en primitive que ci-dessus.
    let storyHasAudioTranscript: Bool
    let isGlobalMuted: Bool
    let availableTranslationLanguages: [TranslationLanguage]
    /// Langue d'exploration active (`nil` = chaine préférée). Descendue en `let`
    /// jusqu'au strip pour y marquer le drapeau lu.
    let activeLanguageCode: String?
    /// `true` quand une surface du reader est ouverte — le prochain toucher la
    /// referme au lieu de naviguer.
    let hasActiveReaderFeature: Bool
    let onDismissActiveReaderFeature: () -> Void
    let onReplyToStory: ((ReplyContext) -> Void)?
    /// Prisme « Exploration » : appelé quand l'utilisateur choisit une langue dans le
    /// picker/strip pour afficher le contenu dans cette langue (override éphémère).
    let onSelectLanguageOverride: (String) -> Void

    // Header inputs
    let composerAccentColor: String

    // Comments overlay inputs
    let storyComments: [FeedComment]
    let storyCommentRepliesMap: [String: [FeedComment]]
    let storyCommentExpandedThreads: Set<String>
    let storyCommentLoadingReplies: Set<String>
    let isLoadingComments: Bool
    let commentsUserLang: String

    // Bindings — UI state owned by the viewer
    @Binding var isContentReady: Bool
    @Binding var showEmojiStrip: Bool
    @Binding var showFullEmojiPicker: Bool
    @Binding var showCommentsOverlay: Bool
    @Binding var showAudioTranscript: Bool
    @Binding var showLanguageOptions: Bool
    @Binding var showFullLanguagePicker: Bool
    @Binding var showViewersSheet: Bool
    @Binding var showExportShareSheet: Bool
    @Binding var isGlobalMutedBinding: Bool
    @Binding var showTextEmojiPicker: Bool
    @Binding var isComposerEngaged: Bool
    @Binding var hasComposerContent: Bool
    @Binding var sharedContentWrapper: SharedContentWrapper?
    /// Republication en STORY — voir la présentation dans `StoryViewerView`.
    @Binding var republishStorySource: RepostPostSourceWrapper?
    @Binding var editAndRepostAsPostSource: RepostPostSourceWrapper?
    /// Lieu ouvert plein écran au tap d'une pastille de position (Layer 6.6).
    @Binding var readerFullscreenPlace: StoryReaderPlaceWrapper?
    @Binding var isPresented: Bool
    @Binding var selectedProfileUser: ProfileSheetUser?
    @Binding var showReportSheet: Bool
    @Binding var replyingToStoryComment: FeedComment?
    @Binding var composerLanguage: String
    @Binding var commentEffects: MessageEffects
    @Binding var commentBlurEnabled: Bool
    @Binding var emojiToInject: String
    @Binding var composerFocusTrigger: Bool
    @Binding var storyDrafts: [String: StoryDraft]
    /// Visibilité du chrome (header + sidebar + composer). Drivé par le parent
    /// `StoryViewerView` selon les gestes (touch-and-hold) et l'état session
    /// (mode plein écran via hamburger). Le `Binding` est nécessaire car le
    /// touch-and-hold interne au canvas mute la valeur en temps réel.
    @Binding var chromeVisible: Bool
    /// Mode session « plein écran » toggleable depuis le menu hamburger « … »
    /// du header. Quand actif, le chrome est caché par défaut pour TOUTE la
    /// session story ; un touch-and-hold le révèle temporairement (sémantique
    /// inversée par rapport au mode normal). Binding car le toggle vit dans
    /// le hamburger menu, qui est rendu par le header — qui le mute donc.
    @Binding var isFullscreenStorySession: Bool
    /// État de pause **long-press uniquement**. Bascule à `true` quand le
    /// hold ≥ 200 ms est confirmé, à `false` au prochain tap. Distinct de
    /// `isPaused` (qui couvre toutes les pauses du timer — sheets, drag,
    /// composer engaged). Le parent observe ce drapeau et poste les
    /// notifications canvas (`.storyPlayerPause` / `.storyPlayerResume`)
    /// uniquement sur ses transitions — pas sur celles de `isPaused`.
    @Binding var isLongPressPaused: Bool

    /// Reflète `shouldPauseTimer` du parent (aggrégation des pauses UI : sheets,
    /// composer, drag, long-press, transition). Propagée au canvas via
    /// `MeeshyScenePlayer.isPlaying` (nié) pour que la timeline canvas (vidéo,
    /// audio, displayLink) gèle EN PHASE avec la progress bar du viewer.
    let isCanvasPlaybackPaused: Bool

    /// Jeton de purge de l'état gestuel transient, relayé tel quel à
    /// `StoryGestureOverlayView` (cf. sa doc). Bumpé par le viewer sur les
    /// chemins où SwiftUI a sauté le `onEnded` du recognizer de l'overlay.
    let gestureResetToken: Int
    /// Relayé tel quel à `StoryGestureOverlayView` (cf. sa doc) : l'overlay
    /// gestuel y signale au viewer qu'il a consommé une surface AU TOUCH-DOWN
    /// du toucher courant, information que le drag parent ne peut pas observer
    /// lui-même (il ne s'éveille qu'à 15 pt de déplacement).
    @Binding var readerFeatureConsumedByTouch: Bool

    @ObservedObject var keyboard: KeyboardObserver

    /// Fraction `[0, 1]` de contenu de la slide active disponible localement.
    /// Pilote `StoryReaderLoadingOverlay` (ThumbHash bg + spinner + %) — seul
    /// loader actif (l'ancien `ProgressView` blanc redondant a été retiré).
    /// Cf. spec stories-video-layers-text-sprint § 3.D.
    @State private var slideContentProgress: Double = 0

    /// Gate d'affichage du spinner + % à l'intérieur de l'overlay. La
    /// backdrop ThumbHash, elle, est rendue immédiatement (cache-first).
    /// Activé seulement après 200 ms si la slide n'a pas progressé — évite
    /// que l'utilisateur voie spinner+% flasher sur un cache hit qui se
    /// rend instantanément.
    @State private var showProgressOverlay: Bool = false

    /// R3 — indicateur discret de buffering MID-SLIDE : visible quand la
    /// timeline est gelée par le stall gate (vidéo qui bufferise, audio/image
    /// en cours de cache — R1/R2) APRÈS le chargement initial. Le gel était
    /// jusqu'ici une frame figée muette, indistinguable d'un freeze.
    @State private var showStallIndicator: Bool = false

    /// Délai de grâce avant d'afficher l'indicateur : un micro-stall (< 350 ms,
    /// fréquent sur un seek/loop vidéo) ne doit pas faire flasher un spinner.
    /// La DISPARITION, elle, est immédiate à la reprise. Miroir du pattern
    /// `showProgressOverlay` (200 ms) du loader initial.
    @State private var stallIndicatorGraceTask: Task<Void, Never>?

    // Closures — actions on the parent view
    /// Envoie la réaction ; le CGRect est le cadre (dans StoryScrubSpace) de la
    /// tuile d'origine du vol — nil = pop sur place depuis le cœur (tap direct).
    let triggerStoryReaction: (String, CGRect?) -> Void
    /// Vrai pendant un scrub longpress→drag sur le rail (pause le timer,
    /// neutralise la navigation du canvas).
    let onScrubStateChanged: (Bool) -> Void
    let pauseTimer: () -> Void
    let resumeTimer: () -> Void
    /// Unified-timeline gate : the canvas reports whether its PRIMARY video is
    /// actually progressing (`true`) or stalled/buffering (`false`). The parent
    /// owns `slideTimer` and forwards this to `setPlaybackStalled(!progressing)`
    /// — the stall decision stays app-side (the SDK only emits the raw signal).
    let onPlaybackProgressing: (Bool) -> Void
    let loadStoryComments: () -> Void
    let dismissComposer: () -> Void
    let goToPrevious: () -> Void
    let goToNext: () -> Void
    let sendComment: (_ text: String, _ effectFlags: Int?, _ parentId: String?, _ pendingMedia: PendingCommentMedia?, _ place: SharedPlace?) -> Void
    let makeStoryCommentRow: (FeedComment, String) -> StoryCommentRowView
    let toggleStoryCommentThread: (String) async -> Void
    let makeStoryExternalShareURL: (String) -> URL?
    let deleteCurrentStory: () -> Void
    let repostAsPostDirect: () -> Void
    let dismissViewer: () -> Void
    let reportStory: (_ storyId: String, _ reportType: String, _ reason: String?) async throws -> Void
    let composerBottomPadding: (GeometryProxy) -> CGFloat

    /// Builds the Instagram-style floating comments overlay. Conditional on
    /// `showCommentsOverlay`. Placed in the ZStack BEFORE the controls
    /// (sidebar / header / composer) so it renders BEHIND them — user can
    /// still tap React / Reply / Settings even with comments visible
    /// (user spec 2026-05-28 « le layer de commentaire doit apparaitre en
    /// dessous des layer des controles de la story »).
    let makeCommentsOverlay: () -> StoryCommentsOverlayView

    private var topInset: CGFloat {
        max(geometry.safeAreaInsets.top, 59)
    }

    /// **La description de la story, affichée PAR-DESSUS le canvas composé (B2, #3925).**
    ///
    /// Le composer unifié garde UN seul contenu (`documentText` → `slide.content`
    /// → `story.content`) et le publie ; jusqu'ici le viewer ne le rendait JAMAIS
    /// au-dessus du média (seule la transcription vocale s'y superposait). B2 le
    /// rend, comme la légende d'un réel (`ReelsPlayerView.reelDescriptionText`) —
    /// c'est la face lecture de la section description repliable du composer.
    ///
    /// **Résolu par le Prisme** : `resolvedContent(preferredLanguages:)` descend
    /// la chaîne complète (systemLanguage > regionalLanguage > customDestination
    /// > deviceLocale) et retombe sur l'ORIGINAL, jamais `translations.first`.
    /// `nil` sur contenu vide — un contrôle sans matière est absent (loi 4).
    private var currentStoryDescription: String? {
        guard let story = currentStory,
              let resolved = story.resolvedContent(preferredLanguages: resolvedViewerLanguageChain),
              !resolved.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        else { return nil }
        return resolved
    }

    /// Dimensions strictes 9:16 du canvas dans la géométrie courante.
    /// `.aspectRatio(.fit) + .frame(maxWidth/Height)` ne contraint pas
    /// correctement l'hôte canvas (`UIViewRepresentable`, monté sous
    /// `MeeshyScenePlayer`) sur iPhone 16 Pro (402×874pt) — le canvas se retrouvait à 491×754pt
    /// (height-fit avec width qui déborde) au lieu de 402×715pt (width-fit
    /// attendu). La sidebar droite tombait alors hors écran à x=389+w=46
    /// → out of 402 (bug 2026-05-27). On force ici les dimensions explicites
    /// par calcul direct du fit ratio.
    /// Ratio (largeur / hauteur) du canvas de la story courante. L'auteur a figé
    /// la forme à la composition (« l'import de l'image de fond impose le cadre et
    /// forme du Canvas ») : un fond paysage → 16:9 horizontal, sinon 9:16 vertical
    /// par défaut. Fallback portrait pour toutes les stories antérieures.
    private var readerCanvasRatio: CGFloat {
        CGFloat(currentStory?.storyEffects?.canvasAspect.ratio ?? Double(CanvasGeometry.portraitRatio))
    }

    /// La PORTE du lecteur de scènes — écrite une fois, partagée par les DEUX
    /// canvas. `nil` = cette story n'a pas de document v3 natif, et se peint par
    /// l'hôte canvas direct.
    ///
    /// Le fil sert du v3 : le décodeur de `StoryEffects` pose alors `canvasV3`,
    /// snapshot de LECTURE du document reçu, et rend le runtime v1 depuis lui —
    /// servir ce snapshot au player est l'identité, pas une conversion.
    ///
    /// **Pourquoi une porte, et non un montage inconditionnel.** La raison
    /// d'origine — iOS ne posait AUCUN `X-Canvas-Caps`, donc `canvasV3` valait
    /// `nil` pour cent pour cent des stories — N'EST PLUS VRAIE : l'en-tête est
    /// posé depuis le 2026-08-22 (`ClientInfoProvider.swift`) et le gateway sert
    /// du v3 natif. La seconde raison est tombée le même jour : l'aller-retour
    /// n'est plus lossy, la scène logeant son `carrierAspect` et le retour
    /// appliquant le remap inverse (`CanvasV3MigrationTests`
    /// `.v1RoundTripThroughV3_isFAITHFUL_nowThatTheSceneCarriesItsAspect`).
    ///
    /// Ce qui MAINTIENT la porte aujourd'hui n'est donc plus une perte, mais la
    /// prudence : la retirer change ce que le lecteur peint pour toute
    /// l'archive v1 restante, et `readerCanvasRatio` encadre au ratio RÉEL de la
    /// story. Ce changement de rendu se mesure et se livre pour lui-même.
    ///
    /// La porte rend les deux branches SELF-COHÉRENTES. L'archive v1 se peint
    /// dans son propre cadre, exactement comme avant le swap E4. Une story
    /// v3-native se peint elle aussi dans son cadre RÉEL, pas systématiquement
    /// en 9:16 : `StoryEffects(rendering:)` restaure `canvasAspectRatio` depuis
    /// `scene.carrierAspect` quand la scène l'a logé
    /// (`CanvasV3Migration.swift:543`) — un fond paysage composé nativement en
    /// v3 (le composer pose `carrierAspect` à l'écriture, cf.
    /// `CanvasV3Migration.swift:338`) garde donc son 16:9 ; seule une scène qui
    /// n'a jamais porté de `carrierAspect` (fond déjà portrait) retombe sur le
    /// défaut portrait — et c'est alors le bon rendu. L'en-tête
    /// `X-Canvas-Caps: 3` est posé depuis `cf05538d9` (2026-08-22,
    /// `ClientInfoProvider.swift:77`) : la porte ci-dessus reste fermée
    /// aujourd'hui par PRUDENCE (paragraphe précédent), plus faute de l'en-tête.
    private func nativeSceneDocument(of story: StoryItem) -> CanvasV3? {
        story.storyEffects?.canvasV3
    }

    /// Couche contenu du canvas SORTANT du cross-fade, derrière la porte v3.
    ///
    /// `isOutgoing: true` des deux côtés : le sortant naît en `.edit` dès
    /// `makeUIView`, ses AVPlayer bg/FG et son mixer audio ne démarrent JAMAIS —
    /// sans quoi les deux canvas jouent en double 350-400 ms à chaque avance
    /// (bug user 2026-05-28). Visuellement le slide reste rendu (image bg +
    /// textes), seule l'animation vidéo est gelée — invisible à l'œil pendant
    /// une sortie en opacity sur 350 ms.
    ///
    /// `carrier: outgoing` — le document dit QUOI peindre, jamais où vivent les
    /// pixels : c'est le porteur qui indexe les médias. Le canvas sortant rend le
    /// MÊME slide que celui qu'on quitte ; sans porteur il repartirait d'une
    /// coquille (`media == []`) le temps du fondu.
    ///
    /// `isPlaying: .constant(false)` : le sortant ne joue jamais.
    @ViewBuilder
    private func outgoingContentHost(_ outgoing: StoryItem) -> some View {
        if let document = nativeSceneDocument(of: outgoing) {
            MeeshyScenePlayer(document: document,
                              mode: .reader,
                              sceneIndex: .constant(0),
                              isPlaying: .constant(false),
                              accentColorHex: composerAccentColor,
                              carrier: outgoing,
                              preferredContentLanguages: resolvedViewerLanguageChain,
                              isOutgoing: true,
                              preloadedImages: preloadedImages,
                              preloadedVideoURLs: preloadedVideoURLs,
                              preloadedAudioURLs: preloadedAudioURLs)
        } else {
            StoryReaderRepresentable(story: outgoing,
                                     preferredLanguage: resolvedViewerLanguage,
                                     preferredContentLanguages: resolvedViewerLanguageChain,
                                     preloadedImages: preloadedImages,
                                     preloadedVideoURLs: preloadedVideoURLs,
                                     preloadedAudioURLs: preloadedAudioURLs,
                                     isOutgoing: true)
        }
    }

    /// Couche contenu de la story COURANTE, derrière la porte v3. Les deux hôtes
    /// portent les mêmes fils du viewer — une porte qui en couperait un d'un seul
    /// côté le couperait pour la moitié du parc, en silence.
    ///
    /// `carrier: story` — sans le porteur, `toRenderableSlide` perd son
    /// hydratation read-time : `aspectRatio` d'abord (source de dimensionnement
    /// PRIMAIRE, le composer stampant toujours la sentinelle 1.0 — tout média non
    /// carré s'afficherait squishé), puis `duration`, l'adresse d'un clip audio et
    /// le backdrop legacy ; le résolveur de `makeUIView` perdrait en plus son
    /// repli distant par `postMediaId`.
    ///
    /// La pause du viewer (long-press, feuilles, drag) gèle la timeline canvas EN
    /// PHASE avec la barre de progression : `isPaused:` pour l'hôte direct,
    /// `isPlaying:` nié pour le lecteur. Le player ne réécrit jamais cette valeur
    /// — la commande de lecture appartient au viewer, d'où la liaison constante.
    /// Le mode `.reader` naît en pause et n'honore la commande qu'À PARTIR de
    /// l'apparition : le rail est ainsi figé à l'entrée du slide.
    ///
    /// Le muet est une préférence VIEWER persistante (`isGlobalMuted`, `@State`
    /// qui survit aux avances). Le canvas est recréé à chaque story
    /// (`.id(story.id)`) : sans cet état à l'init, chaque nouvelle story repartait
    /// non-muette. Le mode `.reader` ne VERROUILLE pas le muet (seule la carte de
    /// fil le fait) — la demande de l'hôte gouverne.
    ///
    /// `onPlaybackProgressing` — timeline unifiée : la barre de progression et
    /// l'auto-advance (pilotés par `slideTimer`) gèlent EN PHASE quand la lecture
    /// du média primaire stalle (buffer), et reprennent sans saut dès qu'elle
    /// rejoue. Entrée INDÉPENDANTE de `setPaused` (long-press / feuilles) — elles
    /// ne se clobberent jamais. No-op pour les slides sans vidéo (le canvas n'émet
    /// alors jamais). Décision produit câblée app-side ; le SDK n'expose que le
    /// signal.
    @ViewBuilder
    private func currentContentHost(_ story: StoryItem) -> some View {
        if let document = nativeSceneDocument(of: story) {
            MeeshyScenePlayer(document: document,
                              mode: .reader,
                              sceneIndex: .constant(0),
                              isPlaying: .constant(!isCanvasPlaybackPaused),
                              accentColorHex: composerAccentColor,
                              carrier: story,
                              preferredContentLanguages: resolvedViewerLanguageChain,
                              isMuted: isGlobalMuted,
                              preloadedImages: preloadedImages,
                              preloadedVideoURLs: preloadedVideoURLs,
                              preloadedAudioURLs: preloadedAudioURLs,
                              onContentReady: { isContentReady = true },
                              onContentProgress: { p in slideContentProgress = latchedContentProgress(p) },
                              onPlaybackProgressing: { progressing in
                                  onPlaybackProgressing(progressing)
                                  handleStallIndicatorSignal(progressing: progressing)
                              })
        } else {
            StoryReaderRepresentable(story: story,
                                     preferredLanguage: resolvedViewerLanguage,
                                     preferredContentLanguages: resolvedViewerLanguageChain,
                                     preloadedImages: preloadedImages,
                                     preloadedVideoURLs: preloadedVideoURLs,
                                     preloadedAudioURLs: preloadedAudioURLs,
                                     mute: isGlobalMuted,
                                     isPaused: isCanvasPlaybackPaused,
                                     onContentReady: { isContentReady = true },
                                     onContentProgress: { p in slideContentProgress = latchedContentProgress(p) },
                                     onPlaybackProgressing: { progressing in
                                         onPlaybackProgressing(progressing)
                                         handleStallIndicatorSignal(progressing: progressing)
                                     })
        }
    }

    /// Latch monotone de la fraction de contenu lue : la valeur à écrire, jamais
    /// l'écriture elle-même — c'est le MONTAGE qui doit montrer le fil qu'il
    /// alimente.
    ///
    /// Une fois le contenu prêt (≥ 0.95), on ne redescend JAMAIS : sans ça chaque
    /// `scheduleContentReadyEvaluation` (déclenché par les didSet slide cumulés)
    /// remettait `contentReadyFired = false` → `recomputeContentProgress` émettait
    /// 0 → l'overlay de chargement réapparaissait → scintillement (user-reporté
    /// 2026-05-27 « la story scintille seulement »). Le reset à 0 se fait
    /// UNIQUEMENT sur slide-change (cf. le `.task(id:)` plus bas).
    private func latchedContentProgress(_ progress: Double) -> Double {
        (slideContentProgress >= 0.95 && progress < slideContentProgress)
            ? slideContentProgress
            : progress
    }

    var canvasFitSize: CGSize { // internal : lu par `StoryViewerView+Sentinel`
        // Source de vérité partagée avec le composer (`CanvasGeometry.aspectFitSize`)
        // pour garantir la parité composer ↔ reader — même ratio (9:16 par défaut,
        // 16:9 si l'auteur a importé un fond paysage).
        CanvasGeometry.aspectFitSize(in: geometry.size, ratio: readerCanvasRatio)
    }

    /// Cadrage « carte → plein écran » du canvas reader, MUTUALISÉ avec le composer
    /// via `StoryCanvasFraming` (même solveur, même rendu). Au repos (mode normal) le
    /// canvas est une carte arrondie (coins 22) SOUS le chrome auteur (progress + ligne
    /// auteur) et AU-DESSUS du footer (actions + champ répondre), avec marges latérales
    /// nettes (distinguée du viewport). En plein écran (`isFullscreenStorySession`) →
    /// `.free` = identité (canvas 9:16 plein bord, coins 0 ; le chrome se masque par
    /// ailleurs via `chromeVisible`). Un seul ressort anime taille/coins/position au
    /// toggle — design user 2026-06-02. (it.33 : insets relevés pour une carte nette —
    /// la tentative it.32 cadrait déjà mais à 0.94 ≈ plein bord, donc invisible.)
    /// Présentation du canvas : `.free` (plein bord) quand le chrome est masqué
    /// (long-press immersif) OU en session plein écran ; `.carded` (carte arrondie
    /// marginée) au repos. Source de vérité : `StoryCanvasFraming.readerPresentation`
    /// (truth-table SDK pure, testée). Le long-press qui cache les contrôleurs
    /// agrandit ainsi le canvas pour épouser le viewport (user 2026-06-03).
    private var canvasPresentation: StoryCanvasFraming.Presentation {
        StoryCanvasFraming.readerPresentation(
            isFullscreenSession: isFullscreenStorySession,
            chromeVisible: chromeVisible)
    }

    /// `true` quand le canvas est étendu plein bord (`.free`) — pilote le voile,
    /// l'ombre et l'animation de la carte en phase avec le cadrage.
    var canvasIsExpanded: Bool { canvasPresentation == .free } // internal : idem

    var readerCanvasFraming: StoryCanvasFraming.Result { // internal : idem
        StoryCanvasFraming.resolve(.init(
            viewport: geometry.size,
            headerInset: topInset + 72,   // barres progress (~8) + ligne auteur (~48) + gap — clairance chrome, flush sans occlusion
            bottomInset: 64,              // marge basse ÷2 (it.48) — carte plus proche du bord bas
            sideInset: 8,                 // marges latérales ÷2 (it.48) — carte plus proche des bords L/R
            state: canvasPresentation,
            cardedCornerRadius: 22,
            // Portrait : la carte se place DIRECTEMENT sous la ligne
            // d'expiration (directive 2026-07-04) — le mou vertical va en bas.
            // Paysage (16:9) : la carte est CENTRÉE dans la région libre
            // (directive 2026-07-13 « la position des vidéos landscape doit
            // être au centre ») — collée au header elle laissait tout le vide
            // en bas de l'écran.
            verticalAlignment: readerCanvasRatio > 1 ? .center : .top,
            canvasRatio: readerCanvasRatio))
    }

    var body: some View {
        ZStack {
            // === Layer 1: Background ===
            // Color/gradient fallback (always present)
            storyBackground

            // === Layer 1.5: Blurred backdrop derived from the slide ThumbHash ===
            // Le canvas réel est contraint à 9:16 (fidélité au design composer).
            // Sur un iPhone "plus haut que 9:16" (iPhone 16 Pro = 0.461 vs 9/16 = 0.5625),
            // ~150pt restent libres au-dessus et en dessous ; on les habille
            // d'un blur du contenu story (ThumbHash upscaled + flou + scale) pour
            // une transition douce entre les letterbox et le canvas net.
            //
            // SINGLE BACKDROP : un seul `storyBlurredBackdrop(for: currentStory)`
            // avec une `.id(currentStory?.id)` pour que SwiftUI swap natif
            // (transition.opacity de defaut, gérée par `withAnimation` du
            // `crossFadeStory`). Le pattern précédent (deux backdrops avec
            // `outgoingOpacity` ET `contentOpacity` additifs) produisait un pic
            // de luminosité au milieu de la transition car les deux blurs
            // semi-transparents s'additionnaient dans le ZStack.
            storyBlurredBackdrop(for: currentStory)
                .id(currentStory?.id ?? "no-story")
                .transition(.opacity)
                .ignoresSafeArea()
                .allowsHitTesting(false)
                .accessibilityHidden(true)

            // Voile LÉGER sur le backdrop ThumbHash flou : on GARDE le ThumbHash visible
            // en fond (demande user 2026-06-02 « mettre en fond le ThumbHash »), juste un
            // soupçon d'assombrissement pour séparer. La carte se distingue surtout par ses
            // coins arrondis + son ombre (voir le canvas cardé). En plein écran → 0 (le
            // backdrop habille les letterbox immersifs). Animé par le ressort de la carte.
            Color.black
                .opacity(canvasIsExpanded ? 0 : 0.18)
                .ignoresSafeArea()
                .allowsHitTesting(false)
                .accessibilityHidden(true)
                .animation(.spring(response: 0.42, dampingFraction: 0.84), value: canvasIsExpanded)

            // === Outgoing canvas (cross-dissolve pixel-perfect) ===
            if let outgoing = outgoingStory, outgoingOpacity > 0 {
                // La porte v3, la naissance en `.edit` et les fils du viewer
                // vivent dans `outgoingContentHost(_:)`.
                outgoingContentHost(outgoing)
                    .id("out-\(outgoing.id)")
                    // Strict 9:16-fit (parité avec UnifiedPostComposer:324).
                    // Sans contrainte, le reader s'étirait à la hauteur écran et
                    // la projection design→render (scaleFactor = width/1080)
                    // décalait visuellement les textes/stickers de ~77pt vers le
                    // haut sur iPhone 16 Pro (bug audit 2026-05-27).
                    // Dimensions explicites 9:16 — cf. `canvasFitSize`. Le
                    // duo `.aspectRatio(.fit) + .frame(maxWidth/Height)`
                    // ne contraint pas correctement le UIViewRepresentable
                    // sur iPhone 16 Pro et le canvas débordait en largeur
                    // (sidebar droite hors écran).
                    .frame(width: canvasFitSize.width,
                           height: canvasFitSize.height)
                    .clipped()
                    .opacity(outgoingOpacity)
                    .scaleEffect(closingScale)
                    // Canvas sortant suit la carte (même cadrage) pendant le cross-fade.
                    // clipShape AVANT scale/offset : appliqué après, le clip
                    // restait sur les bounds NON déplacés — le contenu décalé
                    // vers le bas gardait un bord HAUT brut (coins carrés) et
                    // se faisait rogner en bas par les coins arrondis du rect
                    // d'origine (bug user 2026-07-11 « haut carré, bas à
                    // moitié arrondi »). Rayon compensé : le clip vit en
                    // espace non-scalé.
                    .clipShape(RoundedRectangle(
                        cornerRadius: readerCanvasFraming.scale > 0
                            ? readerCanvasFraming.cornerRadius / readerCanvasFraming.scale
                            : readerCanvasFraming.cornerRadius,
                        style: .continuous))
                    .scaleEffect(readerCanvasFraming.scale)
                    .offset(y: readerCanvasFraming.offset.height)
                    .allowsHitTesting(false)
                    .accessibilityHidden(true)
            }

            // === Layers 2–4: Canvas pixel-perfect (media + filter + text + stickers) ===
            // La SENTINELLE prend la place de la scène quand ce build ne sait pas
            // la peindre (#4088). La bifurcation est ICI, au-dessus de la chaîne
            // d'accessibilité du canvas : plus bas, `children: .ignore` aplatirait
            // ses deux boutons — le seul geste utile deviendrait inatteignable.
            if currentStoryIsUnpaintable {
                sentinelLayer
            } else if let story = currentStory {
                // La porte v3 et les fils du viewer vivent dans
                // `currentContentHost(_:)`.
                currentContentHost(story)
                    .id(story.id)
                    // U6 inc.2 — la navigation prev/next est une gesture
                    // SPATIALE (position x du tap dans le canvas) que VoiceOver
                    // ne peut pas produire : on l'expose en actions custom du
                    // rotor. Le label donne une identité au canvas (le contenu
                    // visuel est du CALayer, invisible d'UIAccessibility).
                    .accessibilityElement(children: .ignore)
                    // Le label PORTE le contenu, il ne se contente pas de
                    // nommer le contenant : le canvas étant du CALayer, c'est
                    // la seule voie par laquelle un utilisateur VoiceOver peut
                    // savoir ce que la story dit. Résolu via le Prisme pour que
                    // l'oral et le visuel racontent la même chose.
                    .accessibilityLabel(StoryCanvasAccessibility.label(
                        index: currentStoryIndex,
                        total: currentGroup?.stories.count ?? 0,
                        authorName: currentGroup?.username,
                        textObjects: story.storyEffects?.textObjects ?? [],
                        preferredLanguages: resolvedViewerLanguageChain,
                        voiceTranscript: currentVoiceCaption
                    ))
                    .accessibilityAction(named: String(
                        localized: "story.viewer.a11y.next",
                        defaultValue: "Story suivante"
                    )) {
                        // Rotor VoiceOver = navigation MANUELLE au même titre
                        // qu'un tap — sans ce tick, un utilisateur VoiceOver
                        // perdait tout retour haptique de navigation (post-revue
                        // 2026-07-13 : seuls les deux gestes tactiles avaient
                        // été raccordés au tick unique).
                        HapticFeedback.light()
                        goToNext()
                    }
                    .accessibilityAction(named: String(
                        localized: "story.viewer.a11y.previous",
                        defaultValue: "Story précédente"
                    )) {
                        HapticFeedback.light()
                        goToPrevious()
                    }
                    // Strict 9:16-fit (parité avec UnifiedPostComposer:324).
                    // Sans contrainte, `geometry.size.height` étirait le canvas
                    // hors ratio design et décalait visuellement le contenu.
                    // Le letterbox au-dessus/en dessous est habillé par le
                    // `storyBlurredBackdrop` (Layer 1.5).
                    // Dimensions explicites 9:16 — cf. `canvasFitSize`. Le
                    // duo `.aspectRatio(.fit) + .frame(maxWidth/Height)`
                    // ne contraint pas correctement le UIViewRepresentable
                    // sur iPhone 16 Pro et le canvas débordait en largeur
                    // (sidebar droite hors écran).
                    .frame(width: canvasFitSize.width,
                           height: canvasFitSize.height)
                    .clipped()
                    // Déplier la légende EFFACE la scène pour laisser remonter
                    // le fond ThumbHash déjà monté sous elle (Layer 1.5) — ou,
                    // sans média, la couleur de fond de la story. Multiplié
                    // avec `contentOpacity` : les deux répondent à « combien de
                    // cette scène voit-on ? » et se cumulent.
                    .opacity(contentOpacity
                             * CaptionExpansionSpace.storySceneOpacity(captionExpanded: isCaptionExpanded))
                    .animation(.easeInOut(duration: 0.22), value: isCaptionExpanded)
                    .offset(x: openingSlideFraction * canvasFitSize.width,
                            y: textSlideOffset)
                    .scaleEffect(openingScale)
                    .clipShape(
                        RevealCircleShape(progress: isRevealActive ? 1.0 : (currentStory?.storyEffects?.opening == .reveal ? 0.001 : 1.0))
                    )
                    // Carte → plein écran (mutualisé composer). Visuel pur (la frame
                    // reste `canvasFitSize` → projection design→render intacte).
                    // clipShape AVANT scale/offset (cf. canvas sortant ci-dessus :
                    // après, le haut restait carré et le bas à moitié arrondi).
                    .clipShape(RoundedRectangle(
                        cornerRadius: readerCanvasFraming.scale > 0
                            ? readerCanvasFraming.cornerRadius / readerCanvasFraming.scale
                            : readerCanvasFraming.cornerRadius,
                        style: .continuous))
                    .scaleEffect(readerCanvasFraming.scale)
                    .offset(y: readerCanvasFraming.offset.height)
                    // Ombre portée : la carte se détache du backdrop ThumbHash flou (même
                    // contenu) par son BORD arrondi + son ombre, pas par un voile sombre
                    // (demande user 2026-06-02 « bords arrondis + ThumbHash en fond »).
                    // Coupée en plein écran (carte = plein bord, pas d'ombre).
                    .shadow(color: .black.opacity(canvasIsExpanded ? 0 : 0.4),
                            radius: 20, y: 8)
                    // **Déplier la légende FLOUTE la scène** (directive porteur
                    // 2026-09-02) : « pour les story pas besoin de cacher quoi
                    // que ce soit, quand on déplie, on floute juste la story et
                    // on affiche le texte déplié ».
                    //
                    // La story n'a rien à sacrifier — pas de carte d'auteur en
                    // bas, pas de pellicule : sa scène OCCUPE déjà tout. Elle
                    // recule donc au lieu de céder la place, et le texte passe
                    // devant. C'est l'inverse de la galerie plein écran, où
                    // c'est l'auteur qui s'efface (`ConversationMediaGalleryView`)
                    // — deux réponses à la même question, « où trouver la
                    // place ? », parce que les deux surfaces n'ont pas le même
                    // voisinage.
                    //
                    // Le flou est posé APRÈS l'ombre et le cadrage : il porte
                    // sur la carte telle qu'elle est rendue, coins compris, et
                    // ne déborde donc pas de son clip.
                    .animation(.spring(response: 0.42, dampingFraction: 0.84), value: canvasIsExpanded)

                // Overlay loader granulaire — ThumbHash bg flouté + (spinner+%).
                // Le backdrop ThumbHash est monté DÈS qu'une slide est active
                // pour servir de placeholder instantané (Cache-First : pas de
                // gradient/canvas vide pendant que le média télécharge). Le
                // spinner + le pourcentage, eux, restent gated par le délai
                // de grâce 200ms via `showProgressOverlay` afin de ne pas
                // flasher sur un cache hit immédiat. L'overlay entier fade
                // out quand la slide a chargé à 95 % — au-dessus, le canvas
                // média est révélé.
                if slideContentProgress < 0.95 {
                    StoryReaderLoadingOverlay(
                        slide: renderableSlideCache.slide(for: story, chain: resolvedViewerLanguageChain),
                        progress: slideContentProgress,
                        threshold: 0.95,
                        showSpinner: showProgressOverlay,
                        // Miniature serveur du fond (brute, sans overlays —
                        // surtout PAS le cover composite local qui bake les
                        // textes : ils seraient doublés par les layers live).
                        // La tray vient de l'afficher → warm cache → rendue
                        // nette par-dessus le ThumbHash dès le frame 0.
                        coverThumbnailURL: story.media.first?.thumbnailUrl
                    )
                    .id("loader-\(story.id)")
                    // Hard-frame the overlay to the canvas dimensions and clip
                    // it: the loader hosts a thumbhash Image + .blur() whose
                    // intrinsic/halo size could otherwise inflate the parent
                    // ZStack and push the sidebar/composer beyond the viewport.
                    // Aligné sur le canvas 9:16 (et non plein écran) pour ne pas
                    // recouvrir le `storyBlurredBackdrop` en bandes letterbox.
                    // Dimensions explicites 9:16 — cf. `canvasFitSize`. Le
                    // duo `.aspectRatio(.fit) + .frame(maxWidth/Height)`
                    // ne contraint pas correctement le UIViewRepresentable
                    // sur iPhone 16 Pro et le canvas débordait en largeur
                    // (sidebar droite hors écran).
                    .frame(width: canvasFitSize.width,
                           height: canvasFitSize.height)
                    .clipped()
                    // Le loader suit la carte (même cadrage) → pas de saut entre le
                    // placeholder ThumbHash carté et le canvas carté.
                    // clipShape AVANT scale/offset (même correctif que le canvas).
                    .clipShape(RoundedRectangle(
                        cornerRadius: readerCanvasFraming.scale > 0
                            ? readerCanvasFraming.cornerRadius / readerCanvasFraming.scale
                            : readerCanvasFraming.cornerRadius,
                        style: .continuous))
                    .scaleEffect(readerCanvasFraming.scale)
                    .offset(y: readerCanvasFraming.offset.height)
                    .animation(.spring(response: 0.42, dampingFraction: 0.84), value: canvasIsExpanded)
                    .allowsHitTesting(false)
                    .transition(.opacity)
                }

                // R3 — buffering MID-SLIDE : spinner discret centré sur la
                // carte, UNIQUEMENT après le chargement initial (le loader
                // ThumbHash ci-dessus couvre `slideContentProgress < 0.95`).
                // Apparition différée (grâce 350 ms), disparition immédiate à
                // la reprise — cf. `handleStallIndicatorSignal`.
                if showStallIndicator && slideContentProgress >= 0.95 {
                    StoryPlaybackStallIndicator()
                        .frame(width: canvasFitSize.width,
                               height: canvasFitSize.height)
                        .scaleEffect(readerCanvasFraming.scale)
                        .offset(y: readerCanvasFraming.offset.height)
                        .allowsHitTesting(false)
                        .transition(.opacity)
                }
            }

            // === Voice caption overlay (transcription voix) ===
            if let transcription = currentVoiceCaption {
                VStack {
                    Spacer()
                    Text(transcription)
                        .font(MeeshyFont.relative(14, weight: .medium))
                        .foregroundColor(.white)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 20)
                        .padding(.vertical, 8)
                        .background(
                            RoundedRectangle(cornerRadius: 10)
                                .fill(Color.black.opacity(0.55))
                        )
                        .padding(.horizontal, 20)
                        .padding(.bottom, topInset + 130)
                }
                .allowsHitTesting(false)
                .transition(.opacity)
            }

            // === Description overlay (B2, #3925 — la légende de la story) ===
            //
            // La face LECTURE de la section description repliable du composer :
            // le contenu partagé du composer unifié (`slide.content`), résolu par
            // le Prisme, s'affiche par-dessus le canvas composé — comme la légende
            // d'un réel. Gaté sur `currentVoiceCaption == nil` : la transcription
            // vocale (exploration à la demande, menu « … ») prend le bas de la
            // scène quand elle est active — les deux ne se chevauchent jamais.
            //
            // **Elle était INERTE.** `Text` brut dans un cartouche noir opaque,
            // `lineLimit(4)`, et `allowsHitTesting(false)` sur tout le bloc :
            // rien ne pouvait la déplier, et le cartouche masquait la
            // composition qu'il commente. `MediaCaptionOverlay` (SDK) tient
            // désormais la règle — dix MOTS, de l'ombre plutôt qu'une boîte, et
            // le plein écran ancré au coin bas-gauche quand on déplie (#4474).
            if currentVoiceCaption == nil, let description = currentStoryDescription {
                VStack(spacing: 0) {
                    Spacer(minLength: 0)
                    // 20 pt — le retrait des couches voisines de ce canvas (la
                    // transcription vocale juste au-dessus le pose aussi). Il
                    // était en dur dans la couche ; il est désormais DIT ici,
                    // pour que le lecteur de réel puisse aligner la sienne sur
                    // sa propre colonne (directive porteur 2026-09-01).
                    MediaCaptionOverlay(caption: description, isExpanded: isCaptionExpanded,
                                        horizontalInset: 20,
                                        onToggle: onCaptionExpansionToggled)
                }
                // **La légende tient la colonne du CANVAS, pas celle de l'hôte**
                // (#4762). Ce conteneur déborde volontairement le viewport pour
                // la pagination (mesuré : 491,3 pt à x = −44,7 sur un écran de
                // 402) ; sans cette largeur, le `frame(maxWidth: .infinity)` de
                // la légende résout celle du CONTENEUR et le texte sort des deux
                // côtés — « The latest apps » s'affichait « e latest apps ».
                .frame(width: StoryCanvasFraming.captionColumnWidth(
                    viewport: geometry.size,
                    ratio: readerCanvasRatio,
                    scale: readerCanvasFraming.scale))
                // **La légende garde sa position** (directive porteur 2026-09-02) : elle
                // MONTE depuis là où elle est, elle ne descend pas au bas de
                // l'écran. La marge basse était annulée au dépliage — le texte
                // changeait donc de place au moment où on demandait à en voir plus.
                .padding(.bottom, topInset + 130)
                .transition(.opacity)
                // **L'invite doit recevoir le doigt** (#4762, mesuré au
                // simulateur le 2026-09-02).
                //
                // La couche de gestes (`StoryGestureOverlayView`, « Layer 6 »)
                // est montée APRÈS cette légende dans le même `ZStack` — donc
                // AU-DESSUS. Son `Color.clear.contentShape(Rectangle())` couvre
                // tout le cadre et son `DragGesture(minimumDistance: 0)`
                // reconnaît dès le touch-down : le bouton « voir plus » ne
                // recevait donc JAMAIS son tap. Mesuré : trois taps sur sa cible
                // ont fait NAVIGUER le lecteur d'une story à l'autre, sans
                // jamais déplier.
                //
                // > Un contrôle correctement rendu, correctement câblé, sous une
                // > couche qui prend tous les touchers, est un contrôle INERTE —
                // > et rien ne rougit : la couche fait exactement son travail.
                //
                // Le relèvement est SÛR parce que la légende repliée ne prend le
                // doigt QUE sur son bouton : elle ne pose aucun `contentShape`
                // sur son fond (doc de `MediaCaptionOverlay.collapsedCaption`),
                // donc la navigation continue de passer partout ailleurs.
                // Dépliée, son voile PREND les touchers — et c'est voulu : on lit.
                .zIndex(60)
            }

            // === Background audio badge ===
            //
            // Le canvas ne porte plus de chip « note + onde » pour l'audio de
            // FOND (directive user 2026-07-30) : depuis que le header affiche la
            // note musicale suivie de l'onde animée, ce chip répétait la même
            // information au milieu de l'image. Les chips du canvas restent
            // réservés aux pistes FOREGROUND, qui ont chacune leur fenêtre de
            // lecture et leur mute propre (`AudioForegroundReaderOverlay`).
            //
            // Seule survit la carte d'une piste de BIBLIOTHÈQUE : elle titre le
            // morceau et crédite son auteur — une attribution que le header, qui
            // ne dit que la présence, ne porte pas.
            if let audio = currentStory?.backgroundAudio {
                VStack {
                    Spacer()
                    backgroundAudioBadge(audio: audio)
                        .padding(.bottom, topInset + 165)
                }
                .frame(maxWidth: .infinity, alignment: .center)
                .allowsHitTesting(false)
            }

            // === Translation indicator (Prisme Linguistique — discret) ===
            // Le badge de langue courante a QUITTÉ le coin bas-gauche (directive
            // user 2026-07-26) : il est désormais accolé au bouton « Abc » du
            // rail (`StoryActionSidebarView`, via `displayedLanguageCode`), au
            // point d'entrée des traductions. Plus de badge flottant ici.

            // === Layer 5: Gradient scrims for readability over photos ===
            VStack {
                LinearGradient(
                    stops: [
                        .init(color: .black.opacity(0.7), location: 0),
                        .init(color: .black.opacity(0.4), location: 0.5),
                        .init(color: .black.opacity(0.0), location: 1)
                    ],
                    startPoint: .top, endPoint: .bottom
                )
                .frame(height: topInset + 110)
                Spacer()
                // Scrim bottom plus opaque + plus haut — assure que le caption
                // texte d'une slide (rendu par le canvas à y≈0.95 en design
                // coords) ne déborde plus visuellement sur la zone composer
                // « Commenter... ». Le canvas du reader est positionné au
                // centre du geometry (9:16 fit-to-width), donc un text
                // positioné bas du slide tombe juste au-dessus du composer.
                // Sans ce scrim fort, les deux se superposent — symptôme
                // user-reporté 2026-05-27.
                LinearGradient(
                    stops: [
                        .init(color: .black.opacity(0.0), location: 0),
                        .init(color: .black.opacity(0.55), location: 0.45),
                        .init(color: .black.opacity(0.92), location: 1)
                    ],
                    startPoint: .top, endPoint: .bottom
                )
                .frame(height: 240)
            }
            .ignoresSafeArea()
            .allowsHitTesting(false)
            .accessibilityHidden(true)

            // === Layer 6: Gesture overlay (tap left/right, long press) ===
            StoryGestureOverlayView(
                geometry: geometry,
                isComposerEngaged: isComposerEngaged,
                isLongPressPaused: $isLongPressPaused,
                onDismissComposer: dismissComposer,
                onPrevious: goToPrevious,
                onNext: goToNext,
                onChromeVisibilityChange: { newValue in
                    // Animation spring rapide (lecture immersive) avec un
                    // léger overshoot pour donner du caractère au reveal et au
                    // hide. Sortie clavier en parallèle si le composer était
                    // engagé — le keyboard.hide() ne déclenche pas re-render
                    // du composer s'il est déjà non-focused.
                    withAnimation(.spring(response: 0.32, dampingFraction: 0.78)) {
                        chromeVisible = newValue
                    }
                    if !newValue {
                        UIApplication.shared.sendAction(
                            #selector(UIResponder.resignFirstResponder),
                            to: nil, from: nil, for: nil
                        )
                    }
                },
                onTogglePause: {
                    // `isLongPressPaused` est la source de vérité unique de la
                    // pause : le double tap la bascule, donc timer, vidéo de
                    // fond, audios et effets gèlent et repartent ensemble.
                    //
                    // Le double tap NE TOUCHE PAS au chrome (directive user
                    // 2026-07-25) : c'est une pause, pas une mise en immersion.
                    // Seuls le long-press (immersion pendant le maintien) et le
                    // swipe vertical (plein écran) changent le cadrage.
                    isLongPressPaused.toggle()
                },
                hasActiveFeature: hasActiveReaderFeature,
                onDismissActiveFeature: onDismissActiveReaderFeature,
                isFullscreenStorySession: isFullscreenStorySession,
                gestureResetToken: gestureResetToken,
                readerFeatureConsumedByTouch: $readerFeatureConsumedByTouch
            )

            // === Layer 6.5: Foreground audio chips ===
            // Au-dessus du gesture overlay : le tap d'un chip est consommé
            // avant d'atteindre la nav gauche/droite des slides. Masqué hors
            // de la fenêtre `startTime..startTime+duration` de chaque audio.
            // Le tap toggle le mute *per-piste* via la registry partagée
            // (`StoryReaderAudioMuteRegistry`) — la canvas applique au mixer.
            if let story = currentStory,
               let audios = story.storyEffects?.audioPlayerObjects,
               !audios.isEmpty {
                AudioForegroundReaderOverlay(
                    foregroundAudios: audios,
                    slideDuration: currentSlideDuration,
                    fallbackElapsedTime: progress > 0 ? TimeInterval(progress) * currentSlideDuration : nil
                )
                .allowsHitTesting(!isComposerEngaged)
            }

            // === Layer 6.6: Location badge tap targets ===
            // Au-dessus du gesture overlay (même règle que les chips audio) :
            // le tap d'une pastille de lieu ouvre la carte au lieu de
            // naviguer. Réplique le cadrage EXACT du canvas visible (frame
            // `canvasFitSize` + scale/offset carte, même ressort) pour que
            // les cibles tombent sur les badges dessinés par
            // `StoryLocationLayer` — la zone vient de `badgeFrame`, la mesure
            // partagée avec le rendu.
            if let story = currentStory,
               let locations = story.storyEffects?.locationObjects,
               !locations.isEmpty {
                StoryLocationReaderTapOverlay(locations: locations, onTap: { place in
                    HapticFeedback.light()
                    pauseTimer()
                    readerFullscreenPlace = StoryReaderPlaceWrapper(place: place)
                })
                .frame(width: canvasFitSize.width, height: canvasFitSize.height)
                .scaleEffect(readerCanvasFraming.scale)
                .offset(y: readerCanvasFraming.offset.height)
                .animation(.spring(response: 0.42, dampingFraction: 0.84), value: canvasIsExpanded)
                .allowsHitTesting(!isComposerEngaged)
            }

            // === Layer 7: Top UI (progress bars + header) — ABOVE gesture overlay for hit testing ===
            // min 59pt accounts for Dynamic Island when .statusBarHidden() zeroes safeAreaInsets
            VStack(spacing: 0) {
                StoryProgressBarsView(
                    group: currentGroup,
                    currentIndex: currentStoryIndex,
                    progress: progress
                )
                    .padding(.horizontal, 12)
                    .padding(.top, topInset + 4)

                StoryHeaderView(
                    currentGroup: currentGroup,
                    currentStory: currentStory,
                    isOwnStory: isOwnStory,
                    backgroundSoundAnnouncement: backgroundSoundAnnouncement,
                    hasAudioTranscript: storyHasAudioTranscript,
                    showAudioTranscript: $showAudioTranscript,
                    selectedProfileUser: $selectedProfileUser,
                    editAndRepostAsPostSource: $editAndRepostAsPostSource,
                    showReportSheet: $showReportSheet,
                    sharedContentWrapper: $sharedContentWrapper,
                    makeStoryExternalShareURL: makeStoryExternalShareURL,
                    deleteCurrentStory: deleteCurrentStory,
                    repostAsPostDirect: repostAsPostDirect,
                    pauseTimer: pauseTimer,
                    dismissViewer: dismissViewer,
                    reportStory: reportStory,
                    isFullscreenStorySession: $isFullscreenStorySession,
                    chromeVisible: $chromeVisible
                )
                    .padding(.horizontal, 16)
                    .padding(.top, 10)

                // Les personnes que la story NOMME en mode NOTE, sous l'auteur.
                //
                // La donnée arrivait déjà jusqu'ici (`StoryItem.mentions`,
                // servie par le gateway, décodée par le SDK) mais aucune vue du
                // reader ne la lisait : une story qui nommait quelqu'un en NOTE
                // ne le montrait NULLE PART, alors que la personne nommée
                // recevait bien sa notification et ouvrait la story pour n'y
                // trouver aucune trace. Les posts, eux, l'affichaient depuis le
                // début (`FeedPostCard`, `PostDetailView`).
                //
                // La rangée fait ses propres tris et n'a besoin d'aucune garde
                // ici : SILENT n'y figure jamais (il ne se voit que par son
                // sujet, via le marqueur personnel), PINNED non plus (la
                // pastille posée sur le canevas EST déjà son affichage).
                // Vide, elle ne rend rien — pas de place réservée.
                //
                // DANS le chrome, à dessein : elle disparaît avec l'en-tête et
                // le rail quand le lecteur veut voir le contenu nu.
                ReferenceNoteRow(
                    references: currentStory?.mentions ?? [],
                    currentUserId: AuthManager.shared.currentUser?.id,
                    accentColor: Color(hex: composerAccentColor),
                    onTapReference: { selectedProfileUser = .from(reference: $0) }
                )
                .equatable()
                .padding(.horizontal, 16)
                .padding(.top, 6)

                Spacer()
            }
            // Width strict — même rationale que le sidebar Layer 8 : le
            // UIViewRepresentable du canvas expanse le ZStack parent ce qui
            // fait sortir le bouton « Fermer » (xmark) du header hors écran
            // (mesuré x=391 r=427 sur viewport 402pt avant ce fix, 2026-05-27).
            .frame(width: geometry.size.width, height: geometry.size.height, alignment: .top)
            .clipped()
            // Glissement vers le HAUT à la disparition + fondu. Le `.offset`
            // négatif fait sortir progress bars + header de l'écran ; on
            // ajoute une opacity 0 pour que l'élément reste totalement
            // invisible lorsqu'il est positionné juste en dehors du safe area
            // (sinon un sliver pixelé peut traîner sur certaines tailles).
            .offset(y: chromeVisible ? 0 : -(topInset + 120))
            .opacity(chromeVisible ? 1 : 0)
            .allowsHitTesting(chromeVisible)
            .animation(.spring(response: 0.32, dampingFraction: 0.78), value: chromeVisible)
            .environment(\.colorScheme, readerChromeScheme)

            // === Layer 7.5: Floating comments overlay (Instagram-style) ===
            // Rendered BEFORE the sidebar / composer / reaction flight blocks so
            // SwiftUI ZStack z-orders it BENEATH the story controls — user
            // can still tap React / Reply / mute / settings while comments
            // are visible. Background story stays interactable (tap to pause,
            // long-press) through the overlay's transparent surface.
            if showCommentsOverlay {
                makeCommentsOverlay()
                    // Le UIViewRepresentable du canvas expanse le ZStack parent
                    // au-delà du viewport (même cause que Layer 7 header et
                    // Layer 8 sidebar, cf. note ligne ~1024). Sans contrainte de
                    // largeur, l'overlay hérite de cette largeur trop grande et,
                    // le ZStack étant centré, ses rows (padding leading 28)
                    // démarrent à un x négatif → la ligne de commentaire sort du
                    // viewport à gauche (bug user 2026-06-08). On le borne à
                    // geometry.size.width + clipped comme ses voisins.
                    .frame(width: geometry.size.width, height: geometry.size.height, alignment: .bottom)
                    .clipped()
                    .transition(.opacity)
                    // Même scheme que le header/sidebar (Layer 7/8) : sans lui
                    // le texte des réponses restait blanc fixe, illisible sur un
                    // fond de story clair/blanc — seul un halo protégeait
                    // jusqu'ici, insuffisant sur un fond proche du blanc pur
                    // (capture user 2026-08-11).
                    .environment(\.colorScheme, readerChromeScheme)
            }

            // === Layer 8: Right action sidebar — centered vertically, right side ===
            // The sidebar is bounded between the header strip (top) and the
            // composer strip (bottom) so its action buttons never slide
            // off-screen on small iPhones (SE, mini). The sidebar itself
            // ships a `ViewThatFits` fallback that switches to a vertical
            // scroller when the bounded height is still too small for the
            // full button stack.
            let topReserved: CGFloat = topInset + 100   // progress bars + header
            let bottomReserved: CGFloat = geometry.safeAreaInsets.bottom + (isOwnStory ? 56 : 96)
            let sidebarMaxHeight = max(180, geometry.size.height - topReserved - bottomReserved)
            HStack {
                Spacer()
                StoryActionSidebarView(
                    isOwnStory: isOwnStory,
                    storyReactionCount: storyReactionCount,
                    storyCurrentUserHasReacted: storyCurrentUserHasReacted,
                    heartBouncePulse: heartBouncePulse,
                    quickEmojis: quickEmojis,
                    onReplyToStory: onReplyToStory,
                    currentStory: currentStory,
                    currentGroup: currentGroup,
                    storyCommentCount: storyCommentCount,
                    storyCommentCountReconciledPulse: storyCommentCountReconciledPulse,
                    storyShareCount: storyShareCount,
                    storyViewCount: storyViewCount,
                    storyRepostCount: storyRepostCount,
                    isStoryCommentsEmpty: isStoryCommentsEmpty,
                    storyHasAudibleSound: storyHasAudibleSound,
                    storyHasTranslatableContent: storyHasTranslatableContent,
                    isGlobalMuted: isGlobalMuted,
                    availableTranslationLanguages: availableTranslationLanguages,
                    activeLanguageCode: activeLanguageCode,
                    displayedLanguageCode: resolvedViewerLanguage,
                    onSelectLanguageOverride: onSelectLanguageOverride,
                    showEmojiStrip: $showEmojiStrip,
                    showFullEmojiPicker: $showFullEmojiPicker,
                    showCommentsOverlay: $showCommentsOverlay,
                    showLanguageOptions: $showLanguageOptions,
                    showFullLanguagePicker: $showFullLanguagePicker,
                    showViewersSheet: $showViewersSheet,
                    showExportShareSheet: $showExportShareSheet,
                    isGlobalMutedBinding: $isGlobalMutedBinding,
                    sharedContentWrapper: $sharedContentWrapper,
                    republishStorySource: $republishStorySource,
                    isPresented: $isPresented,
                    triggerStoryReaction: triggerStoryReaction,
                    onScrubStateChanged: onScrubStateChanged,
                    pauseTimer: pauseTimer,
                    loadStoryComments: loadStoryComments
                )
                    .frame(maxHeight: sidebarMaxHeight)
                    // 16pt clears the iPhone Pro rounded-corner radius at the
                    // sidebar's vertical position (mid-screen). 6pt was
                    // visibly too tight — button labels « React », « Répondre »,
                    // « Envoyer », « Son » were clipped on the right
                    // (bug user 2026-05-28 « les elements sortent du viewport »).
                    .padding(.trailing, 16)
            }
            .padding(.top, topReserved)
            .padding(.bottom, bottomReserved)
            // Width strict + clipped — sur iPhone 16 Pro le UIViewRepresentable
            // du canvas expanse le ZStack parent à ~491pt (cf. canvasFitSize
            // doc). Le sidebar à right edge tombait alors hors écran. Cap
            // dur du HStack à `geometry.size.width` + clip pour empêcher
            // tout débordement (bug 2026-05-27). Le Spacer + l'alignement
            // .trailing dans le HStack interne suffisent pour pousser le
            // sidebar VStack au bord droit visible.
            // `.bottomTrailing` (2026-07-10) : le rail s'ancre au BAS de sa
            // bande utile (juste au-dessus du composer) au lieu d'être centré
            // verticalement — les actions restent « à portée de pouce » et le
            // vide perçu au-dessus du composer disparaît (IMG_0984).
            .frame(width: geometry.size.width, height: geometry.size.height, alignment: .bottomTrailing)
            .clipped()
            // Glissement vers la DROITE à la disparition + fondu. L'offset
            // de 110pt couvre largement la largeur du chip (max 48pt) + son
            // padding-trailing (6pt) + un peu de marge pour les écrans sans
            // bord arrondi. Hit-testing désactivé en plus de l'opacité 0 pour
            // éviter qu'un tap fantôme atterrisse sur un bouton invisible.
            .offset(x: chromeVisible ? 0 : 110)
            .opacity(chromeVisible ? 1 : 0)
            .allowsHitTesting(chromeVisible)
            .environment(\.colorScheme, readerChromeScheme)

            // === Layer 9: Reaction flight (tuile agrandie → cœur, ≤ 1 s) ===
            if let flight = reactionFlight {
                StoryReactionFlightView(
                    flight: flight,
                    target: heartFrame,
                    onArrived: { heartBouncePulse += 1 },
                    onFinished: { reactionFlight = nil }
                )
                // Identité PAR VOL : sans elle, une deuxième réaction envoyée
                // dans les 750ms de la première ne fait que muter la vue déjà
                // montée (structural identity) — `@State progress` reste à 1,
                // `onAppear` ne re-tique jamais (aucun mouvement, aucun
                // rebond), et l'`asyncAfter` du premier vol efface l'overlay
                // en avance (revue fix round 1, 2026-08-11).
                .id(flight.id)
                // Même garde que les autres calques flottants (header, rail,
                // composer, pickers plein écran) : le canvas gonfle le ZStack
                // parent au-delà du viewport, un calque non borné s'y étale
                // avant de se faire rogner par le `.clipped()` final
                // (StoryOverlayWidthPinGuardTests).
                .frame(maxWidth: geometry.size.width)
                .zIndex(50)
            }

            // NOTE: Live comments overlay (Instagram-style) is rendered by
            // `StoryViewerContentView` as a sibling of the card transform
            // stack — see this file's `StoryViewerContentView.body`.
            // Keeping it inside the card meant it inherited the card's
            // `.offset(x: totalSlideX)`, scale and rotation3D, and shifted
            // left during drag / scale / 3D transitions (bug 2026-05-28).

            // Bottom area: composer + emoji panel / keyboard space
            VStack(spacing: 0) {
                Spacer()

                // **Toujours visible** quand l'utilisateur n'est pas l'auteur
                // de la story (un seul composer pour la story-reply ET la
                // comment-reply — spec user 2026-05-28). Quand l'overlay
                // commentaires est ouvert et qu'on tape « Répondre » sur un
                // commentaire, la reply banner apparaît au-dessus de CETTE
                // rangée de saisie via le binding `replyingToStoryComment`.
                //
                // **Auteur de sa propre story** : pas de composer permanent (on
                // ne répond pas à sa propre story), MAIS il doit pouvoir
                // répondre aux commentaires reçus. Le composer apparaît donc
                // dès que `replyingToStoryComment` est posé (tap « Répondre »
                // dans l'overlay), avec la reply banner, puis se referme à
                // l'envoi (`sendComment` remet le binding à nil) ou à la
                // fermeture de la banner (spec user 2026-06-25).
                if !isOwnStory || replyingToStoryComment != nil {
                    StoryComposerBarView(
                        accentColor: currentGroup?.avatarColor ?? "6366F1",
                        storyId: currentStory?.id,
                        composerLanguage: $composerLanguage,
                        commentEffects: $commentEffects,
                        commentBlurEnabled: $commentBlurEnabled,
                        isComposerEngaged: $isComposerEngaged,
                        showTextEmojiPicker: $showTextEmojiPicker,
                        hasComposerContent: $hasComposerContent,
                        emojiToInject: $emojiToInject,
                        composerFocusTrigger: $composerFocusTrigger,
                        storyDrafts: $storyDrafts,
                        replyingToStoryComment: $replyingToStoryComment,
                        sendComment: sendComment
                    )
                        // Marge latérale 16pt, alignée sur le `sideInset` (16) de
                        // la carte reader (`readerCanvasFraming`) et le
                        // `.padding(.trailing, 16)` du sidebar — même rythme 16pt
                        // pour les trois colonnes de chrome.
                        // (Historique 14 → 20 → 28 : tentatives de rattraper un
                        // bouton d'envoi rogné à droite. La cause réelle n'était
                        // pas la courbure des coins — le composer est ~54pt au-dessus
                        // du bas, où l'arc des coins a déjà reculé — mais le
                        // `maxWidth: .infinity` du bloc, corrigé par le pin de
                        // largeur sur le viewport ci-dessous.)
                        .padding(.horizontal, 16)
                        .simultaneousGesture(
                            DragGesture(minimumDistance: 20, coordinateSpace: .local)
                                .onEnded { value in
                                    // Swipe down on composer → dismiss keyboard & disengage
                                    if value.translation.height > 40 && abs(value.translation.width) < value.translation.height {
                                        dismissComposer()
                                    }
                                }
                        )

                    // Inline emoji keyboard panel (replaces system keyboard)
                    if showTextEmojiPicker {
                        EmojiKeyboardPanel(
                            style: .dark,
                            onSelect: { emoji in
                                emojiToInject = emoji
                            }
                        )
                        .frame(height: max(keyboard.lastKnownHeight - geometry.safeAreaInsets.bottom, 260))
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                    }
                }
            }
            // **CRITIQUE (hauteur)** : `maxHeight: .infinity, alignment: .bottom`
            // force la VStack à remplir la hauteur du canvas ZStack. Sans cela, le
            // `Spacer()` au top collapse à minLength: 0 et la VStack prend sa
            // hauteur intrinsèque (~150pt = composer + emoji panel). Le canvas
            // ZStack parent utilisant `alignment: .center`, une VStack courte se
            // faisait CENTRER verticalement dans le canvas 874pt → composer
            // apparaissait à y≈360pt au lieu de y≈760pt en bas (bug user
            // 2026-05-28 « le composeur est rogné au lieu d'être bien aligné »).
            //
            // **CRITIQUE (largeur)** : `maxWidth: geometry.size.width` (et NON
            // `.infinity`) borne la proposition de largeur du bloc au viewport réel.
            // Le canvas UIViewRepresentable gonfle la largeur intrinsèque du ZStack
            // parent au-delà de l'écran (~480pt vs 402pt sur iPhone 16 Pro) ; avec
            // `.infinity` le composer remplissait ces ~480pt et son bouton d'envoi
            // sortait à droite de l'écran (bug user 2026-06-03). Borné au viewport,
            // le bloc se cadre sur l'écran réel et reste centré — même principe que
            // le pin `.frame(width: geometry.size.width)` du header (L1013) et du
            // sidebar (L1099).
            .frame(maxWidth: geometry.size.width, maxHeight: .infinity, alignment: .bottom)
            .padding(.bottom, composerBottomPadding(geometry))
            .animation(.easeInOut(duration: 0.25), value: keyboard.height)
            .animation(.spring(response: 0.3, dampingFraction: 0.8), value: showTextEmojiPicker)
            // Glissement vers le BAS à la disparition + fondu. L'offset 240pt
            // couvre l'ensemble composer + picker emoji + safe area inférieure
            // pour les iPhones les plus grands ; le composant étant ancré
            // bottom via `Spacer()`, c'est suffisant pour le sortir totalement
            // du viewport. Hit-testing OFF en plus pour ne pas intercepter
            // les taps même invisible.
            .offset(y: chromeVisible ? 0 : 240)
            .opacity(chromeVisible ? 1 : 0)
            .allowsHitTesting(chromeVisible)

            // Full emoji picker — REACTIONS ONLY (sends via API)
            if showFullEmojiPicker {
                EmojiFullPickerSheet(
                    style: .dark,
                    onReact: { emoji in
                        triggerStoryReaction(emoji, nil)
                    },
                    onDismiss: {
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                            showFullEmojiPicker = false
                        }
                    }
                )
                // Borné au viewport RÉEL, jamais `.infinity` : le canvas gonfle
                // la largeur intrinsèque du ZStack parent au-delà de l'écran
                // (~480 pt vs 402 pt sur iPhone 16 Pro), et un calque non borné
                // s'y étale avant de se faire rogner aux deux bords par le
                // `.clipped()` final. Même pin que le header, le rail et le
                // composer.
                .frame(maxWidth: geometry.size.width)
                .transition(.move(edge: .bottom).combined(with: .opacity))
                .zIndex(100)
            }

            // === Layer 10: Explorateur de langues complet (Prisme) — remplace
            // l'ancien `LanguagePickerSheet` mal intégré au liquid glass et sans
            // dark/light (directive user 2026-07-26). Reprend le visuel de la
            // liste extraite de la vue de conversation : contenu de la langue
            // COURANTE en tête + liste avec aperçu, retraduire et « Traduire »
            // on-demand. La story reste visible derrière. ===
            if showFullLanguagePicker, let story = currentStory {
                StoryLanguageDetailView(
                    story: story,
                    activeLanguageCode: activeLanguageCode,
                    onSelectLanguage: { code in
                        LanguageUsageTracker.recordUsage(languageId: code)
                        // Prisme « Exploration » : override prépendu à la chaine ;
                        // le reader se re-rend dès l'arrivée de la traduction.
                        onSelectLanguageOverride(code)
                    },
                    onTranslate: { code, force in
                        Task {
                            await StoryInteractionService().requestTranslation(
                                storyId: story.id,
                                targetLanguage: code,
                                force: force
                            )
                        }
                    },
                    onDismiss: {
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                            showFullLanguagePicker = false
                        }
                    }
                )
                // Idem : sans ce pin, la feuille remplissait les ~480 pt du
                // ZStack gonflé par le canvas et perdait ~39 pt de chaque côté
                // sous le `.clipped()` — titre amputé à gauche, boutons
                // « Traduire » coupés à droite (bug user 2026-07-27).
                .frame(maxWidth: geometry.size.width)
                .transition(.move(edge: .bottom).combined(with: .opacity))
                .zIndex(150)
            }
            // La barre rapide des langues (`showLanguageOptions`) est rendue dans
            // le rail, À GAUCHE du bouton « Abc » (comme le strip de réactions) —
            // voir `StoryViewerView+Sidebar`. Plus d'overlay bas-de-composer ici.
        }
        // Lock the entire story canvas (background + reader + overlays +
        // sidebar + composer) to EXACTLY the viewport size we were handed
        // in `geometry`. Without this, any child with an intrinsic size
        // bigger than the proposed size — a long translated text line, a
        // foreground media at natural pixel size, a reaction flight emoji
        // during its tuile→cœur animation — silently grows the enclosing ZStack
        // and pushes the right-side action sidebar (and bottom composer)
        // off-screen, making them untappable. `.clipped()` discards
        // anything that still tries to draw past the bounds rather than
        // letting it leak into adjacent UI.
        .frame(width: geometry.size.width, height: geometry.size.height, alignment: .center)
        // Espace de coordonnées commun du système scrub (cœur + tuiles des
        // barres réaction/langues), posé APRÈS le pin de taille ci-dessus —
        // pas avant : le ZStack racine peut gonfler à ~480pt (canvas
        // UIViewRepresentable) avant d'être ramené aux 402pt du viewport, et
        // un `.coordinateSpace` posé sur le ZStack non-pinné aurait une
        // origine décalée d'environ (480-402)/2 ≈ 44pt vers la gauche par
        // rapport à Layer 9 (rendu, lui, à l'intérieur du `.frame` pinné) —
        // tuiles, position du doigt et cible du vol partageraient alors des
        // repères désalignés (revue fix round 1, 2026-08-11).
        .coordinateSpace(name: StoryScrubSpace.name)
        .onPreferenceChange(StoryHeartFrameKey.self) { heartFrame = $0 }
        .clipped()
        // Délai de grâce du spinner+% : on n'arme `showProgressOverlay` qu'au
        // bout de 200 ms si la slide est sous 20 % de progression. La backdrop
        // ThumbHash, elle, est rendue immédiatement par
        // `StoryReaderLoadingOverlay` quand `slideContentProgress < 0.95` —
        // garantit un placeholder cache-first sans flasher d'indicateur de
        // chargement sur les slides qui se rendent instantanément.
        .task(id: currentStory?.id) {
            showProgressOverlay = false
            slideContentProgress = 0
            // R3 — nouvelle slide = état neuf : le canvas repart « progressant »
            // SANS émettre (resetPlaybackHealthState n'émet pas) ; sans ce reset
            // un indicateur de stall de la slide précédente resterait affiché.
            stallIndicatorGraceTask?.cancel()
            stallIndicatorGraceTask = nil
            showStallIndicator = false
            try? await Task.sleep(for: .milliseconds(200))
            guard !Task.isCancelled else { return }
            if slideContentProgress < 0.20 {
                withAnimation(.easeIn(duration: 0.2)) {
                    showProgressOverlay = true
                }
            }
        }
    }

    /// R3 — pilote l'indicateur de stall mid-slide depuis le signal
    /// `onPlaybackProgressing` du canvas : apparition DIFFÉRÉE (grâce 350 ms —
    /// un micro-stall de seek/loop ne flashe pas de spinner), disparition
    /// IMMÉDIATE à la reprise. Indépendant du forward vers `slideTimer`
    /// (le gel de la barre, lui, est toujours instantané et en phase).
    private func handleStallIndicatorSignal(progressing: Bool) {
        stallIndicatorGraceTask?.cancel()
        stallIndicatorGraceTask = nil
        if progressing {
            withAnimation(.easeOut(duration: 0.15)) { showStallIndicator = false }
            return
        }
        stallIndicatorGraceTask = Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(350))
            guard !Task.isCancelled else { return }
            // Signal VISUEL uniquement : les haptics de stall/reprise
            // s'empilaient sur celle de navigation et hachaient la lecture
            // (retour user 2026-07-13) — le spinner suffit.
            withAnimation(.easeIn(duration: 0.2)) { showStallIndicator = true }
        }
    }

    // MARK: - Story Background

    /// `true` quand la slide courante a un vrai fond média (image/vidéo) : le canvas
    /// peint alors ce média plein cadre et le `storyBlurredBackdrop` (Layer 1.5) habille
    /// les letterbox d'un flou DÉRIVÉ du média. Dans ce cas le fond de canvas couleur/gradient
    /// (`storyBackground`, Layer 1) est redondant — pire, il bleed (~15 %) derrière le backdrop
    /// semi-transparent, teintant le média d'un voile indigo parasite. On le neutralise en noir
    /// (user 2026-06-03 : « le reader/preview ne doit pas afficher de fond de canvas quand le fond
    /// est déjà une image/vidéo »).
    private var currentSlideHasMediaBackground: Bool {
        guard let story = currentStory else { return false }
        return renderableSlideCache.slide(for: story, chain: resolvedViewerLanguageChain)
            .effects.hasVisualBackgroundMedia
    }

    /// Scheme épinglé sur le chrome du reader (header + sidebar) : suit la
    /// luminance du FOND de la slide affichée, pas le thème de l'app — même
    /// règle que le composer (`CanvasChromeScheme`, capture user 2026-07-11 :
    /// icônes glass illisibles selon la couleur de fond).
    private var readerChromeScheme: ColorScheme {
        CanvasChromeScheme.scheme(
            background: currentStory?.storyEffects?.background,
            hasMediaBackground: currentSlideHasMediaBackground
        )
    }

    private var storyBackground: some View {
        Group {
            if currentSlideHasMediaBackground {
                // Fond média (image/vidéo) : aucun fond de canvas synthétique. Noir immersif
                // sous le backdrop flou dérivé du média (pas de bleed couleur/gradient).
                Color.black
            } else if let bg = currentStory?.storyEffects?.background {
                // Source de vérité unique : `StoryBackgroundValue` (forme
                // « gradient:RRGGBB:RRGGBB », séparateur deux-points, partagée
                // avec le composer). Le parsing maison splittait sur la
                // VIRGULE : la chaîne restait entière, `Color(hex:)` recevait
                // « FF0000:0000FF » et le dégradé de l'auteur se rendait en
                // aplat. Le parse tolérant retombe en `.hex` sur une valeur
                // abîmée, ce qui préserve le fallback couleur historique.
                switch StoryBackgroundValue.parse(bg) {
                case .gradient(let start, let end):
                    LinearGradient(
                        colors: [Color(hex: start), Color(hex: end)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                case .hex(let hex):
                    Color(hex: hex)
                }
            } else {
                LinearGradient(
                    colors: [MeeshyColors.indigo950, MeeshyColors.indigo900, Color(hex: "24243E")],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            }
        }
        .ignoresSafeArea()
        .accessibilityHidden(true)
    }

    // MARK: - Blurred backdrop (letterbox au-dessus/en dessous du canvas 9:16)

    /// Habille les bandes letterbox d'un blur du contenu story.
    /// Cascade de sources (priorité descendante) :
    ///   1. `slide.effects.thumbHash` — thumbHash explicite côté slide
    ///   2. `media[backgroundId].thumbHash` — thumbHash du média de fond
    ///      (couvre les vidéos uploadées qui portent leur thumbHash côté
    ///      `FeedMedia` plutôt que sur le slide composite)
    ///   3. Color.clear → le `storyBackground` gradient indigo se voit dans
    ///      les bandes (fallback graceful, jamais de rectangle noir)
    ///
    /// Décodage ThumbHash < 0.5 ms (16×16 → upscaled), blur GPU SwiftUI < 1 ms.
    @ViewBuilder
    private func storyBlurredBackdrop(for story: StoryItem?) -> some View {
        if let img = resolvedBackdropImage(for: story) {
            Image(uiImage: img)
                .resizable()
                .scaledToFill()
                .blur(radius: 60)
                .scaleEffect(1.18)
                .opacity(0.85)
        } else {
            Color.clear
        }
    }

    /// Résout l'image-source du backdrop selon la cascade documentée plus haut.
    /// Retourne `nil` si aucune source exploitable n'existe (Color.clear path).
    private func resolvedBackdropImage(for story: StoryItem?) -> UIImage? {
        guard let story else { return nil }
        let slide = renderableSlideCache.slide(for: story, chain: resolvedViewerLanguageChain)
        // (1) thumbHash slide-level
        if let hash = slide.effects.thumbHash,
           !hash.isEmpty,
           let img = UIImage.fromThumbHash(hash) {
            return img
        }
        // (2) thumbHash du media de fond — typique pour vidéo uploadée
        let bgMediaId: String? = {
            if let bg = slide.effects.resolvedBackgroundMedia {
                return bg.postMediaId
            }
            // Fallback historique : premier média si pas de canvas mediaObjects
            if (slide.effects.mediaObjects ?? []).isEmpty {
                return story.media.first?.id
            }
            return nil
        }()
        if let bgMediaId,
           let media = story.media.first(where: { $0.id == bgMediaId }),
           let mediaHash = media.thumbHash,
           !mediaHash.isEmpty,
           let img = UIImage.fromThumbHash(mediaHash) {
            return img
        }
        return nil
    }

    // MARK: - Background Audio Badge

    private func backgroundAudioBadge(audio: StoryBackgroundAudioEntry) -> some View {
        HStack(spacing: 6) {
            Image(systemName: "music.note")
                .font(MeeshyFont.relative(11, weight: .semibold))
            Text(audio.title)
                .font(MeeshyFont.relative(12, weight: .medium))
                .lineLimit(1)
                .truncationMode(.tail)
            if let uploader = audio.uploaderName {
                Text("· \(uploader)")
                    .font(MeeshyFont.relative(11))
                    .opacity(0.7)
                    .lineLimit(1)
            }
        }
        .foregroundColor(.white)
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(
            Capsule()
                .fill(.ultraThinMaterial)
                .overlay(Capsule().fill(Color.black.opacity(0.35)))
        )
    }

    // Le chip « note + onde » d'une piste de fond ENREGISTRÉE/IMPORTÉE a été
    // retiré du canvas (directive user 2026-07-30) : le header du reader porte
    // désormais ce même signal — note musicale puis onde animée — juste après
    // l'heure de publication. Une piste de fond sans entrée bibliothèque n'a
    // donc plus rien à afficher au milieu de l'image.

    // Le badge de langue courante vit désormais dans le rail (accolé à « Abc »),
    // plus dans le canvas — voir `StoryActionSidebarView.displayedLanguageCode`.
}

// MARK: - Story Viewer Content

/// Root canvas of the story viewer: opaque black base, offscreen prefetcher
/// host, and the geometry-wrapped story card with its transform stack and
/// lifecycle modifiers. Extracted from `StoryViewerView.viewerContent`
/// (formerly an `AnyView`) so the whole subtree is its own type-metadata
/// unit instead of inflating `StoryViewerView.body`'s opaque type.
struct StoryViewerContentView: View {
    let prefetcher: StoryReaderPrefetcher

    // Card transform inputs
    let cardScale: CGFloat
    let cardCornerRadius: CGFloat
    let cardOpacity: Double
    let cardOffsetY: CGFloat
    let totalSlideX: CGFloat
    let slideProgress: CGFloat
    let dragProgress: CGFloat

    // Cube inter-groupes (Lot 3) : aperçu statique léger du groupe voisin
    // rendu comme seconde face pendant le drag horizontal / le commit.
    let neighborGroup: StoryGroup?
    let neighborEntryStory: StoryItem?
    let neighborDirection: Int
    // Interlude du voisin révélé AU DOIGT (directive user 2026-07-25) —
    // valeurs OPAQUES résolues par `StoryViewerView` (cache d'intros
    // pré-résolues + présence + amitié) et descendues jusqu'à la face du cube.
    // `nil` = pas encore résolu → la face reste sur son backdrop seul.
    let neighborIntro: StoryViewModel.StoryGroupIntro?
    let neighborPresence: UserPresence?
    let neighborIsFriend: Bool

    @Binding var isPresented: Bool

    /// Builds the story card for the supplied geometry. The closure is owned by
    /// `StoryViewerView` so the card receives the view's `@State` bindings.
    let makeStoryCard: (GeometryProxy) -> StoryCardView

    var body: some View {
        ZStack {
            // Opaque black base — prevents any white frame bleed
            Color.black.ignoresSafeArea()

            // === P3 wire-up : offscreen prefetcher host ===
            PrefetcherHostView(prefetcher: prefetcher)
                .frame(width: 1, height: 1)
                .allowsHitTesting(false)
                .accessibilityHidden(true)
                .zIndex(-1000)

            GeometryReader { geometry in
                ZStack {
                    // The story card with all transforms layered.
                    // Pin to geometry size BEFORE applying scale/clip — the
                    // story canvas itself (`StoryCardView`) hard-frames its
                    // body, and we double-down here so neither the
                    // `scaleEffect` nor any unexpected intrinsic content
                    // size can leak beyond the viewport's actual bounds.
                    // Vrai cube inter-groupes (Lot 3) : angle proportionnel à
                    // la position écran, anchor sur l'arête intérieure — les
                    // deux faces (carte sortante + aperçu voisin) tournent
                    // autour de l'arête commune. À 90° la face est de profil :
                    // le swap de contenu au commit y est invisible.
                    let cubeWidth = max(geometry.size.width, 1)
                    makeStoryCard(geometry)
                        .frame(width: geometry.size.width, height: geometry.size.height)
                        .scaleEffect(cardScale * (1.0 - slideProgress * 0.08))
                        .clipShape(RoundedRectangle(cornerRadius: cardCornerRadius + slideProgress * 16, style: .continuous))
                        .opacity(cardOpacity)
                        .offset(x: totalSlideX, y: cardOffsetY)
                        .rotation3DEffect(
                            .degrees(Double(totalSlideX / cubeWidth) * 90.0),
                            axis: (x: 0, y: 1, z: 0),
                            anchor: totalSlideX > 0 ? .leading : .trailing,
                            perspective: 0.5
                        )
                        .shadow(
                            color: .black.opacity(dragProgress > 0.05 || slideProgress > 0.02 ? 0.5 : 0),
                            radius: 40, y: 15
                        )

                    if let neighborGroup, neighborDirection != 0 {
                        let incomingX = totalSlideX + (neighborDirection == 1 ? cubeWidth : -cubeWidth)
                        NeighborGroupCubeFace(
                            entryStory: neighborEntryStory,
                            intro: neighborIntro,
                            avatarURL: neighborGroup.avatarURL,
                            avatarColor: neighborGroup.avatarColor,
                            presence: neighborPresence,
                            isFriend: neighborIsFriend,
                            revealProgress: slideProgress
                        )
                            .frame(width: geometry.size.width, height: geometry.size.height)
                            .clipShape(RoundedRectangle(cornerRadius: cardCornerRadius + slideProgress * 16, style: .continuous))
                            .offset(x: incomingX, y: cardOffsetY)
                            .rotation3DEffect(
                                .degrees(Double(incomingX / cubeWidth) * 90.0),
                                axis: (x: 0, y: 1, z: 0),
                                anchor: incomingX > 0 ? .leading : .trailing,
                                perspective: 0.5
                            )
                            .allowsHitTesting(false)
                            .accessibilityHidden(true)
                    }

                    // La croix de fermeture du preview est portée par le
                    // `StoryHeaderView` (coin haut-droit, `dismissViewer()`).
                    // Pas de bouton ✕ additionnel en haut-gauche — une seule
                    // croix de fermeture (directive user 2026-07-23).

                }
            }
        }
    }
}

// MARK: - R3 : indicateur de buffering mid-slide

/// Spinner discret style Instagram affiché au CENTRE de la carte quand la
/// timeline unifiée est gelée par le stall gate (vidéo qui bufferise, audio /
/// image bg en cours de cache — R1/R2) après le chargement initial. Pas de
/// plein écran, pas de voile : le média figé reste visible, seul un petit
/// disque glass signale l'attente. `colorScheme .dark` épinglé : sur verre en
/// Light, le spinner blanc serait illisible (règle mémoire « texte blanc
/// illisible Light sur verre »).
private struct StoryPlaybackStallIndicator: View {
    var body: some View {
        ProgressView()
            .progressViewStyle(.circular)
            .tint(.white)
            .scaleEffect(1.15)
            .frame(width: 52, height: 52)
            .background(.ultraThinMaterial, in: Circle())
            .environment(\.colorScheme, .dark)
            .accessibilityLabel(
                String(localized: "story.reader.buffering",
                       defaultValue: "Chargement de la story en cours")
            )
    }
}
