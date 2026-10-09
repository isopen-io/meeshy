import SwiftUI
import MeeshySDK

/// **L'aperçu du viseur — un seul montage de `CameraPreviewLayer` pour les deux
/// présentations** (#9134). La carte en scène et le plein écran le posent à la
/// taille qu'ils choisissent, et il la REMPLIT (#9557) : le plein écran est le
/// plein écran, la toile peinte prend les proportions de ce rectangle, et ce
/// qui part les garde. Il n'en prend aucun doigt : l'appui long qui a
/// armé le viseur est toujours en cours SOUS lui, et c'est sa levée qui décide.
///
/// **En édition, la même toile montre la source retouchée** (#9352, spec § 3.3) :
/// la vue Metal lit la photo figée ou la boucle, avec le cadrage réglé au doigt,
/// à la cadence du palier. La couche système reste montée dessous — l'objectif
/// se repose, il n'est pas démonté — et rien de l'objectif (couverture de
/// bascule, mention thermique) ne se pose sur un média qui ne vient plus de lui.
struct ComposerCapturePreview: View {
    @ObservedObject var session: ComposerCaptureSession
    let size: ComposerSceneCameraSize
    /// La vue Metal a présenté sa première image : la couche système peut se
    /// détacher sans laisser un écran noir (#9349).
    @State private var metalHasFrame = false

    private var showsThermalNotice: Bool {
        !session.phase.isEditing
            && ComposerCaptureSurfaceRule.showsThermalNotice(look: session.look, budget: session.thermalBudget)
    }

    /// Ce que le peintre lit en édition : la photo figée, ou la boucle.
    private var editedSource: (any ComposerFrameSourcing)? {
        session.phase.isEditing ? session.editSource : nil
    }

    var body: some View {
        ZStack {
            Color.black
            switch ComposerSceneCameraSurface.shown(stage: session.stage, permission: session.camera.permission) {
            case .scene:
                EmptyView()
            case .viewfinder:
                GeometryReader { exterieur in
                    let toile = CGRect(origin: .zero, size: exterieur.size)
                    let proportions = ComposerLookPainter.aspect(of: exterieur.size)
                    let canevas = ComposerLookPainter.previewCanvas(aspect: proportions)
                    ZStack {
                        CameraPreviewLayer(session: session.camera.session, focusPoints: session.focusPoints,
                                           mirrorsFrames: ComposerCaptureSurfaceRule.mirrorsSystemLayer(
                                               paintsWithMetal: session.paintsWithMetal, metalHasFrame: metalHasFrame))
                            .background(GeometryReader { proxy in
                                Color.clear.adaptiveOnChange(of: proxy.frame(in: .global), initial: true) { _, cadre in
                                    session.focusPoints.previewFrame = cadre
                                }
                            })
                        if let source = editedSource {
                            ComposerLiveLookSurface(look: session.look, person: session.lookPerson,
                                                    date: session.lookDate, framing: session.framing,
                                                    source: source, canvas: canevas,
                                                    fps: ComposerCaptureSurfaceRule.editFPS(session.thermalBudget))
                                .id(session.phase)
                        } else {
                            if session.paintsWithMetal {
                                ComposerLiveLookSurface(look: session.look, person: session.lookPerson,
                                                        date: session.lookDate, framing: .identity,
                                                        source: session.camera.liveFeed, canvas: canevas,
                                                        fps: session.thermalBudget.previewFPS,
                                                        surfaceScale: session.thermalBudget.surfaceScale,
                                                        onFirstFrame: { metalHasFrame = true })
                            }
                            if let couverture = session.camera.switchCover {
                                Image(decorative: couverture, scale: 1)
                                    .resizable()
                                    .scaledToFill()
                                    .frame(width: toile.width, height: toile.height)
                                    .clipped()
                                    .transition(.opacity)
                            }
                            if showsThermalNotice {
                                VStack {
                                    Text(ComposerCaptureCopy.thermalNotice)
                                        .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold))
                                        .foregroundStyle(.white)
                                        .padding(.horizontal, MeeshySpacing.md)
                                        .padding(.vertical, MeeshySpacing.sm)
                                        .adaptiveLiquidGlass(in: Capsule())
                                        .padding(.top, MeeshySpacing.xl * 2)
                                    Spacer()
                                }
                            }
                        }
                    }
                    .frame(width: toile.width, height: toile.height)
                    .animation(.easeOut(duration: 0.15), value: session.camera.switchCover != nil)
                    .position(x: toile.midX, y: toile.midY)
                    .adaptiveOnChange(of: proportions, initial: true) { _, vues in
                        session.canvasAspect = vues
                    }
                }
            case .permissionRefused:
                CameraPermissionPanel()
            }
        }
        .adaptiveOnChange(of: session.paintsWithMetal) { _, peint in
            if !peint { metalHasFrame = false }
        }
        .adaptiveOnChange(of: session.phase.isEditing) { _, _ in
            metalHasFrame = false
        }
        .adaptiveOnChange(of: showsThermalNotice) { _, montree in
            if montree { UIAccessibility.post(notification: .announcement, argument: ComposerCaptureCopy.thermalNotice) }
        }
        .clipShape(RoundedRectangle(
            cornerRadius: ComposerCapturePlacement.radius(for: size, editing: session.phase.isEditing),
            style: .continuous))
        .allowsHitTesting(false)
        .offset(y: ComposerSceneCameraFrame.dismissOffset(translationY: session.dismissDrag))
        .opacity(ComposerSceneCameraFrame.dismissOpacity(translationY: session.dismissDrag))
    }
}

