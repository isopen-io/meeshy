import SwiftUI
import MeeshySDK
import MeeshyUI

extension StoryViewerView {

    // MARK: - Unified Drag Gesture (horizontal = groups, vertical = dismiss)

    // Les DEUX lois de cession de ce drag — et la clé qui alimente la première —
    // vivent dans `StoryReaderDragOwnership.swift` : `StoryReaderDragStartZone`
    // (cède sur le point de départ, aux panneaux défilants) et
    // `StoryReactionStripGesture` (cède sur la direction, à la barre de
    // réactions). Elles y disent aussi pourquoi les deux critères ne sont pas
    // interchangeables.

    var unifiedDragGesture: some Gesture {
        DragGesture(minimumDistance: 15, coordinateSpace: .global)
            .onChanged { value in
                guard !isDismissing && !isTransitioning && !isComposerEngaged else { return }
                // CESSION À LA BARRE DE RÉACTIONS (#6083, cf.
                // `StoryReactionStripGesture`) : ce drag est simultané, donc
                // insubordonnable par priorité — la barre ne peut gagner que
                // s'il CÈDE, et il ne le sait qu'en lisant cet état.
                guard !reactionStripOwnsDrag else { return }
                guard !composerOwnsDrag else { return }
                // CESSION AU GLISSÉ DE LA BARRE (#7878) et du rail : pendant un
                // parcours au doigt, ni cube ni fermeture.
                guard !isScrubbingRail else { return }
                // GARDE DE POINT DE DÉPART — ce drag est monté sur un ANCÊTRE de
                // tout le contenu du lecteur, donc aussi des `ScrollView` que
                // portent certaines surfaces (liste de commentaires, sélecteurs
                // plein écran). Deux dégâts, par ordre de gravité :
                //  (b) si l'`UIScrollView` emporte la séquence, SwiftUI ne délivre
                //      JAMAIS notre `onEnded` : `gestureAxis` resterait à 2 et la
                //      story serait gelée jusqu'à la fin de la session ;
                //  (a) scroller la liste translatait la carte (`dragOffset`) et
                //      pouvait committer un `.dismissActiveFeature` involontaire.
                // La surface publie désormais son bord SUPÉRIEUR réel en
                // coordonnées `.global` (`StoryReaderScrollableSurfaceTopKey`,
                // posée sur le conteneur PARENT de son `ScrollView` — donc un
                // cadre de layout, pas une position de défilement). On n'abandonne
                // donc plus le geste que quand il NAÎT DANS la surface : ce
                // geste-là appartient au scroll et à rien d'autre. Né dans la
                // story encore visible AU-DESSUS, il reste au drag parent, qui
                // peut de nouveau refermer la surface d'un glissement bas.
                //
                // FAIL-SAFE : bord inconnu (mesure pas encore arrivée, ou surface
                // dont le panneau n'est pas mesurable ici — cf.
                // `effectiveScrollableSurfaceTopY`) ⇒ on retombe sur la sortie
                // anticipée intégrale. Un swipe inerte pendant une frame est un
                // moindre mal devant (b).
                guard !StoryReaderDragStartZone.yieldsToScrollableSurface(
                    hasScrollableSurface: hasScrollableReaderSurface,
                    surfaceTopY: effectiveScrollableSurfaceTopY,
                    dragStartY: value.startLocation.y
                ) else { return }
                let dx = value.translation.width
                let dy = value.translation.height

                // Decide axis on first significant movement.
                // L'axe vertical accepte désormais les DEUX sens : le swipe
                // haut active le plein écran (spec 2026-07-25), il ne peut
                // donc plus être filtré par `dy > 0`.
                //
                // AUCUN `pauseTimer()` ici : la pause du drag est ÉTAT-DIRIGÉE
                // (`shouldPauseTimer` contient `gestureAxis != 0`). Un
                // `pauseTimer()` événementiel exigeait un `resumeTimer()`
                // symétrique — jamais appelé quand SwiftUI saute le `onEnded`,
                // d'où une story gelée sans retour. Adossée à `gestureAxis`, la
                // reprise redevient automatique dès que l'axe retombe à 0.
                if gestureAxis == 0 {
                    if abs(dx) > abs(dy) + 8 {
                        guard !StoryReaderHorizontalYield.yields(
                            stripFrame: reactionStripFrame, chromeFrames: readerChromeFrames, dragStart: value.startLocation
                        ) else { return }
                        gestureAxis = 1 // horizontal
                    } else if abs(dy) > abs(dx) + 8 {
                        gestureAxis = 2 // vertical
                        // Photographie de l'état des surfaces AU DÉBUT du geste :
                        // l'overlay gestuel enfant referme la surface dès le
                        // touch-down, donc au relâchement l'information est perdue
                        // (cf. doc de `hadActiveFeatureAtDragStart`).
                        hadActiveFeatureAtDragStart = hasActiveReaderFeature
                    }
                }

                switch gestureAxis {
                case 1:
                    horizontalDrag = StoryGroupSwipeDecision.displayedTranslation(
                        dx, width: screenW,
                        hasNeighbor: dx < 0 ? currentGroupIndex < groups.count - 1 : currentGroupIndex > 0
                    )
                    // Face du cube côté direction courante — recalculée à
                    // chaque tick : le geste est réversible mi-course.
                    let total = groupSlide + dx
                    neighborPreviewDirection = total < 0 ? 1 : (total > 0 ? -1 : 0)
                case 2:
                    // Vers le bas : la carte suit le doigt (dismiss ou sortie
                    // de plein écran). Vers le haut : on ne translate pas la
                    // carte — l'entrée en plein écran est un changement de
                    // cadrage, pas un déplacement ; on garde `dragOffset` à 0
                    // pour ne pas décoller la story de l'écran.
                    dragOffset = max(0, dy)
                default: break
                }
            }
            .onEnded { value in
                let axis = gestureAxis
                gestureAxis = 0
                // Consommées ici et nulle part ailleurs : les deux photographies
                // ne valent que pour LE geste qui vient de se terminer.
                //
                // DEUX SOURCES, PAS UNE. `hadActiveFeatureAtDragStart` est prise à
                // la décision d'axe, donc après 15 pt de déplacement ; quand le
                // doigt part d'une zone hit-testée par l'overlay gestuel enfant
                // (tout le canvas hors la bande basse), celui-ci a DÉJÀ refermé la
                // surface au touch-down et cette photographie vaut `false`. Un
                // glissement bas de plus de 120 pt concluait alors `.dismissViewer`
                // et l'utilisateur PERDAIT la story en croyant refermer son strip.
                // `readerFeatureConsumedByTouch`, posé par l'enfant à l'instant où
                // il consomme la surface, couvre exactement ce trou.
                let hadActiveFeature = hadActiveFeatureAtDragStart || readerFeatureConsumedByTouch
                hadActiveFeatureAtDragStart = false
                readerFeatureConsumedByTouch = false

                guard !isDismissing && !isTransitioning && !isComposerEngaged else {
                    snapBackAll()
                    return
                }

                switch axis {
                case 1: // Horizontal — group navigation
                    // NE PAS retourner ce signe seul (#4297, tenté puis annulé) :
                    // la géométrie du CUBE vit en espace ÉCRAN (`horizontalDrag`,
                    // `groupSlide`, `exitX`, faces voisines). Retourner la décision
                    // sans le cube ferait partir la face de commit à l'OPPOSÉ du
                    // doigt. Le retournement complet demande le simulateur (#4298).

                    // Transfer interactive drag -> groupSlide (no visual snap).
                    // 1:1 (Lot 3) — cohérent avec `totalSlideX` sans amorti.
                    groupSlide += horizontalDrag
                    horizontalDrag = 0

                    // Progressif et annulable jusqu'au bout (#11192) : le doigt
                    // qui repart vers l'origine annule, à tout point de la course.
                    switch StoryGroupSwipeDecision.decide(
                        translation: value.translation.width,
                        predictedEnd: value.predictedEndTranslation.width,
                        width: screenW,
                        hasNext: currentGroupIndex < groups.count - 1,
                        hasPrevious: currentGroupIndex > 0
                    ) {
                    case .next:
                        // Reprend l'auteur suivant à sa première story non lue
                        // (parité avec l'aperçu du cube), pas à la slide 0.
                        HapticFeedback.light()
                        groupTransition(forward: true) { landOnNextGroup() }
                    case .previous:
                        HapticFeedback.light()
                        groupTransition(forward: false) { landOnPreviousGroup() }
                    case .cancel:
                        // La face du cube reste montée pendant le retour, nettoyée une fois posée.
                        snapBackAll()
                    }

                case 2: // Vertical — plein écran / dismiss
                    // Le swipe bas porte deux sens : en plein écran il REVIENT
                    // au mode fenêtré, sinon il quitte la story. Décision
                    // isolée et testée dans `StoryVerticalGestureDecisions`.
                    switch StoryVerticalGestureDecisions.decide(
                        translationY: value.translation.height,
                        predictedY: value.predictedEndTranslation.height,
                        isFullscreen: isFullscreenStorySession,
                        threshold: 120,
                        // Valeur FIGÉE au début du geste, jamais relue ici : cf.
                        // `hadActiveFeatureAtDragStart` / `readerFeatureConsumedByTouch`.
                        hasActiveFeature: hadActiveFeature
                    ) {
                    case .dismissActiveFeature:
                        // La surface ouverte se referme, et RIEN d'autre : ni
                        // dismiss, ni bascule plein écran. Si l'enfant l'avait déjà
                        // refermée au touch-down, l'appel est un no-op idempotent
                        // et il ne reste que le snap-back + la reprise de lecture —
                        // c'est exactement le `.cancel` attendu, et surtout PAS une
                        // sortie du lecteur.
                        dismissActiveReaderFeature()
                        snapDragOffsetBack()
                    case .dismissViewer:
                        dismissViewer()
                    case .enterFullscreen:
                        HapticFeedback.light()
                        setFullscreenSession(true)
                        snapDragOffsetBack()
                    case .exitFullscreen:
                        HapticFeedback.light()
                        setFullscreenSession(false)
                        snapDragOffsetBack()
                    case .cancel, .none:
                        snapDragOffsetBack()
                    }

                default:
                    snapBackAll()
                }
            }
    }

