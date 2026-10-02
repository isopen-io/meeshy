import SwiftUI
import Combine
import AVFoundation
import os
import MeeshySDK
import MeeshyUI

@MainActor
final class CameraModel: NSObject, ObservableObject {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    nonisolated(unsafe) let session = AVCaptureSession()
    var capturedPhoto: UIImage?
    /// Les octets tels que l'appareil les a produits — EXIF compris. `nil`
    /// tant qu'aucune photo n'a été prise.
    var capturedPhotoData: Data?
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

    private let photoOutput = AVCapturePhotoOutput()
    private let videoOutput = AVCaptureMovieFileOutput()
    /// #8695 — le traitement UNIQUE de toute prise photo de l'app : chaque
    /// consommateur (conversation, fil, composer, story) reçoit la photo déjà
    /// redressée, bornée et améliorée, EXIF compris.
    nonisolated let photoProcessor: any PhotoCaptureProcessorProviding

    init(photoProcessor: any PhotoCaptureProcessorProviding = PhotoCaptureProcessor.shared) {
        self.photoProcessor = photoProcessor
        super.init()
    }
    /// Publiée : le sol blanc du flash avant (#8653) suit l'objectif actif.
    @Published private(set) var currentPosition: AVCaptureDevice.Position = .back
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
        currentPosition = position
        zoomFactor = device.videoZoomFactor
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
        // Même exception ObjC que l'enregistrement sans connexion active, donc
        // même prévention devant l'appel — un `do/catch` ne la rattraperait pas.
        let connection = photoOutput.connection(with: .video)
        guard CameraRecordingReadiness.mayCapturePhoto(
            sessionIsRunning: session.isRunning,
            hasVideoConnection: connection != nil,
            connectionIsActive: connection?.isActive ?? false,
            connectionIsEnabled: connection?.isEnabled ?? false
        ) else { return }
        let settings = AVCapturePhotoSettings()
        if photoOutput.supportedFlashModes.contains(flash) {
            settings.flashMode = flash
        }
        isTakingPhoto = true
        photoOutput.capturePhoto(with: settings, delegate: self)
    }

    /// **La session peut-elle rendre une image ?** Les mêmes quatre faits que
    /// `takePhoto` exige — lus ici pour qu'un geste qui OUVRE la caméra et
    /// PREND dans le même mouvement (#8653) attende qu'elle le puisse.
    var isCaptureReady: Bool {
        let connection = photoOutput.connection(with: .video)
        return CameraRecordingReadiness.mayCapturePhoto(
            sessionIsRunning: session.isRunning,
            hasVideoConnection: connection != nil,
            connectionIsActive: connection?.isActive ?? false,
            connectionIsEnabled: connection?.isEnabled ?? false)
    }

    /// Attend que la session soit prête, au plus `timeout`. `false` ⇒ elle ne
    /// l'a pas été (permission refusée, simulateur sans caméra, tâche annulée).
    func waitUntilCaptureReady(timeout: TimeInterval) async -> Bool {
        let limite = Date().addingTimeInterval(timeout)
        while !isCaptureReady {
            guard !Task.isCancelled, Date() < limite else { return false }
            try? await Task.sleep(nanoseconds: 50_000_000)
        }
        return !Task.isCancelled
    }

    /// **La torche de l'objectif actif** (#8653) — la lumière d'une VIDÉO, que
    /// `flashMode` n'éclaire pas. Sans lampe, ou sur un mode refusé, rien ne
    /// change : l'objectif avant n'en a pas, c'est l'écran qui l'éclaire.
    ///
    /// `level` vient du curseur d'intensité (#8671) : une torche ALLUMÉE prend
    /// la puissance demandée, bornée à ce que l'appareil sert (une torche
    /// chaude en sert moins).
    func setTorch(_ mode: AVCaptureDevice.TorchMode, level: Double = ComposerFlashIntensity.defaultLevel) {
        guard let device = activeVideoDevice,
              device.hasTorch, device.isTorchModeSupported(mode)
        else { return }
        do {
            try device.lockForConfiguration()
            defer { device.unlockForConfiguration() }
            if mode == .on {
                try device.setTorchModeOn(level: ComposerFlashIntensity.torchLevel(
                    level, maxAvailable: AVCaptureDevice.maxAvailableTorchLevel))
            } else if device.torchMode != mode {
                device.torchMode = mode
            }
        } catch {
            Logger.media.error("Torch configuration failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    private var activeVideoDevice: AVCaptureDevice? {
        session.inputs
            .compactMap { ($0 as? AVCaptureDeviceInput)?.device }
            .first { $0.hasMediaType(.video) }
    }

    /// **Le cadrage de l'objectif actif** (#8671) — publié pour le badge du
    /// viseur, remis à 1 à chaque changement d'objectif.
    @Published private(set) var zoomFactor: CGFloat = 1

    /// Ce que l'objectif sert. Sans objectif (simulateur), `1...1` : le geste
    /// de zoom n'y a aucun effet.
    var zoomRange: ClosedRange<CGFloat> {
        guard let device = activeVideoDevice else { return 1...1 }
        return ComposerCaptureZoom.range(deviceMin: device.minAvailableVideoZoomFactor,
                                         deviceMax: device.maxAvailableVideoZoomFactor)
    }

    /// Affectation directe sous `lockForConfiguration` : le doigt pilote déjà
    /// la progressivité, une rampe ajouterait un retard au geste.
    func setZoom(_ factor: CGFloat) {
        let plage = zoomRange
        let borne = min(plage.upperBound, max(plage.lowerBound, factor))
        guard let device = activeVideoDevice, borne != device.videoZoomFactor else { return }
        do {
            try device.lockForConfiguration()
            device.videoZoomFactor = borne
            device.unlockForConfiguration()
            zoomFactor = borne
        } catch {
            Logger.media.error("Zoom configuration failed: \(error.localizedDescription, privacy: .public)")
        }
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
            endRecordingWithoutOutput()
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
        guard let original = photo.fileDataRepresentation() else {
            Task { @MainActor in self.isTakingPhoto = false }
            return
        }
        let processed = photoProcessor.process(encoded: original, settings: .capture)
        let data = processed?.data ?? original
        guard let image = processed.map({ UIImage(cgImage: $0.image) }) ?? UIImage(data: original) else {
            Task { @MainActor in self.isTakingPhoto = false }
            return
        }
        Task { @MainActor in
            self.isTakingPhoto = false
            self.capturedPhoto = image
            // Les octets TRAITÉS, publiés à côté de l'image : ils portent
            // l'EXIF de la prise, qu'une `UIImage` ne rend pas.
            self.capturedPhotoData = data
            self.capturedPhotoId = UUID().uuidString
        }
        // Persist the processed encoded bytes (HEIC/JPEG, EXIF kept), not a
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
