import SwiftUI
import Combine
import AVFoundation
import QuartzCore
import os
import MeeshySDK
import MeeshyUI

// MARK: - Story reaction recovery

/// Ce qu'on fait d'une réaction de story que le POST direct n'a pas posée.
///
/// Le tri lit `MeeshyError.from(_:)`, la normalisation `APIClient` de tout
/// `URLError` de transport en `.network` — la même forme que
/// `NearbyDiscoveryViewModel` lit pour dire « hors ligne », et celle sur
/// laquelle la file elle-même exempte une ligne de son budget de tentatives
/// (`OutboxFlusher.isNetworkTransportError`). Tout le reste est un REFUS ou une
/// erreur locale : le 409 `REACTION_LIMIT_REACHED` du gateway, un 403, un 404,
/// un décodage — rejouer ne changerait rien, l'optimisme est rembobiné.
nonisolated enum StoryReactionRecovery: Equatable, Sendable {
    /// Panne de transport : la file durable rejouera la réaction au retour du
    /// réseau, et l'emoji affiché reste vrai.
    case queueForReplay
    /// Refus du serveur ou erreur locale : restaurer l'état d'avant le tap.
    case rollback

    static func decide(for error: Error) -> StoryReactionRecovery {
        if case .network = MeeshyError.from(error) { return .queueForReplay }
        return .rollback
    }
}

// MARK: - Reveal Circle Shape

/// Shape animable pour l'effet de révélation circulaire.
struct RevealCircleShape: Shape {
    var progress: CGFloat  // 0 = cercle invisible, 1 = plein écran

    var animatableData: CGFloat {
        get { progress }
        set { progress = newValue }
    }

    func path(in rect: CGRect) -> Path {
        let maxRadius = sqrt(rect.width * rect.width + rect.height * rect.height)
        let radius = maxRadius * progress
        let center = CGPoint(x: rect.midX, y: rect.midY)
        return Path(ellipseIn: CGRect(
            x: center.x - radius, y: center.y - radius,
            width: radius * 2, height: radius * 2
        ))
    }
}

// MARK: - Grammaire d'apparition d'une story

/// État de DÉPART des quatre pilotes d'apparition d'une story, dérivé de la
/// transition d'OUVERTURE choisie par l'auteur.
///
/// Pourquoi extraire ça d'un `switch` inline : la même story peut apparaître par
/// DEUX chemins — le cross-fade intra-groupe (`crossFadeStory`) et le retrait de
/// l'interlude d'identité inter-groupes (`dismissGroupIntro(revealing:)`). Le
/// second ne l'animait pas du tout avant le 2026-07-26 : passer d'un groupe à
/// l'autre posait le slide d'un bloc, alors qu'avancer dans un groupe respectait
/// le zoom / slide / reveal configuré. Une seule table de valeurs garantit
/// désormais qu'un zoom reste un zoom, qu'il arrive après un slide ou après le
/// voile d'identité.
///
/// « Armé » = ce qu'on pose HORS animation juste avant la transaction qui ramène
/// tout au repos (`contentOpacity` 1, `openingScale` 1, `textSlideOffset` 0,
/// `isRevealActive` vrai pour `.reveal` uniquement).
///
/// `nonisolated` porté par le TYPE et non méthode par méthode : `apps/ios`
/// compile avec `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor`, et l'annotation au
/// niveau des membres ne couvre ni la conformance `Equatable` synthétisée ni les
/// key paths — un helper purement calculatoire doit être neutre en entier.
nonisolated struct StoryOpeningEntrance: Equatable {
    /// Toujours 0 : quelle que soit la grammaire, la story entrante part
    /// invisible et c'est l'animation qui la fait exister.
    let contentOpacity: Double
    let openingScale: CGFloat
    /// Décalage HORIZONTAL en fraction de la largeur du canvas, aligné sur le
    /// SDK (`StoryRenderer.slideTransitionTravelFraction`). Distinct de
    /// `textSlideOffset`, qui est un décalage vertical en points.
    let openingSlideFraction: CGFloat
    let textSlideOffset: CGFloat
    let isRevealActive: Bool

    static func armed(for opening: StoryTransitionEffect?) -> StoryOpeningEntrance {
        switch opening {
        case .zoom:
            // `1.08 → 1.0` : le SDK DÉZOOME. Partir de 0.88 zoomait, donc le
            // même effet nommé jouait à l'envers selon qu'on regardait
            // l'aperçu du composer (chemin SDK) ou le lecteur.
            return StoryOpeningEntrance(contentOpacity: 0,
                                        openingScale: StoryRenderer.zoomTransitionScale,
                                        openingSlideFraction: 0,
                                        textSlideOffset: 0, isRevealActive: false)
        case .slide:
            // Le SDK glisse HORIZONTALEMENT de 8 % de la largeur du canvas ;
            // un décalage vertical de 30 pt ne correspondait ni à l'aperçu ni
            // à l'export.
            return StoryOpeningEntrance(contentOpacity: 0, openingScale: 1.0,
                                        openingSlideFraction: StoryRenderer.slideTransitionTravelFraction,
                                        textSlideOffset: 0, isRevealActive: false)
        case .reveal:
            // Rien à armer géométriquement : c'est `RevealCircleShape` qui joue,
            // piloté par `isRevealActive` qui bascule à vrai DANS l'animation.
            return StoryOpeningEntrance(contentOpacity: 0, openingScale: 1.0,
                                        openingSlideFraction: 0,
                                        textSlideOffset: 0, isRevealActive: false)
        case .fade, .none:
            // Fondu + micro-décalage (14 pt) : le fondu seul se lit comme un
            // saut de luminosité, le décalage lui donne une direction.
            return StoryOpeningEntrance(contentOpacity: 0, openingScale: 1.0,
                                        openingSlideFraction: 0,
                                        textSlideOffset: 14, isRevealActive: false)
        }
    }
}

// MARK: - Extracted from StoryViewerView.swift

extension StoryViewerView {

    // MARK: - Text Content · Media Overlay — RETIRÉS (244i)
    //
    // Six fonctions vivaient ici sans qu'aucun commit du dépôt ne les appelle :
    // `storyTextContent(_:storyEffects:)` et `mediaOverlay(media:geometry:)`, plus
    // les quatre privées qu'elles SEULES appelaient — `fontForStyle`,
    // `textAlignmentFor`, `compositeAlignment`, `coloredMediaFallback`.
    //
    // C'était le lecteur de story d'AVANT le canvas : du texte SwiftUI positionné
    // par `StoryEffects.textPosition/textAlign`, et une image posée en overlay. Le
    // rendu vivant est le canvas — `StoryViewerView+Canvas.swift` côté app,
    // `StorySlideRenderer` côté SDK, qui honore `fontFamily`/`textStyle` (c'est
    // l'extension à 18 familles du 2026-08-20 : `italic` et `retro` y sont entrés
    // précisément parce que des stories publiées portaient le vocabulaire
    // historique de `fontForStyle`).
    //
    // Elles emportaient `story.viewer.a11y.storyText` — une clé traduite en sept
    // locales pour un `accessibilityLabel` qu'aucun lecteur d'écran n'a jamais
    // annoncé.

    // MARK: - Filter Overlay

    var filterOverlay: some View {
        Group {
            if let filter = currentStory?.storyEffects?.filter {
                switch filter {
                case "vintage":
                    Color(hex: "F8B500").opacity(0.15)
                        .blendMode(.multiply)
                case "bw":
                    Color.gray.opacity(0.4)
                        .blendMode(.saturation)
                case "warm":
                    MeeshyColors.error.opacity(0.1)
                        .blendMode(.softLight)
                case "cool":
                    MeeshyColors.indigo300.opacity(0.1)
                        .blendMode(.softLight)
                default:
                    EmptyView()
                }
            }
        }
        .ignoresSafeArea()
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    // MARK: - Unified Drag Gesture (horizontal = groups, vertical = dismiss)

    // (clé de préférence + décision de zone de départ : voir en bas de fichier,
    // `StoryReaderScrollableSurfaceTopKey` et `StoryReaderDragStartZone`.)

    var unifiedDragGesture: some Gesture {
        DragGesture(minimumDistance: 15, coordinateSpace: .global)
            .onChanged { value in
                guard !isDismissing && !isTransitioning && !isComposerEngaged else { return }
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
                    horizontalDrag = dx
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
                    let dx = value.translation.width
                    let predicted = value.predictedEndTranslation.width

                    // Transfer interactive drag -> groupSlide (no visual snap).
                    // 1:1 (Lot 3) — cohérent avec `totalSlideX` sans amorti.
                    groupSlide += horizontalDrag
                    horizontalDrag = 0

                    if (dx < -60 || predicted < -150) && currentGroupIndex < groups.count - 1 {
                        // Swipe left -> next group. Reprend l'auteur suivant à
                        // sa première story non lue (parité avec l'aperçu du
                        // cube), pas systématiquement à la slide 0.
                        HapticFeedback.light()
                        groupTransition(forward: true) {
                            currentGroupIndex += 1
                            currentStoryIndex = entryIndex(of: groups[currentGroupIndex])
                            progress = 0
                        }
                    } else if (dx > 60 || predicted > 150) && currentGroupIndex > 0 {
                        // Swipe right -> prev group
                        HapticFeedback.light()
                        groupTransition(forward: false) {
                            currentGroupIndex -= 1
                            currentStoryIndex = max(0, groups[currentGroupIndex].stories.count - 1)
                            progress = 0
                        }
                    } else {
                        // Snap back — animate groupSlide to 0. La face du cube
                        // reste montée pendant le retour (elle sort de l'écran
                        // avec l'animation), nettoyée une fois posée.
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                            groupSlide = 0
                        }
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.32) {
                            if !isTransitioning { neighborPreviewDirection = 0 }
                        }
                        resumeTimer()
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
        gestureResetToken &+= 1
    }

    private func snapBackAll() {
        resetGestureTracking()
        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
            horizontalDrag = 0
            dragOffset = 0
            groupSlide = 0
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.32) {
            if !isTransitioning { neighborPreviewDirection = 0 }
        }
        resumeTimer()
    }

    // MARK: - Navigation

    // Pas de haptic ici : `goToNext`/`goToPrevious` sont aussi le chemin de
    // l'auto-advance (timer `onCompletion`) — vibrer à chaque slide casse la
    // fluidité de lecture (retour user 2026-07-13 : « 3 retours haptiques par
    // slide »). Le tick unique par navigation MANUELLE vit au point de geste
    // (touchUp nav dans +Canvas, commit de swipe de groupe ci-dessus).
    func goToNext() {
        guard !isDismissing && !isTransitioning && !isComposerEngaged else { return }
        guard let group = currentGroup else { return }

        if currentStoryIndex < group.stories.count - 1 {
            crossFadeStory {
                currentStoryIndex += 1
                progress = 0
            }
        } else if currentGroupIndex < groups.count - 1 {
            if isPreviewMode {
                isPresented = false
                return
            }
            groupTransition(forward: true) {
                currentGroupIndex += 1
                currentStoryIndex = entryIndex(of: groups[currentGroupIndex])
                progress = 0
            }
        } else {
            if isPreviewMode {
                isPresented = false
                return
            }
            dismissViewer()
        }
    }

    func goToPrevious() {
        guard !isDismissing && !isTransitioning && !isComposerEngaged else { return }

        if currentStoryIndex > 0 {
            crossFadeStory {
                currentStoryIndex -= 1
                progress = 0
            }
        } else if currentGroupIndex > 0 {
            groupTransition(forward: false) {
                currentGroupIndex -= 1
                currentStoryIndex = max(0, groups[currentGroupIndex].stories.count - 1)
                progress = 0
            }
        }
    }

    /// True cross-dissolve for stories within the same user.
    /// Old content stays visible (outgoing layer) while new content fades in on top —
    /// eliminates the flash caused by AsyncImage reloading between swaps.
    /// Supports StoryTransitionEffect: fade, zoom, slide, reveal.
    private func crossFadeStory(update: @escaping () -> Void) {
        isTransitioning = true

        // 1. Snapshot current story as outgoing (already rendered, no reload needed)
        outgoingStory = currentStory
        outgoingOpacity = 1
        closingScale = 1.0
        contentOpacity = 0

        let closingEffect = currentStory?.storyEffects?.closing

        // 2. Swap to the incoming story (invisible because contentOpacity = 0)
        update()
        markCurrentViewed()

        // Fire-and-forget prefetch — thumbHash provides instant visual while full image loads
        if let story = currentStory { prefetchAllMedia(for: story) }
        prefetchStory(at: currentStoryIndex + 1)
        prefetchStory(at: currentStoryIndex + 2)

        let incomingEffect = currentStory?.storyEffects?.opening

        // Table d'armement PARTAGÉE avec le retrait de l'interlude inter-groupes
        // (`dismissGroupIntro(revealing:)`) : une seule grammaire d'apparition,
        // deux chemins d'entrée. `contentOpacity` n'est PAS réappliqué ici — il
        // a été mis à 0 avant `update()` plus haut, précisément pour que le swap
        // de story soit invisible ; le réécrire après coup n'ajouterait rien et
        // brouillerait cette intention.
        let entrance = StoryOpeningEntrance.armed(for: incomingEffect)
        openingScale = entrance.openingScale
        openingSlideFraction = entrance.openingSlideFraction
        textSlideOffset = entrance.textSlideOffset
        isRevealActive = entrance.isRevealActive

        let animDuration: Double
        let animation: Animation
        switch incomingEffect {
        // Les trois effets NOMMÉS partagent la durée du SDK
        // (`slideTransitionDuration`). L'app en avait trois différentes —
        // 0,4 / 0,38 / 0,4 — désalignées de la seule valeur que l'aperçu du
        // composer et l'export respectent.
        case .zoom:
            animDuration = StoryRenderer.slideTransitionDuration
            animation = .spring(response: StoryRenderer.slideTransitionDuration,
                                dampingFraction: 0.75)
        case .slide:
            animDuration = StoryRenderer.slideTransitionDuration
            animation = .spring(response: StoryRenderer.slideTransitionDuration,
                                dampingFraction: 0.82)
        case .reveal:
            animDuration = StoryRenderer.slideTransitionDuration
            animation = .easeOut(duration: StoryRenderer.slideTransitionDuration)
        default:
            animDuration = 0.35
            animation = .easeOut(duration: 0.35)
        }

        // 3. Animate immediately — thumbHash provides instant visual while full image loads
        withAnimation(animation) {
            outgoingOpacity = 0
            contentOpacity = 1
            openingScale = 1.0
            textSlideOffset = 0
            openingSlideFraction = 0
            if incomingEffect == .reveal { isRevealActive = true }
            if closingEffect == .zoom { closingScale = StoryRenderer.zoomTransitionScale }
        }

        restartTimer()
        DispatchQueue.main.asyncAfter(deadline: .now() + animDuration + 0.04) {
            outgoingStory = nil
            isTransitioning = false
            closingScale = 1.0
        }
    }

