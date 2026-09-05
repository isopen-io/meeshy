import XCTest
import Combine
import CoreLocation
@testable import Meeshy

/// Gardes d'analyse de source pour la campagne « demander au bon moment »
/// (2026-07-23).
///
/// Ces chemins ne sont pas exerçables sans matériel ni décision TCC réelle
/// (caméra, micro, appel VoIP), mais leur régression est silencieuse et
/// coûteuse : un `startRecording()` sans garde repart muet, un `answerCall()`
/// sans garde connecte un appel sans micro, un `configure()` qui sort en
/// silence laisse un écran noir. On épingle donc le câblage.
///
/// Même technique que `CameraModelSwitchDuringRecordingTests`.
final class PermissionGateSourceGuardTests: XCTestCase {

    // MARK: - Helpers

    private func source(_ relativePath: String) throws -> String {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()  // Services
            .deletingLastPathComponent()  // Unit
            .deletingLastPathComponent()  // MeeshyTests
            .deletingLastPathComponent()  // ios
        return try String(contentsOf: root.appendingPathComponent(relativePath), encoding: .utf8)
    }

    private func body(from startMarker: String, to endMarker: String, in source: String) throws -> String {
        guard let start = source.range(of: startMarker) else {
            XCTFail("Marqueur introuvable : \(startMarker)"); throw XCTSkip("marker")
        }
        let end = source.range(of: endMarker, range: start.upperBound..<source.endIndex)?.lowerBound ?? source.endIndex
        return String(source[start.lowerBound..<end])
    }

    // MARK: - Enregistrement audio

    /// `AudioRecorderManager` est le point unique des cinq surfaces
    /// d'enregistrement (message vocal, commentaire post, commentaire story,
    /// post audio, canvas story). Sans garde, `setActive(true)` déclenchait le
    /// prompt TCC pendant que `record()` tournait déjà : premier enregistrement
    /// muet, sans le moindre signal.
    func test_audioRecorder_startRecording_gatesOnMicrophonePermission() throws {
        let src = try source("Meeshy/Features/Main/Services/AudioRecorderManager.swift")
        let fn = try body(from: "func startRecording() {", to: "private func hasMicrophonePermission", in: src)

        XCTAssertTrue(
            fn.contains("guard hasMicrophonePermission() else { return }"),
            "startRecording() doit trancher la permission micro AVANT toute activation de session."
        )
        guard let gateIndex = fn.range(of: "hasMicrophonePermission()")?.lowerBound,
              let sessionIndex = fn.range(of: "session.setCategory")?.lowerBound else {
            return XCTFail("Impossible de localiser la garde et l'activation de session")
        }
        XCTAssertLessThan(
            gateIndex, sessionIndex,
            "La garde micro doit précéder setCategory/setActive — l'inverse laisse iOS " +
            "prompter de façon asynchrone pendant que l'enregistrement a déjà démarré."
        )
    }

    /// Le refus définitif ne doit pas re-prompter (le système n'afficherait
    /// plus rien) mais renvoyer vers les Réglages, via le coordinateur.
    func test_audioRecorder_permissionHelper_routesThroughCoordinator() throws {
        let src = try source("Meeshy/Features/Main/Services/AudioRecorderManager.swift")
        let fn = try body(from: "private func hasMicrophonePermission()", to: "internal func deactivateAudioSessionAfterFailure", in: src)

        XCTAssertTrue(fn.contains("MediaPermissionState.microphone"),
                      "Le chemin nominal doit être un test synchrone d'état, sans latence ajoutée.")
        XCTAssertTrue(fn.contains("MediaPermissionCoordinator.ensureMicrophone()"),
                      "La demande et le message de refus doivent passer par le coordinateur.")
    }

    // MARK: - Appels

