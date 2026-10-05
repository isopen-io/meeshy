import SwiftUI
import MeeshySDK

/// **La toile à l'écran** (#9347) : le canevas 9:16, ajusté et centré — la
/// couche système comme la vue Metal s'y posent, donc l'écran montre exactement
/// ce qui part.
nonisolated enum ComposerCaptureCanvas {
    static func fitted(in bounds: CGRect) -> CGRect {
        let toile = ComposerLookPainter.designCanvas
        guard bounds.width > 0, bounds.height > 0 else { return bounds }
        let echelle = min(bounds.width / toile.width, bounds.height / toile.height)
        let taille = CGSize(width: toile.width * echelle, height: toile.height * echelle)
        return CGRect(x: bounds.midX - taille.width / 2, y: bounds.midY - taille.height / 2,
                      width: taille.width, height: taille.height)
    }
}

/// **L'aperçu du viseur — un seul montage de `CameraPreviewLayer` pour les deux
/// présentations** (#9134). La carte en scène et le plein écran le posent à la
/// taille qu'ils choisissent ; il n'en prend aucun doigt : l'appui long qui a
/// armé le viseur est toujours en cours SOUS lui, et c'est sa levée qui décide.
struct ComposerCapturePreview: View {
    @ObservedObject var session: ComposerCaptureSession
    let size: ComposerSceneCameraSize
    /// La vue Metal a présenté sa première image : la couche système peut se
    /// détacher sans laisser un écran noir (#9349).
    @State private var metalHasFrame = false

    private var showsThermalNotice: Bool {
        ComposerCaptureSurfaceRule.showsThermalNotice(look: session.look, budget: session.thermalBudget)
    }