    /// Transition cube entre groupes d'auteurs (Lot 3). Pendant le drag, les
    /// deux faces (carte + aperçu voisin) suivent déjà le doigt ; le commit
    /// termine la rotation jusqu'à ±90° puis swappe le contenu à l'arête —
    /// la carte réelle remplace la face entrante à transform identité, swap
    /// invisible. Le canvas voisin est chaud (prefetch inter-groupes), la
    /// première frame réelle est instantanée.
    // Non-private : appelée depuis `goBackToPreviousGroupFromIntro()`
    // (StoryViewerView.swift, fichier d'extension frère) pour rejouer
    // exactement la même animation de cube quand le tap gauche de l'intro
    // annule le switch de groupe.
    func groupTransition(forward: Bool, update: @escaping () -> Void) {
        guard !isTransitioning else { return }
        isTransitioning = true
        // Le groupe change : quel que soit le chemin d'entrée (drag commité, tap
        // en bord, auto-advance, tap gauche de l'interlude), l'état de toucher
        // hérité n'a plus de sens sur le nouveau groupe. Purge explicite — un
        // drag préempté n'a pas eu son `onEnded` et laisserait l'axe collé.
        resetGestureTracking()
        // Tap-en-bord / auto-advance arrivent ici sans drag : poser la
        // direction pour que la face entrante participe au commit.
        neighborPreviewDirection = forward ? 1 : -1

        let exitX: CGFloat = forward ? -screenW : screenW
        withAnimation(.spring(response: 0.32, dampingFraction: 0.9)) {
            groupSlide = exitX
        }

        // Swap quand l'arête est quasi à 90° (~96 % de la course du spring) :
        // la face entrante est alors à ~quelques points de l'identité.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.38) {
            update()
            // Pas de `markCurrentViewed()` ici : l'interlude du nouvel auteur
            // n'est décidé qu'ensuite, par l'`adaptiveOnChange(of:
            // currentGroupIndex)`. Marquer maintenant comptait la story avant
            // même que l'écran d'identité ne la recouvre. Le marquage se fait
            // dans ce onChange, APRÈS `presentGroupIntroIfNeeded()`.
            prefetchCurrentGroup()

            // Sans animation : la carte réelle prend la place exacte de la
            // face entrante (transform identité), la face est démontée.
            groupSlide = 0
            neighborPreviewDirection = 0
            restartTimer()
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
                isTransitioning = false
            }
        }
    }

    /// Dismiss — shrink to small card and fly toward top
    func dismissViewer() {
        guard !isDismissing else { return }
        isTransitioning = true
        slideTimer.setPaused(true)
        // Déclencher le fade-out audio immédiat lors du dismiss
        NotificationCenter.default.post(name: .storyAudioFadeOut, object: nil)

        // isDismissing MUST be inside withAnimation so computed transforms animate
        withAnimation(.spring(response: 0.5, dampingFraction: 0.82)) {
            isDismissing = true
            dragOffset = 0
            horizontalDrag = 0
            groupSlide = 0
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.45) {
            isPresented = false
        }
    }

    // MARK: - Timer

    /// State-driven pause: the timer checks ALL active UI states each tick
    /// instead of relying on paired pauseTimer/resumeTimer event calls.
    ///
    /// - `isPaused` : pauses du timer pour sheets, drag-to-dismiss, etc.
    ///   (timer-only — le canvas continue à jouer).
    /// - `isLongPressPaused` : toggle long-press utilisateur (timer + canvas
    ///   gelés ensemble via `.storyPlayerPause`).
    /// Internal car lu depuis `StoryViewerView.swift` (cross-file extension) :
    /// le helper `storyCard(geometry:)` passe cette valeur à `StoryCardView`
    /// pour propager la pause au canvas via `StoryReaderRepresentable.isPaused`.
    /// Composers + pickers + transitions pause the slide timer. Comments
    /// overlay does NOT (the user wants to read comments while the story
    /// keeps playing/looping behind). Focus on the comment composer engages
    /// `isComposerEngaged` which DOES pause — that's the intended trigger,
    /// not the overlay visibility alone (user spec 2026-05-28).
    var shouldPauseTimer: Bool {
        // Un peek Notification Center / Control Center (aperçu app-switcher,
        // scenePhase devenant transitoirement inactif) n'apparaît DÉLIBÉRÉMENT
        // PAS dans cet agrégat : la lecture doit continuer sans coupure pendant
        // ce genre de peek, comme une vidéo en PIP ou une app de musique en
        // arrière-plan (directive user 2026-07-14, qui annule une tentative
        // précédente de gate sur la phase de scène — celle-ci coupait l'audio
        // de fond et le faisait recommencer à 0 au retour). Le vrai
        // `.background` (dismiss complet du viewer) reste géré séparément via
        // `.adaptiveOnChange(of: scenePhase)` plus haut dans ce fichier.
        isPaused
        || isLongPressPaused
        || isComposerEngaged
        || hasComposerContent
        || showEmojiStrip
        || showFullEmojiPicker
        || showTextEmojiPicker
        || showLanguageOptions
        || showFullLanguagePicker
        // Scrub du rail + vol de réaction : la lecture attend la fin du geste et
        // de l'animation (spec scrub 2026-08-11).
        || isScrubbingRail
        || reactionFlight != nil
        // L'overlay commentaires ouvert met la story en pause : lire / répondre à
        // un commentaire ne doit pas laisser la slide auto-avancer sous l'overlay
        // (bug 2026-06-01 — l'utilisateur lit les commentaires et la story passe
        // à la slide suivante). Parité Instagram : ouvrir les commentaires gèle
        // la lecture (timer + médias via `isCanvasPlaybackPaused`).
        || showCommentsOverlay
        || isTransitioning
        || isDismissing
        // Interstitiel d'identité inter-groupes : la lecture (timer + canvas +
        // audio) attend la fin des ~2,2 s (ou le tap skip) — reprise sans saut.
        || showGroupIntro
        // Drag du lecteur en cours (axe décidé). ÉTAT-DIRIGÉ et non
        // événementiel : le drag ne pose plus de `pauseTimer()` à la décision
        // d'axe, car son `resumeTimer()` symétrique n'arrive jamais quand un
        // recognizer concurrent (un `UIScrollView` de surface, typiquement)
        // emporte la séquence et que SwiftUI saute le `onEnded` — la story
        // restait alors gelée pour de bon. Adossée à `gestureAxis`, la reprise
        // est automatique dès que l'axe retombe à 0 : le cas dégénéré se
        // rattrape tout seul au geste suivant.
        || gestureAxis != 0
    }

    func startTimer() {
        progress = 0
        isContentReady = false
        hasFiredFadeOut = false
        hasFiredNextPrefetch = false
        // Toutes les surfaces du reader tombent au changement de slide, pas
        // seulement les commentaires : un strip de langues ou une barre d'emojis
        // laissés ouverts se retrouvaient posés sur la story SUIVANTE, à laquelle
        // ils ne se rapportent plus (directive user 2026-07-25).
        showCommentsOverlay = false
        showLanguageOptions = false
        showFullLanguagePicker = false
        showEmojiStrip = false
        showFullEmojiPicker = false
        // Reset seam for a scrub whose .onEnded never fires (competing
        // recognizer / system interruption drops it, same hazard documented
        // for gestureAxis above): without this, isScrubbingRail could stay
        // stuck true and shouldPauseTimer would freeze the story forever.
        isScrubbingRail = false
        replyingToStoryComment = nil
        storyCommentRepliesMap = [:]
        storyCommentExpandedThreads = []
        storyCommentLoadingReplies = []
        // Slide changed → drop previous slide's comment list, like overrides, and
        // any in-flight heart taps. Without this, `isStoryCommentsEmpty` stays
        // false in the sidebar tap path (Sidebar:277) and the overlay re-opens
        // with the prior slide's comments without ever refetching.
        storyComments = []
        storyCommentLikedIds = []
        storyCommentLikeDelta = [:]
        heartInFlightIds = []
        isLoadingComments = false
        loadStoryCommentCount()
        storyReactionCount = currentStory?.reactionCount ?? 0
        storyCurrentUserReactions = currentStory?.currentUserReactions ?? []
        updateStoryDuration()

        // PROGRESS = StoryReaderTimerController (SDK), unique display-link de
        // progression. Gating : `markContentReady` (canvas visible via
        // `adaptiveOnChange(of: isContentReady)` + canvas préfetché via
        // `refreshPrefetchWindowAndTimer`) empêche le compte avant contenu ;
        // pause : `setPaused` asservi à `shouldPauseTimer`. La barre, le seuil
        // de prefetch N+1 et `goToNext()` vivent dans les callbacks câblés par
        // `installPrefetchPipelineIfNeeded`. Le wall-clock du controller reste
        // l'autorité de la durée slide (cf. plan Lot 2 — l'asservissement au
        // clock canvas clampé bloquerait l'auto-advance sur les pauses UI).
        refreshPrefetchWindowAndTimer()
        slideTimer.setPaused(shouldPauseTimer)
    }

    /// Restart timer AND clear manual pause (e.g., after drag->transition).
    /// Changement de slide ou sortie de transition : on repart en lecture
    /// fraîche. On désarme **les deux** drapeaux de pause :
    /// - `isPaused` (timer-only)
    /// - `isLongPressPaused` (long-press latch — déclenche `.storyPlayerResume`
    ///   au canvas si on était latched-paused au moment du changement).
    private func restartTimer() {
        isPaused = false
        isLongPressPaused = false
        // Filet de récupération de l'axe de geste. Depuis que la pause du drag
        // est ÉTAT-DIRIGÉE (`gestureAxis != 0` dans `shouldPauseTimer`), un axe
        // resté collé gèle la lecture — et SwiftUI ne délivre PAS `onEnded`
        // quand un recognizer concurrent (ScrollView du rail en repli
        // `ViewThatFits`, liste de commentaires) emporte la séquence. Avant ce
        // passage à l'état, la pause était portée par `isPaused`, que cette
        // fonction remettait déjà à false : le changement de slide était la
        // voie de récupération naturelle. La rétablir ici la préserve — sinon
        // taper pour avancer changeait bien de slide, mais la lecture restait
        // figée jusqu'à un changement de GROUPE ou la sortie du lecteur.
        gestureAxis = 0
        startTimer()
    }

    /// Calcule la durée du slide courant en fonction des médias (vidéo/audio).
    /// Minimum 6s pour les slides texte/image seules — parité Instagram/Snapchat,
    /// abaissé depuis 12s après retour utilisateur « les stories durent trop ».
    ///
    /// Spec: la story dure `max(longest_media_end_time, configured_slideDuration, 6s_minimum)`,
    /// puis arrondie au multiple supérieur de chaque période de loop bg pour
    /// que la vidéo/audio bg ne soit JAMAIS coupée au milieu d'un cycle.
    /// Avant ce fix, `effects.slideDuration` early-returned et les médias plus longs
    /// que la durée configurée étaient coupés (la vidéo apparaissait quelques
    /// secondes puis disparaissait alors que le son continuait — typique d'un
    /// timer de slide expirant avant la fin du média).
    /// SINGLE SOURCE OF TRUTH pour la durée du slide.
    /// User spec 2026-05-27 :
    /// - Slide statique → 6 s
    /// - Slide avec vidéo OU audio bg → durée du media (loopé si < 6 s)
    /// - `storyEffects.slideDuration` configuré prime quand > 0
    ///
    /// Délégation à `StorySlide.toRenderableSlide(...).computedTotalDuration()`
    /// pour aligner exactement avec la durée que pilote le canvas
    /// (`StoryCanvasUIView.displayLinkTick.effectiveDuration`). Garantit que
    /// progress bar (wall-clock viewer-side) et auto-advance (canvas-side)
    /// utilisent la MÊME valeur.
    static let defaultSlideDuration: Double = 6.0

    private func updateStoryDuration() {
        guard let story = currentStory else {
            computedStoryDuration = Self.defaultSlideDuration
            return
        }
        // `preferredLanguages: []` — la résolution de langue n'affecte
        // pas la durée (computedTotalDuration ne consulte plus le texte
        // résolu depuis sa simplification single-source-of-truth).
        // Évite la dépendance sur `resolvedViewerLanguageChain` (private
        // dans StoryViewerView.swift, inaccessible depuis cette extension).
        let renderable = story.toRenderableSlide(preferredLanguages: [])
        computedStoryDuration = renderable.computedTotalDuration()
    }

    /// Manual pause — sheets, drag-to-dismiss, composer engaged, etc.
    /// **Timer-only** : le canvas (vidéo BG, audios, effets) continue à
    /// jouer. Cela évite un blip audible au cycle pause/resume rapide
    /// d'un drag de transition. Le toggle long-press passe par
    /// `isLongPressPaused` (qui, lui, freeze le canvas via notification).
    func pauseTimer() { isPaused = true }

    /// Manual resume — symétrique de `pauseTimer()`. N'inverse pas le
    /// long-press latch (`isLongPressPaused`) : si l'utilisateur a stoppé
    /// la story via long-press puis ouvert une sheet, la fermeture de la
    /// sheet ne doit pas relancer la story automatiquement.
    func resumeTimer() {
        isPaused = false
    }

    // MARK: - Initial Action (Phase F — notification entry point)

    /// Honours the optional `initialAction` (set when this viewer was launched
    /// from a story notification redirect). The 250 ms delay lets the
    /// fullScreenCover finish its presentation animation and lets the canvas
    /// (media + progress bars) mount one frame, otherwise the comments overlay
    /// or viewers sheet animates in over a half-blank screen on cold start.
    /// Idempotent via `hasTriggeredInitialAction` — repeated `.onAppear` calls
    /// (scene phase, parent re-renders) are no-ops.
    func triggerInitialActionIfNeeded() {
        guard let action = initialAction, !hasTriggeredInitialAction else { return }
        hasTriggeredInitialAction = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
            switch action {
            case .showCommentsOverlay:
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    showCommentsOverlay = true
                }
                pauseTimer()
                if storyComments.isEmpty {
                    loadStoryComments()
                }
            case .showViewersSheet:
                showViewersSheet = true
                pauseTimer()
            }
        }
    }

    // MARK: - Dismiss Composer

    func dismissComposer() {
        UIApplication.shared.sendAction(
            #selector(UIResponder.resignFirstResponder),
            to: nil, from: nil, for: nil
        )
        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
            showTextEmojiPicker = false
            showFullEmojiPicker = false
        }
        isComposerEngaged = false
    }

    // MARK: - Actions

    func sendComment(text: String, effectFlags: Int? = nil, parentId: String? = nil, pendingMedia: PendingCommentMedia? = nil, location: SharedPlace? = nil) {
        guard (!text.isEmpty || pendingMedia != nil), let story = currentStory else { return }
        EngagementTracker.shared.recordAction(.commented, surface: .storyViewer)

        // Optimistic local insert. Reply nesting is currently flat in the UI
        // (Threads-style max-1-niveau pour MVP) — the parentId is forwarded
        // to the backend so the comment graph stays correct, but rendering
        // does not yet visually indent replies. See SOTA audit Pilier 19.
        let currentUser = AuthManager.shared.currentUser
        let authorName: String = currentUser?.displayName ?? currentUser?.username ?? "Moi"
        let authorId: String = currentUser?.id ?? ""
        // La ligne optimiste est keyée par le cmid : envoyé au REST ET réutilisé
        // par le repli outbox, il fait dédoublonner le serveur (MutationLog) et
        // revient dans l'écho `comment:added` pour une réconciliation par id
        // exacte (le twin-match par contenu ne tenait pas quand le serveur
        // normalise le texte).
        let optimisticComment = FeedComment(
            id: ClientMutationId.generate(),
            author: authorName,
            authorId: authorId,
            authorUsername: currentUser?.username,
            authorAvatarURL: currentUser?.avatar,
            content: text,
            parentId: parentId,
            effectFlags: effectFlags ?? 0,
            originalLanguage: composerLanguage,
            media: pendingMedia.map { [$0.optimistic] } ?? [],
            location: location
        )

        if let parentId {
            // Reply — insert into repliesMap so it appears in the thread
            var existing = storyCommentRepliesMap[parentId] ?? []
            existing.append(optimisticComment)
            storyCommentRepliesMap[parentId] = existing
            // Also increment the reply count on the parent comment
            if let idx = storyComments.firstIndex(where: { $0.id == parentId }) {
                storyComments[idx].replies += 1
            }
            // Counter now sums top-level + replies, so it must also bump here.
            storyCommentCount += 1
        } else {
            // Top-level comment
            storyComments.append(optimisticComment)
            storyCommentCount += 1
        }

        // Send to API. Un média éventuel est uploadé (uploadContext=comment → PostMedia)
        // puis transmis via `attachmentIds` ; la ligne serveur réconcilie via le socket
        // `comment:added` (qui porte désormais le média). Le commentaire optimiste
        // affiche déjà le média local.
        //
        // Both the media upload and the comment POST now THROW instead of being
        // silently swallowed by `try?` — a media upload failure used to publish
        // the comment WITHOUT its media (silent data loss); a POST failure left
        // the optimistic `temp_` comment/reply on screen forever even offline
        // (no rollback). Either failure now rolls back the exact optimistic
        // insert via the pure `rollingBackOptimisticComment` — same snapshot/
        // rollback discipline as `sendReaction`.
        let language = composerLanguage
        let tempCommentId = optimisticComment.id
        Task {
            do {
                var attachmentIds: [String]? = nil
                if let pendingMedia {
                    attachmentIds = [try await CommentMediaUploader.upload(pendingMedia)]
                }
                try await StoryInteractionService().postComment(
                    storyId: story.id,
                    content: text,
                    originalLanguage: language,
                    effectFlags: effectFlags,
                    parentId: parentId,
                    attachmentIds: attachmentIds,
                    mobileTranscription: pendingMedia?.mobileTranscription,
                    location: location,
                    clientMutationId: tempCommentId
                )
            } catch {
                // Le POST direct a échoué — le plus souvent parce qu'on est
                // hors-ligne. Perdre un commentaire que l'utilisateur vient de
                // taper est la pire issue possible : on le confie à l'outbox,
                // qui le rejouera au retour du réseau. Même chemin que le feed
                // (`FeedCommentsSheet`), même kind `.createComment` : la ligne
                // optimiste `temp_` est réconciliée par le handler socket
                // `comment:added` déjà câblé quand le rejeu aboutit.
                //
                // LIMITE ASSUMÉE, identique au feed : `CreateCommentPayload` ne
                // porte pas `attachmentIds` (lacune du schéma SDK). Un média
                // joint à un commentaire envoyé hors-ligne est perdu au rejeu ;
                // le TEXTE et ses effets visuels, eux, survivent.
                do {
                    // MÊME cmid que la tentative REST : un POST abouti dont la
                    // réponse s'est perdue est dédoublonné au rejeu (MutationLog).
                    let cmid = tempCommentId
                    try await OfflineQueue.shared.enqueue(
                        .createComment,
                        payload: CreateCommentPayload(
                            clientMutationId: cmid,
                            postId: story.id,
                            parentCommentId: parentId,
                            content: text,
                            location: location,
                            effectFlags: effectFlags
                        ),
                        conversationId: story.id
                    )
                    observeStoryCommentOutcome(cmid: cmid,
                                               tempId: tempCommentId,
                                               parentId: parentId)
                } catch {
                    // L'outbox elle-même a refusé la ligne : là, il n'y a plus
                    // de recours, on annule l'insert optimiste.
                    rollbackOptimisticComment(id: tempCommentId, parentId: parentId)
                    HapticFeedback.error()
                }
            }
        }

        // Dismiss composer and give feedback
        DispatchQueue.main.async {
            HapticFeedback.success()
            self.dismissComposer()
            self.storyDrafts.removeValue(forKey: story.id)
        }
    }

    /// Pure core of the rollback — no `@State` access, so it's unit-testable
    /// without a live view (mirrors the "extract the pure decision" pattern
    /// used elsewhere in the codebase). Removes the failed `temp_` comment
    /// (top-level) or reply (routes back out of the parent's reply count +
    /// the replies map) and decrements the shared counter exactly once,
    /// symmetrically with how `sendComment` incremented it.
    static func rollingBackOptimisticComment(
        id: String,
        parentId: String?,
        comments: [FeedComment],
        repliesMap: [String: [FeedComment]],
        commentCount: Int
    ) -> (comments: [FeedComment], repliesMap: [String: [FeedComment]], commentCount: Int) {
        var comments = comments
        var repliesMap = repliesMap
        if let parentId {
            if var replies = repliesMap[parentId] {
                replies.removeAll { $0.id == id }
                repliesMap[parentId] = replies
            }
            if let idx = comments.firstIndex(where: { $0.id == parentId }) {
                comments[idx].replies = max(0, comments[idx].replies - 1)
            }
        } else {
            comments.removeAll { $0.id == id }
        }
        return (comments, repliesMap, max(0, commentCount - 1))
    }

    private func rollbackOptimisticComment(id: String, parentId: String?) {
        let result = Self.rollingBackOptimisticComment(
            id: id, parentId: parentId,
            comments: storyComments, repliesMap: storyCommentRepliesMap, commentCount: storyCommentCount
        )
        storyComments = result.comments
        storyCommentRepliesMap = result.repliesMap
        storyCommentCount = result.commentCount
    }

    /// `priorReactions`/`priorCount` is the snapshot `triggerStoryReaction` took
    /// BEFORE its optimistic emoji append / counter bump — the sole rollback
    /// target. `StoryInteractionService.react` now throws (most notably the
    /// gateway's 409 REACTION_LIMIT_REACHED conflict), so a rejected reaction
    /// restores the exact prior state instead of leaving a phantom emoji and
    /// an inflated counter forever.
    ///
    /// `interactionService` is injectable (defaults to the real service) so
    /// `StoryViewerReactionRollbackTests` can exercise this exact method —
    /// including the swipe-away guard below — against a `MockAPIClientForApp`
    /// instead of re-implementing the snapshot/rollback logic as local
    /// variables in a test that never calls production code.
    ///
    /// Une PANNE DE TRANSPORT ne rembobine plus : la réaction part dans la file
    /// durable, comme le commentaire de story juste au-dessus, et l'optimisme
    /// affiché reste vrai jusqu'au rejeu. Pas de `kind` dédié — le gateway sert
    /// la réaction de story sur `POST /posts/:id/like`, journalisée
    /// `toggleLikePost` comme un like de post, à l'emoji près. Le tri
    /// transport / refus est `StoryReactionRecovery.decide(for:)` ; le rollback
    /// reste réservé au refus du serveur et à une file qui refuse la ligne.
    ///
    /// `offlineQueue` est injectable pour la même raison que le service ; la
    /// tâche est rendue pour qu'un témoin l'attende au lieu de dormir.
    @discardableResult
    func sendReaction(
        emoji: String,
        priorReactions: [String],
        priorCount: Int,
        interactionService: StoryInteractionService = StoryInteractionService(),
        offlineQueue: OfflineQueueing = OfflineQueue.shared
    ) -> Task<Void, Never> {
        guard let story = currentStory else { return Task {} }
        EngagementTracker.shared.recordAction(.reacted, surface: .storyViewer)

        return Task {
            do {
                try await interactionService.react(storyId: story.id, emoji: emoji)
            } catch {
                guard StoryReactionRecovery.decide(for: error) == .queueForReplay else {
                    rollBackReaction(originatingStoryId: story.id,
                                     priorReactions: priorReactions,
                                     priorCount: priorCount)
                    return
                }
                do {
                    try await offlineQueue.enqueue(
                        .toggleLikePost,
                        payload: ToggleLikePostPayload(
                            clientMutationId: ClientMutationId.generate(),
                            postId: story.id,
                            liked: true,
                            emoji: emoji
                        ),
                        conversationId: story.id
                    )
                } catch {
                    rollBackReaction(originatingStoryId: story.id,
                                     priorReactions: priorReactions,
                                     priorCount: priorCount)
                }
            }
        }
    }

    private func rollBackReaction(originatingStoryId: String, priorReactions: [String], priorCount: Int) {
        guard let target = Self.reactionRollbackTarget(
            currentStoryId: currentStory?.id,
            originatingStoryId: originatingStoryId,
            priorReactions: priorReactions,
            priorCount: priorCount
        ) else { return }
        storyCurrentUserReactions = target.reactions
        storyReactionCount = target.count
        HapticFeedback.error()
    }

    /// Pure rollback decision for a rejected reaction — extracted so the
    /// swipe-away guard is directly unit-testable
    /// (`StoryViewerReactionRollbackTests`) without constructing a live view.
    /// Returns `nil` when the viewer has moved to a different story since the
    /// reaction was sent — those `@State` fields already belong to that other
    /// story now and must not be touched.
    nonisolated static func reactionRollbackTarget(
        currentStoryId: String?,
        originatingStoryId: String,
        priorReactions: [String],
        priorCount: Int
    ) -> (reactions: [String], count: Int)? {
        guard currentStoryId == originatingStoryId else { return nil }
        return (priorReactions, priorCount)
    }

    // Le compte à rebours d'expiration a quitté le header du reader (directive
    // user 2026-07-30) : il n'existe plus de surface qui l'affiche, donc plus
    // de formateur. `story.expiresAt` reste la source de vérité côté logique
    // (`isExpired(at:)` pilote la sélection de slide et le bandeau « Story
    // expirée ») — c'est seulement la relecture permanente du chrono qui part.

    // MARK: - Delete Story

    func deleteCurrentStory() {
        guard let story = currentStory else { return }
        HapticFeedback.light()
        
        Task {
            let success = await viewModel.deleteStory(storyId: story.id)
            DispatchQueue.main.async {
                if success {
                    HapticFeedback.success()
                    dismissViewer()
                } else {
                    HapticFeedback.error()
                }
            }
        }
    }

    // MARK: - Mark Viewed

    /// - Parameter isIntroVisible: surcharge de `showGroupIntro`. Les `@State`
    ///   d'une `View` hors graphe SwiftUI ne retiennent pas les écritures d'un
    ///   test ; sans cette entrée la garde n'est pas vérifiable. Production :
    ///   `nil`, sauf `dismissGroupIntro` qui passe `false` — à cet instant
    ///   l'interlude vient d'être retiré et la story est révélée.
    /// Annule l'insert optimiste si l'outbox finit par abandonner ce
    /// commentaire (le serveur le refuse durablement). Sans ça, une ligne
    /// `temp_` resterait à l'écran pour toujours : l'écho `comment:added`
    /// qu'elle attend n'arrivera jamais pour une mutation abandonnée.
    /// Miroir de `FeedCommentsSheet.observeCreateCommentOutcome`.
    private func observeStoryCommentOutcome(cmid: String, tempId: String, parentId: String?) {
        Task { @MainActor in
            let stream = await OfflineQueue.shared.outcomeStream(for: cmid)
            for await event in stream {
                if case .exhausted = event {
                    rollbackOptimisticComment(id: tempId, parentId: parentId)
                    FeedbackToastManager.shared.showError(
                        // Clé du feed réutilisée : message identique, et le
                        // catalogue est verrouillé à 100 % de couverture — une
                        // clé jumelle serait sept traductions redondantes.
                        String(localized: "feed.comments.send_error",
                               defaultValue: "Erreur lors de l'envoi du commentaire",
                               bundle: .main)
                    )
                }
            }
        }
    }

    func markCurrentViewed(isIntroVisible: Bool? = nil) {
        // L'interlude d'identité est OPAQUE et occupe tout l'écran : tant qu'il
        // est affiché, la story n'a rien montré. Marquer ici gonflait le
        // compteur de vues de l'auteur et faisait passer l'anneau en « vu »
        // alors que le lecteur n'avait vu qu'un écran d'identité. Le marquage
        // suit la RÉVÉLATION (`dismissGroupIntro`), pas l'indexation.
        guard !(isIntroVisible ?? showGroupIntro) else { return }
        if let story = currentStory {
            viewModel.markViewed(storyId: story.id)
            // C3 : ce slide vient d'être affiché → 1 impression (source "story") pour CE
            // post-slide, en plus de la vue unique. Chaque changement de slide en émet une.
            viewModel.recordStoryImpression(storyId: story.id)
            // Contenu consommé → ses notifications ne doivent plus être non lues,
            // ET toute notification qui arrive PENDANT la lecture naît consommée
            // (`activePostId`). Idempotent : le manager ignore une story déjà
            // déclarée active et coalesce les appels serveur.
            NotificationToastManager.shared.onPostOpened(story.id)
        }
    }

    // MARK: - Prefetch

    /// Précharge tous les médias d'une story : legacy media, mediaObjects, audioPlayerObjects, backgroundAudio.
    /// Retourne un Task awaitable pour permettre de bloquer sur le chargement si nécessaire.
    @discardableResult
    private func prefetchAllMedia(for story: StoryItem) -> Task<Void, Never> {
        var urls: [String] = []

        urls.append(contentsOf: story.media.compactMap(\.url))

        if let mediaObjs = story.storyEffects?.mediaObjects {
            for obj in mediaObjs {
                if let urlStr = story.media.first(where: { $0.id == obj.postMediaId })?.url {
                    urls.append(urlStr)
                }
            }
        }

        if let audioObjs = story.storyEffects?.audioPlayerObjects {
            for obj in audioObjs {
                if let urlStr = story.media.first(where: { $0.id == obj.postMediaId })?.url {
                    urls.append(urlStr)
                }
            }
        }

        if let bgAudioId = story.storyEffects?.backgroundAudioId {
            if let urlStr = story.media.first(where: { $0.id == bgAudioId })?.url {
                urls.append(urlStr)
            }
        }

        let uniqueURLs = Array(Set(urls))
        let task = Task {
            let imageStore = await CacheCoordinator.shared.images
            for urlString in uniqueURLs {
                // Annulé par l'onDisappear du viewer : sans ce check, les
                // téléchargements + prerolls AVPlayer continuaient après la
                // fermeture (borné par le cache FIFO de 6 players, mais
                // réseau/CPU gaspillés pour un viewer mort).
                guard !Task.isCancelled else { return }
                let mediaType = story.media.first(where: { $0.url == urlString })?.type
                if mediaType == .video {
                    // Le canvas relit la vidéo via `CacheCoordinator.shared.video`
                    // (`videoLocalFileURL(for:)`). Le prefetch DOIT peupler CE
                    // store — pas `images` — sinon le canvas tombe en cache-miss
                    // et re-télécharge ce qui vient d'être préchargé.
                    _ = try? await CacheCoordinator.shared.video.data(for: urlString)
                    if let url = URL(string: urlString) {
                        await StoryMediaLoader.shared.preloadAndCachePlayer(url: url)
                    }
                } else if mediaType == .audio {
                    // Idem : le lecteur audio relit via le store `audio`.
                    _ = try? await CacheCoordinator.shared.audio.data(for: urlString)
                } else {
                    // Image: use image(for:) to populate UIImage NSCache for instant display
                    _ = await imageStore.image(for: urlString)
                }
            }
            guard !Task.isCancelled else { return }
            // Pre-probe foreground video audio tracks so `storyHasAudibleSound`
            // resolves to its final value before the slide is rendered —
            // without this, the sound button « apparait après quelques 100 ms »
            // when the story carries a video with audio (user bug 2026-05-28
            // « le calcul pour savoir si on affiche le bouton son doit se
            // faire avant qu'on affiche la story »). The probe lives in
            // `StoryViewerView.swift` so it can touch the private @State /
            // private resolveVideoURL helpers directly.
            await self.preProbeVideoAudio(for: story)
        }
        prefetchTasks.append(task)
        return task
    }

    /// Précharge la story à l'index donné dans le groupe actuel.
    @discardableResult
    func prefetchStory(at index: Int) -> Task<Void, Never>? {
        guard currentGroupIndex < groups.count else { return nil }
        let stories = groups[currentGroupIndex].stories
        guard index >= 0, index < stories.count else { return nil }
        return prefetchAllMedia(for: stories[index])
    }

    /// Précharge toutes les stories du groupe actuel, puis la fenêtre d'ENTRÉE
    /// des deux groupes suivants (directive user 2026-08-20 : « précharger les
    /// groupes suivants » — une story déjà locale s'ouvre instantanément).
    /// La fenêtre part de `entryIndex(of:)` — la slide sur laquelle un switch
    /// forward atterrit réellement (première non-vue non-expirée) — et non des
    /// 2 premières slides du groupe, souvent déjà vues donc jamais rejouées.
    func prefetchCurrentGroup() {
        guard currentGroupIndex >= 0, currentGroupIndex < groups.count else { return }

        groups[currentGroupIndex].stories.forEach { prefetchAllMedia(for: $0) }

        for nextGroupIdx in (currentGroupIndex + 1)...(currentGroupIndex + 2)
        where nextGroupIdx < groups.count {
            let nextGroup = groups[nextGroupIdx]
            nextGroup.stories
                .dropFirst(entryIndex(of: nextGroup))
                .prefix(2)
                .forEach { prefetchAllMedia(for: $0) }
        }
    }
}