/// **Le chrome du viseur — la nappe de gestes, la rangée haute et le bas de la
/// capture, câblés une fois** (#9134, #9351).
///
/// Chaque geste de la nappe est DÉCIDÉ par la table (`ComposerCaptureGesture`) :
/// un toucher vise, le second d'un double photographie — lu par le seul
/// décideur du toucher, qui ne retarde jamais le premier (#9464, #9566) —, l'appui long
/// filme un segment, le glissé pilote la prise tenue, zoome une prise en cours
/// ou range le viseur hors prise, PROGRESSIF et ANNULABLE (directive
/// 2026-08-30), le pincement zoome. VoiceOver reçoit les mêmes prises en actions
/// nommées, projetées de la table.
///
/// **Des segments en attente ne partent jamais en silence** : la croix ou le
/// glissé qui fermerait le viseur demande d'abord « Abandonner la vidéo ? ».
///
/// **En édition, la même nappe cadre le média** (#9352, spec § 3.3), dans sa
/// scène posée sur le sol (#9567) dont quatre crochets règlent la taille : un doigt
/// le déplace, deux le zooment — chaque image avance de l'écart depuis la
/// précédente, donc les deux gestes se composent sans se disputer une ancre.
/// La croix abandonne la retouche et revient viser ; elle reste vivante pendant
/// le rendu de « Terminé », quand le reste se tait.
struct ComposerCaptureChrome: View {
    @ObservedObject var session: ComposerCaptureSession
    let size: ComposerSceneCameraSize
    var offersSizeToggle = true
    var allowsPhoto = true
    var allowsVideo = true
    var onToggleSize: () -> Void = {}
    let onDisarm: () -> Void
    let onValidateSegments: () -> Void

    /// L'anneau de la dernière mise au point — un état de VUE, pas de la machine.
    @State private var focusMark: ComposerCaptureFocusMark?
    @State private var confirmsDiscard = false
    /// Retombe tout seul quand le pincement finit — y compris annulé par le
    /// système, qui n'appelle pas `onEnded`.
    @GestureState private var pinchActive = false
    /// Le dernier pas du glissé et du pincement de cadrage — des états de VUE.
    @State private var reframeStep: ComposerCaptureReframeStep?
    @State private var rezoomStep: CGFloat?
    /// La fin de la dernière tenue — sa levée ne compte pas pour un toucher.
    @State private var holdEndedAt: Date?
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// Le pas d'un balayage VoiceOver sur le média : un quart de plus, ou de moins.
    private static let accessibleZoomStep: CGFloat = 1.25

