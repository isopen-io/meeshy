import XCTest
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

    // MARK: - Mot de passe

    /// Sans `.newPassword`, iOS ne propose ni mot de passe fort ni — surtout —
    /// l'enregistrement au trousseau en fin d'inscription.
    func test_signupPasswordFields_optIntoKeychainSave() throws {
        let src = try source("Meeshy/Features/Auth/Onboarding/OnboardingStepViews.swift")
        XCTAssertEqual(
            src.components(separatedBy: ".textContentType(.newPassword)").count - 1, 2,
            "Le mot de passe ET sa confirmation doivent être `.newPassword`."
        )
        XCTAssertTrue(src.contains(".textContentType(.username)"),
                      "iOS a besoin de l'identifiant pour savoir quoi enregistrer avec le mot de passe.")
    }

    /// `webcredentials:` est ce qui associe l'app au domaine dans le trousseau
    /// iCloud. L'AASA sert déjà cette section côté web.
    func test_entitlements_declareWebCredentialsDomain() throws {
        let src = try source("Meeshy/Meeshy.entitlements")
        XCTAssertTrue(src.contains("webcredentials:meeshy.me"),
                      "L'entitlement webcredentials est requis pour la sauvegarde/relecture trousseau.")
    }
}