// MARK: - Story Viewers Sheet

struct StoryViewerItem: Identifiable {
    let id: String
    let username: String
    let displayName: String
    let avatarUrl: String?
    let viewedAt: Date
    let reactionEmoji: String?
    let replyContent: String?
    let hasReshared: Bool
}

struct StoryViewersSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var colorScheme
    let story: StoryItem
    let accentColor: Color
    /// Mood resolution (local-first). Passed explicitly rather than via
    /// `@EnvironmentObject` so it survives the sheet boundary.
    @ObservedObject var statusViewModel: StatusViewModel
    /// Opens the tapped viewer's profile. Owned by the presenter
    /// (`StoryViewerView` holds the `Router`) so the sheet never reaches a
    /// `Router` `@EnvironmentObject` across its boundary.
    let onOpenProfile: (StoryViewerItem) -> Void

    private var isDark: Bool { colorScheme == .dark }

    @State private var viewers: [StoryViewerItem] = []
    @State private var isLoading = true
    // Coalescing anti-course pour le re-fetch temps réel : une rafale de
    // `story:viewed` ne doit pas lancer N fetches `/interactions` concurrents
    // (ils peuvent se terminer dans le désordre → liste momentanément périmée).
    // `isRefreshing` = un seul fetch en vol ; `refreshQueued` = un événement est
    // arrivé pendant le fetch → on relance EXACTEMENT une fois à la fin.
    @State private var isRefreshing = false
    @State private var refreshQueued = false

    var body: some View {
        NavigationStack {
            ZStack {
                isDark ? Color.black.ignoresSafeArea() : Color(UIColor.systemGroupedBackground).ignoresSafeArea()

                if isLoading {
                    ProgressView("Chargement des vues...")
                        .tint(accentColor)
                } else if viewers.isEmpty {
                    EmptyStateView(
                        icon: "eye.slash",
                        title: "Aucune vue pour le moment",
                        subtitle: "Les personnes qui regardent votre story apparaîtront ici."
                    )
                } else {
                    List {
                        // C4 + C1 : en-tête = viewCount AUTORITATIF (dénormalisé, la même
                        // valeur que le bouton « Vues » ; élimine le « bouton dit 3 / sheet
                        // dit 2 » où la sheet montrait la longueur de /interactions) + les
                        // impressions (author-only), pour la parité avec le détail/réel.
                        // Nouvelle clé de localisation (pas de traduction existante à casser).
                        Section(header: Text(String(localized: "story.viewer.viewsAndImpressions", defaultValue: "\(story.viewCount ?? viewers.count) Vues · \(story.impressionCount ?? 0) impressions", bundle: .main))
                            .font(.headline)
                            .foregroundColor(.primary)
                            .textCase(nil)
                        ) {
                            ForEach(viewers) { viewer in
                                viewerRow(viewer)
                            }
                        }
                    }
                    .listStyle(.insetGrouped)
                    .scrollContentBackground(.hidden)
                }
            }
            .navigationTitle(String(localized: "story.viewer.views.title", defaultValue: "Vues", bundle: .main))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(String(localized: "common.close", defaultValue: "Fermer", bundle: .main)) {
                        dismiss()
                    }
                    .font(MeeshyFont.relative(16, weight: .bold))
                    .foregroundColor(accentColor)
                }
            }
            .task {
                await loadViewers()
            }
            // Temps réel : chaque `story:viewed` de CETTE story (émis par le
            // gateway vers la feed room de l'auteur) re-fetch la liste enrichie
            // via `/posts/:id/interactions`. Sans ça, la feuille chargeait une
            // seule fois (`.task`) et un nouveau viewer n'apparaissait jamais tant
            // qu'elle restait ouverte — le cœur du « la remontée des vues ne se
            // fait pas en temps réel ». Le re-fetch est silencieux (pas de spinner :
            // `loadViewers` ne repasse pas `isLoading` à true).
            .onReceive(SocialSocketManager.shared.storyViewed) { viewedData in
                guard viewedData.storyId == story.id else { return }
                Task { await loadViewers() }
            }
        }
    }

    private func viewerRow(_ viewer: StoryViewerItem) -> some View {
        HStack(spacing: 12) {
            // Local-first mood (StatusViewModel) + presence (PresenceManager
            // live store). `onViewProfile` + row tap open the viewer's profile.
            MeeshyAvatar(
                name: viewer.displayName,
                context: .storyViewerRow,
                avatarURL: viewer.avatarUrl,
                moodEmoji: statusViewModel.statusForUser(userId: viewer.id)?.moodEmoji,
                presenceState: PresenceManager.shared.resolvedState(userId: viewer.id, isOnline: nil),
                onViewProfile: { onOpenProfile(viewer) },
                onMoodTap: statusViewModel.moodTapHandler(for: viewer.id)
            )

            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(viewer.displayName)
                        .font(MeeshyFont.relative(16, weight: .semibold))
                        .foregroundColor(.primary)

                    if viewer.hasReshared {
                        Image(systemName: "arrow.2.squarepath")
                            .font(MeeshyFont.relative(12, weight: .bold))
                            .foregroundColor(accentColor)
                    }

                    Spacer()

                    Text(viewer.viewedAt, style: .time)
                        .font(MeeshyFont.relative(12))
                        .foregroundColor(.secondary)
                }

                if let reply = viewer.replyContent {
                    HStack(spacing: 6) {
                        Image(systemName: "arrowshape.turn.up.left.fill")
                            .font(MeeshyFont.relative(10))
                        Text(reply)
                            .font(MeeshyFont.relative(14))
                            .lineLimit(1)
                    }
                    .foregroundColor(.secondary)
                } else if let reaction = viewer.reactionEmoji {
                    HStack(spacing: 6) {
                        Image(systemName: "heart.fill")
                            .font(MeeshyFont.relative(10))
                            .foregroundColor(MeeshyColors.error)
                        Text(reaction)
                            .font(MeeshyFont.relative(14))
                    }
                }
            }
        }
        .padding(.vertical, 4)
        .contentShape(Rectangle())
        .onTapGesture { onOpenProfile(viewer) }
        .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
        .listRowBackground(isDark ? Color(UIColor.secondarySystemGroupedBackground) : Color.white)
    }

    private func loadViewers() async {
        // Un seul fetch en vol : si un autre tourne déjà, on note qu'un refresh
        // est dû (`refreshQueued`) et on sort — le fetch courant le rejouera.
        let shouldStart = await MainActor.run { () -> Bool in
            if isRefreshing { refreshQueued = true; return false }
            isRefreshing = true
            return true
        }
        guard shouldStart else { return }

        // Boucle jusqu'à ce qu'aucun événement n'ait été mis en file pendant le
        // dernier fetch — au plus un refresh de rattrapage, jamais N concurrents.
        repeat {
            await MainActor.run { refreshQueued = false }
            // M1 follow-up: the wire-shape decoding + nullable-field
            // defaulting now lives in StoryInteractionService.loadViewers.
            // A nil result here means "couldn't load" (logged at fault level
            // in the service) — we leave the previous list alone, matching
            // the prior swallow-and-show-empty behaviour.
            let snapshots = await StoryInteractionService().loadViewers(storyId: story.id)
            await MainActor.run {
                if let snapshots {
                    self.viewers = snapshots.map { s in
                        StoryViewerItem(
                            id: s.id,
                            username: s.username,
                            displayName: s.displayName,
                            avatarUrl: s.avatarUrl,
                            viewedAt: s.viewedAt,
                            reactionEmoji: s.reactionEmoji,
                            replyContent: nil,
                            hasReshared: false
                        )
                    }
                }
                self.isLoading = false
            }
        } while await MainActor.run(body: { refreshQueued })

        await MainActor.run { isRefreshing = false }
    }
}

