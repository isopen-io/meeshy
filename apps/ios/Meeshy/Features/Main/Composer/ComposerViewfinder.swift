import SwiftUI
import AVFoundation
import MeeshySDK
import MeeshyUI

/// Les règles du viseur servi SEUL, hors d'une scène (#9125).
nonisolated enum ComposerViewfinderRules {

    /// Le mode que la porte a promis (#4998) devient celui que la barre
    /// annonce — jamais un viseur photo sous une porte vidéo.
    static func sceneMode(for mode: CameraCaptureMode) -> ComposerSceneCameraMode {
        switch mode {
        case .photo: return .photo
        case .video: return .video
        }
    }

    /// Le toucher hors des contrôleurs prend la photo (#8711) — viseur armé, et
    /// aucun segment vidéo en attente : une photo posée au milieu d'une prise
    /// en plusieurs segments jetterait ceux-ci.
    static func takesPhotoOnTap(stage: ComposerSceneCameraStage, pendingSegments: Int) -> Bool {
        stage == .armed && pendingSegments == 0
    }

    /// L'appui long hors des contrôleurs filme (#8846), viseur armé.
    static func filmsOnHold(stage: ComposerSceneCameraStage) -> Bool {
        stage == .armed
    }
}

/// **Le viseur du composeur, servi SEUL en plein écran** (#9125).
///
/// > Demande porteur 2026-10-02 : il n'existe plus qu'UNE vue de capture.
///
/// La scène du composeur sert le viseur dans sa carte et le fait grandir en
/// plein écran (`MeeshyComposerHost+Viewfinder`). Les portes qui n'ont PAS de
/// scène — le statut, la page blanche de l'atelier, la citation du fil — le
/// reçoivent ici, directement à sa taille plein écran : même barre
/// (`ComposerSceneCameraBar`), même aperçu (`CameraPreviewLayer`), même panneau
/// de refus, mêmes lois de geste, de cadenas, de zoom et de flash. L'ancienne
/// `CameraView`, qui portait un second chrome et une seconde gestuelle, a quitté
/// le dépôt.
///
/// Ce que la prise rend part par `onCapture` — une photo avec ses octets
/// d'origine, ou la vidéo concaténée de ses segments — puis le viseur se retire.
struct ComposerViewfinder: View {
    let initialMode: CameraCaptureMode
    let onCapture: (CameraResult) -> Void

    @Environment(\.dismiss) private var dismiss
    @StateObject private var camera = CameraModel()
    @State private var stage: ComposerSceneCameraStage = .armed
    @State private var mode: ComposerSceneCameraMode
    @State private var flash: AVCaptureDevice.FlashMode = .off
    @State private var flashIntensity = ComposerFlashIntensity.defaultLevel
    @State private var segments: [ComposerCaptureSegment] = []
    @State private var pendingSegmentDuration: TimeInterval = 0
    @State private var zoomAnchor: ComposerCaptureZoomAnchor?
    @State private var dismissDrag: CGFloat = 0
    @State private var holdStartedAt: Date?
    @State private var holdPhase: ComposerCaptureHold.Phase?
    @State private var lockProgress: Double = 0
    @State private var holdTask: Task<Void, Never>?
    @State private var delivered = false

    /// Le mode est SEMÉ à la construction : posé dans un `.onAppear`, la barre
    /// annoncerait la photo une image avant de basculer.
    init(initialMode: CameraCaptureMode = .photo,
         onCapture: @escaping (CameraResult) -> Void) {
        self.initialMode = initialMode
        self.onCapture = onCapture
        _mode = State(initialValue: ComposerViewfinderRules.sceneMode(for: initialMode))
    }

    var body: some View {
        ZStack {
            preview
                .ignoresSafeArea()
            if refused {
                refusedChrome
            } else {
                chrome
            }
        }
        .background(Color.black.ignoresSafeArea())
        .onAppear {
            camera.configure()
            // La porte qui promet la vidéo arme le micro À L'OUVERTURE : le
            // prompt n'arrive pas sous le doigt qui veut déjà filmer.
            if initialMode == .video {
                Task { await camera.enableAudioCaptureIfNeeded() }
            }
        }
        .onDisappear { abandon() }
        .onReceive(camera.$capturedPhotoId) { id in
            guard id != nil, !delivered, let image = camera.capturedPhoto else { return }
            deliver(.photo(image, data: camera.capturedPhotoData))
        }
        // Une vidéo s'ACCUMULE (#4099) : `✓` concatène et rend.
        .onReceive(camera.$capturedVideoId) { id in
            guard id != nil, !delivered, let url = camera.capturedVideoURL else { return }
            segments.append(ComposerCaptureSegment(url: url, duration: pendingSegmentDuration))
            pendingSegmentDuration = 0
        }
        .statusBarHidden()
    }

