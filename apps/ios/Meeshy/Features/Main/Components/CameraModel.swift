import SwiftUI
import Combine
import AVFoundation
import os
import QuartzCore
import MeeshySDK
import MeeshyUI

@MainActor
final class CameraModel: NSObject, ObservableObject, ComposerCaptureCameraProviding {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {
        // Un modèle libéré sans `stop()` ne laisse pas son guet de la scène
        // inscrit au centre de notifications (#9295).
        if let subjectAreaObserver { NotificationCenter.default.removeObserver(subjectAreaObserver) }
    }
    nonisolated(unsafe) let session = AVCaptureSession()
    var capturedPhoto: UIImage?
    /// Les octets tels que l'appareil les a produits — EXIF compris. `nil`
    /// tant qu'aucune photo n'a été prise.
    var capturedPhotoData: Data?
    var capturedVideoURL: URL?
    /// L'enregistrement du BRUT de la dernière prise, posé AVANT son identifiant (#9351) —
    /// `nil` quand `CaptureSavePolicy` ne l'enregistre pas (défaut, #9684).
    var librarySave: Task<Bool, Never>?
    /// Le jeton de la prise, de son départ à sa LIVRAISON — chaque fichier porte
    /// le sien (`segmentTokens`) : `capturedVideoId` à l'arrivée, `abandonedRecordingId` sans fichier.
    private(set) var recordingId: String?
    private(set) var segmentTokens: [URL: String] = [:]
    /// L'arrêt est demandé, le fichier pas encore livré : `isRecordingVideo` reste vrai jusqu'au délégué.
    private(set) var stopIsRequested = false
    @Published var abandonedRecordingId: String?
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

    /// Les sorties se branchent sur la file de la session (`sessionQueue`) ;
    /// le fil principal n'en lit que les connexions.
    nonisolated(unsafe) private let photoOutput = AVCapturePhotoOutput()
    nonisolated(unsafe) private let videoOutput = AVCaptureMovieFileOutput()
    /// Les trames de l'objectif pour le look en direct (#9329) — guettées, mais
    /// gardées seulement quand un look est choisi.
    nonisolated(unsafe) private let frameOutput = AVCaptureVideoDataOutput()
    /// **La file UNIQUE de la session** (#9464) : configuration, lancement et
    /// arrêt, dans l'ordre. Ce qu'elle installe est publié ensuite ici.
    nonisolated let sessionQueue = ComposerCaptureSessionQueue()
    /// L'entrée de l'autre objectif, prête avant la bascule (#9753).
    nonisolated let preparedInputs = ComposerCameraPreparedInputs<AVCaptureDeviceInput>()
    nonisolated let liveFeed = ComposerCameraFeed()
    #if DEBUG
    /// La caméra de recette (#9351) — `nil` hors simulateur ou sans `-MeeshyCaptureFixture`.
    let fixture: ComposerCaptureFixtureDriver?
    #endif

    /// La capture tourne-t-elle sur la caméra de recette ? Elle ne touche alors
    /// ni la session ni sa file : ses trames vont droit au guetteur.
    var runsFixture: Bool {
        #if DEBUG
        return fixture != nil
        #else
        return false
        #endif
    }
    /// #8695 — le traitement UNIQUE de toute prise photo de l'app : chaque
    /// consommateur (conversation, fil, composer, story) reçoit la photo déjà
    /// redressée, bornée et améliorée, EXIF compris.
    nonisolated let photoProcessor: any PhotoCaptureProcessorProviding

    init(photoProcessor: any PhotoCaptureProcessorProviding = PhotoCaptureProcessor.shared) {
        self.photoProcessor = photoProcessor
        #if DEBUG
        fixture = ComposerCaptureFixture.isActive() ? ComposerCaptureFixtureDriver() : nil
        #endif
        super.init()
    }