    private var context: ComposerCaptureGestureContext {
        session.gestureContext(allowsPhoto: allowsPhoto, allowsVideo: allowsVideo)
    }

    /// « Terminé » rend : seule la croix répond encore.
    private var finishing: Bool {
        session.phase.isEditing && session.isRenderingLook
    }

    var body: some View {
        ZStack {
            GeometryReader { proxy in
                let origine = proxy.frame(in: .global).origin
                Color.clear
                    .contentShape(Rectangle())
                    .gesture(holdGesture.simultaneously(with: tapGesture(origin: origine)))
                    .simultaneousGesture(dragGesture)
                    .simultaneousGesture(pinchGesture)
                    .adaptiveOnChange(of: pinchActive) { _, actif in
                        guard !actif else { return }
                        rezoomStep = nil
                        session.endPinchZoom()
                    }
                    .overlay(alignment: .topLeading) {
                        if let focusMark {
                            ComposerCaptureFocusRing(reduceMotion: reduceMotion)
                                .id(focusMark.id)
                                .position(focusMark.location)
                                .allowsHitTesting(false)
                        }
                    }
                    .accessibilityElement()
                    .accessibilityLabel(session.phase.isEditing
                        ? ComposerCaptureCopy.reframe
                        : ComposerSceneCameraCopy.shutterLabel(mode: session.mode ?? .photo, stage: session.stage))
                    .accessibilityValue(session.phase.isEditing
                        ? ComposerSceneCameraCopy.zoomValue(session.framing.scale) : "")
                    .composerCaptureAccessibilityActions(zone: .scene, context: context) { action in
                        performAccessible(action, origin: origine)
                    }
                    .accessibilityAdjustableAction { sens in
                        switch sens {
                        case .increment: adjustAccessible(up: true)
                        case .decrement: adjustAccessible(up: false)
                        @unknown default: break
                        }
                    }
                    .allowsHitTesting(!finishing)
            }
            if !finishing, let aspect = session.editAspect {
                GeometryReader { proxy in
                    let zone = ComposerEditScene.area(container: proxy.size, top: 0, bottom: 0, panel: session.editPanel)
                    ComposerCropBrackets(scene: ComposerEditScene.rect(aspect: aspect, in: zone), area: zone) { cadre in
                        guard cadre.height > 0 else { return }
                        session.setEditAspect(cadre.width / cadre.height)
                    }
                }
                .animation(reduceMotion ? nil : ComposerCaptureMount<EmptyView>.growth, value: session.editAspect)
                .animation(reduceMotion ? nil : ComposerCaptureMount<EmptyView>.growth, value: session.editPanel)
            }
            VStack(spacing: 0) {
                if session.stage != .recording {
                    ComposerSceneCameraBar(
                        stage: session.stage,
                        flashMode: session.flash,
                        onCycleFlash: { session.cycleFlash() },
                        onFlipCamera: { session.flipCamera() },
                        onDisarm: { requestDisarm() },
                        size: size,
                        onToggleSize: onToggleSize,
                        offersSizeToggle: offersSizeToggle,
                        segments: session.segments,
                        onDropLastSegment: { session.dropLastSegment() },
                        onValidateSegments: onValidateSegments,
                        liveDuration: session.camera.recordingDuration,
                        flashIntensity: session.barCapture.flashIntensity,
                        onFlashIntensity: { session.setFlashIntensity($0) },
                        flipping: session.barCapture.flipping,
                        editing: session.phase.isEditing,
                        rendering: session.isRenderingLook || session.takeSaveState == .saving,
                        onDone: { session.finishEditing() },
                        saveState: session.takeSaveState,
                        onSave: { session.saveTakeToPhotos() })
                    .transition(.opacity)
                }
                Spacer(minLength: 0)
                ComposerCaptureBottomRow(session: session, context: context)
                    .allowsHitTesting(!finishing)
            }
            if session.isRenderingLook {
                ProgressView()
                    .progressViewStyle(.circular)
                    .tint(.white)
                    .controlSize(.large)
                    .padding(MeeshySpacing.lg)
                    .adaptiveLiquidGlass(in: Circle())
                    .accessibilityLabel(ComposerCaptureCopy.rendering)
            }
        }
        .animation(reduceMotion ? nil : .easeOut(duration: 0.2), value: session.stage == .recording)
        .offset(y: ComposerSceneCameraFrame.dismissOffset(translationY: session.dismissDrag))
        .opacity(ComposerSceneCameraFrame.dismissOpacity(translationY: session.dismissDrag))
        .alert(ComposerSceneCameraCopy.discardTitle, isPresented: $confirmsDiscard) {
            Button(ComposerSceneCameraCopy.discardConfirm, role: .destructive) { onDisarm() }
            Button(ComposerSceneCameraCopy.discardKeep, role: .cancel) {}
        }
    }