    /// Répondre sans micro connecte un appel muet : l'appelant parle dans le
    /// vide sans jamais comprendre. Le chemin CallKit ne permet aucune demande
    /// en amont, d'où la garde ici.
    func test_answerCall_endsCallWhenMicrophoneMissing() throws {
        let src = try source("Meeshy/Features/Main/Services/CallManager.swift")
        let fn = try body(from: "func answerCall() {", to: "ringbackPlayer.stop()", in: src)

        XCTAssertTrue(fn.contains("MediaPermissionState.microphone.isUsable"),
                      "answerCall() doit vérifier le micro avant d'accepter.")
        XCTAssertTrue(fn.contains("endCall()"),
                      "Sans micro, l'appel doit être raccroché au lieu de se connecter muet.")
        XCTAssertTrue(fn.contains("MediaPermissionCoordinator"),
                      "Le refus doit être annoncé avec un renvoi vers les Réglages.")
    }

    /// Répondre depuis l'UI système CallKit (écran verrouillé, Dynamic Island,
    /// CarPlay, AirPods) invoque `answerCallReady()`, PAS `answerCall()` — un
    /// chemin distinct qui ne portait aucune garde micro jusqu'ici. Sans elle,
    /// un appel accepté via CallKit avec le micro refusé se connectait muet,
    /// sans toast ni raccroché : miroir exact du bug déjà corrigé sur
    /// `answerCall()`, resté ouvert sur son propre point d'entrée.
    func test_answerCallReady_endsCallWhenMicrophoneMissing() throws {
        let src = try source("Meeshy/Features/Main/Services/CallManager.swift")
        let fn = try body(from: "func answerCallReady() async {", to: "// MARK: - Reject Call", in: src)

        XCTAssertTrue(fn.contains("MediaPermissionState.microphone.isUsable"),
                      "answerCallReady() doit vérifier le micro avant d'accepter, comme answerCall().")
        XCTAssertTrue(fn.contains("failCall("),
                      "Sans micro, l'appel doit être raccroché via failCall() — endCall() ne résout pas " +
                      "le CXAnswerCallAction déjà retenu par holdPendingAnswerAction.")
        XCTAssertTrue(fn.contains("MediaPermissionCoordinator"),
                      "Le refus doit être annoncé avec un renvoi vers les Réglages.")

        guard let guardIndex = fn.range(of: "MediaPermissionState.microphone.isUsable")?.lowerBound,
              let connectingIndex = fn.range(of: "callState = .connecting")?.lowerBound else {
            return XCTFail("Impossible de localiser la garde et la transition .connecting")
        }
        XCTAssertLessThan(
            guardIndex, connectingIndex,
            "La garde micro doit précéder le passage à .connecting — sinon l'appel est déjà donné " +
            "comme démarré côté UI quand le raccroché survient."
        )
    }

    /// `rejoinActiveCall()` est le chemin de reprise après crash/relance :
    /// `ConversationView+Header.swift` (pastille « rejoindre ») et
    /// `ConversationViewModel.joinOngoingCall` l'appellent SANS pré-vol de
    /// permission, contrairement à `answerCall()`/`answerCallReady()`. Il
    /// partage pourtant le même pipeline média
    /// (`performLocalMediaStart` → `startLocalMedia`), qui ne vérifie jamais
    /// lui-même le micro (seule la caméra l'est, côté vidéo). Sans garde ici,
    /// un micro révoqué pendant que l'app était tuée reconnecte un appel
    /// silencieux au tap sur « rejoindre » — miroir exact du bug déjà corrigé
    /// sur les deux autres points d'entrée, resté ouvert sur celui-ci.
    func test_rejoinActiveCall_refusesWhenMicrophoneMissing() throws {
        let src = try source("Meeshy/Features/Main/Services/CallManager.swift")
        let fn = try body(from: "func rejoinActiveCall(callId: String", to: "// MARK: - VoIP Push Incoming Call", in: src)

        XCTAssertTrue(fn.contains("MediaPermissionState.microphone.isUsable"),
                      "rejoinActiveCall() doit vérifier le micro avant de reprendre l'appel.")
        XCTAssertTrue(fn.contains("return false"),
                      "Sans micro, rejoinActiveCall() doit refuser la reprise et renvoyer false.")
        XCTAssertTrue(fn.contains("MediaPermissionCoordinator"),
                      "Le refus doit être annoncé avec un renvoi vers les Réglages.")

        guard let guardIndex = fn.range(of: "MediaPermissionState.microphone.isUsable")?.lowerBound,
              let connectingIndex = fn.range(of: "callState = .connecting")?.lowerBound else {
            return XCTFail("Impossible de localiser la garde et la transition .connecting")
        }
        XCTAssertLessThan(
            guardIndex, connectingIndex,
            "La garde micro doit précéder le passage à .connecting — sinon l'appel est déjà donné " +
            "comme repris côté UI quand le refus survient."
        )
    }