// MARK: - Story Comments Overlay (live-chat style with replies)

/// Full-featured comment overlay: occupies bottom half of screen with
/// infinite scroll, reply threading (simple indentation), inline
/// UniversalComposerBar, and timer pause. All other controls except
/// the composer are hidden.
///
/// Extracted from `StoryViewerView.storyCommentsOverlay` (formerly an
/// `AnyView`) so the deeply-nested comment panel becomes its own
/// type-metadata unit instead of inflating the viewer's opaque type.
/// Listing threadé d'UN commentaire racine d'une story : la ligne racine, l'aperçu
/// auto des 2 premières réponses, le bouton « Voir N autres réponses » / « Masquer »,
/// et les réponses dépliées. Composant réutilisable extrait de `StoryCommentsOverlayView`
/// (le rendu est préservé à l'identique) — paramétré par un builder de ligne opaque
/// (`makeRow`) pour rester agnostique du style de la ligne.
struct StoryCommentThread: View {
    let comment: FeedComment
    let replies: [FeedComment]
    let isExpanded: Bool
    let isLoadingReplies: Bool
    let userLang: String
    let makeRow: (FeedComment, String) -> StoryCommentRowView
    let onToggleThread: () -> Void
    /// Vrai quand le serveur a d'autres pages de réponses au-delà de celles
    /// chargées (endpoint replies paginé à 20) — affiche « Voir plus de
    /// réponses » en bas du fil déplié.
    var hasMoreReplies: Bool = false
    var onLoadMoreReplies: (() async -> Void)? = nil

    var body: some View {
        makeRow(comment, userLang)
            .id(comment.id)

        let autoPreview = Array(replies.prefix(2))
        if !autoPreview.isEmpty && !isExpanded {
            ForEach(autoPreview) { reply in
                makeRow(reply, userLang)
                    .padding(.leading, 32)
                    .id(reply.id)
            }
        }

        if comment.replies > 2 {
            Button {
                HapticFeedback.light()
                onToggleThread()
            } label: {
                HStack(spacing: 4) {
                    Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                        .font(MeeshyFont.relative(9, weight: .bold))
                    let remaining = max(0, comment.replies - 2)
                    Text(isExpanded
                         ? "Masquer"
                         : "Voir \(remaining) autre\(remaining > 1 ? "s" : "") r\u{00E9}ponse\(remaining > 1 ? "s" : "")")
                        .font(MeeshyFont.relative(11, weight: .semibold))
                }
                .foregroundColor(StoryCommentRowView.legibleAuthorColor(hex: comment.authorColor))
                .padding(.leading, 40)
                .padding(.vertical, 4)
                .storyOverlayLegible()
            }
        }

        if isExpanded {
            if isLoadingReplies && replies.isEmpty {
                HStack {
                    Spacer()
                    ProgressView().tint(.white.opacity(0.5)).scaleEffect(0.7)
                    Spacer()
                }
                .padding(.leading, 32)
                .padding(.vertical, 4)
            }

            ForEach(replies) { reply in
                makeRow(reply, userLang)
                    .padding(.leading, 32)
                    .id(reply.id)
            }

            if hasMoreReplies, let onLoadMoreReplies {
                Button {
                    HapticFeedback.light()
                    Task { await onLoadMoreReplies() }
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "chevron.down")
                            .font(MeeshyFont.relative(9, weight: .bold))
                        Text(String(localized: "story.viewer.comments.loadMoreReplies", defaultValue: "Voir plus de réponses", bundle: .main))
                            .font(MeeshyFont.relative(11, weight: .semibold))
                    }
                    .foregroundColor(StoryCommentRowView.legibleAuthorColor(hex: comment.authorColor))
                    .padding(.leading, 40)
                    .padding(.vertical, 4)
                    .storyOverlayLegible()
                }
                .accessibilityLabel(String(localized: "a11y.story.comments.loadMoreReplies", defaultValue: "Charger plus de réponses", bundle: .main))
            }
        }
    }
}

struct StoryCommentsOverlayView: View {
    let storyComments: [FeedComment]
    let storyCommentCount: Int
    let storyCommentRepliesMap: [String: [FeedComment]]
    let storyCommentExpandedThreads: Set<String>
    let storyCommentLoadingReplies: Set<String>
    /// Pagination des réponses par fil (endpoint replies paginé à 20) — pilote
    /// le bouton « Voir plus de réponses » de chaque `StoryCommentThread`.
    var storyCommentRepliesHasMore: [String: Bool] = [:]
    let isLoadingComments: Bool
    let userLang: String
    /// Vrai quand la story consultée est expirée. Affiche une bannière au-dessus
    /// de la liste pour que les commentaires/réactions restent visibles tout en
    /// indiquant que la story n'est plus accessible (spec 2026-06-23).
    var isStoryExpired: Bool = false

    /// Commentaire ciblé par une notification : premier scroll de la liste
    /// dirigé sur lui (repli : parent de thread) au lieu du dernier commentaire.
    var targetCommentId: String? = nil
    var targetParentCommentId: String? = nil
    /// Chasse paginée fournie par le parent quand la cible n'est pas dans les
    /// pages chargées (les pages qui arrivent re-déclenchent le scroll via
    /// l'onChange sur le count).
    var huntTargetComment: (() async -> Void)? = nil
    /// Page suivante des réponses d'un fil (commentId) — câblé sur
    /// `loadMoreStoryCommentReplies` côté StoryViewerView.
    var loadMoreStoryCommentReplies: ((String) async -> Void)? = nil
    /// Ciblage d'une RÉPONSE : déplie le fil du parent (parentId) puis chasse
    /// les pages de réponses jusqu'à la cible (replyId). Retourne `true` si la
    /// réponse est chargée à l'issue de la chasse.
    var revealTargetReply: ((_ parentId: String, _ replyId: String) async -> Bool)? = nil
    /// Latch — un seul ciblage par montage de l'overlay, ensuite la liste
    /// reprend le comportement historique (suivre le dernier commentaire).
    @State private var hasScrolledToTargetStoryComment = false
    @State private var hasRequestedTargetHunt = false

    @Binding var showCommentsOverlay: Bool
    /// Réservation visuelle. Quand non-nil, le composer principal (un
    /// `StoryComposerBarView` rendu dans la canvas « Bottom area ») affiche
    /// sa reply banner. L'overlay s'en sert seulement pour étirer sa
    /// `composerSpaceReservation` afin que la liste ne passe pas sous la
    /// banner.
    @Binding var replyingToStoryComment: FeedComment?

    /// Drives the dynamic max-height of the comment list — with keyboard the
    /// list expands toward the top, without it the list caps at ~50 % of the
    /// screen so the underlying story stays manipulable above the list.
    @ObservedObject var keyboard: KeyboardObserver

    /// Vrai safe area bas lu sur la keyWindow par le parent
    /// (`StoryViewerView.windowBottomInset`). Necessaire parce que cet
    /// overlay est rendu dans le ZStack canvas qui herite du
    /// `.ignoresSafeArea()` root — `geometry.safeAreaInsets.bottom` y vaut 0.
    /// Sans cette valeur, `composerSpaceReservation` retombait sur une
    /// constante hardcodee (54pt pour iPhone Pro) qui derivait sur iPhone
    /// SE / iPad / pliables (bug 2026-05-28 : « le commentaire sort du
    /// viewport EXACTEMENT comme la zone de composition »).
    let safeBottom: CGFloat

    let makeStoryCommentRow: (FeedComment, String) -> StoryCommentRowView
    let toggleStoryCommentThread: (String) async -> Void

    private var topLevelComments: [FeedComment] {
        storyComments.filter { $0.parentId == nil }
    }

    /// Instagram-style top fade — older comments dissolve toward the middle
    /// of the screen as the user scrolls up. Bottom stays solid so the row
    /// touching the composer is fully legible.
    private var listFadeMask: LinearGradient {
        LinearGradient(
            stops: [
                .init(color: .clear, location: 0.0),
                .init(color: .black.opacity(0.4), location: 0.12),
                .init(color: .black, location: 0.30),
                .init(color: .black, location: 1.0)
            ],
            startPoint: .top,
            endPoint: .bottom
        )
    }

    /// Cap the comment list to ~half the screen when the keyboard is hidden
    /// so the rest of the story (head, mid-frame) stays visible and tappable.
    /// When the keyboard rises the list can grow into the space the keyboard
    /// uncovered.
    private var listMaxHeight: CGFloat {
        // `DeviceLayout.windowSize`, pas `UIScreen.main.bounds` : en Split View
        // la fraction était prise sur le DISPLAY, donc plus haute que la fenêtre
        // entière — le plafond ne plafonnait plus rien et la liste recouvrait la
        // story qu'elle est censée laisser visible.
        let window = DeviceLayout.windowSize.height
        return keyboard.isVisible ? window * 0.62 : window * 0.42
    }

    /// Instagram-style overlay: comments float above the composer with a top
    /// fade, the story behind stays visible AND interactable (no opaque
    /// background catching taps). Composer alone wears a subtle glass strip so
    /// the input is legible against any background.
    ///
    /// No global scrim behind the list — each individual `StoryCommentRowView`
    /// carries its own dark bubble for legibility (user spec 2026-05-28:
    /// « enlève le fond dégradé noir sur le composant de listing »). The
    /// `listFadeMask` keeps fading rows out at the top so older comments
    /// dissolve into the story above as the user scrolls up.
    /// Bannière « story expirée » : les commentaires/réactions restent
    /// consultables, mais on signale que la story n'est plus accessible.
    private var expiredStoryBanner: some View {
        Label {
            Text(String(localized: "story.viewer.expiredBanner", defaultValue: "Story expirée — les commentaires restent visibles", bundle: .main))
                .font(MeeshyFont.relative(11, weight: .semibold))
                .lineLimit(1)
        } icon: {
            Image(systemName: "clock.badge.xmark")
                .font(MeeshyFont.relative(11, weight: .semibold))
        }
        .foregroundColor(.white.opacity(0.85))
        .padding(.horizontal, 12)
        .padding(.vertical, 7)
        .background(Capsule().fill(MeeshyColors.error.opacity(0.32)))
        .padding(.bottom, 6)
        .transition(.opacity)
    }

