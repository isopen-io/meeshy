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
        // inscrit au centre de notifications.
        if let subjectAreaObserver { NotificationCenter.default.removeObserver(subjectAreaObserver) }
        sessionObservers.forEach { NotificationCenter.default.removeObserver($0) }
    }
    /// Le guet de la santé de la session — `CameraModel+Recovery`.
    nonisolated(unsafe) var sessionObservers: [NSObjectProtocol] = []
    /// Le rang de la dernière entrée vidéo posée : la couche d'aperçu
    /// ne règle sa connexion qu'à ce changement, jamais à chaque passe.
    @Published private(set) var inputEpoch = 0
    nonisolated(unsafe) let session = AVCaptureSession()
    var capturedPhoto: UIImage?
    /// Les octets tels que l'appareil les a produits — EXIF compris. `nil`
    /// tant qu'aucune photo n'a été prise.
    var capturedPhotoData: Data?
    var capturedVideoURL: URL?
    /// L'enregistrement du BRUT de la dernière prise, posé AVANT son identifiant —
    /// `nil` quand `CaptureSavePolicy` ne l'enregistre pas (défaut).
    var librarySave: Task<Bool, Never>?
    /// Réglages › Médias « enregistrer l'original », lu par l'hôte (sa politique
    /// injectée) ; sans hôte, le réglage stocké.
    var savesOriginalSetting: (@MainActor () -> Bool)?

    /// Le brut de TOUTE prise rejoint Photos si Réglages › Médias le demande, hors
    /// cadre compris : la loi fixe un défaut, le réglage prime
    /// (`CaptureSaveLaw.destination(for:savesOriginal:)`).
    func savesOriginal() -> Bool {
        savesOriginalSetting?() ?? CaptureSavePolicy.stored().savesOriginal
    }
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
    /// Les trames de l'objectif pour le look en direct — guettées, mais
    /// gardées seulement quand un look est choisi.
    nonisolated(unsafe) private let frameOutput = AVCaptureVideoDataOutput()
    /// **La file UNIQUE de la session** : configuration, lancement et
    /// arrêt, dans l'ordre. Ce qu'elle installe est publié ensuite ici.
    nonisolated let sessionQueue = ComposerCaptureSessionQueue()
    /// L'entrée de l'autre objectif, prête avant la bascule.
    nonisolated let preparedInputs = ComposerCameraPreparedInputs<AVCaptureDeviceInput>()
    nonisolated let liveFeed = ComposerCameraFeed()
    /// Le vœu de la couche d'aperçu, que la bascule applique dans sa transaction.
    nonisolated let previewMirroring = ComposerPreviewMirroring()
    /// La session est configurée (ou en cours de l'être sur sa file) : on ne la
    /// refait pas.
    private(set) var sessionIsPrepared = false
    /// De l'armement à la première trame, relevé dans la console.
    nonisolated let firstFrameClock = ComposerCameraFirstFrameClock()
    #if DEBUG
    /// La caméra de recette — `nil` hors simulateur ou sans `-MeeshyCaptureFixture`.
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
    /// Le traitement UNIQUE de toute prise photo de l'app : chaque
    /// consommateur (conversation, fil, composer, story) reçoit la photo déjà
    /// redressée, bornée et améliorée, EXIF compris.
    nonisolated let photoProcessor: any PhotoCaptureProcessorProviding
    /// La session audio d'un enregistrement : posée par la loi, plus
    /// par la capture elle-même.
    let recordingSession: MeeshyRecordingSession = .shared
    /// La dernière remise de session demandée : un viseur qui revient avant
    /// qu'elle ne s'exécute l'annule.
    private var sessionHandBackGeneration = 0

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
    /// Publiée : le sol blanc du flash avant suit l'objectif actif.
    @Published private(set) var currentPosition: AVCaptureDevice.Position = .back
    /// Une bascule d'objectif est en cours : le bouton se tait.
    @Published private(set) var isSwitchingCamera = false
    /// La dernière trame de l'ancien objectif, floutée, qui couvre la bascule.
    @Published private(set) var switchCover: CGImage?
    /// La bascule en cours : une couverture peinte après la sienne ne se pose pas.
    private var switchGeneration = 0
    private var recordingTimer: Timer?
    /// Le guet de la scène après un toucher — `nil` hors session.
    /// `nonisolated(unsafe)` : la deinit, non isolée, le retire ; il n'est
    /// écrit que sur le fil principal.
    nonisolated(unsafe) private var subjectAreaObserver: NSObjectProtocol?

    // Camera-switch-mid-recording: `AVCaptureMovieFileOutput`'s
    // active recording connection breaks when its video input is removed, even
    // transiently inside a single beginConfiguration()/commitConfiguration()
    // transaction — swapping cameras in place would silently end the recording early
    // (didFinishRecordingTo fires, the view dismisses with a truncated clip).
    // So on a mid-recording switch, cleanly close the current segment, swap
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

    /// **La session se prépare AVANT d'être montrée**, pour armer la caméra
    /// vite : le composer qui s'ouvre sur un
    /// format qui filme la configure déjà — sorties, objectif, connexions —
    /// sans la lancer : aucun voyant caméra ne s'allume tant qu'on ne vise pas,
    /// et l'armement n'a plus qu'à la démarrer. Seulement si l'accès est DÉJÀ
    /// accordé : préparer ne demande jamais rien.
    func prewarm() {
        guard !runsFixture, AVCaptureDevice.authorizationStatus(for: .video) == .authorized else { return }
        prepareSession()
    }

    /// Arme, puis lance : la configuration n'est faite qu'UNE fois par modèle —
    /// un ré-armement ne retire ni ne repose rien, il garde l'objectif
    /// choisi et démarre. Le micro déjà autorisé entre avant le lancement.
    private func setupSession() {
        let prechauffee = sessionIsPrepared
        prepareSession()
        reclaimRecordingSessionIfArmed()
        armMicrophoneAtSetup()
        firstFrameClock.start(prewarmed: prechauffee)
        sessionQueue.setRunning(true, session)
    }

    /// La configuration se fait sur la file de la session ; l'objectif installé
    /// revient au fil principal, dans l'ordre de la file.
    private func prepareSession() {
        observeSessionHealth()
        guard !sessionIsPrepared else { return }
        sessionIsPrepared = true
        liveFeed.watchFirstFrame { [firstFrameClock] in _ = firstFrameClock.report() }
        sessionQueue.perform { [weak self] in
            guard let self else { return }
            self.session.beginConfiguration()
            // La capture ne reconfigure pas la session audio à sa guise : sa
            // configuration automatique couperait les sons de Meeshy.
            // `RecordingSessionLaw` la pose — non mélangeable, un son Meeshy
            // qui joue baisse au lancement de la prise et remonte à la fin.
            self.session.automaticallyConfiguresApplicationAudioSession = false
            if self.session.sessionPreset != .high { self.session.sessionPreset = .high }
            if self.session.canAddOutput(self.photoOutput) { self.session.addOutput(self.photoOutput) }
            if self.session.canAddOutput(self.videoOutput) { self.session.addOutput(self.videoOutput) }
            self.frameOutput.alwaysDiscardsLateVideoFrames = true
            self.frameOutput.setSampleBufferDelegate(self.liveFeed, queue: self.liveFeed.queue)
            if self.session.canAddOutput(self.frameOutput) { self.session.addOutput(self.frameOutput) }
            let installe = CameraInputInstaller.installVideoInput(in: self.session, position: .back, outputs: self.orientedOutputs,
                                                  prepared: self.preparedInputs,
                                                  previewWanted: self.previewMirroring.isWanted)
            self.session.commitConfiguration()
            DispatchQueue.main.async {
                MainActor.assumeIsolated {
                    if let installe { self.adopt(installe) }
                    self.inputEpoch += 1
                }
            }
            self.preparedInputs.prepare(.front) { CameraInputInstaller.videoInput(position: .front) }
        }
    }

    /// Le micro déjà autorisé entre dans la session ARRÊTÉE, jamais
    /// pendant qu'une musique joue ; décidé à l'armement, pas à la préparation.
    private func armMicrophoneAtSetup() {
        guard !hasAudioInput, CameraAudioArming.armsAtSetup(
            microphone: AVCaptureDevice.authorizationStatus(for: .audio),
            otherAudioPlaying: AVAudioSession.sharedInstance().isOtherAudioPlaying) else { return }
        recordingSession.prepare(.video)
        sessionQueue.perform { [weak self] in
            guard let self else { return }
            self.session.beginConfiguration()
            let micro = Self.addAudioInput(to: self.session)
            self.session.commitConfiguration()
            guard micro else { return }
            DispatchQueue.main.async { MainActor.assumeIsolated { self.hasAudioInput = true } }
        }
    }

    /// Demande le micro et branche l'entrée audio, au premier passage en mode
    /// Vidéo (et défensivement avant un enregistrement).
    ///
    /// Le micro n'est pas demandé dès l'ouverture de la caméra, y compris pour
    /// quelqu'un qui ne prend qu'une photo : un prompt sans motif visible, que
    /// l'utilisateur refuse souvent — définitivement. Il arrive au moment où le
    /// son sert réellement.
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

        prepareRecordingSessionUnlessMusicPlays()
        hasAudioInput = await sessionQueue.run { [weak self] in
            guard let self else { return false }
            self.session.beginConfiguration()
            defer { self.session.commitConfiguration() }
            return Self.addAudioInput(to: self.session)
        }
    }

    /// Le micro entre dans la capture : la session devient capable
    /// d'enregistrer AVANT que l'entrée n'y tourne — sauf si une
    /// musique joue, que seule la prise interrompra (`CameraAudioArming`).
    private func prepareRecordingSessionUnlessMusicPlays() {
        guard !AVAudioSession.sharedInstance().isOtherAudioPlaying else { return }
        recordingSession.prepare(.video)
    }

    /// Le viseur revient avec son micro déjà branché : la session
    /// redevient celle d'un enregistrement, et une remise encore en file
    /// s'efface.
    func reclaimRecordingSessionIfArmed() {
        sessionHandBackGeneration &+= 1
        guard hasAudioInput else { return }
        prepareRecordingSessionUnlessMusicPlays()
    }

    /// Le viseur se ferme ou se suspend : le son Meeshy baissé
    /// remonte tout de suite ; la session, elle, ne se rend qu'une fois la
    /// capture ARRÊTÉE sur sa file — une désactivation sous une entrée audio
    /// qui tourne échoue, et la musique des autres apps ne reprendrait pas.
    func handBackRecordingSession() {
        recordingSession.finish(handingBackSession: false)
        guard !runsFixture else { return }
        sessionHandBackGeneration &+= 1
        let generation = sessionHandBackGeneration
        sessionQueue.perform { [weak self] in
            guard let self else { return }
            DispatchQueue.main.async {
                MainActor.assumeIsolated {
                    guard self.sessionHandBackGeneration == generation else { return }
                    self.recordingSession.handBack()
                }
            }
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

    /// Les sorties dont chaque entrée neuve redresse et miroite la connexion.
    nonisolated private var orientedOutputs: [(AVCaptureOutput, ComposerCaptureMirrorRule.Output)] {
        [(photoOutput, .photo), (videoOutput, .movie), (frameOutput, .frames)]
    }

    /// Ce que l'objectif installé change à l'écran — publié APRÈS le commit.
    private func adopt(_ installe: CameraInputInstaller.InstalledCamera) {
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

    /// `then` reçoit l'objectif en place une fois la bascule finie —
    /// la machine de capture y rend le zoom et la lumière.
    func switchCamera(then: @escaping @MainActor @Sendable (AVCaptureDevice.Position) -> Void) {
        guard ComposerCameraSwitchRule.mayFlip(isSwitching: isSwitchingCamera), !recordingIsPending else { return }
        guard !isSwitchingCameraDuringRecording else { return }
        isSwitchingCamera = true
        #if DEBUG
        if fixture != nil {
            // La caméra de recette se retourne aussi : le selfie éclairé par
            // l'écran se recette au simulateur.
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
    /// fois l'objectif publié. La trame de couverture est celle déjà retenue,
    /// et son flou se peint À CÔTÉ de la bascule, jamais devant elle.
    private func performCameraSwitch(to position: AVCaptureDevice.Position,
                                     then: @escaping @MainActor @Sendable () -> Void = {}) {
        let debut = CACurrentMediaTime()
        switchGeneration += 1
        let generation = switchGeneration
        let quitte = currentPosition
        sessionQueue.perform { [weak self] in
            guard let self else { return }
            let file = CACurrentMediaTime()
            let trame = ComposerCameraSwitchRule.coverFrame(latest: self.liveFeed.latestImage()) {
                self.liveFeed.holdNextFrame(timeout: ComposerCameraSwitchRule.frameWait)
            }
            let couverte = CACurrentMediaTime()
            if let trame {
                self.paintCover(ComposerCameraSwitchRule.Frame(image: trame), generation: generation, leaving: quitte)
            }
            let installe = CameraInputInstaller.installVideoInput(in: self.session, position: position, outputs: self.orientedOutputs,
                                                  prepared: self.preparedInputs,
                                                  previewWanted: self.previewMirroring.isWanted)
            let posee = CACurrentMediaTime()
            DispatchQueue.main.async {
                MainActor.assumeIsolated {
                    if let installe { self.adopt(installe) }
                    self.inputEpoch += 1
                    func ms(_ a: CFTimeInterval, _ b: CFTimeInterval) -> Int {
                        ComposerCameraSwitchTiming.milliseconds(from: a, to: b)
                    }
                    let fin = CACurrentMediaTime()
                    let validee = installe?.committedAt ?? posee
                    let phases = ComposerCameraSwitchPhases(queue: ms(debut, file), frame: ms(file, couverte),
                                                            commit: ms(couverte, validee), settle: ms(validee, posee),
                                                            main: ms(posee, fin))
                    let rapport = ComposerCameraSwitchTiming.report(to: position, total: ms(debut, fin), phases: phases)
                    Logger.media.info("\(rapport, privacy: .public)")
                    self.endSwitch()
                    then()
                }
            }
        }
        HapticFeedback.light()
    }

    /// Le flou de la couverture, hors de la file de la session ; il ne se pose
    /// que si sa bascule dure encore et que l'ancien objectif est toujours là.
    nonisolated private func paintCover(_ trame: ComposerCameraSwitchRule.Frame, generation: Int,
                                        leaving ancien: AVCaptureDevice.Position) {
        DispatchQueue.global(qos: .userInteractive).async { [weak self] in
            guard let self, let couverture = ComposerCameraSwitchRule.cover(from: trame.image)
                .map(ComposerCameraSwitchRule.Cover.init(image:)) else { return }
            DispatchQueue.main.async {
                MainActor.assumeIsolated {
                    guard self.isSwitchingCamera, self.switchGeneration == generation,
                          self.currentPosition == ancien else { return }
                    self.switchCover = couverture.image
                }
            }
        }
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
    /// PREND dans le même mouvement attende qu'elle le puisse. Jamais
    /// pendant une bascule : l'entrée en place va être retirée.
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

    /// **La torche de l'objectif actif** — la lumière d'une VIDÉO, que
    /// `flashMode` n'éclaire pas. Sans lampe, ou sur un mode refusé, rien ne
    /// change : l'objectif avant n'en a pas, c'est l'écran qui l'éclaire.
    ///
    /// `level` vient du curseur d'intensité : une torche ALLUMÉE prend
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

    /// **Le cadrage de l'objectif actif** — publié pour le badge du
    /// viseur en facteur AFFICHÉ, remis à ×1 à chaque changement d'objectif.
    @Published private(set) var zoomFactor: CGFloat = 1

    /// L'échelle entre le facteur de l'appareil et celui qu'on lit.
    private(set) var zoomScale = ComposerCaptureZoomScale(base: 1)

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

    // MARK: - La mise au point

    /// **Le toucher vise ce point du capteur** — mise au point et exposition,
    /// une fois ; la scène qui change rend l'objectif au continu. `devicePoint`
    /// est en coordonnées capteur (`0...1`), converties selon l'image affichée
    /// (`ComposerCaptureFocusGeometry`).
    /// `false` ⇒ l'objectif ne règle ni la netteté ni l'exposition sur un point :
    /// rien n'a été visé, et l'écran ne doit pas le prétendre.
    @discardableResult
    func focus(at devicePoint: CGPoint, smooth: Bool) -> Bool {
        guard let device = activeVideoDevice else { return false }
        return CameraFocusControl.aim(at: devicePoint, smooth: smooth, on: device)
    }

    private func resumeContinuousFocus() {
        guard let device = activeVideoDevice else { return }
        CameraFocusControl.resumeContinuous(on: device, smooth: isRecordingVideo)
    }

    /// **La netteté glisse pendant TOUTE la prise** — posée à chaque
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
        // Les sons extérieurs s'arrêtent, le son Meeshy qui joue BAISSE sans
        // s'arrêter. Refusé pendant un appel : la prise se fait sous
        // la session de l'appel.
        recordingSession.begin(.video)
        guard startSegment() else {
            recordingSession.finish(handingBackSession: false)
            return closeRecordingToken(recordingId)
        }
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
        recordingSession.finish(handingBackSession: false)
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
        handBackRecordingSession()
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
            // ne s'ouvre qu'une fois le nouvel objectif EN PLACE.
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
    /// l'auteur a demandé l'arrêt pendant la bascule. Sa connexion peut naître
    /// inactive : la reprise l'attend un instant plutôt que de clore la
    /// prise sur un refus d'une image ; un arrêt demandé entre-temps reste en file.
    private func resumeRecordingAfterSwitch() {
        let suite = switchFollower
        switchFollower = nil
        suite?(currentPosition)
        Task { @MainActor [weak self] in
            let limite = Date().addingTimeInterval(ComposerCameraSwitchRule.segmentResumeWait)
            while let self, !self.videoRecordingIsPossible, !self.pendingStopRequested, Date() < limite {
                try? await Task.sleep(nanoseconds: 30_000_000)
            }
            self?.reopenSegmentAfterSwitch()
        }
    }

    private func reopenSegmentAfterSwitch() {
        isSwitchingCameraDuringRecording = false
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
        recordingSession.finish(handingBackSession: false)
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
                librarySave = savesOriginal()
                    ? Task { await Self.saveToPhotoLibrary { await PhotoLibraryManager.shared.saveVideo(at: lastSegment) } }
                    : nil
                capturedVideoId = token ?? UUID().uuidString
                return closeRecordingToken(token)
            }
            return abandonRecording(token: token)
        }
        capturedVideoURL = finalURL
        librarySave = savesOriginal()
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

    /// Façade : l'assemblage vit dans `CameraSegmentMerger`.
    nonisolated static func mergeSegments(_ urls: [URL]) async -> URL? {
        await CameraSegmentMerger.merge(urls)
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
        // `saveImageFile` hands Photos the bytes untouched.
        // `PhotoLibraryManager` is deliberately non-@MainActor so its
        // `performChanges` block runs on Photos' own queue without the
        // executor-isolation SIGTRAP an inline save would hit.
        // L'original ne rejoint Photos que si le réglage le demande,
        // quelle que soit la zone de la prise : la prise reste dans la
        // session de toute façon.
        let nom = ComposerPhotoEncoding.fileName(for: data, id: UUID().uuidString)
        Task { @MainActor in
            self.isTakingPhoto = false
            self.capturedPhoto = image
            // Les octets TRAITÉS, publiés à côté de l'image : ils portent
            // l'EXIF de la prise, qu'une `UIImage` ne rend pas.
            self.capturedPhotoData = data
            self.librarySave = self.savesOriginal()
                ? Task { await CameraModel.saveToPhotoLibrary { await PhotoLibraryManager.shared.saveImageFile(data, fileName: nom) } }
                : nil
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