    /// Toute surface produit compose via le point d'entrée qui demande d'abord
    /// les permissions. `startCall` brut reste réservé au moteur/tests.
    func test_outgoingCallSurfaces_useThePermissionCheckedEntryPoint() throws {
        let surfaces = [
            "Meeshy/Features/Contacts/CallStarter.swift",
            "Meeshy/Features/Main/ViewModels/ConversationViewModel.swift",
            "Meeshy/Features/Main/Views/ConversationListView+Overlays.swift",
            "Meeshy/Features/Main/Views/ConversationView+Header.swift",
        ]
        for path in surfaces {
            let src = try source(path)
            XCTAssertFalse(
                src.contains("CallManager.shared.startCall("),
                "\(path) doit composer via requestPermissionsThenStartCall — " +
                "`startCall` direct ne demande ni micro ni caméra."
            )
            XCTAssertTrue(
                src.contains("requestPermissionsThenStartCall"),
                "\(path) doit utiliser le point d'entrée avec pré-flight de permissions."
            )
        }
    }

    /// La bannière in-app est le seul chemin où l'on peut demander AVANT que
    /// l'utilisateur accepte — c'est ce que demande le cahier des charges.
    func test_incomingCallView_requestsMicrophoneBeforeAnswering() throws {
        let src = try source("Meeshy/Features/Main/Views/IncomingCallView.swift")
        let fn = try body(from: "private func acceptCall() {", to: "var body: some View", in: src)

        XCTAssertTrue(fn.contains("MediaPermissionCoordinator.ensureMicrophone()"),
                      "Le tap « Accepter » doit garantir le micro avant de répondre.")
        XCTAssertTrue(fn.contains("callManager.endCall()"),
                      "Un refus micro doit raccrocher plutôt que de répondre muet.")
    }

    // MARK: - Caméra

    /// Le micro était demandé dès l'ouverture de la caméra, y compris pour une
    /// simple photo — un prompt sans motif visible, souvent refusé
    /// définitivement. Il doit désormais arriver au passage en mode Vidéo.
    func test_cameraSession_doesNotAddAudioInputEagerly() throws {
        let src = try source("Meeshy/Features/Main/Components/CameraView.swift")
        let setup = try body(from: "private func setupSession() {", to: "func enableAudioCaptureIfNeeded", in: src)

        XCTAssertFalse(
            setup.contains("AVCaptureDevice.default(for: .audio)"),
            "setupSession() ne doit plus brancher le micro : l'entrée audio est " +
            "ajoutée paresseusement par enableAudioCaptureIfNeeded() au mode Vidéo."
        )

        let configure = try body(from: "func configure() {", to: "private func setupSession", in: src)
        XCTAssertFalse(
            configure.contains(".audio"),
            "configure() ne doit demander QUE la caméra — pas le micro."
        )
        XCTAssertTrue(
            configure.contains("MediaPermissionCoordinator.ensureCamera"),
            "configure() doit passer par le coordinateur."
        )
        XCTAssertTrue(
            configure.contains("self.permission = state"),
            "Un refus doit être publié pour que la vue rende un panneau explicatif " +
            "au lieu d'un preview noir muet."
        )
    }

