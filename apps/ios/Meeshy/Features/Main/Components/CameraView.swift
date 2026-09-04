import SwiftUI
import Combine
import AVFoundation
import os
import MeeshySDK
import MeeshyUI

enum CameraResult {
    case photo(UIImage)
    case video(URL)
}

/// **Le mode dans lequel le viseur s'OUVRE** (#4998, directive porteur
/// 2026-09-03 : « assure-toi que la caméra se déclenche bien en mode photo et
/// vidéo sans problème ! »).
///
/// L'écran a toujours su faire les deux — deux onglets, deux déclencheurs, deux
/// sorties — et naissait TOUJOURS en photo. Une porte qui promet un viseur
/// vidéo (`ComposerOpening.videoCameraReady`) ouvrait donc un viseur photo, et
/// rien ne rougissait : les deux modes existent, les deux marchent, c'est
/// l'appariement qui manquait.
///
/// > Déplacer une porte d'un écran à l'autre ne déplace pas ce qu'elle PROMET.
/// > Ici la promesse n'avait même jamais eu de porteur.
/// **`nonisolated` — sinon sa conformance `Equatable` l'est au MainActor.**
///
/// Le fichier compile sous `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor` : sans
/// l'annotation, `==` n'est appelable que depuis le main actor, et toute règle
/// pure qui rend un mode devient intestable — l'erreur tombe alors sur les
/// SITES d'appel (« main actor-isolated conformance … in nonisolated context »),
/// jamais sur la déclaration qui en est la cause.
///
/// > Une isolation se propage vers le HAUT par les appels. Un type de valeur à
/// > deux cas peut ainsi retenir sur le main actor toutes les règles qui le
/// > mentionnent, et l'erreur qu'on lit désigne partout sauf sa source.
nonisolated enum CameraCaptureMode: Equatable, Sendable {
    case photo
    case video
}

struct CameraView: View {
    /// Le mode d'ouverture. `.photo` par défaut — les trois appelants
    /// historiques (conversation, feed, pièces jointes) n'en demandent pas
    /// d'autre, et leur comportement ne bouge pas d'un pixel.
    let initialMode: CameraCaptureMode
    let onCapture: (CameraResult) -> Void
    @Environment(\.dismiss) private var dismiss
    @StateObject private var camera = CameraModel()
    @State private var isVideoMode: Bool
    @State private var flashMode: AVCaptureDevice.FlashMode = .off

    /// **L'état de mode est SEMÉ à la construction, jamais posé dans un
    /// `.onAppear`.** Posé après coup, le premier rendu montrerait l'onglet
    /// Photo puis basculerait sous l'œil — et le déclencheur photo resterait
    /// tappable pendant cette frame.
    init(initialMode: CameraCaptureMode = .photo,
         onCapture: @escaping (CameraResult) -> Void) {
        self.initialMode = initialMode
        self.onCapture = onCapture
        _isVideoMode = State(initialValue: initialMode == .video)
    }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            if camera.permission.needsSettingsRedirect {
                permissionDeniedPanel
            } else {
                CameraPreviewLayer(session: camera.session)
                    .ignoresSafeArea()
            }

            VStack(spacing: 0) {
                topBar
                Spacer()
                if !camera.permission.needsSettingsRedirect {
                    bottomControls
                }
            }