    /// Bascule la session plein écran et synchronise l'état au repos du chrome.
    /// Même mécanique que l'entrée par le menu « … » (`StoryViewerView+Sidebar`)
    /// — un seul comportement, deux points d'entrée.
    func setFullscreenSession(_ enabled: Bool) {
        isFullscreenStorySession = enabled
        withAnimation(.spring(response: 0.32, dampingFraction: 0.78)) {
            chromeVisible = !enabled
        }
    }

    /// Ramène la carte à sa position de repos après un geste vertical non
    /// validé (ou validé sans dismiss), et relance la lecture.
    private func snapDragOffsetBack() {
        withAnimation(.spring(response: 0.35, dampingFraction: 0.75)) {
            dragOffset = 0
        }
        resumeTimer()
    }

    /// FILET ANTI-ÉTAT-COLLANT du système gestuel du lecteur.
    ///
    /// CE QUE LA FONCTION FAIT, exactement :
    /// 1. remet `gestureAxis` à 0 — sans quoi la décision d'axe du geste suivant
    ///    est sautée (`if gestureAxis == 0`) et ce geste hérite d'un axe faux ;
    ///    comme `shouldPauseTimer` contient `gestureAxis != 0`, c'est AUSSI ce
    ///    qui rend la lecture (la pause du drag est état-dirigée, pas
    ///    événementielle — aucun `pauseTimer()` n'est posé par le drag) ;
    /// 2. purge les photographies `hadActiveFeatureAtDragStart` et
    ///    `readerFeatureConsumedByTouch`, qui ne valent que pour le geste
    ///    interrompu — sans quoi la seconde neutraliserait le geste SUIVANT
    ///    (glissement bas qui ne fermerait plus le lecteur) ;
    /// 3. incrémente `gestureResetToken`, seul canal vers l'état de toucher
    ///    PRIVÉ de `StoryGestureOverlayView` (`touchStartTime`, `didExceedSlop`,
    ///    `holdActive`, `isResumingTap`).
    ///
    /// POURQUOI : SwiftUI n'appelle pas `onEnded` quand un recognizer concurrent
    /// emporte la séquence de touches, et depuis que `unifiedDragGesture` et le
    /// `DragGesture(minimumDistance: 0)` de l'overlay sont reconnus EN PARALLÈLE,
    /// ce cas est atteignable en usage normal.
    ///
    /// QUI L'APPELLE : `snapBackAll()` (donc le `onEnded` du drag sur ses chemins
    /// préemptés / d'axe indécis), `groupTransition(forward:)` au début de chaque
    /// transition de groupe, et le `onDisappear` du lecteur (sortie en plein
    /// drag). Elle n'est PAS un rattrapage universel : les
    /// chemins où `onEnded` n'arrive jamais ne sont réparés que par le point 1,
    /// au geste suivant — c'est précisément pour cela que la pause du drag est
    /// état-dirigée plutôt que confiée à un `resumeTimer()` symétrique.
    func resetGestureTracking() {
        gestureAxis = 0
        hadActiveFeatureAtDragStart = false
        readerFeatureConsumedByTouch = false
        // Même raison que les deux lignes précédentes : la revendication de la
        // barre de réactions ne vaut que pour LE geste qui vient de finir.
        reactionStripOwnsDrag = false
        composerOwnsDrag = false
        gestureResetToken &+= 1
    }

    private func snapBackAll() {
        resetGestureTracking()
        withAnimation(StoryGroupCube.settleAnimation) {
            horizontalDrag = 0
            dragOffset = 0
            groupSlide = 0
        }
        delays.run(after: .milliseconds(320)) { if !isTransitioning { neighborPreviewDirection = 0 } }
        resumeTimer()
    }
}