    /// Le panneau de refus (et son bouton Réglages) est la seule chose qui
    /// distingue « caméra refusée » d'un bug d'affichage.
    func test_cameraView_rendersDeniedPanelInsteadOfBlackPreview() throws {
        let src = try source("Meeshy/Features/Main/Components/CameraView.swift")
        XCTAssertTrue(src.contains("permissionDeniedPanel"),
                      "CameraView doit exposer un panneau de refus.")
        XCTAssertTrue(src.contains("camera.permission.needsSettingsRedirect"),
                      "Le rendu doit basculer sur l'état d'autorisation publié par le modèle.")
        XCTAssertTrue(src.contains("MediaPermissionCoordinator.openSettings()"),
                      "Le panneau doit offrir l'ouverture des Réglages.")
    }

    // MARK: - Photothèque

    /// Le strip est monté à l'ouverture du composer : y prompter revenait à
    /// réclamer l'accès aux photos avant toute intention de l'utilisateur.
    func test_recentMediaStrip_doesNotPromptOnLoad() throws {
        let src = try source("Meeshy/Features/Main/Components/RecentMediaStrip.swift")
        let fn = try body(from: "func load(limit: Int = 40) {", to: "func requestAccess()", in: src)

        XCTAssertFalse(
            fn.contains("requestAuthorization"),
            "load() ne doit jamais déclencher de prompt — la tuile d'accès s'en charge sur tap."
        )
        XCTAssertTrue(src.contains("MediaPermissionCoordinator.ensurePhotoLibraryRead"),
                      "La demande explicite doit passer par le coordinateur.")
    }

    // MARK: - Géolocalisation

    /// `requestLocation()` sur un statut refusé ne produisait qu'un
    /// `didFailWithError` silencieux, et l'utilisateur attendait un recentrage
    /// qui n'arriverait jamais.
    func test_locationPicker_doesNotRequestLocationWhenUnauthorized() throws {
        let src = try source("Meeshy/Features/Main/Components/LocationPickerView.swift")
        let fn = try body(from: "func requestPermission() {", to: "func updateSelectedLocation", in: src)

        XCTAssertTrue(fn.contains("case .authorizedWhenInUse, .authorizedAlways:"),
                      "Le relevé ne doit partir que sur un statut autorisé.")
        XCTAssertTrue(fn.contains("manager.requestWhenInUseAuthorization()"),
                      "Le statut indéterminé doit déclencher la demande.")
        XCTAssertTrue(src.contains("locationDeniedBanner"),
                      "Un refus doit être expliqué dans l'UI, pas seulement journalisé.")
    }

    /// Une classe `@MainActor` sans `deinit` écrite reçoit une deinit ISOLÉE
    /// (SE-0466) dont le shim de rétro-déploiement double-libère le scope
    /// task-local et tue le processus au démontage. Le picker étant une sheet,
    /// ce chemin est exercé à chaque fermeture. Même signature que le crash
    /// `ScrollOffsetRelay`.
    func test_locationPickerModel_isTypeLevelNonisolated() throws {
        let src = try source("Meeshy/Features/Main/Components/LocationPickerView.swift")

        XCTAssertTrue(src.contains("nonisolated final class LocationPickerModel"),
                      "Le `nonisolated` doit vivre sur le TYPE : c'est la seule annotation qui désisole la deinit.")
        XCTAssertTrue(src.contains("@unchecked Sendable"),
                      "Un type nonisolated capturé dans des fermetures de delegate doit être Sendable.")
        XCTAssertFalse(src.contains("@Published var selectedCoordinate"),
                       "`nonisolated` est refusé sur une propriété enveloppée : les @Published doivent être dépliés.")
        XCTAssertTrue(src.contains("willSet { objectWillChange.send() }"),
                      "Le dépliage doit publier sur willSet, exactement comme @Published.")
    }