            if camera.isTakingPhoto {
                Color.white.ignoresSafeArea()
                    .opacity(0.3)
                    .animation(.easeOut(duration: 0.15), value: camera.isTakingPhoto)
            }
        }
        .onAppear {
            camera.configure()
            // **Le micro est armé À L'OUVERTURE quand la porte a promis la
            // vidéo**, et pas au premier appui sur le déclencheur : sans ça,
            // l'auteur presse « enregistrer » et attend un prompt d'autorisation
            // pendant que le viseur, lui, montre déjà la scène qu'il voulait
            // filmer. Hors de ce cas, le prompt reste attaché à l'onglet Vidéo —
            // le demander à qui ne prend qu'une photo est ce que le lot
            // précédent a corrigé.
            if initialMode == .video {
                Task { await camera.enableAudioCaptureIfNeeded() }
            }
        }
        .onDisappear { camera.stop() }
        .onReceive(camera.$capturedPhotoId) { id in
            guard id != nil, let image = camera.capturedPhoto else { return }
            onCapture(.photo(image))
            dismiss()
        }
        .onReceive(camera.$capturedVideoId) { id in
            guard id != nil, let url = camera.capturedVideoURL else { return }
            onCapture(.video(url))
            dismiss()
        }
        .statusBarHidden()
    }

    // MARK: - Permission Denied

    /// Remplace le preview quand l'accès caméra est refusé ou restreint.
    /// Avant, `configure()` sortait en silence et l'utilisateur restait devant
    /// un écran noir sans explication ni recours.
    private var permissionDeniedPanel: some View {
        VStack(spacing: 16) {
            Image(systemName: "camera.fill")
                .font(.system(size: 44, weight: .light))
                .foregroundColor(.white.opacity(0.7))

            Text(String(localized: "camera.permission.denied.title",
                        defaultValue: "Accès à la caméra refusé", bundle: .main))
                .font(MeeshyFont.relative(17, weight: .semibold))
                .foregroundColor(.white)

            Text(String(localized: "camera.permission.denied.body",
                        defaultValue: "Autorisez Meeshy à utiliser la caméra pour prendre des photos et des vidéos.",
                        bundle: .main))
                .font(MeeshyFont.relative(14))
                .foregroundColor(.white.opacity(0.7))
                .multilineTextAlignment(.center)

            Button {
                MediaPermissionCoordinator.openSettings()
            } label: {
                Text(String(localized: "camera.permission.openSettings",
                            defaultValue: "Ouvrir les Réglages", bundle: .main))
                    .font(MeeshyFont.relative(15, weight: .semibold))
                    .foregroundColor(.black)
                    .padding(.horizontal, 24)
                    .frame(height: 44)
                    .background(Capsule().fill(.white))
            }
        }
        .padding(.horizontal, 40)
        .accessibilityElement(children: .contain)
    }

    // MARK: - Top Bar

    private var topBar: some View {
        HStack {
            Button { dismiss() } label: {
                Image(systemName: "xmark")
                    // doctrine 82i — glyphe borné par le cadre tap fixe 44×44
                    .font(.system(size: 18, weight: .bold))
                    .foregroundColor(.white)
                    .frame(width: 44, height: 44)
                    .background(Circle().fill(.black.opacity(0.3)))
            }
            .accessibilityLabel(String(localized: "camera.close", defaultValue: "Fermer", bundle: .main))

            Spacer()

            Button { cycleFlash() } label: {
                Image(systemName: flashIcon)
                    // doctrine 82i — glyphe borné par le cadre tap fixe 44×44
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(flashMode == .off ? .white.opacity(0.6) : .yellow)
                    .frame(width: 44, height: 44)
                    .background(Circle().fill(.black.opacity(0.3)))
            }
            .accessibilityLabel(flashAccessibilityLabel)
        }
        .padding(.horizontal, 16)
        .padding(.top, 8)
    }

    // **Le vocabulaire du flash a été EXTRAIT** (#4080) : la barre du viseur en
    // scène sert les mêmes trois positions, et deux cycles écrits séparément
    // auraient divergé au premier réglage. `ComposerCameraFlash` en est le site
    // unique — glyphe, libellé et ordre du cycle.
    private var flashIcon: String { ComposerCameraFlash.symbol(for: flashMode) }

    private var flashAccessibilityLabel: String { ComposerCameraFlash.label(for: flashMode) }

    private func cycleFlash() {
        flashMode = ComposerCameraFlash.next(after: flashMode)
        HapticFeedback.light()
    }

    // MARK: - Bottom Controls

    private var bottomControls: some View {
        VStack(spacing: 20) {
            if camera.isRecordingVideo {
                recordingIndicator
            }

            modeSwitcher

            HStack(spacing: 40) {
                Spacer()

                captureButton

                Button { camera.switchCamera() } label: {
                    Image(systemName: "camera.rotate.fill")
                        // doctrine 82i — glyphe borné par le cadre tap fixe 50×50
                        .font(.system(size: 22))
                        .foregroundColor(.white)
                        .frame(width: 50, height: 50)
                        .background(Circle().fill(.white.opacity(0.15)))
                }
                .accessibilityLabel(String(localized: "camera.switch", defaultValue: "Changer de caméra", bundle: .main))

                Spacer()
            }
        }
        .padding(.bottom, 30)
    }

    private var modeSwitcher: some View {
        HStack(spacing: 24) {
            modeTab(String(localized: "camera.mode.photo", defaultValue: "Photo", bundle: .main), selected: !isVideoMode) {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) { isVideoMode = false }
                HapticFeedback.light()
            }
            modeTab(String(localized: "camera.mode.video", defaultValue: "Vidéo", bundle: .main), selected: isVideoMode) {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) { isVideoMode = true }
                HapticFeedback.light()
                // Le micro est demandé ICI — au moment où le son devient utile —
                // et non à l'ouverture de la caméra.
                Task { await camera.enableAudioCaptureIfNeeded() }
            }
        }
    }

    private func modeTab(_ title: String, selected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(MeeshyFont.relative(14, weight: selected ? .bold : .medium))
                .foregroundColor(selected ? .white : .white.opacity(0.5))
        }
        .accessibilityAddTraits(selected ? [.isSelected] : [])
    }

    @ViewBuilder
    private var captureButton: some View {
        if isVideoMode {
            videoRecordButton
        } else {
            photoButton
        }
    }

    private var photoButton: some View {
        Button {
            camera.takePhoto(flash: flashMode)
            HapticFeedback.medium()
        } label: {
            ZStack {
                Circle()
                    .stroke(.white, lineWidth: 4)
                    .frame(width: 72, height: 72)
                Circle()
                    .fill(.white)
                    .frame(width: 60, height: 60)
            }
        }
        .accessibilityLabel(String(localized: "camera.capture.photo", defaultValue: "Prendre une photo", bundle: .main))
    }

    private var videoRecordButton: some View {
        Button {
            if camera.isRecordingVideo {
                camera.stopRecording()
                HapticFeedback.medium()
            } else {
                // Filet : couvre le cas où l'on arrive en mode Vidéo autrement
                // que par l'onglet (préselection, restauration d'état).
                Task {
                    await camera.enableAudioCaptureIfNeeded()
                    camera.startRecording()
                    HapticFeedback.medium()
                }
            }
        } label: {
            ZStack {
                Circle()
                    .stroke(.white, lineWidth: 4)
                    .frame(width: 72, height: 72)
                if camera.isRecordingVideo {
                    RoundedRectangle(cornerRadius: 6)
                        .fill(MeeshyColors.error)
                        .frame(width: 30, height: 30)
                } else {
                    Circle()
                        .fill(MeeshyColors.error)
                        .frame(width: 60, height: 60)
                }
            }
        }
        .accessibilityLabel(camera.isRecordingVideo
            ? String(localized: "camera.record.stop", defaultValue: "Arrêter l'enregistrement", bundle: .main)
            : String(localized: "camera.record.start", defaultValue: "Démarrer l'enregistrement", bundle: .main))
    }

    private var recordingIndicator: some View {
        HStack(spacing: 8) {
            Circle()
                .fill(MeeshyColors.error)
                .frame(width: 10, height: 10)
            Text(formatDuration(camera.recordingDuration))
                .font(MeeshyFont.relative(16, weight: .semibold, design: .monospaced))
                .foregroundColor(.white)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .background(Capsule().fill(.black.opacity(0.5)))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(String(localized: "camera.recording", defaultValue: "Enregistrement en cours", bundle: .main))
        .accessibilityValue(LocalizedNumber.spokenDuration(seconds: camera.recordingDuration))
        .accessibilityAddTraits(.updatesFrequently)
    }

    private func formatDuration(_ t: TimeInterval) -> String {
        LocalizedNumber.duration(seconds: t)
    }
}