    private var refused: Bool {
        ComposerSceneCameraSurface.shown(stage: stage, permission: camera.permission) == .permissionRefused
    }

    private var floorLit: Bool {
        ComposerFrontFlash.lightsFloor(flash: flash, position: camera.currentPosition, stage: stage)
    }

    // MARK: - L'image

    private var preview: some View {
        GeometryReader { proxy in
            let rect = ComposerFrontFlash.previewRect(
                CGRect(origin: .zero, size: proxy.size), size: .fullScreen, floorLit: floorLit)
            ZStack {
                if floorLit { Color(white: ComposerFlashIntensity.floorWhite(flashIntensity)) }
                Group {
                    if refused {
                        CameraPermissionPanel()
                    } else {
                        CameraPreviewLayer(session: camera.session)
                            .allowsHitTesting(false)
                    }
                }
                .frame(width: rect.width, height: rect.height)
                .clipShape(RoundedRectangle(
                    cornerRadius: ComposerSceneCameraFrame.radius(for: .fullScreen),
                    style: .continuous))
                .position(x: rect.midX, y: rect.midY)
            }
        }
        .offset(y: ComposerSceneCameraFrame.dismissOffset(translationY: dismissDrag))
        .opacity(ComposerSceneCameraFrame.dismissOpacity(translationY: dismissDrag))
    }

    // MARK: - Le chrome

    private var chrome: some View {
        ZStack {
            Color.clear
                .contentShape(Rectangle())
                .gesture(holdGesture.exclusively(before: TapGesture().onEnded { tapAnywhere() }))
                .simultaneousGesture(dragGesture)
            ComposerSceneCameraBar(
                stage: stage,
                mode: mode,
                onPhoto: { takePhoto() },
                onStartFilming: { startFilming() },
                onLock: { lockTake() },
                onCloseTake: { closeTake() },
                flashMode: flash,
                onCycleFlash: { flash = ComposerCameraFlash.next(after: flash) },
                onFlipCamera: { camera.switchCamera() },
                onDisarm: { close() },
                size: .fullScreen,
                onToggleSize: {},
                offersSizeToggle: false,
                segments: segments,
                onDropLastSegment: { dropLastSegment() },
                onValidateSegments: { validateSegments() },
                liveDuration: camera.recordingDuration,
                capture: ComposerSceneCameraBar.Capture(
                    holding: holdStartedAt != nil,
                    lockProgress: lockProgress,
                    locked: holdPhase == .locked || mode == ComposerShutterGesture.mode(locked: true),
                    zoomFactor: camera.zoomFactor,
                    flashIntensity: flashIntensity),
                onZoomDrag: { dragZoom(translationY: $0) },
                onZoomDragEnded: { zoomAnchor = nil },
                onZoomStep: { up in
                    camera.setZoom(ComposerCaptureZoom.stepped(camera.zoomFactor, up: up, range: camera.zoomRange))
                },
                onFlashIntensity: { setFlashIntensity($0) },
                onShutterTouched: { if holdStartedAt != nil { endHold() } })
        }
        .offset(y: ComposerSceneCameraFrame.dismissOffset(translationY: dismissDrag))
        .opacity(ComposerSceneCameraFrame.dismissOpacity(translationY: dismissDrag))
    }

