import SwiftUI
import Combine
import AVFoundation
import os
import QuartzCore
import MeeshySDK
import MeeshyUI

@MainActor
final class CameraModel: NSObject, ObservableObject, ComposerCaptureCameraProviding, CameraWarmable {
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
    /// Un tic par obturateur PARTI (`willCapturePhotoFor`) : le cadre blanchit
    /// à cet instant, jamais à la fin du traitement (#16482).
    @Published private(set) var shutterCount = 0
    /// Un tic par toucher qui photographie : le déclencheur se contracte tout
    /// de suite, avant même que l'objectif ne prenne (#16482).
    @Published private(set) var shutterPresses = 0
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
    nonisolated(unsafe) let videoOutput = AVCaptureMovieFileOutput()
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
    /// L'horizon de l'objectif en service, posé sur la photo au déclenchement.
    let horizon = ComposerCaptureHorizon()
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
    /// La dernière ouverture demandée : fermer l'annule, sinon la réponse de la
    /// permission allumerait l'objectif d'une caméra gardée, sans viseur.
    var openingGeneration = 0
    /// La caméra sort de la garde : un appel a pu écrire format et zoom sur
    /// l'appareil partagé depuis sa remise.
    private var lensWasHandedBack = false
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
    /// Du toucher à l'obturateur, relevé pour la recette sur appareil (#16504).
    nonisolated let shutterClock = ComposerShutterClock()
    private(set) var lastShutterDelay: Int?
    /// Publiée : le sol blanc du flash avant suit l'objectif actif.
    @Published private(set) var currentPosition: AVCaptureDevice.Position = .back
    /// Une bascule d'objectif est en cours : le bouton se tait.
    @Published var isSwitchingCamera = false
    /// La dernière trame de l'ancien objectif, floutée, qui couvre la bascule.
    @Published var switchCover: CGImage?
    /// La bascule en cours : une couverture peinte après la sienne ne se pose pas.
    private var switchGeneration = 0
    var recordingTimer: Timer?
    /// Le guet de la scène après un toucher — `nil` hors session.
    /// `nonisolated(unsafe)` : la deinit, non isolée, le retire ; il n'est
    /// écrit que sur le fil principal.
    nonisolated(unsafe) var subjectAreaObserver: NSObjectProtocol?

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
    var recordedSegmentURLs: [URL] = []
    var isSwitchingCameraDuringRecording = false
    var pendingSwitchPosition: AVCaptureDevice.Position?
    var pendingStopRequested = false
    /// Ce qui suit une bascule faite PENDANT une prise, prévenu à sa reprise.
    var switchFollower: (@MainActor @Sendable (AVCaptureDevice.Position) -> Void)?

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
    func configure(filming: Bool = false) {
        forgetStaleRecording()
        #if DEBUG
        if let fixture {
            permission = .granted
            fixture.start(feeding: liveFeed)
            return
        }
        #endif
        firstFrameClock.start(prewarmed: sessionIsPrepared)
        let ouverture = beginOpening()
        Task { @MainActor [weak self] in
            let state = await MediaPermissionCoordinator.ensureCamera(announcesRefusal: false)
                ? MediaPermissionState.granted
                : MediaPermissionState.camera
            guard let self else { return }
            self.permission = state
            guard state.isUsable, self.openingIsCurrent(ouverture) else { return }
            self.setupSession(filming: filming)
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
        prepareFrontLens()
    }

    /// Arme, puis lance : la configuration n'est faite qu'UNE fois par modèle —
    /// un ré-armement ne retire ni ne repose rien, il garde l'objectif
    /// choisi et démarre. Le micro déjà autorisé entre avant le lancement.
    private func setupSession(filming: Bool) {
        let micro = microphoneArmsAtSetup(filming: filming)
        let prechauffee = sessionIsPrepared
        prepareSession(withMicrophone: micro)
        if lensWasHandedBack {
            lensWasHandedBack = false
            reclaimLensAfterHandBack()
        }
        reclaimRecordingSessionIfArmed()
        armMicrophoneAtSetup(micro, inPreparedSession: prechauffee)
        if let activeVideoDevice { watchSubjectArea(of: activeVideoDevice) }
        sessionQueue.setRunning(true, session)
        prepareFrontLens()
    }

    /// L'autre objectif attend le lancement : bâtir son entrée retarderait la
    /// première trame du viseur (#16504).
    private func prepareFrontLens() {
        sessionQueue.perform { [weak self] in
            self?.preparedInputs.prepare(.front) { CameraInputInstaller.videoInput(position: .front) }
        }
    }

    /// La configuration se fait sur la file de la session ; l'objectif installé
    /// revient au fil principal, dans l'ordre de la file.
    private func prepareSession(withMicrophone micro: Bool = false) {
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
                                                  previewWanted: self.previewMirroring.isWanted,
                                                  photoPlan: { self.adoptLens($0) })
            let audio = micro && Self.addAudioInput(to: self.session)
            self.session.commitConfiguration()
            if let device = installe?.device { CameraPhotoTuning.confirm(self.photoOutput, in: self.session, for: device) }
            DispatchQueue.main.async {
                MainActor.assumeIsolated {
                    if let installe { self.adopt(installe) }
                    if audio { self.hasAudioInput = true }
                    self.inputEpoch += 1
                }
            }
        }
    }

    /// Le micro déjà autorisé entre dans la session ARRÊTÉE, jamais
    /// pendant qu'une musique joue ; décidé à l'armement, pas à la préparation.
    /// Une ouverture en photo le retire s'il reste de la prise précédente.
    private func microphoneArmsAtSetup(filming: Bool) -> Bool {
        guard filming else {
            disarmMicrophoneForPhoto()
            return false
        }
        guard !hasAudioInput else { return false }
        return CameraAudioArming.armsAtSetup(
            microphone: AVCaptureDevice.authorizationStatus(for: .audio),
            otherAudioPlaying: AVAudioSession.sharedInstance().isOtherAudioPlaying, filming: filming)
    }

    /// Une session neuve a reçu son micro dans sa transaction initiale ; une
    /// session déjà préparée le reçoit à part, toujours avant son lancement.
    private func armMicrophoneAtSetup(_ micro: Bool, inPreparedSession prechauffee: Bool) {
        guard micro else { return }
        recordingSession.prepare(.video)
        guard prechauffee else { return }
        sessionQueue.perform { [weak self] in
            guard let self else { return }
            self.session.beginConfiguration()
            let audio = Self.addAudioInput(to: self.session)
            self.session.commitConfiguration()
            guard audio else { return }
            DispatchQueue.main.async { MainActor.assumeIsolated { self.hasAudioInput = true } }
        }
    }

    private func disarmMicrophoneForPhoto() {
        guard hasAudioInput else { return }
        hasAudioInput = false
        sessionQueue.perform { [weak self] in
            guard let self else { return }
            self.session.beginConfiguration()
            self.session.inputs.compactMap { $0 as? AVCaptureDeviceInput }
                .filter { $0.device.hasMediaType(.audio) }
                .forEach(self.session.removeInput)
            self.session.commitConfiguration()
        }
    }

    /// **La caméra revient comme neuve pour le viseur suivant** (#16504) : aucune
    /// prise du précédent, pas de micro, objectif arrière à ×1. La session reste
    /// arrêtée et le travail se fait sur sa file, hors du chemin de l'ouverture.
    func rewindForNewHolder() {
        cancelOpening()
        lensWasHandedBack = true
        capturedPhoto = nil
        capturedPhotoData = nil
        capturedVideoURL = nil
        capturedPhotoId = nil
        capturedVideoId = nil
        abandonedRecordingId = nil
        librarySave = nil
        disarmMicrophoneForPhoto()
        #if DEBUG
        guard fixture == nil else {
            currentPosition = .back
            liveFeed.setPosition(.back)
            return
        }
        #endif
        guard sessionIsPrepared else { return }
        zoomFactor = 1
        let derriere = currentPosition == .back
        sessionQueue.perform { [weak self] in
            guard let self else { return }
            guard !derriere else { return CameraInputInstaller.reopenLens(in: self.session) }
            let installe = self.swapLens(to: .back)
            DispatchQueue.main.async { MainActor.assumeIsolated { self.publishLens(installe) } }
        }
    }

    /// **La caméra gardée reprend son objectif** (#16504). Un appel sur le même
    /// appareil écrit `activeFormat` et `videoZoomFactor` : la session passe en
    /// `.inputPriority` et garderait son format, et l'affichage dirait ×1 sur un
    /// autre cadrage. Sur la file de la session, avant le lancement.
    func reclaimLensAfterHandBack() {
        sessionQueue.perform { [weak self] in
            guard let self else { return }
            if self.session.sessionPreset != .high, self.session.canSetSessionPreset(.high) {
                self.session.beginConfiguration()
                self.session.sessionPreset = .high
                self.session.commitConfiguration()
                let entree = self.session.inputs.compactMap { $0 as? AVCaptureDeviceInput }.first { $0.device.hasMediaType(.video) }
                if let device = entree?.device { CameraPhotoTuning.confirm(self.photoOutput, in: self.session, for: device) }
            }
            CameraInputInstaller.reopenLens(in: self.session)
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
        horizon.follow(installe.device)
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

    /// Sur la file de la session : l'objectif change, son plan de photo avec lui.
    nonisolated private func swapLens(to position: AVCaptureDevice.Position) -> CameraInputInstaller.InstalledCamera? {
        let installe = CameraInputInstaller.installVideoInput(in: session, position: position, outputs: orientedOutputs,
                                                  prepared: preparedInputs,
                                                  previewWanted: previewMirroring.isWanted,
                                                  photoPlan: { self.adoptLens($0) })
        if let device = installe?.device { CameraPhotoTuning.confirm(photoOutput, in: session, for: device) }
        return installe
    }

    /// Ce que reçoit chaque objectif installé, dans sa transaction : le plan
    /// photo, et les curseurs du bouton Camera Control (OPUS-9).
    nonisolated private func adoptLens(_ device: AVCaptureDevice) {
        CameraPhotoTuning.adopt(for: device, on: photoOutput)
        CameraSystemControlsHost.install(in: session, for: device) { [weak self] facteur in
            guard let self else { return }
            self.zoomFactor = self.zoomScale.displayed(facteur)
        }
    }

    private func publishLens(_ installe: CameraInputInstaller.InstalledCamera?) {
        if let installe { adopt(installe) }
        self.inputEpoch += 1
    }

    /// La bascule se fait sur la file ; `then` passe sur le fil principal une
    /// fois l'objectif publié. La trame de couverture est celle déjà retenue,
    /// et son flou se peint À CÔTÉ de la bascule, jamais devant elle.
    func performCameraSwitch(to position: AVCaptureDevice.Position,
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
            let installe = self.swapLens(to: position)
            let posee = CACurrentMediaTime()
            DispatchQueue.main.async {
                MainActor.assumeIsolated {
                    self.publishLens(installe)
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
    func endSwitch() {
        Task { @MainActor [weak self] in
            guard await cancellableSleep(for: .seconds(ComposerCameraSwitchRule.coverHold)) else { return }
            self?.switchCover = nil
            self?.isSwitchingCamera = false
        }
    }

    func takePhoto(flash: AVCaptureDevice.FlashMode) {
        #if DEBUG
        if let fixture {
            guard !isSwitchingCamera else { return }
            noteShutterFired()
            deliverFixturePhoto(fixture)
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
        let settings = CameraPhotoTuning.settings(
            flash: flash, supportedFlashModes: photoOutput.supportedFlashModes,
            outputMaxPhotoDimensions: CameraPhotoDimensions(photoOutput.maxPhotoDimensions),
            formatMaxPhotoDimensions: photoOutput.sourceMaxPhotoDimensions)
        horizon.level(connection)
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
            guard await cancellableSleep(for: .milliseconds(50)) else { return false }
        }
        return !Task.isCancelled
    }

    /// L'objectif en place, tel que la file l'a installé.
    private(set) var activeVideoDevice: AVCaptureDevice?

    /// **Le cadrage de l'objectif actif** — publié pour le badge du
    /// viseur en facteur AFFICHÉ, remis à ×1 à chaque changement d'objectif.
    @Published var zoomFactor: CGFloat = 1

    /// L'échelle entre le facteur de l'appareil et celui qu'on lit.
    private(set) var zoomScale = ComposerCaptureZoomScale(base: 1)

    func stop() {
        cancelOpening()
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
}

// MARK: - Photo Delegate

extension CameraModel: AVCapturePhotoCaptureDelegate {
    /// **L'obturateur part** : le retour visuel suit cet instant, pas la photo
    /// traitée qui arrive ensuite (#16482).
    nonisolated func photoOutput(_ output: AVCapturePhotoOutput, willCapturePhotoFor resolvedSettings: AVCaptureResolvedPhotoSettings) {
        DispatchQueue.main.async { MainActor.assumeIsolated { self.noteShutterFired() } }
    }

    /// **Le toucher est entendu** : le bouton se contracte et une haptique
    /// LÉGÈRE répond au doigt, avant l'attente de l'objectif.
    func noteShutterPress() {
        shutterPresses += 1
        shutterClock.start()
        HapticFeedback.light()
    }

    /// AVFoundation n'a rendu aucune image : le déclencheur se libère, et le dit.
    func photoWasLost() {
        isTakingPhoto = false
        CameraTakeNotice.announceLostPhoto()
    }

    /// Le tic du cadre, et le délai toucher → obturateur, signpost et console.
    func noteShutterFired() {
        shutterCount += 1
        lastShutterDelay = shutterClock.report()
    }

    nonisolated func photoOutput(_ output: AVCapturePhotoOutput, didFinishProcessingPhoto photo: AVCapturePhoto, error: Error?) {
        guard let original = photo.fileDataRepresentation() else {
            Task { @MainActor in self.photoWasLost() }
            return
        }
        let processed = photoProcessor.process(encoded: original, settings: .capture)
        let data = processed?.data ?? original
        guard let image = processed.map({ UIImage(cgImage: $0.image) }) ?? UIImage(data: original) else {
            Task { @MainActor in self.photoWasLost() }
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