// MARK: - Camera Model

@MainActor
final class CameraModel: NSObject, ObservableObject {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    nonisolated(unsafe) let session = AVCaptureSession()
    var capturedPhoto: UIImage?
    var capturedVideoURL: URL?
    @Published var capturedPhotoId: String?
    @Published var capturedVideoId: String?
    @Published var isTakingPhoto = false
    @Published var isRecordingVideo = false
    @Published var recordingDuration: TimeInterval = 0
    /// État de l'autorisation caméra. `.denied`/`.restricted` fait rendre à la
    /// vue un panneau « Ouvrir les Réglages » au lieu d'un preview noir muet.
    @Published private(set) var permission: MediaPermissionState = .notDetermined

    /// L'entrée audio est ajoutée paresseusement (mode Vidéo), pas au montage
    /// de la session — cf. `enableAudioCaptureIfNeeded()`.
    private var hasAudioInput = false
    private var didAnnounceMicrophoneRefusal = false

    private var photoOutput = AVCapturePhotoOutput()
    private var videoOutput = AVCaptureMovieFileOutput()
    private var currentDevice: AVCaptureDevice?
    private var currentPosition: AVCaptureDevice.Position = .back
    private var recordingTimer: Timer?

    // Camera-switch-mid-recording (bug fix 2026-07-09): `AVCaptureMovieFileOutput`'s
    // active recording connection breaks when its video input is removed, even
    // transiently inside a single beginConfiguration()/commitConfiguration()
    // transaction — swapping cameras used to silently end the recording early
    // (didFinishRecordingTo fires, the view dismisses with a truncated clip).
    // Fix: on a mid-recording switch, cleanly close the current segment, swap
    // cameras once truly stopped, then open a NEW segment on the new camera —
    // the user sees one continuous recording (duration keeps counting, the
    // `isRecordingVideo` indicator never drops). All segments are stitched into
    // one file via `mergeSegments` when the user finally stops.
    private var recordedSegmentURLs: [URL] = []
    private var isSwitchingCameraDuringRecording = false
    private var pendingSwitchPosition: AVCaptureDevice.Position?
    private var pendingStopRequested = false