    /// Accès refusé : le panneau explique et ouvre les Réglages ; la croix
    /// reste, quitter à tout moment (#8653).
    private var refusedChrome: some View {
        VStack {
            HStack {
                Spacer()
                Button { close() } label: {
                    Image(systemName: "xmark")
                        .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                        .foregroundStyle(.white)
                        .frame(width: MeeshyControlSize.tapTarget, height: MeeshyControlSize.tapTarget)
                        .adaptiveGlass(in: Circle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(ComposerSceneCameraCopy.disarmLabel)
            }
            Spacer()
        }
        .padding(.horizontal, MeeshySpacing.mdPlus)
        .padding(.top, MeeshySpacing.md)
    }

    // MARK: - Les gestes hors des contrôleurs

    private var holdGesture: some Gesture {
        LongPressGesture(minimumDuration: ComposerSceneQuickCapture.armedHoldDuration)
            .sequenced(before: DragGesture(minimumDistance: 0))
            .onChanged { valeur in
                guard case .second(true, _) = valeur else { return }
                startHold()
            }
            .onEnded { _ in endHold() }
    }

    /// Pendant la tenue, le glissé est celui de la prise — à droite le
    /// cadenas, à la verticale le zoom ; hors prise, vers le bas il range le
    /// viseur, progressif et annulable.
    private var dragGesture: some Gesture {
        DragGesture(minimumDistance: 12)
            .onChanged { valeur in
                if holdStartedAt != nil {
                    holdChanged(CGPoint(x: valeur.translation.width, y: valeur.translation.height))
                    return
                }
                switch ComposerCaptureHold.verticalDrag(stage: stage) {
                case .zoom: dragZoom(translationY: valeur.translation.height)
                case .dismiss: dismissDrag = valeur.translation.height
                }
            }
            .onEnded { valeur in
                zoomAnchor = nil
                guard holdStartedAt == nil else { return }
                let course = valeur.translation.height
                dismissDrag = 0
                guard ComposerCaptureHold.verticalDrag(stage: stage) == .dismiss,
                      ComposerSceneCameraFrame.dismisses(translationY: course) else { return }
                HapticFeedback.light()
                close()
            }
    }

    private func tapAnywhere() {
        guard ComposerViewfinderRules.takesPhotoOnTap(stage: stage, pendingSegments: segments.count) else { return }
        holdTask?.cancel()
        holdTask = Task { @MainActor in
            guard await camera.waitUntilCaptureReady(timeout: ComposerSceneQuickCapture.readinessTimeout),
                  !Task.isCancelled else { return }
            takePhoto()
        }
    }

    private func startHold() {
        guard holdStartedAt == nil, ComposerViewfinderRules.filmsOnHold(stage: stage) else { return }
        HapticFeedback.medium()
        holdStartedAt = Date()
        holdPhase = .holding
        lockProgress = 0
        holdTask?.cancel()
        holdTask = Task { @MainActor in
            guard await camera.waitUntilCaptureReady(timeout: ComposerSceneQuickCapture.readinessTimeout),
                  !Task.isCancelled,
                  holdStartedAt != nil || holdPhase == .locked else { return }
            startFilming()
        }
    }

    private func holdChanged(_ translation: CGPoint) {
        guard holdStartedAt != nil else { return }
        if stage == .recording { dragZoom(translationY: translation.y) }
        guard holdPhase != .locked else { return }
        lockProgress = ComposerShutterGesture.lockProgress(translationX: translation.x)
        guard ComposerCaptureHold.phase(translation: translation, wasLocked: false) == .locked else { return }
        holdPhase = .locked
        lockProgress = 1
        HapticFeedback.medium()
        UIAccessibility.post(notification: .announcement, argument: ComposerSceneCameraCopy.lockedAnnouncement)
        lockTake()
    }

    /// La levée décide, selon la loi du cadenas (`ComposerCaptureHold.release`).
    private func endHold() {
        zoomAnchor = nil
        guard holdStartedAt != nil else {
            holdTask?.cancel()
            holdTask = nil
            return
        }
        holdStartedAt = nil
        switch ComposerCaptureHold.release(isRecording: stage == .recording, phase: holdPhase ?? .holding) {
        case .closeTake:
            resetHold()
            closeTake()
        case .keepFilming:
            break
        case .cancelPending:
            resetHold()
        }
    }

    private func resetHold() {
        holdTask?.cancel()
        holdTask = nil
        holdPhase = nil
        lockProgress = 0
    }

    // MARK: - La prise

    private func takePhoto() {
        guard stage == .armed, !camera.isTakingPhoto else { return }
        mode = .photo
        HapticFeedback.medium()
        let flashDeLaPrise = flash
        guard floorLit else {
            camera.takePhoto(flash: flashDeLaPrise)
            return
        }
        // Objectif avant : l'ÉCRAN est le flash (#8653).
        ComposerScreenFlash.shared.light(level: flashIntensity)
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: UInt64(ComposerFrontFlash.brightnessRamp * 1_000_000_000))
            camera.takePhoto(flash: flashDeLaPrise)
            try? await Task.sleep(nanoseconds: UInt64(ComposerFrontFlash.photoHold * 1_000_000_000))
            ComposerScreenFlash.shared.restore()
        }
    }