    /// CoreLocation délivre un callback d'autorisation dès l'assignation du
    /// delegate — asynchroniquement sur la runloop, pas pendant `init()`. Le
    /// recevoir avant que SwiftUI ait installé le `@StateObject` publie une
    /// modification en plein cycle de rendu.
    func test_locationPickerModel_doesNotWireCoreLocationFromInit() throws {
        let src = try source("Meeshy/Features/Main/Components/LocationPickerView.swift")
        let initBody = try body(from: "override init() {", to: "func requestPermission()", in: src)
        XCTAssertFalse(initBody.contains("manager.delegate = self"),
                       "Assigner le delegate depuis init() declenche un callback d'autorisation avant que le @StateObject soit installe.")
        let request = try body(from: "func requestPermission() {", to: "func updateSelectedLocation", in: src)
        XCTAssertTrue(request.contains("manager.delegate = self"),
                      "Le cablage doit se faire au premier usage, de maniere idempotente.")
    }

    /// À l'ouverture d'un picker déjà autorisé, `requestPermission()` et le
    /// callback d'autorisation initial tirent chacun un `requestLocation()` :
    /// CoreLocation annule alors la première requête et répond
    /// `kCLErrorLocationUnknown`, laissant l'UI attendre un relevé qui
    /// n'arrivera pas.
    func test_locationPicker_guardsAgainstConcurrentFixRequests() throws {
        let src = try source("Meeshy/Features/Main/Components/LocationPickerView.swift")
        XCTAssertTrue(src.contains("isAwaitingFix"),
                      "Deux requestLocation() concurrents font annuler la premiere par CoreLocation, qui repond kCLErrorLocationUnknown.")
        let fail = try body(from: "func locationManager(_ manager: CLLocationManager, didFailWithError",
                            to: "func locationManagerDidChangeAuthorization", in: src)
        XCTAssertTrue(fail.contains("isAwaitingFix = false"),
                      "Un echec doit rearmer la garde, sinon plus aucun releve ne peut partir.")
    }

    /// Le crash est corrigé sans trace. Ces breadcrumbs sont ce qui rendra un
    /// éventuel re-crash diagnosticable au lieu d'imposer une seconde correction
    /// à l'aveugle.
    func test_locationPicker_leavesBreadcrumbsOnEveryAuthorizationStep() throws {
        let src = try source("Meeshy/Features/Main/Components/LocationPickerView.swift")
        for step in ["breadcrumb.request", "breadcrumb.authorization", "breadcrumb.fix",
                     "breadcrumb.failure", "breadcrumb.selection"] {
            XCTAssertTrue(src.contains(step),
                          "Etape \(step) non tracee : un re-crash resterait indiagnosticable.")
        }
    }

    // MARK: - Partage de position (Task 11/12, 2026-07-29)

    /// Le picker rendait des coordonnées nues et jetait le nom du lieu :
    /// l'ancienne signature `(CLLocationCoordinate2D, String?) -> Void` est ce
    /// qui faisait jeter le nom aux quatre call sites, dont un littéral
    /// `{ coordinate, _ in }`. Personne ne l'avait vu parce que rien
    /// n'arrivait jamais à destination.
    func test_locationPicker_emitsAFullPlace_notBareCoordinates() throws {
        let src = try source("Meeshy/Features/Main/Components/LocationPickerView.swift")
        XCTAssertTrue(src.contains("let onSelect: (SharedPlace) -> Void"),
                      "Le picker doit emettre un lieu complet : la signature (coordonnees, String?) est ce qui faisait jeter le nom.")
        XCTAssertTrue(src.contains("pointOfInterestCategory"),
                      "La categorie POI de MapKit est disponible et doit etre conservee.")
    }