    var body: some View {
        VStack(spacing: 0) {
            Spacer(minLength: 0)
            if isStoryExpired {
                expiredStoryBanner
            }
            commentsList
                // Les médias de TOUS les commentaires de la story (racines +
                // réponses dépliées) se feuillettent ensemble en plein écran.
                .commentMediaGallery(
                    topLevel: topLevelComments, replies: storyCommentRepliesMap
                )
                .frame(maxHeight: listMaxHeight)
                // Bord supérieur RÉEL de la zone défilante, remonté au viewer :
                // c'est lui qui sépare « geste né dans la liste » (au scroll) de
                // « geste né dans la story encore visible au-dessus » (au drag
                // parent, qui referme alors l'overlay). Publié ICI, sur le
                // conteneur PARENT du `ScrollView` — le mettre à l'intérieur du
                // contenu défilant asservirait la clé au scroll, et sous iOS 18+
                // `onPreferenceChange` ne re-tirerait plus.
                //
                // Mesuré AVANT le `.mask` : le dégradé de fondu efface les
                // premières rows à l'œil mais la zone reste défilante, donc
                // interdite au drag parent. Et avant le `.padding(.bottom:)`, qui
                // ne déplace pas ce bord.
                .background(
                    GeometryReader { proxy in
                        Color.clear.preference(
                            key: StoryReaderScrollableSurfaceTopKey.self,
                            value: proxy.frame(in: .global).minY
                        )
                    }
                )
                .mask(listFadeMask)
                // Réserve l'espace occupé par le composer principal rendu
                // dans la canvas « Bottom area » (cf. `StoryComposerBarView`
                // à canvas line ~1078). Sans cette réservation, les derniers
                // commentaires de la liste passeraient SOUS le composer
                // (bug user 2026-05-28 « deuxième instance de composer
                // apparaît et fait disparaître l'autre »). On unifie sur
                // UN SEUL composer (le principal) et on laisse la liste
                // s'arrêter juste au-dessus.
                .padding(.bottom, composerSpaceReservation)
        }
        // **CRITIQUE** : forcer la VStack à remplir toute la hauteur du
        // canvas. Sans `.frame(maxHeight: .infinity)`, le `Spacer(minLength:
        // 0)` collapse à 0pt et la liste se positionne au TOP de la VStack
        // intrinsèque (~150-200pt) qui se centre dans le canvas ZStack →
        // les commentaires apparaissent dans le tiers supérieur de l'écran
        // au lieu de juste au-dessus du composer (bug user 2026-05-28
        // « la zone de commentaire est coupé »). Auparavant `composerStrip`
        // avec son `Rectangle.ignoresSafeArea(.bottom)` étirait
        // implicitement la VStack ; maintenant il faut le déclarer.
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
        .animation(.easeInOut(duration: 0.25), value: keyboard.isVisible)
        .animation(.easeInOut(duration: 0.2), value: replyingToStoryComment?.id)
    }

    /// Hauteur réservée pour le composer principal (StoryComposerBarView)
    /// + son safe area / sa montée clavier. La liste s'arrête au MILIEU du
    /// composer (et non au-dessus) pour que les nouveaux commentaires
    /// paraissent « émerger » de la zone de composition au scroll — le
    /// composer recouvre visuellement la moitié inférieure de la liste,
    /// et la masque-gradient `listFadeMask` cache déjà les rows arrivant
    /// par le haut. User spec 2026-05-28 : « le composant pour remonter
    /// les commentaires doit débuter en milieu de la zone de composition
    /// […] on verra les commentaires sortir de cette zone ».
    /// - clavier visible : `keyboard.height` + composer ~ 92pt (sans banner)
    ///   ou ~140pt (avec reply banner)
    /// - clavier caché : safe area ~34pt + 20pt breathing room + composer/2.
    private var composerSpaceReservation: CGFloat {
        let composerHeight: CGFloat = replyingToStoryComment != nil ? 142 : 92
        // Mirror `composerBottomPadding(geometry:)` cote canvas : safe area
        // reel + 20pt breathing room quand clavier cache, sinon hauteur clavier.
        // `safeBottom` arrive du parent via `windowBottomInset` (keyWindow),
        // pas via `geometry.safeAreaInsets.bottom` qui vaut 0 sous
        // `.ignoresSafeArea()` (bug 2026-05-28).
        let bottomPadding: CGFloat = keyboard.isVisible
            ? keyboard.height
            : safeBottom + 20
        // Half-composer overlap — list ends at composer.middle, the lower
        // half is the « emerge » zone where new rows transition into view.
        return composerHeight / 2 + bottomPadding
    }

    // MARK: - Comments List

    private var commentsList: some View {
        ScrollViewReader { proxy in
            ScrollView(.vertical, showsIndicators: false) {
                LazyVStack(alignment: .leading, spacing: 8) {
                    ForEach(Array(topLevelComments.enumerated()), id: \.element.id) { idx, comment in
                        // Separator between top-level comments — `Divider()`
                        // SwiftUI natif (1pt, white opacity ~15%) au lieu de la
                        // RoundedRectangle box autour de chaque row (user spec
                        // 2026-05-28 : « alignés et séparés par des ---- »).
                        if idx > 0 {
                            Divider()
                                .overlay(Color.white.opacity(0.28))
                                .shadow(color: .black.opacity(0.3), radius: 1)
                                .padding(.vertical, 4)
                        }

                        StoryCommentThread(
                            comment: comment,
                            replies: storyCommentRepliesMap[comment.id] ?? [],
                            isExpanded: storyCommentExpandedThreads.contains(comment.id),
                            isLoadingReplies: storyCommentLoadingReplies.contains(comment.id),
                            userLang: userLang,
                            makeRow: makeStoryCommentRow,
                            onToggleThread: { Task { await toggleStoryCommentThread(comment.id) } },
                            hasMoreReplies: storyCommentExpandedThreads.contains(comment.id)
                                && (storyCommentRepliesHasMore[comment.id] ?? false),
                            onLoadMoreReplies: loadMoreStoryCommentReplies.map { load -> (() async -> Void) in
                                { await load(comment.id) }
                            }
                        )
                    }

                    if isLoadingComments {
                        HStack {
                            Spacer()
                            ProgressView().tint(.white.opacity(0.6))
                            Spacer()
                        }
                        .padding(.vertical, 8)
                    }

                    if topLevelComments.isEmpty && !isLoadingComments {
                        emptyPlaceholder
                    }
                }
                // **Aligned with composer's 28pt outer padding** (cf.
                // canvas line 1108). Le commentaire-row visuel commence
                // exactement au même `leading` que la rangée de saisie du
                // composer → plus de désalignement entre la liste
                // commentaires et la zone Commenter / reply banner (bug
                // user 2026-05-28). Trailing 80pt préserve le dégagement
                // sidebar (Layer 8 ~56+6=62pt depuis le bord droit).
                .padding(.leading, 28)
                .padding(.trailing, 80)
                .padding(.top, 24)
                .padding(.bottom, 12)
            }
            .adaptiveOnChange(of: storyComments.count) { _, _ in
                // Notification → RÉPONSE précise : le parent est chargé
                // (top-level) mais la cible n'y est pas — c'est une réponse.
                // Déplier le fil du parent + chasser ses pages de réponses via
                // la closure du parent, puis scroller sur la rangée de la
                // réponse elle-même (les ancres `.id(reply.id)` existent déjà).
                // Repli : scroll sur le parent si la chasse échoue.
                if !hasScrolledToTargetStoryComment,
                   let target = targetCommentId,
                   let parentId = targetParentCommentId, parentId != target,
                   topLevelComments.contains(where: { $0.id == parentId }),
                   !topLevelComments.contains(where: { $0.id == target }),
                   let reveal = revealTargetReply {
                    hasScrolledToTargetStoryComment = true
                    Task {
                        let found = await reveal(parentId, target)
                        withAnimation(.easeOut(duration: 0.3)) {
                            proxy.scrollTo(found ? target : parentId, anchor: .center)
                        }
                    }
                    return
                }
                // Notification → commentaire précis : au premier chargement où
                // la cible (ou son parent de thread) est présente, scroller
                // dessus au lieu du dernier commentaire. Une seule fois par
                // présentation ; ensuite comportement historique (suivre le
                // dernier commentaire).
                if !hasScrolledToTargetStoryComment,
                   let anchorId = [targetCommentId, targetParentCommentId]
                       .compactMap({ $0 })
                       .first(where: { id in storyComments.contains { $0.id == id } }) {
                    hasScrolledToTargetStoryComment = true
                    withAnimation(.easeOut(duration: 0.3)) {
                        proxy.scrollTo(anchorId, anchor: .center)
                    }
                    return
                }
                // Cible hors des pages chargées : demander la chasse paginée
                // une seule fois — ses pages re-déclencheront ce onChange.
                if !hasScrolledToTargetStoryComment, !hasRequestedTargetHunt,
                   targetCommentId != nil || targetParentCommentId != nil,
                   let hunt = huntTargetComment {
                    hasRequestedTargetHunt = true
                    Task { await hunt() }
                }
                if let last = storyComments.last {
                    withAnimation(.easeOut(duration: 0.3)) {
                        proxy.scrollTo(last.id, anchor: .bottom)
                    }
                }
            }
            .adaptiveOnChange(of: replyingToStoryComment?.id) { _, newId in
                // Bring the target into view so the user sees what they're
                // replying to even if it was off-screen.
                guard let id = newId else { return }
                withAnimation(.easeOut(duration: 0.3)) {
                    proxy.scrollTo(id, anchor: .center)
                }
            }
        }
    }

    // MARK: - Empty State

    private var emptyPlaceholder: some View {
        VStack(spacing: 8) {
            Image(systemName: "bubble.left.and.bubble.right")
                // Doctrine 84i/86i : glyphe héros décoratif de l'état vide → taille
                // figée + masqué de VoiceOver (les deux libellés ci-dessous portent
                // le sens). Le texte, lui, scale avec le Dynamic Type.
                .font(.system(size: 28))
                .foregroundColor(.white.opacity(0.7))
                .accessibilityHidden(true)
            Text(String(localized: "story.viewer.comments.empty", defaultValue: "Pas encore de commentaires", bundle: .main))
                .font(MeeshyFont.relative(13, weight: .semibold))
                .foregroundColor(.white.opacity(0.85))
            Text(String(localized: "story.viewer.comments.beFirst", defaultValue: "Soyez le premier \u{00E0} commenter !", bundle: .main))
                .font(MeeshyFont.relative(11))
                .foregroundColor(.white.opacity(0.65))
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 32)
        .storyOverlayLegible()
    }

}

extension StoryViewerView {

    // MARK: - Story Comment Thread Management

    func toggleStoryCommentThread(_ commentId: String) async {
        if storyCommentExpandedThreads.contains(commentId) {
            storyCommentExpandedThreads.remove(commentId)
        } else {
            storyCommentExpandedThreads.insert(commentId)
            // Always refetch to get latest replies
            await loadStoryCommentReplies(commentId: commentId)
        }
    }

    func loadStoryCommentReplies(commentId: String) async {
        guard let story = currentStory,
              !storyCommentLoadingReplies.contains(commentId) else { return }
        storyCommentLoadingReplies.insert(commentId)
        defer { storyCommentLoadingReplies.remove(commentId) }
        do {
            let response = try await PostService.shared.getCommentReplies(
                postId: story.id, commentId: commentId
            )
            // Refetch-on-expand = première page → REPLACE + réinitialisation
            // du curseur ; les pages suivantes (loadMoreStoryCommentReplies)
            // s'append-ent dessus.
            storyCommentRepliesMap[commentId] = mapStoryReplies(response.data, parentId: commentId)
            storyCommentRepliesNextCursor[commentId] = response.pagination?.nextCursor
            storyCommentRepliesHasMore[commentId] = response.pagination?.hasMore ?? false
        } catch {
            // Échec réseau transitoire : on garde le thread OUVERT (le
            // refermer punissait l'utilisateur qui venait de l'ouvrir) —
            // il affiche son état vide/spinner et le prochain toggle ou
            // refetch opportuniste réessaiera.
            Logger.messages.error("[StoryViewer] loadStoryCommentReplies failed for \(commentId, privacy: .public): \(error.localizedDescription, privacy: .public)")
        }
    }

    /// Page suivante (curseur `gt`, tri ASC → APPEND) des réponses d'un fil de
    /// commentaire de story. Jamais de remplacement : les réponses posées
    /// optimistiquement / par socket restent en place (dédup par id).
    /// NOTE : `storyCommentRepliesHasMore[id] == nil` (pagination jamais
    /// enregistrée — premier fetch échoué) n'est PAS bloquant : `cursor: nil`
    /// signifie « page 1 » et récupère un vrai curseur. Seul `false` stoppe.
    func loadMoreStoryCommentReplies(commentId: String) async {
        guard let story = currentStory,
              storyCommentRepliesHasMore[commentId] != false,
              !storyCommentLoadingReplies.contains(commentId) else { return }
        storyCommentLoadingReplies.insert(commentId)
        defer { storyCommentLoadingReplies.remove(commentId) }
        do {
            let response = try await PostService.shared.getCommentReplies(
                postId: story.id, commentId: commentId,
                cursor: storyCommentRepliesNextCursor[commentId], limit: 20
            )
            let fetched = mapStoryReplies(response.data, parentId: commentId)
            let existing = storyCommentRepliesMap[commentId] ?? []
            let existingIds = Set(existing.map(\.id))
            storyCommentRepliesMap[commentId] = existing + fetched.filter { !existingIds.contains($0.id) }
            storyCommentRepliesNextCursor[commentId] = response.pagination?.nextCursor
            storyCommentRepliesHasMore[commentId] = response.pagination?.hasMore ?? false
        } catch {
            // Échec réseau : stopper proprement la pagination (et toute chasse
            // en cours) — le fil garde les pages déjà chargées.
            storyCommentRepliesHasMore[commentId] = false
        }
    }

    /// Ciblage d'une RÉPONSE notifiée : déplie le fil du parent (refetch page 1,
    /// curseur réinitialisé) puis chasse les pages de réponses jusqu'à la cible
    /// (borné — cf. `CommentTargetHunter`). Retourne `true` si la réponse est
    /// chargée à l'issue de la chasse.
    func revealTargetStoryReply(parentId: String, replyId: String) async -> Bool {
        if !storyCommentExpandedThreads.contains(parentId) {
            await toggleStoryCommentThread(parentId)
        } else if storyCommentRepliesMap[parentId] == nil {
            await loadStoryCommentReplies(commentId: parentId)
        }
        return await CommentTargetHunter.hunt(
            isPresent: { storyCommentRepliesMap[parentId]?.contains(where: { $0.id == replyId }) ?? false },
            // `nil` = pagination inconnue (premier fetch échoué) → retenter la
            // page 1 ; seul `false` (fin de fil connue) arrête la chasse.
            hasMore: { storyCommentRepliesHasMore[parentId] != false },
            loadNextPage: { await loadMoreStoryCommentReplies(commentId: parentId) }
        )
    }

    private func mapStoryReplies(_ data: [APIPostComment], parentId: String) -> [FeedComment] {
        let langs = AuthManager.shared.currentUser?.preferredContentLanguages ?? []
        return data.map { c -> FeedComment in
            let translated = PostDetailViewModel.resolveCommentTranslation(
                translations: c.translations, originalLanguage: c.originalLanguage,
                preferredLanguages: langs
            )
            return FeedComment(
                id: c.id, author: c.author.name, authorId: c.author.id,
                authorUsername: c.author.username,
                authorAvatarURL: c.author.avatar,
                content: c.content, timestamp: c.createdAt,
                likes: c.likeCount ?? 0, replies: c.replyCount ?? 0,
                parentId: parentId,
                effectFlags: c.effectFlags ?? 0,
                originalLanguage: c.originalLanguage, translatedContent: translated,
                currentUserReactions: c.currentUserReactions,
                media: (c.media ?? []).map { $0.toFeedMedia() },
                location: c.location
            )
        }
    }

    func makeStoryCommentRow(_ comment: FeedComment, userLang: String) -> StoryCommentRowView {
        StoryCommentRowView(
            comment: comment,
            userLang: userLang,
            isLiked: storyCommentLikedIds.contains(comment.id),
            likeCount: max(0, comment.likes + (storyCommentLikeDelta[comment.id] ?? 0)),
            isInFlight: heartInFlightIds.contains(comment.id),
            onReply: {
                withAnimation(.spring(response: 0.25, dampingFraction: 0.8)) {
                    replyingToStoryComment = comment
                }
                // Répondre à une réponse (niveau 2) : la réponse reste plate au niveau 2
                // (parent racine, cf. submitStoryComment) — on injecte une @mention de
                // l'auteur ciblé dans le composer pour qu'il soit notifié (`user_mentioned`).
                if comment.parentId != nil, let username = comment.authorUsername, !username.isEmpty {
                    emojiToInject = "@\(username) "
                }
                // Faire APPARAÎTRE l'universal composer bar : on déclenche le focus
                // pour ouvrir le clavier immédiatement (spec 2026-06-23) — l'auteur
                // (et tout viewer) peut répondre sans tap supplémentaire.
                //
                // Pour l'auteur de sa propre story, le composer n'existe PAS avant
                // ce tap (cf. condition de rendu `!isOwnStory || replyingToStoryComment`
                // dans +Canvas) : il est monté dans la même passe que `replyingToStoryComment`.
                // Or `focusTrigger` est consommé via `onChange`, qui ne fire pas au
                // montage initial — poser `true` synchroniquement serait ignoré et le
                // drapeau resterait coincé. On force donc un front false→true sur le
                // runloop suivant, une fois le composer monté et son `onChange` actif.
                composerFocusTrigger = false
                DispatchQueue.main.async { composerFocusTrigger = true }
                HapticFeedback.light()
            },
            onToggleLike: {
                HapticFeedback.light()
                Task { await toggleStoryCommentLike(comment) }
            }
        )
    }