    private func startFilming() {
        guard stage == .armed else { return }
        mode = ComposerShutterGesture.mode(locked: holdPhase == .locked)
        stage = .recording
        camera.setTorch(ComposerFrontFlash.torch(flash: flash, position: camera.currentPosition),
                        level: flashIntensity)
        if floorLit { ComposerScreenFlash.shared.light(level: flashIntensity) }
        Task { @MainActor in
            await camera.enableAudioCaptureIfNeeded()
            camera.startRecording()
        }
    }

    private func lockTake() {
        guard stage == .recording else { return }
        mode = ComposerShutterGesture.mode(locked: true)
    }

    /// La durée est saisie AVANT l'arrêt : le fichier n'arrive qu'après, et
    /// l'horloge du modèle repart à zéro au démarrage suivant.
    private func closeTake() {
        guard stage == .recording else { return }
        stage = .armed
        holdPhase = nil
        lockProgress = 0
        zoomAnchor = nil
        pendingSegmentDuration = camera.recordingDuration
        camera.stopRecording()
        extinguishFlash()
        HapticFeedback.medium()
    }

    private func dropLastSegment() {
        let (gardés, orphelin) = ComposerCaptureSegments.droppingLast(segments)
        segments = gardés
        if let orphelin {
            FileManager.default.removeItemLogging(
                at: orphelin, context: "segment de prise retiré par l'auteur", logger: .media)
        }
        HapticFeedback.light()
    }

    /// `✓` concatène et rend. Un segment unique EST le fichier final ; une
    /// concaténation qui échoue retombe sur le dernier segment plutôt que de
    /// perdre la prise.
    private func validateSegments() {
        let pris = segments
        guard ComposerCaptureSegments.canValidate(pris) else { return }
        segments = []
        Task { @MainActor in
            let finale = ComposerCaptureSegments.needsMerge(pris)
                ? await CameraModel.mergeSegments(pris.map(\.url))
                : pris.first?.url
            guard let url = finale ?? pris.last?.url else { return }
            deliver(.video(url))
        }
    }

    private func dragZoom(translationY: CGFloat) {
        guard ComposerCaptureHold.verticalDrag(stage: stage) == .zoom else { return }
        let ancre = zoomAnchor ?? ComposerCaptureZoomAnchor(factor: camera.zoomFactor, translationY: translationY)
        zoomAnchor = ancre
        camera.setZoom(ComposerCaptureZoom.factor(
            from: ancre.factor, translationY: translationY - ancre.translationY, range: camera.zoomRange))
    }

    private func setFlashIntensity(_ level: Double) {
        flashIntensity = ComposerFlashIntensity.clamped(level)
        ComposerScreenFlash.shared.adjust(level: flashIntensity)
        guard stage == .recording, camera.currentPosition == .back else { return }
        camera.setTorch(ComposerFrontFlash.torch(flash: flash, position: .back), level: flashIntensity)
    }

    private func extinguishFlash() {
        camera.setTorch(.off)
        ComposerScreenFlash.shared.restore()
    }

    // MARK: - La sortie

    private func deliver(_ result: CameraResult) {
        delivered = true
        stage = ComposerSceneCamera.stageAfterCapture
        extinguishFlash()
        camera.stop()
        HapticFeedback.success()
        onCapture(result)
        dismiss()
    }

    private func close() {
        dismiss()
    }

    /// Quitter sans rendre emporte les segments abandonnés ET leurs fichiers,
    /// éteint la lumière et coupe la session — quel que soit le chemin de
    /// sortie (croix, glissé, fermeture par l'hôte).
    private func abandon() {
        resetHold()
        extinguishFlash()
        camera.stop()
        guard !delivered else { return }
        for segment in segments {
            FileManager.default.removeItemLogging(
                at: segment.url, context: "segment de prise abandonné", logger: .media)
        }
        segments = []
        pendingSegmentDuration = 0
    }
}
