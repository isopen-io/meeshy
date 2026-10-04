import SwiftUI
import MeeshySDK

/// **L'aperçu du viseur — un seul montage de `CameraPreviewLayer` pour les deux
/// présentations** (#9134). La carte en scène et le plein écran le posent à la
/// taille qu'ils choisissent ; il n'en prend aucun doigt : l'appui long qui a
/// armé le viseur est toujours en cours SOUS lui, et c'est sa levée qui décide.
struct ComposerCapturePreview: View {
    @ObservedObject var session: ComposerCaptureSession
    let size: ComposerSceneCameraSize

    var body: some View {
        ZStack {
            Color.black
            switch ComposerSceneCameraSurface.shown(stage: session.stage, permission: session.camera.permission) {
            case .scene:
                EmptyView()
            case .viewfinder:
                CameraPreviewLayer(session: session.camera.session, focusPoints: session.focusPoints)
                    .background(GeometryReader { proxy in
                        Color.clear.adaptiveOnChange(of: proxy.frame(in: .global), initial: true) { _, cadre in
                            session.focusPoints.previewFrame = cadre
                        }
                    })
            case .permissionRefused:
                CameraPermissionPanel()
            }
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
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        ZStack {
            GeometryReader { proxy in
                Color.clear
                    .contentShape(Rectangle())
                    .gesture(holdGesture.exclusively(before:
                        focusGesture(origin: proxy.frame(in: .global).origin)
                            .exclusively(before: TapGesture().onEnded { onTap() })))
                    .simultaneousGesture(dragGesture)
                    .simultaneousGesture(pinchGesture)
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
                onFlashIntensity: { session.setFlashIntensity($0) },
                onShutterTouched: { session.releaseStaleHold() })
        }
        .offset(y: ComposerSceneCameraFrame.dismissOffset(translationY: session.dismissDrag))
        .opacity(ComposerSceneCameraFrame.dismissOpacity(translationY: session.dismissDrag))
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
                case .dismiss: session.dismissDrag = session.pinchSpoilsDismiss ? 0 : valeur.translation.height
                }
            }
            .onEnded { valeur in
                session.endZoomDrag()
                guard session.holdStartedAt == nil else { return }
                let course = valeur.translation.height
                session.dismissDrag = 0
                guard ComposerCaptureHold.verticalDrag(stage: session.stage) == .dismiss,
                      !session.pinchSpoilsDismiss,
                      ComposerSceneCameraFrame.dismisses(translationY: course) else { return }
                HapticFeedback.light()
                onDisarm()
            }
    }

    /// **Pincer zoome l'objectif** (#9295), dans les deux montages.
    private var pinchGesture: some Gesture {
        MagnificationGesture()
            .onChanged { echelle in session.pinchZoom(scale: echelle) }
            .onEnded { _ in session.endPinchZoom() }
    }

    /// **Deux touchers visent** (#9295) : le point part dans le repère global,
    /// celui où l'aperçu mesure son cadre ; l'anneau se pose dans celui de la
    /// nappe. Le toucher simple attend que le double échoue — c'est le prix
    /// d'un même vide qui photographie et qui vise.
    private func focusGesture(origin: CGPoint) -> some Gesture {
        SpatialTapGesture(count: 2, coordinateSpace: .global).onEnded { toucher in
            guard session.focus(atGlobalPoint: toucher.location) else { return }
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