    // MARK: - Story Comment Reactions

    /// Applique un événement socket `comment:reaction-added` ou
    /// `comment:reaction-removed` en utilisant l'agrégation server-authoritative
    /// (`event.aggregation.count` + `event.aggregation.hasCurrentUser`).
    ///
    /// Avant 2026-05-28, le code maintenait deux états locaux séparés —
    /// `storyCommentLikedIds` (set d'ids likés par l'utilisateur) et
    /// `storyCommentLikeDelta` (offset depuis le count serveur) — et appliquait
    /// l'événement socket en patchant le delta selon `event.userId ==
    /// currentUserId`. Ce design dérivait facilement :
    ///   - Si `currentUserId` était nil ou mal formaté, l'événement propre était
    ///     traité comme « autre utilisateur » → delta double-comptait.
    ///   - Si le serveur émettait un `comment:reaction-removed` parasite (ex :
    ///     idempotence côté gateway), le delta repassait à 0 et le count
    ///     « disparaissait » à l'écran (bug user 2026-05-28).
    ///
    /// La solution : faire confiance à `event.aggregation` qui porte le state
    /// global (count total + flag `hasCurrentUser`) après application de
    /// l'événement. On met à jour `storyComments[i].likes` à ce count, on
    /// réinitialise le delta à 0, et on synchronise `storyCommentLikedIds`
    /// depuis `hasCurrentUser`. Le résultat affiché — `comment.likes + delta`
    /// — converge vers la vérité serveur sans flicker.
    /// Realtime asymmetry fix (mirrors `PostDetailViewModel.subscribeToSocket`'s
    /// `commentAdded` sink): a `comment:added` broadcast for the currently
    /// viewed story used to only move the sidebar's denormalized count (via
    /// `StoryViewModel`'s `storyGroups` mutation → the `.adaptiveOnChange(of:
    /// currentStory?.commentCount)` mirror) — the comments overlay's own
    /// `storyComments`/`storyCommentRepliesMap` never received the new row, so
    /// a viewer with the overlay open needed to close and reopen it to see a
    /// comment someone else just posted.
    func applyStoryCommentAdded(_ data: SocketCommentAddedData) {
        guard data.postId == currentStory?.id else { return }

        let translatedContent = PostDetailViewModel.resolveCommentTranslation(
            translations: data.comment.translations,
            originalLanguage: data.comment.originalLanguage,
            preferredLanguages: resolvedViewerLanguageChain
        )
        let comment = FeedComment(
            id: data.comment.id,
            author: data.comment.author.name,
            authorId: data.comment.author.id,
            authorUsername: data.comment.author.username,
            authorAvatarURL: data.comment.author.avatar,
            content: data.comment.content,
            timestamp: data.comment.createdAt,
            likes: data.comment.likeCount ?? 0,
            replies: data.comment.replyCount ?? 0,
            parentId: data.comment.parentId,
            effectFlags: data.comment.effectFlags ?? 0,
            originalLanguage: data.comment.originalLanguage,
            translatedContent: translatedContent,
            currentUserReactions: data.comment.currentUserReactions,
            media: (data.comment.media ?? []).map { $0.toFeedMedia() },
            location: data.comment.location
        )

        let result = Self.applyingStoryCommentAdded(
            comment: comment,
            clientMutationId: data.clientMutationId,
            expandedThreads: storyCommentExpandedThreads,
            comments: storyComments,
            repliesMap: storyCommentRepliesMap
        )
        storyComments = result.comments
        storyCommentRepliesMap = result.repliesMap
        storyCommentCount = data.commentCount
    }

    /// Édition en temps réel (`comment:updated`) : remplace la ligne EN PLACE
    /// dans l'overlay (racine ou réponse) — idempotent par id, aucun compteur
    /// à toucher. Miroir de `PostDetailViewModel.applyCommentUpdated`.
    func applyStoryCommentUpdated(_ data: SocketCommentUpdatedData) {
        guard data.postId == currentStory?.id else { return }
        let translated = PostDetailViewModel.resolveCommentTranslation(
            translations: data.comment.translations,
            originalLanguage: data.comment.originalLanguage,
            preferredLanguages: resolvedViewerLanguageChain
        )
        let updated = FeedComment(
            id: data.comment.id,
            author: data.comment.author.name,
            authorId: data.comment.author.id,
            authorUsername: data.comment.author.username,
            authorAvatarURL: data.comment.author.avatar,
            content: data.comment.content,
            timestamp: data.comment.createdAt,
            likes: data.comment.likeCount ?? 0,
            replies: data.comment.replyCount ?? 0,
            parentId: data.comment.parentId,
            effectFlags: data.comment.effectFlags ?? 0,
            originalLanguage: data.comment.originalLanguage,
            translatedContent: translated,
            currentUserReactions: data.comment.currentUserReactions,
            media: (data.comment.media ?? []).map { $0.toFeedMedia() },
            location: data.comment.location
        )
        if let parentId = updated.parentId,
           var replies = storyCommentRepliesMap[parentId],
           let idx = replies.firstIndex(where: { $0.id == updated.id }) {
            replies[idx] = updated
            storyCommentRepliesMap[parentId] = replies
            return
        }
        if let idx = storyComments.firstIndex(where: { $0.id == updated.id }) {
            storyComments[idx] = updated
        }
    }

    /// Traduction de commentaire arrivée pendant la lecture : pose
    /// `translatedContent` (racine ou réponse) si la langue est préférée et
    /// que la ligne n'affiche pas déjà une traduction plus prioritaire —
    /// règle unique du Prisme (`FeedViewModel.applyCommentTranslation`).
    func applyStoryCommentTranslationUpdated(_ data: SocketCommentTranslationUpdatedData) {
        guard data.postId == currentStory?.id else { return }
        let langs = resolvedViewerLanguageChain
        guard langs.contains(where: { $0.caseInsensitiveCompare(data.language) == .orderedSame }) else { return }
        let text = data.translation.text
        if let idx = storyComments.firstIndex(where: { $0.id == data.commentId }),
           storyComments[idx].translatedContent == nil {
            storyComments[idx].translatedContent = text
            return
        }
        for (key, var replies) in storyCommentRepliesMap {
            if let idx = replies.firstIndex(where: { $0.id == data.commentId }), replies[idx].translatedContent == nil {
                replies[idx].translatedContent = text
                storyCommentRepliesMap[key] = replies
                return
            }
        }
    }

    /// Pure routing/dedup decision for a `comment:added` broadcast — extracted
    /// so it's directly unit-testable (`StoryViewerCommentRealtimeTests`)
    /// without constructing a live view (mirrors `rollingBackOptimisticComment`
    /// just above). The echoed broadcast for OUR OWN just-sent comment/reply:
    /// `sendComment` already inserted an optimistic `temp_` placeholder and
    /// bumped the counters synchronously — it never reconciles that
    /// placeholder on POST success. Without the `isTwin` check the server's
    /// real row lands ALONGSIDE the temp_ one (visible duplicate) and, for a
    /// reply, the parent's `replies` count gets incremented a second time.
    /// Mirrors `FeedCommentsSheet`'s `isTwin` reconciliation for the
    /// equivalent case.
    nonisolated static func applyingStoryCommentAdded(
        comment: FeedComment,
        clientMutationId: String? = nil,
        expandedThreads: Set<String>,
        comments: [FeedComment],
        repliesMap: [String: [FeedComment]]
    ) -> (comments: [FeedComment], repliesMap: [String: [FeedComment]]) {
        var comments = comments
        var repliesMap = repliesMap

        // Clé primaire : le cmid ré-émis par le gateway matche exactement l'id
        // de la ligne optimiste. Repli : les lignes `temp_` héritées, matchées
        // par auteur + contenu + parent (fragile quand le serveur normalise le
        // texte — d'où le cmid).
        func isTwin(_ c: FeedComment) -> Bool {
            if let clientMutationId, c.id == clientMutationId { return true }
            return c.id.hasPrefix("temp_")
                && c.authorId == comment.authorId
                && c.content == comment.content
                && c.parentId == comment.parentId
        }

        if let parentId = comment.parentId {
            var existing = repliesMap[parentId] ?? []
            if let idx = existing.firstIndex(where: isTwin) {
                existing[idx] = comment
                repliesMap[parentId] = existing
            } else {
                if expandedThreads.contains(parentId), !existing.contains(where: { $0.id == comment.id }) {
                    existing.append(comment)
                    repliesMap[parentId] = existing
                }
                if let idx = comments.firstIndex(where: { $0.id == parentId }) {
                    comments[idx].replies += 1
                }
            }
        } else if let idx = comments.firstIndex(where: isTwin) {
            comments[idx] = comment
        } else if !comments.contains(where: { $0.id == comment.id }) {
            comments.append(comment)
        }

        return (comments, repliesMap)
    }

    func applyCommentReactionEvent(_ event: SocketCommentReactionUpdateEvent) {
        // 2026-05-29 : on ne gate plus sur `showCommentsOverlay` — l'état doit
        // rester aligné sur le serveur même quand l'overlay est fermé.
        // Si `storyComments` est vide (overlay jamais ouvert), `firstIndex(where:)`
        // plus bas retourne nil et on skip silencieusement ; on se ré-aligne
        // au prochain load via `computeLikedIds(fromCachedComments:)` (Task 3).
        guard event.postId == currentStory?.id else { return }
        guard event.emoji == Self.heartEmoji else { return }

        let commentId = event.commentId
        let serverCount = event.aggregation.count

        // Mise à jour de likedIds depuis l'agrégat (source de vérité) — « mon
        // cœur » dérive de `userIds` (la liste des User.id ayant réagi), PAS de
        // `hasCurrentUser` : ce flag est calculé côté gateway relativement à
        // l'ACTEUR de l'événement, donc il vaut true pour le like d'un TIERS et
        // allumait le cœur de tous les destinataires du broadcast.
        var resolvedCount = serverCount
        if let myId = AuthManager.shared.currentUser?.id {
            if event.aggregation.userIds.contains(myId) {
                storyCommentLikedIds.insert(commentId)
            } else if event.userId == myId {
                // L'événement décrit MA propre action : agrégat autoritatif.
                storyCommentLikedIds.remove(commentId)
            } else if storyCommentLikedIds.contains(commentId) {
                // Agrégat d'un TIERS pendant que MON like est encore en vol :
                // il ne me connaît pas — préserver le cœur, compter le mien
                // par-dessus (l'écho de mon propre like reconfirmera).
                resolvedCount = serverCount + 1
            }
        }

        // Reset du delta et propagation du count serveur dans la liste pour
        // que la prochaine reaction parte d'une baseline propre.
        storyCommentLikeDelta[commentId] = 0
        if let idx = storyComments.firstIndex(where: { $0.id == commentId }) {
            storyComments[idx].likes = resolvedCount
        } else if let parentId = storyComments.first(where: { storyCommentRepliesMap[$0.id]?.contains(where: { $0.id == commentId }) == true })?.id,
                  var replies = storyCommentRepliesMap[parentId],
                  let replyIdx = replies.firstIndex(where: { $0.id == commentId }) {
            replies[replyIdx].likes = resolvedCount
            storyCommentRepliesMap[parentId] = replies
        }
    }

    func toggleStoryCommentLike(_ comment: FeedComment) async {
        let id = comment.id
        guard !heartInFlightIds.contains(id) else { return }
        heartInFlightIds.insert(id)
        defer { heartInFlightIds.remove(id) }

        let wasLiked = storyCommentLikedIds.contains(id)
        let postId = currentStory?.id ?? ""

        withAnimation(.spring(response: 0.3, dampingFraction: 0.6)) {
            if wasLiked {
                storyCommentLikedIds.remove(id)
                storyCommentLikeDelta[id] = (storyCommentLikeDelta[id] ?? 0) - 1
            } else {
                storyCommentLikedIds.insert(id)
                storyCommentLikeDelta[id] = (storyCommentLikeDelta[id] ?? 0) + 1
            }
        }

        do {
            if wasLiked {
                _ = try await SocialSocketManager.shared.removeCommentReaction(commentId: id, postId: postId, emoji: StoryViewerView.heartEmoji)
            } else {
                _ = try await SocialSocketManager.shared.addCommentReaction(commentId: id, postId: postId, emoji: StoryViewerView.heartEmoji)
            }
        } catch {
            withAnimation {
                if wasLiked {
                    storyCommentLikedIds.insert(id)
                    storyCommentLikeDelta[id] = (storyCommentLikeDelta[id] ?? 0) + 1
                } else {
                    storyCommentLikedIds.remove(id)
                    storyCommentLikeDelta[id] = (storyCommentLikeDelta[id] ?? 0) - 1
                }
            }
        }
    }

    // MARK: - Load Comments

    static func computeLikedIds(from comments: [APIPostComment]) -> Set<String> {
        return Set(
            comments
                .filter { $0.currentUserReactions?.contains(StoryViewerView.heartEmoji) == true }
                .map { $0.id }
        )
    }

    /// Overload pour le chemin cache : `FeedComment` (déjà mappé) porte maintenant
    /// `currentUserReactions` (cf. `FeedModels.swift`). Permet de restaurer
    /// `storyCommentLikedIds` au cold start sans round-trip réseau.
    static func computeLikedIds(fromCachedComments comments: [FeedComment]) -> Set<String> {
        return Set(
            comments
                .filter { $0.currentUserReactions?.contains(StoryViewerView.heartEmoji) == true }
                .map { $0.id }
        )
    }

    func loadStoryComments() {
        guard let story = currentStory, !isLoadingComments else { return }
        Task { await loadStoryCommentsAsync(story: story) }
    }

    private func loadStoryCommentsAsync(story: StoryItem) async {
        let cacheKey = "post-\(story.id)"

        let cached = await CacheCoordinator.shared.comments.load(for: cacheKey)
        // Stale-write guard: drop the result ONLY if the viewer has CLEARLY
        // swiped to a different known story. A transient `currentStory == nil`
        // (group/index race during socket updates) must NOT drop the response
        // — otherwise the overlay stays empty for a story that has comments.
        if let now = currentStory?.id, now != story.id { return }
        switch cached {
        case .fresh(let comments, _):
            storyComments = comments
            storyCommentLikedIds = Self.computeLikedIds(fromCachedComments: comments)
            let topAll = comments.filter { $0.parentId == nil }
            storyCommentCount = topAll.count + topAll.reduce(0) { $0 + $1.replies }
            return
        case .stale(let comments, _):
            storyComments = comments
            storyCommentLikedIds = Self.computeLikedIds(fromCachedComments: comments)
            let topAll = comments.filter { $0.parentId == nil }
            storyCommentCount = topAll.count + topAll.reduce(0) { $0 + $1.replies }
        case .expired, .empty:
            isLoadingComments = true
        }

        await fetchStoryCommentsFromNetwork(story: story, cacheKey: cacheKey)
        isLoadingComments = false
    }

    /// Ligne de l'overlay bâtie depuis la PREMIÈRE charge réseau — le chemin
    /// principal, celui de chaque ouverture sur cache froid. Sa langue passe par
    /// le résolveur canonique du Prisme, comme les trois autres chemins de ce
    /// fichier (réponses, temps réel, pagination) : la fermeture locale qui
    /// vivait ici ignorait `originalLanguage`, si bien qu'un commentaire déjà
    /// écrit dans la langue n°1 du lecteur s'affichait traduit dans sa langue
    /// n°2 dès que le serveur avait produit cette traduction pour d'autres.
    /// Extrait en `static` pour que le témoin de RANG lise ce chemin-ci, pas
    /// seulement le résolveur.
    static func storyComment(from c: APIPostComment, preferredLanguages langs: [String]) -> FeedComment {
        FeedComment(
            id: c.id, author: c.author.name, authorId: c.author.id,
            authorUsername: c.author.username,
            authorAvatarURL: c.author.avatar,
            content: c.content, timestamp: c.createdAt,
            likes: c.likeCount ?? 0, replies: c.replyCount ?? 0,
            parentId: c.parentId,
            effectFlags: c.effectFlags ?? 0,
            originalLanguage: c.originalLanguage,
            translatedContent: PostDetailViewModel.resolveCommentTranslation(
                translations: c.translations,
                originalLanguage: c.originalLanguage,
                preferredLanguages: langs
            ),
            currentUserReactions: c.currentUserReactions,
            media: (c.media ?? []).map { $0.toFeedMedia() },
            location: c.location
        )
    }