    /// Les quatre call sites (message, feed inline, feed sheet, commentaire)
    /// jetaient le lieu — `FeedCommentsSheet` écrivait littéralement
    /// `{ coordinate, _ in }`.
    func test_noCallSiteDiscardsThePlace() throws {
        for path in ["Meeshy/Features/Main/Views/ConversationView+Composer.swift",
                     "Meeshy/Features/Main/Views/FeedView.swift",
                     "Meeshy/Features/Main/Views/FeedView+Attachments.swift",
                     "Meeshy/Features/Main/Views/FeedCommentsSheet.swift"] {
            let src = try source(path)
            XCTAssertFalse(src.contains("LocationPickerView(accentColor: accentColor) { coordinate, _ in"),
                           "\(path) jette encore le lieu.")
            XCTAssertFalse(src.contains("coordinate: CLLocationCoordinate2D, address: String?"),
                           "\(path) porte encore la signature qui separait le point de son nom.")
        }
    }

    // MARK: - Partage de position (Task 13, 2026-07-29)

    /// `publishPost()` **et** `publishPostWithAttachments()` sortaient tous deux
    /// par `createPost(content:)` seul quand il n'y avait pas de fichier : une
    /// position seule, sans texte ni piece jointe, n'envoyait rien. Corriger un
    /// seul des deux chemins laisse la moitie du bug.
    func test_bothPublishPathsCarryTheLocation() throws {
        let src = try source("Meeshy/Features/Main/Views/FeedView+Attachments.swift")
        let publish = try body(from: "private func publishPost()", to: "// MARK:", in: src)
        XCTAssertTrue(publish.contains("location: pendingPlace"),
                      "publishPost perd la position dans sa branche sans fichier.")

        let withAttachments = try body(from: "func publishPostWithAttachments", to: "private func publishPost()", in: src)
        XCTAssertTrue(withAttachments.contains("location: pendingPlace"),
                      "publishPostWithAttachments a le meme defaut : corriger un seul chemin laisse la moitie du bug.")

        XCTAssertTrue(publish.contains("pendingPlace != nil"),
                      "Une position seule, sans texte ni piece jointe, doit pouvoir partir.")
    }

    // MARK: - Partage de position (Task 14, 2026-07-29)

    /// `CommentsSheetView` (le commentaire depuis le FEED, distinct de
    /// `PostDetailView`) capturait le lieu choisi dans `commentPendingPlace`
    /// mais ne l'envoyait jamais : ni au chemin direct, ni au chemin
    /// hors-ligne. Choisir un lieu dans un commentaire du feed ne produisait
    /// donc aucun effet réseau — le symétrique exact du bug déjà corrigé
    /// côté détail de post (`PostDetailView.submitComment`, qui capture
    /// `place` avant la garde et l'inclut dans la condition de départ).
    func test_feedCommentsSheet_submitComment_capturesPlaceBeforeTheEmptyGuard() throws {
        let src = try source("Meeshy/Features/Main/Views/FeedCommentsSheet.swift")
        let fn = try body(from: "private func submitComment(text: String, attachments: [ComposerAttachment]) {",
                          to: "// Réponse plate à 2 niveaux", in: src)

        XCTAssertTrue(fn.contains("let place = commentPendingPlace"),
                      "Le lieu en attente doit être capturé au début de submitComment, avant tout early-return.")
        XCTAssertTrue(fn.contains("commentPendingPlace = nil"),
                      "La chip doit être effacée après capture — sinon elle réapparaît sur le commentaire suivant.")
        XCTAssertTrue(fn.contains("guard !trimmed.isEmpty || media != nil || place != nil else { return }"),
                      "Un commentaire « lieu seul » (sans texte ni média) doit pouvoir partir — l'ancienne garde à 2 conditions l'aurait avorté silencieusement, exactement comme le bug déjà corrigé sur publishPost.")
    }