    #if DEBUG
    /// La caméra de recette imposée — pour les témoins, qui ne sont pas lancés
    /// avec `-MeeshyCaptureFixture`.
    init(photoProcessor: any PhotoCaptureProcessorProviding = PhotoCaptureProcessor.shared,
         fixture: ComposerCaptureFixtureDriver?) {
        self.photoProcessor = photoProcessor
        self.fixture = fixture
        super.init()
    }
    #endif
    /// Publiée : le sol blanc du flash avant (#8653) suit l'objectif actif.
    @Published private(set) var currentPosition: AVCaptureDevice.Position = .back
    /// Une bascule d'objectif est en cours (#9464) : le bouton se tait.
    @Published private(set) var isSwitchingCamera = false
    /// La dernière trame de l'ancien objectif, floutée, qui couvre la bascule.
    @Published private(set) var switchCover: CGImage?
    private var recordingTimer: Timer?
    /// Le guet de la scène après un toucher (#9295) — `nil` hors session.
    /// `nonisolated(unsafe)` : la deinit, non isolée, le retire ; il n'est
    /// écrit que sur le fil principal.
    nonisolated(unsafe) private var subjectAreaObserver: NSObjectProtocol?

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
    /// Ce qui suit une bascule faite PENDANT une prise, prévenu à sa reprise.
    private var switchFollower: (@MainActor @Sendable (AVCaptureDevice.Position) -> Void)?

    /// Seul le jeton de la prise en cours se referme : une fin tardive d'une autre
    /// prise ne libère rien.
    func closeRecordingToken(_ token: String?) {
        guard let token, recordingId == token else { return }
        objectWillChange.send()
        recordingId = nil
        stopIsRequested = false
    }

    /// Une prise jamais livrée (session coupée pendant une bascule) ne bloque pas
    /// le viseur suivant.
    func forgetStaleRecording() {
        guard !isRecordingVideo, let ancienne = recordingId else { return }
        segmentTokens = [:]
        abandonRecording(token: ancienne)
    }