    /// La croix et le glissé de rangement passent par ici : des segments en
    /// attente demandent confirmation, sinon le viseur se range tout de suite.
    /// En édition, la croix abandonne la retouche : on revient viser.
    private func requestDisarm() {
        guard !session.phase.isEditing else { return session.cancelEditing() }
        guard ComposerCaptureSegments.asksBeforeClosing(session.segments) else { return onDisarm() }
        HapticFeedback.warning()
        confirmsDiscard = true
    }

    /// Un geste sur la scène, décidé par la table.
    private func scene(_ geste: ComposerCaptureGestureKind) {
        session.perform(ComposerCaptureGesture.action(zone: .scene, gesture: geste, context: context), item: nil)
    }

    /// **VoiceOver ne TIENT pas un doigt** : « Filmer » part verrouillé et
    /// « Arrêter » le termine ; « Mettre au point » vise le centre de l'image.
    private func performAccessible(_ action: ComposerCaptureAction, origin: CGPoint) {
        switch action {
        case .focus:
            let cadre = session.focusPoints.previewFrame
            focus(at: CGPoint(x: cadre.midX, y: cadre.midY), origin: origin)
        case .filmSegment, .filmToGallery:
            session.perform(action, item: nil)
            session.lockPendingTake()
        default:
            session.perform(action, item: nil)
        }
    }

    /// **VoiceOver ne pince pas : il incrémente** — le zoom de l'objectif pendant
    /// une prise, celui du média en édition.
    private func adjustAccessible(up: Bool) {
        guard !session.phase.isEditing else {
            let pas = up ? Self.accessibleZoomStep : 1 / Self.accessibleZoomStep
            return session.rezoom(from: session.framing, scale: pas)
        }
        guard session.stage == .recording else { return }
        session.stepZoom(up: up)
    }

    /// L'appui long et le toucher se reconnaissent CÔTE À CÔTE (#9566) : derrière
    /// un `exclusively(before:)`, le toucher ne partait jamais — ni mise au
    /// point, ni double. La levée d'une tenue, elle, n'est pas un toucher.
    private var holdGesture: some Gesture {
        LongPressGesture(minimumDuration: ComposerSceneQuickCapture.armedHoldDuration)
            .sequenced(before: DragGesture(minimumDistance: 0))
            .onChanged { valeur in
                guard case .second(true, _) = valeur, session.holdStartedAt == nil else { return }
                scene(.longPress)
            }
            .onEnded { _ in
                holdEndedAt = Date()
                session.endHold()
            }
    }

    private var dragGesture: some Gesture {
        DragGesture(minimumDistance: 12)
            .onChanged { valeur in
                switch ComposerCaptureGesture.action(zone: .scene, gesture: .drag, context: context) {
                case .steerTake:
                    session.holdChanged(CGPoint(x: valeur.translation.width, y: valeur.translation.height))
                case .zoom:
                    session.dragZoom(translationY: valeur.translation.height)
                case .close:
                    session.followDismissDrag(translationY: valeur.translation.height)
                case .reframe:
                    reframe(valeur)
                default:
                    return
                }
            }
            .onEnded { valeur in
                reframeStep = nil
                session.endZoomDrag()
                guard session.holdStartedAt == nil else { return }
                guard session.releaseDismissDrag(translationY: valeur.translation.height) else { return }
                HapticFeedback.light()
                requestDisarm()
            }
    }