    /// Demande la caméra puis monte la session. Un refus (au prompt ou déjà
    /// enregistré dans TCC) publie `permission = .denied` au lieu de sortir en
    /// silence : la vue rend alors un panneau explicatif plutôt qu'un preview
    /// noir permanent sans le moindre indice.
    ///
    /// Le micro n'est PAS demandé ici — voir `enableAudioCaptureIfNeeded()`.
    func configure() {
        Task { @MainActor [weak self] in
            let state = await MediaPermissionCoordinator.ensureCamera(announcesRefusal: false)
                ? MediaPermissionState.granted
                : MediaPermissionState.camera
            guard let self else { return }
            self.permission = state
            guard state.isUsable else { return }
            self.setupSession()
        }
    }

    private func setupSession() {
        session.beginConfiguration()
        session.sessionPreset = .high

        addVideoInput(position: .back)

        if session.canAddOutput(photoOutput) { session.addOutput(photoOutput) }
        if session.canAddOutput(videoOutput) { session.addOutput(videoOutput) }

        session.commitConfiguration()

        Task.detached { [weak self] in
            self?.session.startRunning()
        }
    }

    /// Demande le micro et branche l'entrée audio, au premier passage en mode
    /// Vidéo (et défensivement avant un enregistrement).
    ///
    /// Historiquement le micro était demandé dès l'ouverture de la caméra, y
    /// compris pour quelqu'un qui ne prend qu'une photo : un prompt sans motif
    /// visible, que l'utilisateur refuse souvent — définitivement. Il arrive
    /// désormais au moment où le son sert réellement.
    ///
    /// Un refus n'empêche pas de filmer : la capture continue sans piste audio
    /// (`mergeSegments` gère l'absence de piste audio), avec un toast explicatif.
    func enableAudioCaptureIfNeeded() async {
        guard !hasAudioInput else { return }
        guard await MediaPermissionCoordinator.ensureMicrophone(announcesRefusal: false) else {
            guard !didAnnounceMicrophoneRefusal else { return }
            didAnnounceMicrophoneRefusal = true
            FeedbackToastManager.shared.showError(
                String(localized: "camera.microphone.denied",
                       defaultValue: "Micro refusé — la vidéo sera muette. Toucher pour ouvrir les Réglages",
                       bundle: .main)
            ) { MediaPermissionCoordinator.openSettings() }
            return
        }

        guard let audioDevice = AVCaptureDevice.default(for: .audio) else { return }
        let audioInput: AVCaptureDeviceInput
        do {
            audioInput = try AVCaptureDeviceInput(device: audioDevice)
        } catch {
            Logger.media.error("Failed to create audio capture input: \(error.localizedDescription, privacy: .public)")
            return
        }
        session.beginConfiguration()
        if session.canAddInput(audioInput) {
            session.addInput(audioInput)
            hasAudioInput = true
        }
        session.commitConfiguration()
    }