    /// Demande la caméra puis monte la session. Un refus (au prompt ou déjà
    /// enregistré dans TCC) publie `permission = .denied` au lieu de sortir en
    /// silence : la vue rend alors un panneau explicatif plutôt qu'un preview
    /// noir permanent sans le moindre indice.
    ///
    /// Le micro n'est PAS demandé ici — voir `enableAudioCaptureIfNeeded()`.
    func configure() {
        forgetStaleRecording()
        #if DEBUG
        if let fixture {
            permission = .granted
            fixture.start(feeding: liveFeed)
            return
        }
        #endif
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

    /// La configuration se fait sur la file de la session ; l'objectif installé
    /// et le micro reviennent au fil principal, dans l'ordre de la file.
    private func setupSession() {
        let armeLeMicro = CameraAudioArming.armsAtSetup(microphone: AVCaptureDevice.authorizationStatus(for: .audio),
                                                        otherAudioPlaying: AVAudioSession.sharedInstance().isOtherAudioPlaying)
        sessionQueue.perform { [weak self] in
            guard let self else { return }
            self.session.beginConfiguration()
            self.session.sessionPreset = .high
            if self.session.canAddOutput(self.photoOutput) { self.session.addOutput(self.photoOutput) }
            if self.session.canAddOutput(self.videoOutput) { self.session.addOutput(self.videoOutput) }
            self.frameOutput.alwaysDiscardsLateVideoFrames = true
            self.frameOutput.setSampleBufferDelegate(self.liveFeed, queue: self.liveFeed.queue)
            if self.session.canAddOutput(self.frameOutput) { self.session.addOutput(self.frameOutput) }
            let installe = Self.installVideoInput(in: self.session, position: .back, outputs: self.orientedOutputs,
                                                  prepared: self.preparedInputs)
            let micro = armeLeMicro && Self.addAudioInput(to: self.session)
            self.session.commitConfiguration()
            DispatchQueue.main.async {
                MainActor.assumeIsolated {
                    if let installe { self.adopt(installe) }
                    if micro { self.hasAudioInput = true }
                }
            }
        }
        sessionQueue.setRunning(true, session)
        sessionQueue.perform { [weak self] in
            self?.preparedInputs.prepare(.front) { Self.videoInput(position: .front) }
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
        #if DEBUG
        guard fixture == nil else { return }
        #endif
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

        hasAudioInput = await sessionQueue.run { [weak self] in
            guard let self else { return false }
            self.session.beginConfiguration()
            defer { self.session.commitConfiguration() }
            return Self.addAudioInput(to: self.session)
        }
    }

    /// Branche le micro DANS une configuration ouverte par l'appelant, sur la
    /// file de la session. `true` ⇒ la session a son micro.
    nonisolated private static func addAudioInput(to session: AVCaptureSession) -> Bool {
        let present = session.inputs.contains { ($0 as? AVCaptureDeviceInput)?.device.hasMediaType(.audio) == true }
        guard !present else { return true }
        guard let audioDevice = AVCaptureDevice.default(for: .audio) else { return false }
        let audioInput: AVCaptureDeviceInput
        do {
            audioInput = try AVCaptureDeviceInput(device: audioDevice)
        } catch {
            Logger.media.error("Failed to create audio capture input: \(error.localizedDescription, privacy: .public)")
            return false
        }
        guard session.canAddInput(audioInput) else { return false }
        session.addInput(audioInput)
        return true
    }

    /// L'objectif que la file vient d'installer, et ce que le fil principal en publie.
    nonisolated struct InstalledCamera: @unchecked Sendable {
        let device: AVCaptureDevice
        let position: AVCaptureDevice.Position
        let zoomScale: ComposerCaptureZoomScale
    }

    /// **La nouvelle entrée naît AVANT que l'ancienne parte** (#9464) : un
    /// objectif qui ne s'ouvre pas, ou que la session refuse, laisse l'ancien
    /// en place — l'aperçu ne noircit pas et `currentPosition` reste vrai.
    /// Sur la file de la session ; `nil` ⇒ rien n'a changé.
    nonisolated private static func installVideoInput(
        in session: AVCaptureSession, position: AVCaptureDevice.Position,
        outputs: [(AVCaptureOutput, ComposerCaptureMirrorRule.Output)],
        prepared: ComposerCameraPreparedInputs<AVCaptureDeviceInput>
    ) -> InstalledCamera? {
        let ancienne = session.inputs.compactMap { $0 as? AVCaptureDeviceInput }.first { $0.device.hasMediaType(.video) }
        let nouvelle = prepared.take(position) ?? videoInput(position: position)
        let issue = ComposerCameraInputSwap.swap(in: session, replacing: ancienne, with: nouvelle)
        prepared.keep(after: issue, removed: ancienne, at: ancienne?.device.position)
        if let objectif = ComposerCameraInputSwap.orientedPosition(after: issue, new: position,
                                                                   old: ancienne?.device.position) {
            orient(outputs, for: objectif)
        }
        guard issue == .swapped, let device = nouvelle?.device else { return nil }
        let echelle = zoomScale(of: device)
        do {
            try device.lockForConfiguration()
            device.videoZoomFactor = min(device.maxAvailableVideoZoomFactor,
                                         max(device.minAvailableVideoZoomFactor, echelle.opening))
            // La luminosité réglée sur un objectif ne suit pas sur l'autre.
            device.setExposureTargetBias(0, completionHandler: nil)
            device.unlockForConfiguration()
        } catch {
            Logger.media.error("Zoom opening failed: \(error.localizedDescription, privacy: .public)")
        }
        apply(ComposerCaptureFocus.continuous(focusCapabilities(of: device)), to: device)
        return InstalledCamera(device: device, position: position, zoomScale: echelle)
    }

    /// Les sorties dont chaque entrée neuve redresse et miroite la connexion.
    nonisolated private var orientedOutputs: [(AVCaptureOutput, ComposerCaptureMirrorRule.Output)] {
        [(photoOutput, .photo), (videoOutput, .movie), (frameOutput, .frames)]
    }

    /// **Debout, et en miroir à l'avant** (#9464) — à chaque entrée : une
    /// connexion neuve reprend les réglages du système.
    nonisolated private static func orient(_ outputs: [(AVCaptureOutput, ComposerCaptureMirrorRule.Output)],
                                           for position: AVCaptureDevice.Position) {
        for (output, sorte) in outputs {
            guard let connection = output.connection(with: .video) else { continue }
            if ComposerCaptureMirrorRule.rotatesToPortrait(sorte) { standUp(connection) }
            guard connection.isVideoMirroringSupported else { continue }
            connection.automaticallyAdjustsVideoMirroring = false
            connection.isVideoMirrored = ComposerCaptureMirrorRule.mirrors(sorte, position: position)
        }
    }

    nonisolated private static func standUp(_ connection: AVCaptureConnection) {
        if #available(iOS 17.0, *) {
            guard connection.isVideoRotationAngleSupported(ComposerCaptureMirrorRule.portraitAngle) else { return }
            connection.videoRotationAngle = ComposerCaptureMirrorRule.portraitAngle
        } else if connection.isVideoOrientationSupported {
            connection.videoOrientation = .portrait
        }
    }

    /// Ce que l'objectif installé change à l'écran — publié APRÈS le commit.
    private func adopt(_ installe: InstalledCamera) {
        activeVideoDevice = installe.device
        currentPosition = installe.position
        liveFeed.setPosition(installe.position)
        zoomScale = installe.zoomScale
        zoomFactor = 1
        watchSubjectArea(of: installe.device)
    }

    /// Switches the active camera. While recording, this cannot reconfigure the
    /// input in place without losing the capture (see the property doc-comment
    /// on `recordedSegmentURLs`) — it closes the current segment, swaps once
    /// stopped, and reopens a new segment on the new camera. A no-op while a
    /// previous switch is still settling (guards rapid double-taps).
    func switchCamera() {
        switchCamera(then: { _ in })
    }

    /// `then` reçoit l'objectif en place une fois la bascule finie (#9464) —
    /// la machine de capture y rend le zoom et la lumière.
    func switchCamera(then: @escaping @MainActor @Sendable (AVCaptureDevice.Position) -> Void) {
        guard ComposerCameraSwitchRule.mayFlip(isSwitching: isSwitchingCamera), !recordingIsPending else { return }
        guard !isSwitchingCameraDuringRecording else { return }
        isSwitchingCamera = true
        #if DEBUG
        if fixture != nil {
            // La caméra de recette se retourne aussi : le selfie éclairé par
            // l'écran se recette au simulateur (#9566).
            currentPosition = currentPosition == .back ? .front : .back
            endSwitch()
            then(currentPosition)
            return
        }
        #endif
        if isRecordingVideo {
            isSwitchingCameraDuringRecording = true
            pendingSwitchPosition = currentPosition == .back ? .front : .back
            switchFollower = then
            videoOutput.stopRecording()
            return
        }
        performCameraSwitch(to: currentPosition == .back ? .front : .back) { [weak self] in
            guard let self else { return }
            then(self.currentPosition)
        }
    }

    /// La bascule se fait sur la file ; `then` passe sur le fil principal une
    /// fois l'objectif publié.
    private func performCameraSwitch(to position: AVCaptureDevice.Position,
                                     then: @escaping @MainActor @Sendable () -> Void = {}) {
        let debut = CACurrentMediaTime()
        sessionQueue.perform { [weak self] in
            guard let self else { return }
            let couverture = self.liveFeed.holdNextFrame(timeout: ComposerCameraSwitchRule.frameWait)
                .flatMap(ComposerCameraSwitchRule.cover(from:))
                .map(ComposerCameraSwitchRule.Cover.init(image:))
            if let couverture {
                DispatchQueue.main.async {
                    MainActor.assumeIsolated { self.switchCover = couverture.image }
                }
            }
            let installe = Self.installVideoInput(in: self.session, position: position, outputs: self.orientedOutputs,
                                                  prepared: self.preparedInputs)
            DispatchQueue.main.async {
                MainActor.assumeIsolated {
                    if let installe { self.adopt(installe) }
                    let duree = ComposerCameraSwitchTiming.milliseconds(from: debut, to: CACurrentMediaTime())
                    Logger.media.info("camera switch to \(position == .front ? "front" : "back", privacy: .public): \(duree) ms")
                    self.endSwitch()
                    then()
                }
            }
        }
        HapticFeedback.light()
    }

    /// La couverture reste le temps que le nouvel objectif serve, puis s'efface.
    private func endSwitch() {
        Task { @MainActor [weak self] in
            try? await Task.sleep(nanoseconds: UInt64(ComposerCameraSwitchRule.coverHold * 1_000_000_000))
            self?.switchCover = nil
            self?.isSwitchingCamera = false
        }
    }

    func takePhoto(flash: AVCaptureDevice.FlashMode) {
        #if DEBUG
        if let fixture {
            if !isSwitchingCamera { deliverFixturePhoto(fixture) }
            return
        }
        #endif
        // Même exception ObjC que l'enregistrement sans connexion active, donc
        // même prévention devant l'appel — un `do/catch` ne la rattraperait pas.
        let connection = photoOutput.connection(with: .video)
        guard !isSwitchingCamera, CameraRecordingReadiness.mayCapturePhoto(
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
    /// PREND dans le même mouvement (#8653) attende qu'elle le puisse. Jamais
    /// pendant une bascule : l'entrée en place va être retirée (#9464).
    var isCaptureReady: Bool {
        #if DEBUG
        if fixture != nil { return !isSwitchingCamera }
        #endif
        let connection = photoOutput.connection(with: .video)
        return !isSwitchingCamera && CameraRecordingReadiness.mayCapturePhoto(
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

    /// L'objectif en place, tel que la file l'a installé.
    private var activeVideoDevice: AVCaptureDevice?

    /// **Le cadrage de l'objectif actif** (#8671) — publié pour le badge du
    /// viseur en facteur AFFICHÉ (#9350), remis à ×1 à chaque changement d'objectif.
    @Published private(set) var zoomFactor: CGFloat = 1

    /// L'échelle entre le facteur de l'appareil et celui qu'on lit (#9350).
    private(set) var zoomScale = ComposerCaptureZoomScale(base: 1)

    /// **La caméra virtuelle d'abord** (#9350) : triple, double grand-angle,
    /// double, puis l'objectif seul — le premier que l'appareil a.
    nonisolated static func videoDevice(position: AVCaptureDevice.Position) -> AVCaptureDevice? {
        let types = ComposerCaptureZoomScale.preferredDeviceTypes
        let trouves = AVCaptureDevice.DiscoverySession(deviceTypes: types, mediaType: .video,
                                                       position: position).devices
        return types.lazy.compactMap { type in trouves.first { $0.deviceType == type } }.first
    }

    nonisolated static func videoInput(position: AVCaptureDevice.Position) -> AVCaptureDeviceInput? {
        guard let device = videoDevice(position: position) else { return nil }
        do {
            return try AVCaptureDeviceInput(device: device)
        } catch {
            Logger.media.error("Failed to create video capture input: \(error.localizedDescription, privacy: .public)")
            return nil
        }
    }

    nonisolated static func zoomScale(of device: AVCaptureDevice) -> ComposerCaptureZoomScale {
        ComposerCaptureZoomScale(base: ComposerCaptureZoomScale.base(
            switchOvers: device.virtualDeviceSwitchOverVideoZoomFactors.map { CGFloat(truncating: $0) },
            hasUltraWide: device.constituentDevices.contains { $0.deviceType == .builtInUltraWideCamera }))
    }

    /// Ce que l'objectif sert, en facteur AFFICHÉ. Sans objectif (simulateur),
    /// `1...1` : le geste de zoom n'y a aucun effet.
    var zoomRange: ClosedRange<CGFloat> {
        guard let device = activeVideoDevice else { return 1...1 }
        return zoomScale.displayedRange(deviceMin: device.minAvailableVideoZoomFactor,
                                        deviceMax: device.maxAvailableVideoZoomFactor)
    }

    /// `factor` est un facteur AFFICHÉ ; l'appareil reçoit sa conversion.
    /// Affectation directe sous `lockForConfiguration` : le doigt pilote déjà
    /// la progressivité, une rampe ajouterait un retard au geste.
    func setZoom(_ factor: CGFloat) {
        let plage = zoomRange
        let borne = min(plage.upperBound, max(plage.lowerBound, factor))
        let appareil = zoomScale.device(borne)
        guard let device = activeVideoDevice, appareil != device.videoZoomFactor else { return }
        do {
            try device.lockForConfiguration()
            device.videoZoomFactor = appareil
            device.unlockForConfiguration()
            zoomFactor = borne
        } catch {
            Logger.media.error("Zoom configuration failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    // MARK: - La mise au point (#9295)

    /// **Le toucher vise ce point du capteur** — mise au point et exposition,
    /// une fois ; la scène qui change rend l'objectif au continu. `devicePoint`
    /// est en coordonnées capteur (`0...1`), converties selon l'image affichée
    /// (`ComposerCaptureFocusGeometry`).
    /// `false` ⇒ l'objectif ne règle ni la netteté ni l'exposition sur un point :
    /// rien n'a été visé, et l'écran ne doit pas le prétendre (#9464).
    @discardableResult
    func focus(at devicePoint: CGPoint, smooth: Bool) -> Bool {
        guard let device = activeVideoDevice else { return false }
        let plan = ComposerCaptureFocus.focusing(at: devicePoint, Self.focusCapabilities(of: device), smooth: smooth)
        guard ComposerCaptureFocus.aims(plan) else { return false }
        Self.apply(plan, to: device)
        return true
    }

    private func resumeContinuousFocus() {
        guard let device = activeVideoDevice else { return }
        Self.apply(ComposerCaptureFocus.continuous(Self.focusCapabilities(of: device), smooth: isRecordingVideo),
                   to: device)
    }

    /// **La netteté glisse pendant TOUTE la prise** (#9464) — posée à chaque
    /// segment (le nouvel objectif d'une bascule compris), retirée à la fin.
    private func setSmoothFocus(_ lisse: Bool) {
        guard let device = activeVideoDevice, device.isSmoothAutoFocusSupported else { return }
        do {
            try device.lockForConfiguration()
            device.isSmoothAutoFocusEnabled = lisse
            device.unlockForConfiguration()
        } catch {
            Logger.media.error("Smooth focus failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    nonisolated private static func focusCapabilities(of device: AVCaptureDevice) -> ComposerCaptureFocus.Capabilities {
        ComposerCaptureFocus.Capabilities(
            focusPointOfInterest: device.isFocusPointOfInterestSupported,
            autoFocus: device.isFocusModeSupported(.autoFocus),
            continuousAutoFocus: device.isFocusModeSupported(.continuousAutoFocus),
            exposurePointOfInterest: device.isExposurePointOfInterestSupported,
            autoExpose: device.isExposureModeSupported(.autoExpose),
            continuousAutoExposure: device.isExposureModeSupported(.continuousAutoExposure))
    }

    /// Le POINT se pose AVANT le mode : c'est le changement de mode qui lance
    /// la mesure — l'inverse viserait l'ancien point.
    nonisolated private static func apply(_ plan: ComposerCaptureFocus.Plan, to device: AVCaptureDevice) {
        do {
            try device.lockForConfiguration()
            defer { device.unlockForConfiguration() }
            switch plan.focus {
            case .continuous?:
                if device.isFocusPointOfInterestSupported { device.focusPointOfInterest = ComposerCaptureFocus.center }
                device.focusMode = .continuousAutoFocus
            case .once(let point)?:
                device.focusPointOfInterest = point
                device.focusMode = .autoFocus
            case nil:
                break
            }
            switch plan.exposure {
            case .continuous?:
                if device.isExposurePointOfInterestSupported { device.exposurePointOfInterest = ComposerCaptureFocus.center }
                device.exposureMode = .continuousAutoExposure
            case .once(let point)?:
                device.exposurePointOfInterest = point
                device.exposureMode = .autoExpose
            case nil:
                break
            }
            device.isSubjectAreaChangeMonitoringEnabled = plan.watchesSubjectArea
            if device.isSmoothAutoFocusSupported { device.isSmoothAutoFocusEnabled = plan.smoothFocus }
        } catch {
            Logger.media.error("Focus configuration failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    /// Un observateur par objectif : changer d'objectif remplace le guet.
    private func watchSubjectArea(of device: AVCaptureDevice) {
        stopWatchingSubjectArea()
        subjectAreaObserver = NotificationCenter.default.addObserver(
            forName: AVCaptureDevice.subjectAreaDidChangeNotification,
            object: device,
            queue: .main
        ) { [weak self] _ in
            MainActor.assumeIsolated { self?.resumeContinuousFocus() }
        }
    }

    private func stopWatchingSubjectArea() {
        guard let subjectAreaObserver else { return }
        NotificationCenter.default.removeObserver(subjectAreaObserver)
        self.subjectAreaObserver = nil
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
        #if DEBUG
        if fixture != nil {
            guard !isRecordingVideo, !isSwitchingCamera, recordingId == nil else { return }
            recordingDuration = 0
            isRecordingVideo = true
            recordingId = UUID().uuidString
            recordingTimer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in
                Task { @MainActor [weak self] in self?.recordingDuration += 0.5 }
            }
            return
        }
        #endif
        guard recordingId == nil else { return }
        recordedSegmentURLs = []
        isSwitchingCameraDuringRecording = false
        pendingSwitchPosition = nil
        pendingStopRequested = false
        recordingDuration = 0
        // **Le chrono ne part QU'APRÈS le segment.** L'ordre est la moitié de
        // la garde : démarrer le minuteur d'abord ferait courir une durée sur
        // une vidéo que rien n'écrit — un enregistrement fantôme, avec son
        // indicateur rouge et son compteur qui monte.
        recordingId = UUID().uuidString
        guard startSegment() else { return closeRecordingToken(recordingId) }
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
        segmentTokens[tempURL] = recordingId
        videoOutput.startRecording(to: tempURL, recordingDelegate: self)
        isRecordingVideo = true
        setSmoothFocus(true)
        return true
    }

    /// **La sortie d'un enregistrement qui n'écrira rien.**
    ///
    /// Elle est NOMMÉE, et pas repliée dans un `return` muet, parce qu'elle
    /// laisse l'écran dans un état qu'il faut décrire : plus d'indicateur, plus
    /// de chrono, et les segments déjà pris rendus au système de fichiers. Un
    /// refus silencieux garderait `isRecordingVideo` à vrai — l'utilisateur
    /// verrait le point rouge d'une vidéo que personne n'écrit.
    private func endRecordingWithoutOutput(token: String?) {
        isSwitchingCameraDuringRecording = false
        isSwitchingCamera = false
        switchCover = nil
        switchFollower = nil
        isRecordingVideo = false
        setSmoothFocus(false)
        recordingTimer?.invalidate()
        recordingTimer = nil
        for segment in recordedSegmentURLs {
            FileManager.default.removeItemLogging(at: segment,
                                                  context: "discarded recording segment",
                                                  logger: .media)
        }
        recordedSegmentURLs = []
        abandonRecording(token: token)
    }

    /// Ends the recording. If a camera switch is mid-flight, the stop is queued
    /// and honored the instant the new segment opens — otherwise the user's tap
    /// could race the switch and be silently dropped.
    func stopRecording() {
        #if DEBUG
        if let fixture {
            guard isRecordingVideo, !stopIsRequested else { return }
            stopIsRequested = true
            recordingTimer?.invalidate()
            recordingTimer = nil
            deliverFixtureMovie(fixture)
            return
        }
        #endif
        stopIsRequested = recordingId != nil
        guard !isSwitchingCameraDuringRecording else {
            pendingStopRequested = true
            return
        }
        videoOutput.stopRecording()
    }

    func stop() {
        #if DEBUG
        fixture?.stop()
        #endif
        if isRecordingVideo { stopRecording() }
        liveFeed.flush()
        switchCover = nil
        stopWatchingSubjectArea()
        sessionQueue.setRunning(false, session)
    }

    /// Handles every `fileOutput(didFinishRecordingTo:...)` callback — both the
    /// intermediate segment closes from a mid-recording camera switch and the
    /// final stop. See `recordedSegmentURLs`'s doc-comment for the overall design.
    private func handleSegmentFinished(url: URL, error: Error?) async {
        let jeton = segmentTokens.removeValue(forKey: url) ?? recordingId
        guard error == nil else {
            // A genuine recording error (not a deliberate mid-switch stop, which
            // always completes with error == nil) — end cleanly, discard segments.
            endRecordingWithoutOutput(token: jeton)
            return
        }
        recordedSegmentURLs.append(url)

        if isSwitchingCameraDuringRecording {
            // La bascule se fait sur la file de la session : le segment suivant
            // ne s'ouvre qu'une fois le nouvel objectif EN PLACE (#9464).
            guard let position = pendingSwitchPosition else {
                endSwitch()
                resumeRecordingAfterSwitch()
                return
            }
            pendingSwitchPosition = nil
            performCameraSwitch(to: position) { [weak self] in self?.resumeRecordingAfterSwitch() }
            return
        }

        // Final stop.
        await deliverRecording(token: jeton)
    }

    /// Le nouvel objectif est en place : la prise reprend — ou se clôt, si
    /// l'auteur a demandé l'arrêt pendant la bascule.
    private func resumeRecordingAfterSwitch() {
        isSwitchingCameraDuringRecording = false
        let suite = switchFollower
        switchFollower = nil
        suite?(currentPosition)
        if pendingStopRequested {
            pendingStopRequested = false
            let jeton = recordingId
            Task { @MainActor [weak self] in await self?.deliverRecording(token: jeton) }
        } else if !startSegment() {
            // La connexion a disparu PENDANT la bascule — un cas que le
            // changement de caméra rend possible par construction. Sans ce
            // repli, l'enregistrement continuait « en cours » sans sortie.
            endRecordingWithoutOutput(token: recordingId)
        }
    }

    /// La prise est close : les segments se rassemblent et partent.
    private func deliverRecording(token: String?) async {
        isRecordingVideo = false
        setSmoothFocus(false)
        recordingTimer?.invalidate()
        recordingTimer = nil

        let segments = recordedSegmentURLs
        recordedSegmentURLs = []

        guard let finalURL = segments.count > 1 ? await Self.mergeSegments(segments) : segments.first else {
            // Merge failed (or there was nothing to merge) — fail soft to the
            // last recorded segment rather than losing the whole capture.
            if let lastSegment = segments.last {
                capturedVideoURL = lastSegment
                librarySave = CaptureSavePolicy.stored().savesOriginal
                    ? Task { await Self.saveToPhotoLibrary { await PhotoLibraryManager.shared.saveVideo(at: lastSegment) } }
                    : nil
                capturedVideoId = token ?? UUID().uuidString
                return closeRecordingToken(token)
            }
            return abandonRecording(token: token)
        }
        capturedVideoURL = finalURL
        librarySave = CaptureSavePolicy.stored().savesOriginal
            ? Task { await Self.saveToPhotoLibrary { await PhotoLibraryManager.shared.saveVideo(at: finalURL) } }
            : nil
        capturedVideoId = token ?? UUID().uuidString
        closeRecordingToken(token)
        if segments.count > 1 {
            for segment in segments where segment != finalURL {
                FileManager.default.removeItemLogging(at: segment, context: "merged recording segment", logger: .media)
            }
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
    /// **Chaque segment garde l'orientation de SA caméra** (#9464) : des
    /// transformations égales se reportent sur la piste composée (passthrough
    /// intact) ; différentes, chaque segment reçoit son calque debout et la
    /// fusion ré-encode (`CameraSegmentOrientation`).
    ///
    /// Covered by `CameraModelSegmentMergeTests` (empty input), source guards
    /// (`CameraModelSwitchDuringRecordingTests`) and ONE light round-trip of two
    /// tiny synthetic segments (`CameraSegmentOrientationTests`) — kept to a
    /// handful of frames, because heavier synthetic media proved fragile in CI.
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
        // L'orientation de chaque segment — celle de SA caméra (#9464).
        var placements: [CameraSegmentPlacement] = []
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
                    let (natural, transform) = try await assetVideoTrack.load(.naturalSize, .preferredTransform)
                    placements.append(CameraSegmentPlacement(timeRange: CMTimeRange(start: cursor, duration: duration),
                                                             natural: natural, transform: transform))
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
        // Une piste audio restée vide (prise muette) fait échouer l'export.
        if audioTrack.segments.isEmpty { composition.removeTrack(audioTrack) }
        let orientation = CameraSegmentOrientation.uniform(placements)
        if let orientation { videoTrack.preferredTransform = orientation }
        let redressement = orientation == nil
            ? CameraSegmentOrientation.composition(for: videoTrack, placements: placements)
            : nil
        let preset = redressement == nil
            ? CameraSegmentMergePolicy.preset(formats: videoFormats, readableSegmentCount: insertedSegmentCount)
            : AVAssetExportPresetHighestQuality
        guard cursor > .zero,
              let exportSession = AVAssetExportSession(asset: composition, presetName: preset)
        else { return nil }

        let outputURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("video_merged_\(UUID().uuidString).mov")
        exportSession.outputURL = outputURL
        exportSession.outputFileType = .mov
        exportSession.videoComposition = redressement

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
        // Persist the processed encoded bytes AS-IS (HEIC/JPEG, EXIF kept):
        // `saveImage(_ data:)` decodes to a UIImage and loses the EXIF,
        // `saveImageFile` hands Photos the bytes untouched (#9347).
        // `PhotoLibraryManager` is deliberately non-@MainActor so its
        // `performChanges` block runs on Photos' own queue without the
        // executor-isolation SIGTRAP the previous inline save hit.
        // L'original ne rejoint Photos que si le réglage le demande (#9684) :
        // la prise reste dans la session de toute façon.
        let nom = ComposerPhotoEncoding.fileName(for: data, id: UUID().uuidString)
        let enregistrement: Task<Bool, Never>? = CaptureSavePolicy.stored().savesOriginal
            ? Task { await CameraModel.saveToPhotoLibrary { await PhotoLibraryManager.shared.saveImageFile(data, fileName: nom) } }
            : nil
        Task { @MainActor in
            self.isTakingPhoto = false
            self.capturedPhoto = image
            // Les octets TRAITÉS, publiés à côté de l'image : ils portent
            // l'EXIF de la prise, qu'une `UIImage` ne rend pas.
            self.capturedPhotoData = data
            self.librarySave = enregistrement
            self.capturedPhotoId = UUID().uuidString
        }
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