    private func fetchStoryCommentsFromNetwork(story: StoryItem, cacheKey: String) async {
        let langs = AuthManager.shared.currentUser?.preferredContentLanguages ?? []
        do {
            let response = try await PostService.shared.getComments(postId: story.id, cursor: nil, limit: 50)
            // Stale-write guard: drop ONLY if user has clearly swiped to a
            // different known story (tolerate transient nil reads).
            if let now = currentStory?.id, now != story.id { return }
            let comments = response.data.map { Self.storyComment(from: $0, preferredLanguages: langs) }
            storyComments = comments
            storyCommentsNextCursor = response.pagination?.nextCursor
            storyCommentsHasMore = response.pagination?.hasMore ?? false
            storyCommentLikedIds = Self.computeLikedIds(from: response.data)
            let topAll = comments.filter { $0.parentId == nil }
            storyCommentCount = topAll.count + topAll.reduce(0) { $0 + $1.replies }
            try? await CacheCoordinator.shared.comments.save(comments, for: cacheKey)

            let topLevel = topAll.filter { $0.replies > 0 }
            Task {
                for comment in topLevel.prefix(5) {
                    await loadStoryCommentReplies(commentId: comment.id)
                }
            }
        } catch {
            // Cache-first : l'overlay garde les commentaires cachés déjà
            // affichés ; on logue l'échec du refresh réseau au lieu de
            // l'avaler (diagnostic des overlays vides signalés).
            Logger.messages.error("[StoryViewer] fetchStoryComments failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    /// Page suivante (plus ancienne) des commentaires top-level de la story —
    /// utilisée par la chasse paginée d'un commentaire notifié hors de la
    /// première page. Append + dédup (jamais de remplacement : le fetch plein
    /// reste le seul à réinitialiser la liste).
    func loadNextStoryCommentsPage() async {
        guard storyCommentsHasMore, let story = currentStory else { return }
        let langs = AuthManager.shared.currentUser?.preferredContentLanguages ?? []
        do {
            let response = try await PostService.shared.getComments(
                postId: story.id, cursor: storyCommentsNextCursor, limit: 50
            )
            if let now = currentStory?.id, now != story.id { return }
            let fetched = response.data.map { c -> FeedComment in
                FeedComment(
                    id: c.id, author: c.author.name, authorId: c.author.id,
                    authorUsername: c.author.username,
                    authorAvatarURL: c.author.avatar,
                    content: c.content, timestamp: c.createdAt,
                    likes: c.likeCount ?? 0, replies: c.replyCount ?? 0,
                    parentId: c.parentId,
                    originalLanguage: c.originalLanguage,
                    translatedContent: PostDetailViewModel.resolveCommentTranslation(
                        translations: c.translations, originalLanguage: c.originalLanguage, preferredLanguages: langs
                    ),
                    currentUserReactions: c.currentUserReactions,
                    media: (c.media ?? []).map { $0.toFeedMedia() },
                    location: c.location
                )
            }
            let existing = Set(storyComments.map(\.id))
            storyComments.append(contentsOf: fetched.filter { !existing.contains($0.id) })
            storyCommentsNextCursor = response.pagination?.nextCursor
            storyCommentsHasMore = response.pagination?.hasMore ?? false
        } catch {
            storyCommentsHasMore = false
        }
    }

    /// Chasse bornée du commentaire ciblé par la notification (racine ou
    /// parent de thread) — cf. `CommentTargetHunter`.
    func huntTargetStoryComment() async {
        let anchors = [targetCommentId, targetParentCommentId].compactMap { $0 }
        guard !anchors.isEmpty else { return }
        _ = await CommentTargetHunter.hunt(
            isPresent: { storyComments.contains { anchors.contains($0.id) } },
            hasMore: { storyCommentsHasMore },
            loadNextPage: { await loadNextStoryCommentsPage() }
        )
    }

    /// Seeds `storyCommentCount` for the slide that just became visible.
    ///
    /// Uses the count baked into the story payload as the first approximation,
    /// then reconciles with the local comments cache if one exists. The payload
    /// is frequently a >24h client cache, so its count can be a stale 0 for a
    /// story that has since gained comments — and the sidebar hides the comments
    /// button at 0. To break that, when (and ONLY when) the count is still 0
    /// after the cache check, a single debounced network reconciliation confirms
    /// the real count. The 400ms dwell + stale-id guard keep this O(1) per
    /// *watched* story (never the O(N)-on-swipe fetch removed in 2026-05-28).
    ///
    /// Every time a reconciliation branch actually MOVES `storyCommentCount`
    /// (cache hit or network stale-0 fix), it also bumps
    /// `storyCommentCountReconciledPulse` — the dedicated, one-way signal
    /// `StoryActionSidebarView` watches to re-open its already-frozen rail
    /// membership for the comments button. This is what makes the reveal
    /// happen on a NORMAL open (tray/profile/feed — no notification postId),
    /// not just on the notification path already covered upstream by
    /// `StoryViewModel.refreshFromCachedPostIfAvailable`.
    func loadStoryCommentCount() {
        guard let story = currentStory else {
            storyCommentCount = 0
            storyComments = []
            return
        }

        storyCommentCount = story.commentCount

        Task {
            let cacheKey = "post-\(story.id)"
            let cached = await CacheCoordinator.shared.comments.load(for: cacheKey)
            if let now = currentStory?.id, now != story.id { return }
            switch cached {
            case .fresh(let comments, _), .stale(let comments, _):
                let top = comments.filter { $0.parentId == nil }
                let total = top.count + top.reduce(0) { $0 + $1.replies }
                // Le bump ne s'exécute que sur un changement RÉEL de valeur —
                // `storyCommentCountReconciledPulse` doit rester silencieux
                // quand le cache confirme simplement le seed du payload.
                // Voir StoryActionSidebarView pour le consommateur : SEUL ce
                // canal peut faire réapparaître le bouton commentaires après
                // le gel, jamais une activité temps réel.
                if total != storyCommentCount {
                    storyCommentCount = total
                    storyCommentCountReconciledPulse += 1
                }
                return
            case .expired, .empty:
                break
            }

            // Stale-0 reconciliation. The story payload is frequently served from
            // a >24h client cache, so its `commentCount` can read 0 for a story
            // that has since received comments; with no comment cache above we
            // cannot distinguish a genuine 0 from a stale 0, and the sidebar's
            // `count > 0` gate then hides the comments button even though the
            // thread exists (user-reported: « malgré les commentaires on ne
            // voyait rien »). Confirm against the network — but ONLY for the
            // ambiguous 0, and debounced so a fast swipe-through never spams it
            // (the O(N)-on-swipe regression of 2026-05-28). 400ms dwell + the
            // stale-id guard mean only stories the viewer actually pauses on
            // trigger a single lightweight reconciliation.
            guard storyCommentCount == 0 else { return }
            try? await Task.sleep(nanoseconds: 400_000_000)
            if let now = currentStory?.id, now != story.id { return }
            guard let response = try? await PostService.shared.getComments(
                postId: story.id, cursor: nil, limit: 50
            ) else { return }
            if let now = currentStory?.id, now != story.id { return }
            // Same formula as the cache/open paths: top-level comments + their
            // replies. A genuinely empty thread stays 0 → button stays hidden.
            let top = response.data.filter { $0.parentId == nil }
            let total = top.count + top.reduce(0) { $0 + ($1.replyCount ?? 0) }
            if total != storyCommentCount {
                storyCommentCount = total
                storyCommentCountReconciledPulse += 1
            }
        }
    }
}

// MARK: - Story Comment Row View
//
// Modern bubble-style row used by the story viewer comments overlay.
// - Background tinted with the author's accent color (mirrors post comment cards).
// - Header pair of language flags lets the viewer toggle between original and
//   prisme-translated content without leaving the overlay.
// - Heart reaction + Reply CTAs sit below the text in their own action row.
struct StoryCommentRowView: View, Equatable {
    let comment: FeedComment
    let userLang: String
    let isLiked: Bool
    let likeCount: Int
    var isInFlight: Bool = false
    let onReply: () -> Void
    let onToggleLike: () -> Void
    /// Lieu du commentaire ouvert plein écran (tap sur le sticker).
    @State private var rowFullscreenPlace: BubbleFullscreenPlace?

    static func == (lhs: Self, rhs: Self) -> Bool {
        lhs.comment.id == rhs.comment.id &&
        lhs.isLiked == rhs.isLiked &&
        lhs.likeCount == rhs.likeCount &&
        lhs.isInFlight == rhs.isInFlight &&
        lhs.comment.content == rhs.comment.content &&
        lhs.comment.translatedContent == rhs.comment.translatedContent &&
        lhs.comment.media.first?.id == rhs.comment.media.first?.id &&
        lhs.comment.media.first?.transcription?.text == rhs.comment.media.first?.transcription?.text &&
        lhs.comment.media.first?.translatedAudios.count == rhs.comment.media.first?.translatedAudios.count
    }

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    /// Posé par le viewer sur l'overlay (`readerChromeScheme`, cf.
    /// `StoryViewerView+Canvas.swift`) — suit la luminance du FOND de la story,
    /// pas le thème de l'app. Pilote `legibleOverlayColor` ci-dessous.
    @Environment(\.colorScheme) private var colorScheme
    @State private var showOriginal: Bool = false

    private var hasTranslation: Bool {
        comment.translatedContent != nil && comment.originalLanguage != nil
    }

    private var displayContent: String {
        if showOriginal { return comment.content }
        return comment.translatedContent ?? comment.content
    }

    private var bubbleColor: Color { Color(hex: comment.authorColor) }

    /// Flat row sans box : sliver vertical coloré à gauche (identité auteur)
    /// + avatar + VStack {header, contenu, actions}. Pas de RoundedRectangle
    /// background, pas de strokeBorder — les rows sont séparées par un
    /// `Divider()` côté `StoryCommentsOverlayView.commentsList`
    /// (user spec 2026-05-28 : « les commentaires ne doivent pas être dans
    /// des box mais alignés et séparés par des ---- uniquement »).
    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            // Sliver vertical d'accent : identité couleur de l'auteur,
            /// extrait du background pour ne pas avoir à wrapper la row.
            Capsule(style: .continuous)
                .fill(bubbleColor)
                .frame(width: 3)
                .shadow(color: .black.opacity(0.35), radius: 3)
                .padding(.vertical, 6)

            avatar

            VStack(alignment: .leading, spacing: 4) {
                headerRow
                contentText
                // Média unique du commentaire (image/vidéo/audio) — inline + plein
                // écran, identique aux autres surfaces de commentaires.
                if let media = comment.media.first {
                    CommentMediaView(
                        media: media,
                        accentColor: comment.authorColor,
                        commentId: comment.id,
                        carrierText: comment.displayContent,
                        authorName: comment.author,
                        authorAvatarURL: comment.authorAvatarURL,
                        authorColor: comment.authorColor,
                        sentAt: comment.timestamp
                    )
                    .padding(.top, 2)
                }
                // Lieu attaché au commentaire — sticker cliquable, même surface
                // plein écran que les autres rows de commentaires.
                if let place = comment.location {
                    FeedPostLocationSticker(place: place) {
                        rowFullscreenPlace = BubbleFullscreenPlace(place: place)
                    }
                    .padding(.top, 2)
                }
                actionRow
            }

            Spacer(minLength: 0)
        }
        .padding(.vertical, 8)
        .padding(.trailing, 12)
        .fullScreenCover(item: $rowFullscreenPlace) { item in
            LocationFullscreenView(
                latitude: item.place.latitude,
                longitude: item.place.longitude,
                placeName: item.place.name,
                address: item.place.address,
                accentColor: comment.authorColor,
                senderName: comment.author
            )
        }
    }

    @ViewBuilder
    private var avatar: some View {
        Group {
            if let avatarURL = comment.authorAvatarURL,
               let url = MeeshyConfig.resolveMediaURL(avatarURL) {
                CachedAsyncImage(url: url.absoluteString, targetSize: CGSize(width: 32, height: 32)) {
                    Circle().fill(bubbleColor)
                }
            } else {
                Circle()
                    .fill(bubbleColor)
                    .overlay(
                        Text(String(comment.author.prefix(1)).uppercased())
                            // Doctrine 82i : monogramme dans un cercle d'avatar de
                            // dimension fixe 32×32 → taille figée (scaler ferait
                            // déborder l'initiale du cercle). Nom d'auteur lisible
                            // par ailleurs dans `headerRow`.
                            .font(.system(size: 13, weight: .bold))
                            .foregroundColor(.white)
                    )
            }
        }
        .frame(width: 32, height: 32)
        .clipShape(Circle())
        .overlay(Circle().strokeBorder(bubbleColor.opacity(0.55), lineWidth: 1))
        // Halo de séparation : l'avatar reste détaché même sur une story claire.
        .shadow(color: .black.opacity(0.4), radius: 4, y: 1)
    }

    private var headerRow: some View {
        let overlayColor = Self.legibleOverlayColor(for: colorScheme)
        return HStack(spacing: 6) {
            Text(comment.author)
                .font(MeeshyFont.relative(12.5, weight: .semibold))
                .foregroundColor(Self.legibleAuthorColor(hex: comment.authorColor))

            if hasTranslation {
                MetaSeparator().font(MeeshyFont.relative(10)).foregroundColor(overlayColor.opacity(0.55))
                languageSwitcher
            }

            MetaSeparator().font(MeeshyFont.relative(10)).foregroundColor(overlayColor.opacity(0.55))

            Text(comment.timestamp, style: .relative)
                .font(MeeshyFont.relative(10))
                .foregroundColor(overlayColor.opacity(0.75))
        }
        // Halo lisibilité (cf. StoryActionButton sidebar) — le header reste net
        // sur n'importe quel fond de story, clair comme foncé. Pas de box.
        .storyOverlayLegible(isLightText: colorScheme == .dark)
    }

    private var languageSwitcher: some View {
        HStack(spacing: 4) {
            LanguageFlagChip(code: comment.originalLanguage ?? "",
                             isActive: showOriginal,
                             metrics: .overlay) {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    showOriginal = true
                }
            }

            LanguageFlagChip(code: userLang, isActive: !showOriginal, metrics: .overlay) {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    showOriginal = false
                }
            }

            TranslationsBadge(metrics: .overlay)
        }
    }

    private var contentText: some View {
        // La couleur suit `readerChromeScheme` (posé par le viewer sur
        // l'overlay) : blanc sur fond sombre, quasi-noir sur fond clair — un
        // blanc fixe restait illisible sur une story à dominante claire/blanche
        // (bug user 2026-08-11), le halo seul ne suffisant pas à cette extrémité.
        let textColor = Self.legibleOverlayColor(for: colorScheme)
        return MessageTextRenderer.render(
            displayContent,
            fontSize: 13.5,
            color: textColor,
            mentionColor: MeeshyColors.mentionColor(isDark: colorScheme == .dark),
            hashtagColor: MeeshyColors.hashtagColor(isDark: colorScheme == .dark),
            accentColor: textColor,
            usesRelativeFont: true
        )
            .tint(textColor)
            .lineLimit(6)
            .multilineTextAlignment(.leading)
            .animation(.easeInOut(duration: 0.2), value: showOriginal)
            .messageEffects(comment.effects)
            // Halo renforcé sur le corps du commentaire — c'est le texte le plus
            // long, donc le plus exposé à un fond clair/chargé. Le sens du halo
            // suit `colorScheme` : noir pour détacher un texte clair d'un fond
            // clair, blanc pour détacher un texte sombre d'un fond sombre/chargé.
            .storyOverlayLegible(strong: true, isLightText: colorScheme == .dark)
    }

    private var actionRow: some View {
        let overlayColor = Self.legibleOverlayColor(for: colorScheme)
        return HStack(spacing: 16) {
            Button {
                withAnimation(reduceMotion ? nil : .spring(response: 0.3, dampingFraction: 0.6)) {
                    onToggleLike()
                }
            } label: {
                HStack(spacing: 3) {
                    // Le contour à l'accent de l'auteur — « c'est MOI qui ai
                    // aimé ce commentaire ». Sans lui, un commentaire de story
                    // que j'avais aimé ne se distinguait que par sa teinte, la
                    // même qu'un commentaire aimé par d'autres. Le `scaleEffect`
                    // d'origine est conservé.
                    EngagementGlyph(
                        outline: "heart",
                        filled: "heart.fill",
                        participated: isLiked,
                        accentHex: comment.authorColor,
                        activeTint: MeeshyColors.error,
                        inactiveTint: overlayColor.opacity(0.92),
                        size: 13,
                        // Posé sur un média : l'ombre porte la lisibilité.
                        shadowed: true
                    )
                    .scaleEffect(isLiked ? 1.15 : 1.0)
                    if likeCount > 0 {
                        Text("\(likeCount)")
                            .font(MeeshyFont.relative(11, weight: .semibold))
                            .foregroundColor(isLiked ? MeeshyColors.error : overlayColor.opacity(0.85))
                    }
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(isInFlight)
            .frame(minHeight: 44)
            // Ce « j'aime » n'avait AUCUNE étiquette : VoiceOver n'en tirait
            // que le cœur et le compteur. Sa JUMELLE de `FeedCommentsSheet` —
            // le même contrôle, sur la même entité — porte le vocabulaire
            // complet depuis toujours ; il est repris ici à l'identique plutôt
            // que réinventé (253i, #4266).
            //
            // Un « j'aime » n'est PAS un `.isToggle` : son nom dit l'ACTION
            // (« J'aime » / « Je n'aime plus ») et sa valeur porte le COMPTE,
            // pas un « Activé ». C'est le patron que la jumelle a établi.
            .accessibilityElement(children: .ignore)
            .accessibilityAddTraits(.isButton)
            .accessibilityLabel(isLiked
                ? String(localized: "a11y.comment.unlike", defaultValue: "Je n'aime plus", bundle: .main)
                : String(localized: "a11y.comment.like", defaultValue: "J'aime", bundle: .main))
            .accessibilityValue(LocalizedNumber.exact(likeCount))
            .accessibilityHint(String(localized: "a11y.comment.like.hint", defaultValue: "Aimer ce commentaire", bundle: .main))

            Button(action: onReply) {
                HStack(spacing: 3) {
                    Image(systemName: "arrowshape.turn.up.left")
                        .font(MeeshyFont.relative(11, weight: .semibold))
                    Text(String(localized: "story.viewer.reply", defaultValue: "R\u{00E9}pondre", bundle: .main))
                        .font(MeeshyFont.relative(10.5, weight: .semibold))
                }
                .foregroundColor(overlayColor.opacity(0.88))
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .frame(minHeight: 44)

            Spacer()
        }
        .padding(.top, 2)
        // Halo lisibilité sur la rangée d'actions (cœur + Répondre).
        .storyOverlayLegible(isLightText: colorScheme == .dark)
    }
}

// MARK: - Story Overlay Legibility

extension View {
    /// Halo pour le texte/les icônes qui flottent directement au-dessus d'une
    /// story (aucune box, aucun scrim — spec user 2026-05-28). Réplique le
    /// traitement approuvé de la sidebar (`StoryActionButton`, 2026-06-03) : une
    /// ombre serrée pour des glyphes nets + une ombre plus diffuse pour détacher
    /// le contenu d'un fond clair ou chargé. `strong` pour les longs paragraphes.
    ///
    /// `isLightText` choisit le SENS du halo : un halo NOIR détache un texte
    /// clair (blanc) d'un fond CLAIR — comportement historique, toujours le
    /// défaut. Un texte SOMBRE (`StoryCommentRowView.legibleOverlayColor` sur
    /// fond de story clair) a besoin de l'inverse : un halo BLANC pour se
    /// détacher d'un fond sombre/chargé, sinon le halo se fond dans le texte
    /// lui-même et redevient invisible (bug user 2026-08-11).
    func storyOverlayLegible(strong: Bool = false, isLightText: Bool = true) -> some View {
        let haloColor: Color = isLightText ? .black : .white
        return self
            .shadow(color: haloColor.opacity(strong ? 0.7 : 0.55), radius: strong ? 3 : 2, y: 1)
            .shadow(color: haloColor.opacity(strong ? 0.45 : 0.3), radius: strong ? 8 : 6)
    }
}

extension StoryCommentRowView {
    /// Couleur du nom d'auteur garantie lisible sur une story arbitraire.
    /// Les couleurs d'auteur très sombres (`luminance < 0.4` WCAG) sont mélangées
    /// vers le blanc pour ne jamais disparaître sur un fond foncé ; le halo gère
    /// les fonds clairs. Pure + testable (cf. StoryViewerCommentReactionTests).
    static func legibleAuthorColor(hex: String) -> Color {
        let base = Color(hex: hex)
        guard base.luminance < 0.4 else { return base }
        let ui = UIColor(base)
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        ui.getRed(&r, green: &g, blue: &b, alpha: &a)
        let f: CGFloat = 0.55
        return Color(
            red: Double(r + (1 - r) * f),
            green: Double(g + (1 - g) * f),
            blue: Double(b + (1 - b) * f)
        )
    }

    /// Couleur du texte/icônes du corps du commentaire (contenu, séparateurs,
    /// actions) — dérivée du SCHÉMA DE COULEUR du canvas de la story
    /// (`readerChromeScheme`, posé sur l'overlay par le viewer), jamais d'un
    /// blanc fixe. Bug user 2026-08-11 : un fond de story clair/blanc rendait
    /// le texte blanc totalement illisible, le halo seul ne suffisant pas à
    /// cette extrémité. Pure + testable.
    static func legibleOverlayColor(for scheme: ColorScheme) -> Color {
        scheme == .dark ? .white : MeeshyColors.indigo950
    }
}

// MARK: - Story Action Button

/// Single circular action button used in the story viewer's right sidebar.
/// Extracted from `StoryViewerView.storyActionButton(...)` so the sidebar
/// no longer inlines this subtree ~9 times into one opaque type.
struct StoryActionButton: View {
    let icon: String
    let label: String
    var isActive: Bool = false
    var activeColor: Color = .white
    var activeGlow: Color? = nil
    /// Marqueur de participation : non-nil ⇒ le FAB actif dessine son contour
    /// accent dans `accentOutlineColor` (ex : couleur d'avatar pour le cœur déjà
    /// réagi) plutôt que dans son `activeGlow`/`activeColor` par défaut. La
    /// valeur du symbole n'est plus rendue en overlay — seule sa présence
    /// (non-nil) sélectionne la couleur du contour (cf. `body`).
    var accentOutline: String? = nil
    var accentOutlineColor: Color = .clear
    /// Sites porteurs d'un geste séquencé longpress→drag (scrub) : le tap
    /// interne d'un `Button` consomme le touch et la séquence posée en
    /// `.highPriorityGesture` ne s'active JAMAIS — un maintien de 0,9 s
    /// partait en ❤️ direct au relâchement au lieu d'ouvrir le strip
    /// (reproduit au stream HID simulateur, 2026-08-11). `true` = vue plate
    /// + `TapGesture` : le tap court reste servi (la séquence échoue sous
    /// 0,25 s), le maintien laisse la séquence de l'appelant gagner.
    /// VoiceOver est servi par une `accessibilityAction` explicite — VO ne
    /// synthétise pas de TapGesture (leçon du bouton Sound, +Sidebar).
    var handlesTapViaGesture: Bool = false
    let action: () -> Void

    var body: some View {
        Group {
            if handlesTapViaGesture {
                buttonLabel
                    .onTapGesture { action() }
                    .accessibilityAddTraits(.isButton)
                    .accessibilityAction { action() }
            } else {
                Button(action: action) { buttonLabel }
                    .buttonStyle(.plain)
            }
        }
        .accessibilityLabel(label)
        .accessibilityHint(isActive ? "\(label) actif, toucher pour desactiver" : "Toucher pour \(label.lowercased())")
        .accessibilityAddTraits(isActive ? .isSelected : [])
    }

    private var buttonLabel: some View {
        Group {
            // Densité resserrée 2026-07-10 : spacing glyph→label 4→2 et padding
            // vertical 8→3 — le rail complet gagne ~30 % de compacité (parité
            // TikTok/IG) tout en gardant ≥ 44pt de hauteur tappable par bouton
            // (glyph 46 + label ~12 + 2×3 de padding).
            VStack(spacing: 2) {
                ZStack {
                    // Plus de cartouche circulaire : style « glyph flottant »
                    // TikTok/Instagram (spec user 2026-06-25 « supprimer les
                    // cercles autour des FABs, juste le glyph + ombre »).
                    //
                    // FAB ACTIF (l'utilisateur a participé : réaction posée, son
                    // actif, overlay commentaires/traductions ouvert…) → contour
                    // accent PRONONCÉ. Le liseré est dessiné en rendant le même
                    // symbole agrandi en couleur accent JUSTE DERRIÈRE le glyph
                    // blanc : un contour net qui ressort sur n'importe quel fond
                    // de story (clair comme foncé), là où l'ancien anneau du chip
                    // disparaissait. Couleur du contour = couleur de participation
                    // du bouton (`accentOutlineColor`, ex : couleur d'avatar pour
                    // le cœur) sinon le glow/accent du bouton.
                    if isActive {
                        Image(systemName: icon)
                            // Doctrine 82i : glyphe du rail d'action dans un cadre
                            // fixe 46×46 → taille figée (le Dynamic Type déborderait
                            // du rail vertical compact style TikTok/IG). Bouton
                            // labellisé par `Text(label)` ci-dessous → VoiceOver OK.
                            .font(.system(size: 20, weight: .semibold))
                            .foregroundStyle(accentOutline != nil ? accentOutlineColor : (activeGlow ?? activeColor))
                            .scaleEffect(1.22)
                    }

                    Image(systemName: icon)
                        .font(.system(size: 20, weight: .semibold))
                        .foregroundColor(.white)
                        .adaptiveSymbolBounce(value: isActive)
                }
                .frame(width: 46, height: 46)
                // Halo sous l'icône — lisibilité garantie sur N'IMPORTE QUEL fond
                // de story (clair comme foncé), sans voile ni cartouche. Inactif →
                // ombre sombre ; actif → glow coloré plus large qui renforce le
                // contour accent.
                .shadow(
                    color: isActive ? (activeGlow ?? activeColor).opacity(0.55) : .black.opacity(0.6),
                    radius: isActive ? 7 : 4,
                    y: isActive ? 0 : 1
                )

                Text(label)
                    // Doctrine 82i : libellé du rail sous un glyphe figé, dans une
                    // colonne de largeur fixe 56pt (`minimumScaleFactor(0.7)` +
                    // `lineLimit(1)`) → taille figée pour préserver la géométrie du
                    // rail vertical compact.
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundColor(.white.opacity(isActive ? 0.98 : 0.85))
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                    // Même halo pour le label : blanc sur fond clair sinon illisible.
                    .shadow(color: .black.opacity(0.55), radius: 2, y: 1)
            }
            .frame(width: 56)
            // Élargit la zone sensible de quelques pixels AUTOUR du glyph + label.
            // Sans cartouche/cercle de fond (style « glyph flottant »), seul le
            // glyph rendu était tappable : un tap qui manquait le glyph de
            // quelques pixels traversait jusqu'à l'overlay de navigation (Layer 6
            // de StoryViewerView+Canvas — gesture prev/next) et faisait passer la
            // story à la suivante (bug user 2026-06-28 « je touche un bouton, ça
            // passe à la story suivante »). Le `padding` agrandit le rectangle et
            // comble les gaps entre FABs ; `contentShape(Rectangle())` rend TOUT
            // ce rectangle (padding inclus) sensible, transparent compris.
            // (3pt vertical + spacing 8/6 du rail : ≤ 2pt de jour entre deux
            // zones tappables — la protection anti-tap-traversant reste réelle.)
            .padding(.vertical, 3)
            .padding(.horizontal, 6)
            .contentShape(Rectangle())
        }
    }
}

// MARK: - Story Progress Bars

/// Segmented progress indicator for the story viewer's current group.
/// Extracted from `StoryViewerView.progressBars` so the header layer no
/// longer inlines a `ForEach` / `GeometryReader` subtree into the viewer's
/// opaque type.
struct StoryProgressBarsView: View {
    let group: StoryGroup?
    let currentIndex: Int
    let progress: CGFloat

    var body: some View {
        HStack(spacing: 3) {
            if let group {
                ForEach(Array(group.stories.enumerated()), id: \.element.id) { index, _ in
                    GeometryReader { barGeo in
                        let w = width(for: index, totalWidth: barGeo.size.width)
                        ZStack(alignment: .leading) {
                            Capsule()
                                .fill(Color.white.opacity(0.2))
                            Capsule()
                                .fill(
                                    index == currentIndex ?
                                    AnyShapeStyle(LinearGradient(
                                        colors: [MeeshyColors.indigo500, MeeshyColors.error, MeeshyColors.indigo400],
                                        startPoint: .leading,
                                        endPoint: .trailing
                                    )) :
                                    AnyShapeStyle(Color.white)
                                )
                                .frame(width: w)
                                .shadow(
                                    color: index == currentIndex ? MeeshyColors.indigo500.opacity(0.6) : .clear,
                                    radius: 4, y: 0
                                )
                        }
                    }
                    .frame(height: 3)
                    .accessibilityHidden(true)
                }
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(String(localized: "story.viewer.a11y.position", defaultValue: "Story \(currentIndex + 1) sur \(group?.stories.count ?? 0)", bundle: .main))
        .accessibilityValue(String(localized: "story.viewer.a11y.percent", defaultValue: "\(Int(progress * 100)) pourcent", bundle: .main))
    }

    private func width(for index: Int, totalWidth: CGFloat) -> CGFloat {
        if index < currentIndex {
            return totalWidth
        } else if index == currentIndex {
            return totalWidth * progress
        } else {
            return 0
        }
    }
}

// MARK: - Zone de départ du drag parent vs surfaces scrollables

/// Bord SUPÉRIEUR, en coordonnées `.global`, de la surface scrollable ouverte
/// par-dessus la story (liste de commentaires, sélecteurs plein écran).
///
/// À PUBLIER DEPUIS LE CONTENEUR PARENT DU `ScrollView`, jamais depuis
/// l'intérieur du contenu défilant : sous iOS 18+, `onPreferenceChange` ne
/// re-tire plus pour une valeur pilotée par le défilement, et la mise à jour
/// n'arriverait jamais. Ce qu'on publie ici est un cadre de LAYOUT — il ne bouge
/// qu'au (re)positionnement de la surface (ouverture, montée du clavier,
/// rotation), pas au scroll.
///
/// iOS 16 compatible : `GeometryReader` + `PreferenceKey`, aucune API scroll
/// iOS 17/18 (`onGeometryChange` est interdit sur cette cible).
struct StoryReaderScrollableSurfaceTopKey: PreferenceKey {
    static var defaultValue: CGFloat? { nil }
    /// Plusieurs surfaces peuvent être montées simultanément : on garde la plus
    /// HAUTE (minY le plus petit), c'est-à-dire la zone interdite la plus large.
    /// Céder trop est sans danger (le drag parent ne fait rien) ; céder trop peu
    /// laisse un geste naître dans un `ScrollView`, et là `onEnded` n'arrive
    /// jamais.
    static func reduce(value: inout CGFloat?, nextValue: () -> CGFloat?) {
        guard let next = nextValue() else { return }
        value = value.map { Swift.min($0, next) } ?? next
    }
}

/// Décide si le drag parent doit rendre la main à la surface scrollable ouverte,
/// en fonction du POINT DE DÉPART du geste. Pur et testable — `unifiedDragGesture`
/// est un `some Gesture` piloté par des `@State`, injouable en XCTest.
enum StoryReaderDragStartZone {

    /// - Parameters:
    ///   - hasScrollableSurface: une surface embarquant son propre `ScrollView`
    ///     est ouverte.
    ///   - surfaceTopY: bord supérieur mesuré de cette surface (`.global`), ou
    ///     `nil` si inconnu.
    ///   - dragStartY: `value.startLocation.y` du drag parent (`.global`).
    /// - Returns: `true` si le geste appartient à la surface (le drag parent doit
    ///   sortir immédiatement).
    ///
    /// RÈGLE : aucune surface ouverte ⇒ le drag parent s'exécute INTÉGRALEMENT
    /// (cas nominal, la très grande majorité des gestes du lecteur). Surface
    /// ouverte et bord connu ⇒ seuls les gestes nés à l'intérieur lui reviennent ;
    /// ceux nés dans la story encore visible au-dessus restent au drag parent, qui
    /// peut ainsi refermer la surface d'un glissement. Bord INCONNU ⇒ tout lui
    /// revient (fail-safe : un swipe inerte vaut mieux qu'un `onEnded` jamais
    /// délivré, qui laisse `gestureAxis` collé et la lecture gelée).
    static func yieldsToScrollableSurface(hasScrollableSurface: Bool,
                                          surfaceTopY: CGFloat?,
                                          dragStartY: CGFloat) -> Bool {
        guard hasScrollableSurface else { return false }
        guard let top = surfaceTopY else { return true }
        return dragStartY >= top
    }
}