    private func addVideoInput(position: AVCaptureDevice.Position) {
        session.inputs.compactMap { $0 as? AVCaptureDeviceInput }.filter { $0.device.hasMediaType(.video) }
            .forEach { session.removeInput($0) }

        guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: position) else { return }
        let input: AVCaptureDeviceInput
        do {
            input = try AVCaptureDeviceInput(device: device)
        } catch {
            Logger.media.error("Failed to create video capture input: \(error.localizedDescription, privacy: .public)")
            return
        }
        guard session.canAddInput(input) else { return }

        session.addInput(input)
        currentDevice = device
        currentPosition = position
    }

    /// Switches the active camera. While recording, this cannot reconfigure the
    /// input in place without losing the capture (see the property doc-comment
    /// on `recordedSegmentURLs`) — it closes the current segment, swaps once
    /// stopped, and reopens a new segment on the new camera. A no-op while a
    /// previous switch is still settling (guards rapid double-taps).
    func switchCamera() {
        guard !isSwitchingCameraDuringRecording else { return }
        if isRecordingVideo {
            isSwitchingCameraDuringRecording = true
            pendingSwitchPosition = currentPosition == .back ? .front : .back
            videoOutput.stopRecording()
            return
        }
        performCameraSwitch(to: currentPosition == .back ? .front : .back)
    }

    private func performCameraSwitch(to position: AVCaptureDevice.Position) {
        session.beginConfiguration()
        addVideoInput(position: position)
        session.commitConfiguration()
        HapticFeedback.light()
    }

    func takePhoto(flash: AVCaptureDevice.FlashMode) {
        let settings = AVCapturePhotoSettings()
        if photoOutput.supportedFlashModes.contains(flash) {
            settings.flashMode = flash
        }
        isTakingPhoto = true
        photoOutput.capturePhoto(with: settings, delegate: self)
    }

    /// **Peut-on demander un enregistrement à AVFoundation ?** La question est
    /// posée à `CameraRecordingReadiness`, et elle est POSÉE — c'est tout le
    /// lot : `startRecording(to:recordingDelegate:)` lève une exception
    /// Objective-C quand la connexion vidéo manque, et une exception ObjC ne se
    /// rattrape pas en Swift. Il n'y a pas de « gérer l'erreur » ici, seulement
    /// de la prévention.
    private var videoRecordingIsPossible: Bool {
        let connection = videoOutput.connection(with: .video)
        return CameraRecordingReadiness.mayStartRecording(
            sessionIsRunning: session.isRunning,
            hasVideoConnection: connection != nil,
            connectionIsActive: connection?.isActive ?? false,
            connectionIsEnabled: connection?.isEnabled ?? false
        )
    }

    func startRecording() {
        recordedSegmentURLs = []
        isSwitchingCameraDuringRecording = false
        pendingSwitchPosition = nil
        pendingStopRequested = false
        recordingDuration = 0
        // **Le chrono ne part QU'APRÈS le segment.** L'ordre est la moitié de
        // la garde : démarrer le minuteur d'abord ferait courir une durée sur
        // une vidéo que rien n'écrit — un enregistrement fantôme, avec son
        // indicateur rouge et son compteur qui monte.
        guard startSegment() else { return }
        recordingTimer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in
            Task { @MainActor [weak self] in
                self?.recordingDuration += 0.5
            }
        }
    }

    /// Starts (or restarts, after a mid-recording camera switch) recording to a
    /// fresh temp file. Does not touch `recordingDuration`/`recordingTimer` so a
    /// segment restart is invisible to the recording-duration UI.
    ///
    /// **Rend son verdict** : `false` ⇒ AVFoundation n'aurait pas pu écrire, et
    /// l'appelant doit en tenir compte plutôt que de laisser l'écran croire
    /// qu'il filme.
    @discardableResult
    private func startSegment() -> Bool {
        guard videoRecordingIsPossible else {
            Logger.media.error("Video recording refused: no active/enabled capture connection")
            return false
        }
        let tempURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("video_\(UUID().uuidString).mov")
        videoOutput.startRecording(to: tempURL, recordingDelegate: self)
        isRecordingVideo = true
        return true
    }

    /// **La sortie d'un enregistrement qui n'écrira rien.**
    ///
    /// Elle est NOMMÉE, et pas repliée dans un `return` muet, parce qu'elle
    /// laisse l'écran dans un état qu'il faut décrire : plus d'indicateur, plus
    /// de chrono, et les segments déjà pris rendus au système de fichiers. Un
    /// refus silencieux garderait `isRecordingVideo` à vrai — l'utilisateur
    /// verrait le point rouge d'une vidéo que personne n'écrit.
    private func endRecordingWithoutOutput() {
        isSwitchingCameraDuringRecording = false
        isRecordingVideo = false
        recordingTimer?.invalidate()
        recordingTimer = nil
        for segment in recordedSegmentURLs {
            FileManager.default.removeItemLogging(at: segment,
                                                  context: "discarded recording segment",
                                                  logger: .media)
        }
        recordedSegmentURLs = []
    }

    /// Ends the recording. If a camera switch is mid-flight, the stop is queued
    /// and honored the instant the new segment opens — otherwise the user's tap
    /// could race the switch and be silently dropped.
    func stopRecording() {
        guard !isSwitchingCameraDuringRecording else {
            pendingStopRequested = true
            return
        }
        videoOutput.stopRecording()
    }

    func stop() {
        if isRecordingVideo { stopRecording() }
        Task.detached { [weak self] in
            self?.session.stopRunning()
        }
    }

    /// Handles every `fileOutput(didFinishRecordingTo:...)` callback — both the
    /// intermediate segment closes from a mid-recording camera switch and the
    /// final stop. See `recordedSegmentURLs`'s doc-comment for the overall design.
    private func handleSegmentFinished(url: URL, error: Error?) async {
        guard error == nil else {
            // A genuine recording error (not a deliberate mid-switch stop, which
            // always completes with error == nil) — end cleanly, discard segments.
            isSwitchingCameraDuringRecording = false
            isRecordingVideo = false
            recordingTimer?.invalidate()
            recordingTimer = nil
            for segment in recordedSegmentURLs {
                FileManager.default.removeItemLogging(at: segment, context: "discarded recording segment", logger: .media)
            }
            recordedSegmentURLs = []
            return
        }
        recordedSegmentURLs.append(url)

        if isSwitchingCameraDuringRecording {
            isSwitchingCameraDuringRecording = false
            if let position = pendingSwitchPosition {
                performCameraSwitch(to: position)
                pendingSwitchPosition = nil
            }
            if pendingStopRequested {
                pendingStopRequested = false
                videoOutput.stopRecording()
            } else if !startSegment() {
                // La connexion a disparu PENDANT la bascule — un cas que le
                // changement de caméra rend possible par construction. Sans ce
                // repli, l'enregistrement continuait « en cours » sans sortie.
                endRecordingWithoutOutput()
            }
            return
        }

        // Final stop.
        isRecordingVideo = false
        recordingTimer?.invalidate()
        recordingTimer = nil

        let segments = recordedSegmentURLs
        recordedSegmentURLs = []

        guard let finalURL = segments.count > 1 ? await Self.mergeSegments(segments) : segments.first else {
            // Merge failed (or there was nothing to merge) — fail soft to the
            // last recorded segment rather than losing the whole capture.
            if let lastSegment = segments.last {
                capturedVideoURL = lastSegment
                capturedVideoId = UUID().uuidString
                Task { await Self.saveToPhotoLibrary { await PhotoLibraryManager.shared.saveVideo(at: lastSegment) } }
            }
            return
        }
        capturedVideoURL = finalURL
        capturedVideoId = UUID().uuidString
        Task { await Self.saveToPhotoLibrary { await PhotoLibraryManager.shared.saveVideo(at: finalURL) } }
        if segments.count > 1 {
            for segment in segments where segment != finalURL {
                FileManager.default.removeItemLogging(at: segment, context: "merged recording segment", logger: .media)
            }
        }
    }

    /// Enregistre une capture dans l'album Meeshy et **rend le refus visible**.
    /// `PhotoLibraryManager` demande `.addOnly` et renvoie `false` sur refus,
    /// mais les trois appels de ce fichier jetaient ce booléen : une photo prise
    /// puis jamais retrouvée dans Photos, sans un mot. Le média part de toute
    /// façon dans le composer — l'échec de sauvegarde n'est donc pas bloquant.
    nonisolated static func saveToPhotoLibrary(_ save: () async -> Bool) async {
        guard await save() == false else { return }
        let state = PhotoLibraryManager.shared.authorizationState
        await MainActor.run {
            guard state.needsSettingsRedirect else {
                FeedbackToastManager.shared.showError(
                    String(localized: "camera.save.failed",
                           defaultValue: "Impossible d'enregistrer dans Photos", bundle: .main)
                )
                return
            }
            FeedbackToastManager.shared.showError(
                MediaPermissionCoordinator.deniedMessage(for: .photoLibraryAdd)
            ) { MediaPermissionCoordinator.openSettings() }
        }
    }

    /// **Concatène des pistes DÉJÀ ENCODÉES quand elles le permettent** — le
    /// contrat de la vue `4b`, pas une optimisation : « valider concatène des
    /// pistes déjà encodées, ce qui rend la sortie quasi instantanée quelle que
    /// soit la durée ». Le preset est décidé par `CameraSegmentMergePolicy`
    /// d'après les formats RÉELLEMENT lus : passthrough sur des segments
    /// homogènes (le cas nominal — plusieurs `MAINTENIR` sur la même caméra),
    /// ré-encodage quand une bascule de caméra a produit des dimensions
    /// différentes, où le passthrough rendrait `nil` et perdrait la prise.
    ///
    /// Concatenates ordered video segments (each a camera-switch boundary) into
    /// one continuous file via `AVMutableComposition` + export. `nonisolated`
    /// so the composition/export work (CPU-bound, can take a few seconds for
    /// longer recordings) never blocks the main actor.
    ///
    /// Covered by `CameraModelSegmentMergeTests` (the real empty-input fast
    /// path — no AVFoundation asset loading involved) and source-reflection
    /// guards for the rest (`CameraModelSwitchDuringRecordingTests`):
    /// synthesizing throwaway H.264 clips with `AVAssetWriter` purely to
    /// round-trip them back through `AVURLAsset`/`AVAssetExportSession` proved
    /// too fragile in CI (encoder/container edge cases unrelated to this
    /// method's own logic caused spurious failures), so the merge/export
    /// behavior itself is pinned structurally instead of via synthetic media.
    nonisolated static func mergeSegments(_ urls: [URL]) async -> URL? {
        guard !urls.isEmpty else { return nil }
        let composition = AVMutableComposition()
        guard let videoTrack = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid),
              let audioTrack = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)
        else { return nil }

        var cursor = CMTime.zero
        // Les formats des pistes insérées — ce qui décide d'un passthrough
        // (vue 4b : « concatène des pistes DÉJÀ ENCODÉES »). Voir
        // `CameraSegmentMergePolicy`.
        var videoFormats: [SegmentVideoFormat] = []
        var insertedSegmentCount = 0
        for url in urls {
            let asset = AVURLAsset(url: url)
            let duration: CMTime
            do {
                duration = try await asset.load(.duration)
            } catch {
                Logger.media.error("Failed to load duration for a recording segment, skipping it: \(error.localizedDescription, privacy: .public)")
                continue
            }
            guard duration.isValid, duration > .zero else { continue }
            let range = CMTimeRange(start: .zero, duration: duration)
            insertedSegmentCount += 1
            do {
                if let assetVideoTrack = try await asset.loadTracks(withMediaType: .video).first {
                    try videoTrack.insertTimeRange(range, of: assetVideoTrack, at: cursor)
                    if let description = try await assetVideoTrack.load(.formatDescriptions).first {
                        videoFormats.append(SegmentVideoFormat(formatDescription: description))
                    }
                }
            } catch {
                Logger.media.error("Failed to insert the video track of a recording segment: \(error.localizedDescription, privacy: .public)")
            }
            do {
                if let assetAudioTrack = try await asset.loadTracks(withMediaType: .audio).first {
                    try audioTrack.insertTimeRange(range, of: assetAudioTrack, at: cursor)
                }
            } catch {
                Logger.media.error("Failed to insert the audio track of a recording segment: \(error.localizedDescription, privacy: .public)")
            }
            cursor = cursor + duration
        }
        let preset = CameraSegmentMergePolicy.preset(formats: videoFormats,
                                                     readableSegmentCount: insertedSegmentCount)
        guard cursor > .zero,
              let exportSession = AVAssetExportSession(asset: composition, presetName: preset)
        else { return nil }

        let outputURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("video_merged_\(UUID().uuidString).mov")
        exportSession.outputURL = outputURL
        exportSession.outputFileType = .mov

        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            exportSession.exportAsynchronously { continuation.resume() }
        }
        return exportSession.status == .completed ? outputURL : nil
    }
}

