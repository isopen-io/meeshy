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
                CameraPreviewLayer(session: session.camera.session)
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
struct ComposerCaptureChrome: View {
    @ObservedObject var session: ComposerCaptureSession
    let size: ComposerSceneCameraSize
    var offersSizeToggle = true
    var onToggleSize: () -> Void = {}
    let onTap: () -> Void
    let onHold: () -> Void
    let onDisarm: () -> Void
    let onValidateSegments: () -> Void

    var body: some View {
        ZStack {
            Color.clear
                .contentShape(Rectangle())
                .gesture(holdGesture.exclusively(before: TapGesture().onEnded { onTap() }))
                .simultaneousGesture(dragGesture)
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
                case .dismiss: session.dismissDrag = valeur.translation.height
                }
            }
            .onEnded { valeur in
                session.endZoomDrag()
                guard session.holdStartedAt == nil else { return }
                let course = valeur.translation.height
                session.dismissDrag = 0
                guard ComposerCaptureHold.verticalDrag(stage: session.stage) == .dismiss,
                      ComposerSceneCameraFrame.dismisses(translationY: course) else { return }
                HapticFeedback.light()
                onDisarm()
            }
    }
}