    /// Le chemin direct (réseau disponible) doit transmettre le lieu à
    /// `PostService.addComment` — sinon `POST /posts/:postId/comments` part
    /// sans `location` et le serveur (qui persiste pourtant `metadata.location`)
    /// ne reçoit jamais rien à persister.
    func test_feedCommentsSheet_submitComment_sendsLocationOnTheDirectPath() throws {
        let src = try source("Meeshy/Features/Main/Views/FeedCommentsSheet.swift")
        let fn = try body(from: "let apiComment = try await PostService.shared.addComment(",
                          to: "let feedComment = FeedComment(", in: src)

        XCTAssertTrue(fn.contains("location: place"),
                      "submitComment doit transmettre le lieu capturé à addComment — sinon il ne part jamais sur le réseau.")
    }

    /// Le chemin hors-ligne (durable, `OfflineQueue`) doit transporter le
    /// MÊME lieu — `OutboxDispatcher.dispatchCreateComment` sait déjà relayer
    /// `CreateCommentPayload.location`, mais seulement si l'appelant le
    /// remplit. Sans ce fil, une position choisie hors réseau disparaît
    /// silencieusement au lieu de survivre au replay.
    func test_feedCommentsSheet_submitComment_sendsLocationOnTheOfflinePath() throws {
        let src = try source("Meeshy/Features/Main/Views/FeedCommentsSheet.swift")
        let fn = try body(from: "let payload = CreateCommentPayload(",
                          to: "try await OfflineQueue.shared.enqueue", in: src)

        XCTAssertTrue(fn.contains("location: place"),
                      "Le repli hors-ligne doit transporter le lieu — sinon une position choisie sans réseau disparaît.")
    }

    /// `hasContent` (qui gate l'activation du bouton d'envoi dans
    /// `UniversalComposerBar`) ignorait `commentPendingPlace` : même une fois
    /// le transport câblé, un commentaire « lieu seul » resterait injouable
    /// si le bouton d'envoi ne s'active jamais. Miroir exact de
    /// `PostDetailView`'s `externalHasContent: ... || pendingPlace != nil`.
    func test_feedCommentsSheet_locationOnlyComment_countsAsContent() throws {
        let src = try source("Meeshy/Features/Main/Views/FeedCommentsSheet.swift")
        XCTAssertTrue(
            src.contains("externalHasContent: !commentAttachments.isEmpty || audioRecorder.isRecording || commentPendingPlace != nil,"),
            "Sans commentPendingPlace dans la jauge de contenu, le bouton d'envoi reste désactivé pour un commentaire « lieu seul »."
        )
    }

    // MARK: - Mot de passe

    /// Sans `.newPassword`, iOS ne propose ni mot de passe fort ni — surtout —
    /// l'enregistrement au trousseau en fin d'inscription.
    ///
    /// **UN seul site depuis #5218**, contre deux auparavant : la confirmation
    /// de mot de passe a disparu avec le wizard. Le compte est donc EXACT et non
    /// « au moins un » — un second `.newPassword` sur cet écran signifierait que
    /// la confirmation est revenue, ce que la refonte a retiré exprès.
    ///
    /// L'IDENTIFIANT que le trousseau associe au mot de passe n'est plus un
    /// pseudo mais l'ADRESSE : Apple accepte `.username` **ou** `.emailAddress`
    /// comme champ de compte, et l'écran n'a plus de champ pseudo à offrir. La
    /// garde vérifie donc qu'un identifiant est déclaré, sans imposer lequel —
    /// l'imposer reviendrait à exiger le retour d'un champ supprimé.
    func test_signupPasswordFields_optIntoKeychainSave() throws {
        let src = try source("Meeshy/Features/Auth/Signup/SignupView.swift")
        XCTAssertEqual(
            src.components(separatedBy: ".textContentType(.newPassword)").count - 1, 1,
            "Une seule saisie de mot de passe, et elle doit être `.newPassword`."
        )
        XCTAssertTrue(
            src.contains(".textContentType(.emailAddress)") || src.contains(".textContentType(.username)"),
            "iOS a besoin de l'identifiant pour savoir quoi enregistrer avec le mot de passe."
        )
    }