// MARK: - Photo Delegate

extension CameraModel: AVCapturePhotoCaptureDelegate {
    nonisolated func photoOutput(_ output: AVCapturePhotoOutput, didFinishProcessingPhoto photo: AVCapturePhoto, error: Error?) {
        guard let data = photo.fileDataRepresentation(), let image = UIImage(data: data) else {
            Task { @MainActor in self.isTakingPhoto = false }
            return
        }
        Task { @MainActor in
            self.isTakingPhoto = false
            self.capturedPhoto = image
            self.capturedPhotoId = UUID().uuidString
        }
        // Persist the ORIGINAL encoded bytes (HEIC/JPEG as captured), not a
        // re-encoded UIImage. `PhotoLibraryManager` is deliberately non-@MainActor
        // so its `performChanges` block runs on Photos' own queue without the
        // executor-isolation SIGTRAP the previous inline save hit.
        Task { await CameraModel.saveToPhotoLibrary { await PhotoLibraryManager.shared.saveImage(data) } }
    }
}

// MARK: - Video Delegate

extension CameraModel: AVCaptureFileOutputRecordingDelegate {
    nonisolated func fileOutput(_ output: AVCaptureFileOutput, didFinishRecordingTo outputFileURL: URL,
                                from connections: [AVCaptureConnection], error: Error?) {
        Task { @MainActor in
            await self.handleSegmentFinished(url: outputFileURL, error: error)
        }
    }
}