    /// **Le doigt déplace le média** : il avance de l'écart depuis le pas
    /// précédent de CE glissé — reconnu à son point de départ, un glissé que le
    /// système annule sans fin ne lègue donc rien au suivant. La case mesurée est
    /// celle de l'aperçu, pas celle des commandes.
    private func reframe(_ valeur: DragGesture.Value) {
        let pas = ComposerCaptureReframeStep(start: valeur.startLocation, translation: valeur.translation)
        let avant = reframeStep.flatMap { $0.start == pas.start ? $0.translation : nil } ?? pas.translation
        reframeStep = pas
        session.reframe(from: session.framing,
                        translation: CGSize(width: pas.translation.width - avant.width,
                                            height: pas.translation.height - avant.height),
                        viewSize: session.focusPoints.previewFrame.size)
    }

    /// **Pincer zoome l'objectif** (#9295), dans les deux montages — et, en
    /// édition, le média, de l'écart depuis le pas précédent du pincement.
    private var pinchGesture: some Gesture {
        MagnificationGesture()
            .updating($pinchActive) { _, actif, _ in actif = true }
            .onChanged { echelle in
                switch ComposerCaptureGesture.action(zone: .scene, gesture: .pinch, context: context) {
                case .zoom:
                    session.pinchZoom(scale: echelle)
                case .reframe:
                    guard echelle > 0 else { return }
                    session.rezoom(from: session.framing, scale: echelle / (rezoomStep ?? 1))
                    rezoomStep = echelle
                default:
                    return
                }
            }
            .onEnded { _ in
                rezoomStep = nil
                session.endPinchZoom()
            }
    }

    /// **Un toucher vise, le second d'un double photographie** (#9464) — lu par
    /// le seul décideur du toucher, qui n'attend rien : le premier vise tout de
    /// suite. Le point part dans le repère global, celui où l'aperçu mesure son
    /// cadre ; l'anneau se pose dans celui de la nappe.
    private func tapGesture(origin: CGPoint) -> some Gesture {
        SpatialTapGesture(count: 1, coordinateSpace: .global).onEnded { toucher in
            guard !session.pinchSpoilsGestures, session.holdStartedAt == nil,
                  !ComposerCaptureTapRule.followsAHold(holdEndedAt, now: Date()) else { return }
            switch session.tapAction(context: context) {
            case .photo: session.perform(.photoToEdit, item: nil)
            case .focus: focus(at: toucher.location, origin: origin)
            }
        }
    }

    /// L'anneau ne paraît que si l'objectif a vraiment visé.
    private func focus(at location: CGPoint, origin: CGPoint) {
        guard session.focus(atGlobalPoint: location) else { return }
        let marque = ComposerCaptureFocusMark(
            id: UUID(), location: CGPoint(x: location.x - origin.x, y: location.y - origin.y))
        focusMark = marque
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: UInt64(ComposerCaptureFocus.markLifetime * 1_000_000_000))
            if focusMark == marque { focusMark = nil }
        }
    }
}

/// Un pas du glissé de cadrage : le glissé auquel il appartient, et sa course.
nonisolated private struct ComposerCaptureReframeStep: Equatable, Sendable {
    let start: CGPoint
    let translation: CGSize
}

/// **L'anneau de mise au point** (#9295) : il se pose où le doigt a visé, se
/// resserre pendant que l'objectif mesure, puis s'efface. Sans animation quand
/// l'auteur a réduit les mouvements — il paraît, et s'efface.
private struct ComposerCaptureFocusRing: View {
    let reduceMotion: Bool

    static let diameter: CGFloat = 72
    @State private var settled = false

    var body: some View {
        Circle()
            .stroke(Color.white, lineWidth: 2)
            .frame(width: Self.diameter, height: Self.diameter)
            .shadow(color: .black.opacity(0.45), radius: 3)
            .scaleEffect(settled || reduceMotion ? 1 : 1.35)
            .opacity(settled || reduceMotion ? 1 : 0)
            .onAppear {
                guard !reduceMotion else { return }
                withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) { settled = true }
            }
            .accessibilityHidden(true)
    }
}
