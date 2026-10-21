import SwiftUI
import UIKit
import MeeshySDK
import MeeshyUI

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
                                    guard await cancellableSleep(for: .milliseconds(Int(holdThresholdSeconds * 1000))), !Task.isCancelled else { return }
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