// MARK: - Camera Preview

struct CameraPreviewLayer: UIViewRepresentable {
    let session: AVCaptureSession

    func makeUIView(context: Context) -> UIView {
        let view = UIView()
        let previewLayer = AVCaptureVideoPreviewLayer(session: session)
        previewLayer.videoGravity = .resizeAspectFill
        view.layer.addSublayer(previewLayer)
        context.coordinator.previewLayer = previewLayer
        return view
    }

    func updateUIView(_ uiView: UIView, context: Context) {
        Task { @MainActor in
            context.coordinator.previewLayer?.frame = uiView.bounds
        }
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    class Coordinator {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
        var previewLayer: AVCaptureVideoPreviewLayer?
    }
}

// MARK: - Injection dans le composer de story (SDK)

extension View {
    /// Fournit au composer de story (`StoryComposerView`, côté SDK) la fabrique
    /// de CET écran de capture. Même doctrine que `storyLocationPickerProvided`
    /// : `CameraView` pilote une `AVCaptureSession`, gère les permissions et son
    /// écran de refus — de l'orchestration UX produit, donc app-side (SDK
    /// purity). Sans cet appel, l'amorce « Caméra » de la page blanche n'est pas
    /// rendue (une amorce qui ouvre le vide est pire que pas d'amorce).
    ///
    /// La fermeture a DEUX écrivains légitimes : le binding du SDK (posé avant
    /// l'insertion du média) et le `dismiss()` que `CameraView` exécute après
    /// chaque capture. Aucun des deux n'est de trop — le SDK remet aussi le
    /// drapeau à plat dans `resetLocalState()`.
    func storyCameraCaptureProvided() -> some View {
        environment(\.storyCameraCapture, StoryCameraCaptureProvider { onCapture in
            AnyView(CameraView { result in
                switch result {
                case .photo(let image): onCapture(.photo(image))
                case .video(let url):   onCapture(.video(url))
                }
            })
        })
    }
}