    /// `webcredentials:` est ce qui associe l'app au domaine dans le trousseau
    /// iCloud. L'AASA sert déjà cette section côté web.
    func test_entitlements_declareWebCredentialsDomain() throws {
        let src = try source("Meeshy/Meeshy.entitlements")
        XCTAssertTrue(src.contains("webcredentials:meeshy.me"),
                      "L'entitlement webcredentials est requis pour la sauvegarde/relecture trousseau.")
    }
}

// MARK: - Idempotence de updateSelectedLocation (gel du picker de lieu, 2026-07-30)

/// `LocationPickerModel.updateSelectedLocation` republiait la MÊME
/// coordonnée à chaque callback caméra (`onMapCameraChange`), tirant
/// `objectWillChange` sans écrire de valeur nouvelle. Combiné à une
/// position de carte initiale non idempotente (`AdaptiveMapInitialRegion`,
/// côté SDK), ce re-render en boucle ré-entrait MapKit et gelait le main
/// thread — preuve par double `sample` du process montrant deux occurrences
/// imbriquées de `-[MKMapView _performActionAsIfGoingToDefaultLocation:]`
/// sur la même pile.
///
/// Comportement pur, testable par instanciation directe : pas de garde de
/// source ici, `LocationPickerModel` n'a pas besoin de matériel ni de
/// décision TCC pour exercer cette méthode.
final class LocationPickerModelUpdateSelectedLocationTests: XCTestCase {

    private func makeSUT() -> LocationPickerModel {
        LocationPickerModel()
    }

    func test_updateSelectedLocation_calledTwiceWithTheSameCoordinate_notifiesOnlyOnce() {
        let sut = makeSUT()
        let coordinate = CLLocationCoordinate2D(latitude: 48.8566, longitude: 2.3522)
        var notificationCount = 0
        let cancellable = sut.objectWillChange.sink { _ in notificationCount += 1 }

        sut.updateSelectedLocation(coordinate)
        sut.updateSelectedLocation(coordinate)

        cancellable.cancel()
        XCTAssertEqual(notificationCount, 1,
                       "Une coordonnée déjà sélectionnée ne doit tirer objectWillChange qu'une fois — " +
                       "republier l'identique ré-entre MapKit via le re-render de la carte.")
    }

    func test_updateSelectedLocation_calledWithADriftedButEquivalentCoordinate_treatsItAsTheSamePoint() {
        let sut = makeSUT()
        let coordinate = CLLocationCoordinate2D(latitude: 48.8566, longitude: 2.3522)
        let drifted = CLLocationCoordinate2D(latitude: 48.8566 + 5e-8, longitude: 2.3522 - 5e-8)
        var notificationCount = 0
        let cancellable = sut.objectWillChange.sink { _ in notificationCount += 1 }

        sut.updateSelectedLocation(coordinate)
        sut.updateSelectedLocation(drifted)

        cancellable.cancel()
        XCTAssertEqual(notificationCount, 1,
                       "La dérive flottante de MapKit (~1e-9°) ne doit jamais republier — le seuil de tolérance l'absorbe.")
    }

    func test_updateSelectedLocation_calledWithAGenuinelyDifferentCoordinate_notifiesAndUpdates() {
        let sut = makeSUT()
        let first = CLLocationCoordinate2D(latitude: 48.8566, longitude: 2.3522)
        let second = CLLocationCoordinate2D(latitude: 40.7128, longitude: -74.0060)
        var notificationCount = 0
        let cancellable = sut.objectWillChange.sink { _ in notificationCount += 1 }

        sut.updateSelectedLocation(first)
        sut.updateSelectedLocation(second)

        cancellable.cancel()
        XCTAssertEqual(notificationCount, 2, "Deux points réellement distincts doivent chacun notifier.")
        XCTAssertEqual(sut.selectedCoordinate?.latitude ?? .nan, second.latitude, accuracy: 0.0001)
        XCTAssertEqual(sut.selectedCoordinate?.longitude ?? .nan, second.longitude, accuracy: 0.0001)
    }
}