    var body: some View {
        ZStack {
            Color.black
            switch ComposerSceneCameraSurface.shown(stage: session.stage, permission: session.camera.permission) {
            case .scene:
                EmptyView()
            case .viewfinder:
                GeometryReader { exterieur in
                    let toile = ComposerCaptureCanvas.fitted(in: CGRect(origin: .zero, size: exterieur.size))
                    ZStack {
                        CameraPreviewLayer(session: session.camera.session, focusPoints: session.focusPoints,
                                           mirrorsFrames: ComposerCaptureSurfaceRule.mirrorsSystemLayer(
                                               paintsWithMetal: session.paintsWithMetal, metalHasFrame: metalHasFrame))
                            .background(GeometryReader { proxy in
                                Color.clear.adaptiveOnChange(of: proxy.frame(in: .global), initial: true) { _, cadre in
                                    session.focusPoints.previewFrame = cadre
                                }
                            })
                        if session.paintsWithMetal {
                            ComposerLiveLookSurface(look: session.look, person: session.lookPerson,
                                                    date: session.lookDate, framing: .identity,
                                                    source: session.camera.liveFeed,
                                                    fps: session.thermalBudget.previewFPS,
                                                    surfaceScale: session.thermalBudget.surfaceScale,
                                                    onFirstFrame: { metalHasFrame = true })
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
                    .frame(width: toile.width, height: toile.height)
                    .position(x: toile.midX, y: toile.midY)
                }
            case .permissionRefused:
                CameraPermissionPanel()
            }
        }
        .adaptiveOnChange(of: session.paintsWithMetal) { _, peint in
            if !peint { metalHasFrame = false }
        }
        .adaptiveOnChange(of: showsThermalNotice) { _, montree in
            if montree { UIAccessibility.post(notification: .announcement, argument: ComposerCaptureCopy.thermalNotice) }
        }
        .clipShape(RoundedRectangle(cornerRadius: ComposerSceneCameraFrame.radius(for: size), style: .continuous))
        .allowsHitTesting(false)
        .offset(y: ComposerSceneCameraFrame.dismissOffset(translationY: session.dismissDrag))
        .opacity(ComposerSceneCameraFrame.dismissOpacity(translationY: session.dismissDrag))
    }
}

/// **Le chrome du viseur — la nappe de gestes et la barre, câblées une fois**
/// (#9134).
///
/// La nappe ne prend que le vide (les boutons de la barre gagnent sur leurs
/// surfaces) : le toucher et l'appui long y passent par l'hôte, qui sait ce
/// que SON format permet ; le glissé, lui, est celui de la machine — à droite
/// le cadenas et à la verticale le zoom pendant la tenue, vers le bas le
/// rangement du viseur hors prise, PROGRESSIF et ANNULABLE (directive
/// 2026-08-30).
///
/// **Le double toucher fait la mise au point là où il tombe, le pincement
/// zoome** (#9295) — la nappe est celle des DEUX montages, la scène des posts
/// et des stories en profite donc sans câblage de plus.
struct ComposerCaptureChrome: View {
    @ObservedObject var session: ComposerCaptureSession
    let size: ComposerSceneCameraSize
    var offersSizeToggle = true
    var onToggleSize: () -> Void = {}
    let onTap: () -> Void
    let onHold: () -> Void
    let onDisarm: () -> Void
    let onValidateSegments: () -> Void

    /// L'anneau de la dernière mise au point — un état de VUE, pas de la machine.
    @State private var focusMark: ComposerCaptureFocusMark?
    /// Retombe tout seul quand le pincement finit — y compris annulé par le
    /// système, qui n'appelle pas `onEnded`.
    @GestureState private var pinchActive = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        ZStack {
            GeometryReader { proxy in
                Color.clear
                    .contentShape(Rectangle())
                    .gesture(holdGesture.exclusively(before:
                        focusGesture(origin: proxy.frame(in: .global).origin)
                            .exclusively(before: TapGesture().onEnded {
                                guard !session.pinchSpoilsGestures else { return }
                                onTap()
                            })))
                    .simultaneousGesture(dragGesture)
                    .simultaneousGesture(pinchGesture)
                    .adaptiveOnChange(of: pinchActive) { _, actif in
                        guard !actif else { return }
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
            }
            ComposerSceneCameraBar(
                stage: session.stage,
                mode: session.mode ?? .photo,
                onPhoto: { session.takePhoto() },
                onStartFilming: { session.startFilming() },
                onLock: { session.lockTake() },
                onCloseTake: { session.closeTake() },
                flashMode: session.flash,
                onCycleFlash: { session.cycleFlash() },
                onFlipCamera: { session.camera.switchCamera() },
                onDisarm: onDisarm,
                size: size,
                onToggleSize: onToggleSize,
                offersSizeToggle: offersSizeToggle,
                segments: session.segments,
                onDropLastSegment: { session.dropLastSegment() },
                onValidateSegments: onValidateSegments,
                // L'horloge de la prise EN COURS : sans elle, le chrono ne
                // compterait que les segments clos.
                liveDuration: session.camera.recordingDuration,
                capture: session.barCapture,
                onZoomDrag: { session.dragZoom(translationY: $0) },
                onZoomDragEnded: { session.endZoomDrag() },
                onZoomStep: { session.stepZoom(up: $0) },
                onZoomPreset: { session.camera.setZoom($0) },
                onFlashIntensity: { session.setFlashIntensity($0) },
                onShutterTouched: { session.releaseStaleHold() },
                onToggleLooks: session.lookIsLocked ? nil : { toggleLooks() },
                lookActive: !session.look.isUntouched)
            if session.isRenderingLook {
                ProgressView()
                    .progressViewStyle(.circular)
                    .tint(.white)
                    .controlSize(.large)
                    .padding(MeeshySpacing.lg)
                    .adaptiveLiquidGlass(in: Circle())
                    .accessibilityLabel(ComposerLiveLookCopy.rendering)
            }
            if session.looksOpen, !session.lookIsLocked {
                VStack {
                    Spacer(minLength: 0)
                    ComposerLiveLookPanel(session: session)
                        .padding(.horizontal, MeeshySpacing.md)
                        .padding(.bottom, ComposerLiveLookPanelLayout.bottomInset(for: size))
                }
                .transition(reduceMotion ? .opacity : .move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(reduceMotion ? nil : .spring(response: 0.35, dampingFraction: 0.85),
                   value: session.looksOpen && !session.lookIsLocked)
        .offset(y: ComposerSceneCameraFrame.dismissOffset(translationY: session.dismissDrag))
        .opacity(ComposerSceneCameraFrame.dismissOpacity(translationY: session.dismissDrag))
    }

    private func toggleLooks() {
        session.looksOpen.toggle()
        HapticFeedback.light()
    }

    /// L'appui long passe avant le toucher, qui ne prend la photo que si le
    /// doigt part avant le seuil (#8846).
    private var holdGesture: some Gesture {
        LongPressGesture(minimumDuration: ComposerSceneQuickCapture.armedHoldDuration)
            .sequenced(before: DragGesture(minimumDistance: 0))
            .onChanged { valeur in
                guard case .second(true, _) = valeur else { return }
                onHold()
            }
            .onEnded { _ in session.endHold() }
    }

    private var dragGesture: some Gesture {
        DragGesture(minimumDistance: 12)
            .onChanged { valeur in
                if session.holdStartedAt != nil {
                    session.holdChanged(CGPoint(x: valeur.translation.width, y: valeur.translation.height))
                    return
                }
                switch ComposerCaptureHold.verticalDrag(stage: session.stage) {
                case .zoom: session.dragZoom(translationY: valeur.translation.height)
                case .dismiss: session.followDismissDrag(translationY: valeur.translation.height)
                }
            }
            .onEnded { valeur in
                session.endZoomDrag()
                guard session.holdStartedAt == nil else { return }
                guard session.releaseDismissDrag(translationY: valeur.translation.height) else { return }
                HapticFeedback.light()
                onDisarm()
            }
    }

    /// **Pincer zoome l'objectif** (#9295), dans les deux montages.
    private var pinchGesture: some Gesture {
        MagnificationGesture()
            .updating($pinchActive) { _, actif, _ in actif = true }
            .onChanged { echelle in session.pinchZoom(scale: echelle) }
            .onEnded { _ in session.endPinchZoom() }
    }

    /// **Deux touchers visent** (#9295) : le point part dans le repère global,
    /// celui où l'aperçu mesure son cadre ; l'anneau se pose dans celui de la
    /// nappe. Le toucher simple attend que le double échoue — c'est le prix
    /// d'un même vide qui photographie et qui vise.
    private func focusGesture(origin: CGPoint) -> some Gesture {
        SpatialTapGesture(count: 2, coordinateSpace: .global).onEnded { toucher in
            guard !session.pinchSpoilsGestures, session.focus(atGlobalPoint: toucher.location) else { return }
            let marque = ComposerCaptureFocusMark(
                id: UUID(), location: CGPoint(x: toucher.location.x - origin.x, y: toucher.location.y - origin.y))
            focusMark = marque
            Task { @MainActor in
                try? await Task.sleep(nanoseconds: UInt64(ComposerCaptureFocus.markLifetime * 1_000_000_000))
                if focusMark == marque { focusMark = nil }
            }
        }
    }
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
