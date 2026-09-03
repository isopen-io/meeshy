import XCTest
import MeeshySDK
@testable import Meeshy

// MARK: - Mocks

/// Moteur de reconnaissance factice : rend un `Result` préparé, compte ses
/// appels et retient les paramètres reçus (locale, délai) pour prouver que le
/// transcripteur respecte l'autorisation et le plafond de délai sans jamais
/// ouvrir `Speech`.
@MainActor
final class MockVoiceNoteTranscriptionEngine: VoiceNoteTranscriptionEngineProviding {
    var isAuthorized = true
    /// Ce que la boîte système RENDRAIT : `true` accorde — et `isAuthorized`
    /// bascule, comme le statut qu'iOS mémorise ensuite.
    var authorizationGrant = false
    private(set) var requestAuthorizationCallCount = 0

    func requestAuthorization() async -> Bool {
        requestAuthorizationCallCount += 1
        if authorizationGrant { isAuthorized = true }
        return isAuthorized
    }
    var transcribeResult: Result<OnDeviceTranscription, Error> = .success(
        OnDeviceTranscription(text: "Bonjour à tous", language: "fr-FR", confidence: 0.92)
    )
    private(set) var transcribeCallCount = 0
    private(set) var receivedLocales: [Locale] = []
    private(set) var receivedTimeouts: [TimeInterval] = []
    /// Simule un moteur qui met du temps : le résultat n'est rendu qu'après
    /// cette durée (un `Task.sleep`, annulable).
    var latency: Duration = .zero

    func transcribe(audioURL: URL, locale: Locale, timeout: TimeInterval) async throws -> OnDeviceTranscription {
        transcribeCallCount += 1
        receivedLocales.append(locale)
        receivedTimeouts.append(timeout)
        if latency > .zero {
            try await Task.sleep(for: latency)
        }
        return try transcribeResult.get()
    }
}

/// Transcripteur factice conforme à `VoiceNoteLocalTranscribing` — pour les
/// sites qui CONSOMMENT le service (composition du slice optimiste) sans
/// dépendre du moteur.
@MainActor
final class MockVoiceNoteLocalTranscriber: VoiceNoteLocalTranscribing {
    var knownResults: [String: MessageTranscription] = [:]
    var awaitedResults: [String: Result<MessageTranscription, Error>] = [:]
    private(set) var beginCallCount = 0
    private(set) var beganAttachmentIds: [String] = []
    private(set) var awaitCallCount = 0
    private(set) var discardCallCount = 0
    private(set) var discardedAttachmentIds: [String] = []

    func beginTranscription(attachmentId: String, audioURL: URL, durationMs: Int, languageCode: String) {
        beginCallCount += 1
        beganAttachmentIds.append(attachmentId)
    }

    func transcription(for attachmentId: String) -> MessageTranscription? {
        knownResults[attachmentId]
    }

    func awaitTranscription(for attachmentId: String) async -> MessageTranscription? {
        awaitCallCount += 1
        if let known = knownResults[attachmentId] { return known }
        return try? awaitedResults[attachmentId]?.get()
    }

    func discard(attachmentId: String) {
        discardCallCount += 1
        discardedAttachmentIds.append(attachmentId)
    }
}

// MARK: - Tests

/// `VoiceNoteLocalTranscriber` transcrit un vocal SUR L'APPAREIL dès l'arrêt
/// de l'enregistrement (#4948, D-AUDIO-01), en meilleur effort : UNE demande
/// d'autorisation au premier vocal (jamais pendant le geste, jamais en
/// retenant l'envoi), un délai plafonné, `nil` sur tout échec — la bulle
/// optimiste part telle quelle et le serveur (Whisper) reste le repli. Le
/// résultat voyage ensuite avec l'upload TUS (`transcription`).
@MainActor
final class VoiceNoteLocalTranscriberTests: XCTestCase {

    // MARK: - Factories

    private func makeSUT(
        engine: MockVoiceNoteTranscriptionEngine = MockVoiceNoteTranscriptionEngine(),
        timeout: TimeInterval = 8
    ) -> (sut: VoiceNoteLocalTranscriber, engine: MockVoiceNoteTranscriptionEngine) {
        (VoiceNoteLocalTranscriber(engine: engine, timeout: timeout), engine)
    }

    private func makeAudioURL() -> URL {
        FileManager.default.temporaryDirectory
            .appendingPathComponent("voice-note-\(UUID().uuidString).m4a")
    }

    private func makeSegment(_ text: String, at timestamp: TimeInterval, duration: TimeInterval) -> OnDeviceTranscriptionSegment {
        OnDeviceTranscriptionSegment(text: text, timestamp: timestamp, duration: duration, confidence: 0.9)
    }

    // MARK: - Succès ⇒ transcription posée

    func test_awaitTranscription_engineSucceeds_returnsTranscriptionKeyedByAttachment() async {
        let (sut, engine) = makeSUT()
        engine.transcribeResult = .success(OnDeviceTranscription(
            text: "  Bonjour à tous  ", language: "fr-FR", confidence: 0.92,
            segments: [makeSegment("Bonjour", at: 0.1, duration: 0.4), makeSegment("à tous", at: 0.6, duration: 0.5)]
        ))

        sut.beginTranscription(attachmentId: "att-1", audioURL: makeAudioURL(), durationMs: 1_200, languageCode: "fr")
        let transcription = await sut.awaitTranscription(for: "att-1")

        XCTAssertEqual(transcription?.attachmentId, "att-1")
        XCTAssertEqual(transcription?.text, "Bonjour à tous")
        XCTAssertEqual(transcription?.language, "fr")
        XCTAssertEqual(transcription?.confidence, 0.92)
        XCTAssertEqual(transcription?.durationMs, 1_200)
        XCTAssertEqual(transcription?.segments.count, 2)
        XCTAssertEqual(transcription?.segments.first?.startTime, 0.1)
        XCTAssertEqual(transcription?.segments.first?.endTime ?? 0, 0.5, accuracy: 0.0001)
        XCTAssertEqual(engine.transcribeCallCount, 1)
    }

    func test_transcription_afterCompletion_isKnownSynchronously() async {
        let (sut, _) = makeSUT()
        sut.beginTranscription(attachmentId: "att-1", audioURL: makeAudioURL(), durationMs: 900, languageCode: "fr")
        _ = await sut.awaitTranscription(for: "att-1")

        XCTAssertEqual(sut.transcription(for: "att-1")?.text, "Bonjour à tous")
    }

    func test_transcription_whileInFlight_isNil() {
        let (sut, engine) = makeSUT()
        engine.latency = .seconds(5)
        sut.beginTranscription(attachmentId: "att-1", audioURL: makeAudioURL(), durationMs: 900, languageCode: "fr")

        XCTAssertNil(sut.transcription(for: "att-1"))
    }

    func test_beginTranscription_usesComposerLanguageAndCappedTimeout() async {
        let (sut, engine) = makeSUT(timeout: 6)
        sut.beginTranscription(attachmentId: "att-1", audioURL: makeAudioURL(), durationMs: 900, languageCode: "en")
        _ = await sut.awaitTranscription(for: "att-1")

        XCTAssertEqual(engine.receivedLocales.first?.language.languageCode?.identifier, "en")
        XCTAssertEqual(engine.receivedTimeouts, [6])
    }

    func test_beginTranscription_sameAttachmentTwice_runsOnce() async {
        let (sut, engine) = makeSUT()
        let url = makeAudioURL()
        sut.beginTranscription(attachmentId: "att-1", audioURL: url, durationMs: 900, languageCode: "fr")
        sut.beginTranscription(attachmentId: "att-1", audioURL: url, durationMs: 900, languageCode: "fr")
        _ = await sut.awaitTranscription(for: "att-1")

        XCTAssertEqual(engine.transcribeCallCount, 1)
    }

    // MARK: - L'autorisation se DEMANDE — une fois, au premier vocal

    /// « Jamais de demande » rendait la transcription automatique inerte pour
    /// quiconque n'avait jamais accordé Speech ailleurs : le vocal attendait
    /// Whisper. Accordée, la reconnaissance part dans la foulée.
    func test_beginTranscription_notAuthorized_asksOnce_thenTranscribesWhenGranted() async {
        let (sut, engine) = makeSUT()
        engine.isAuthorized = false
        engine.authorizationGrant = true

        sut.beginTranscription(attachmentId: "att-1", audioURL: makeAudioURL(), durationMs: 900, languageCode: "fr")
        let transcription = await sut.awaitTranscription(for: "att-1")

        XCTAssertEqual(transcription?.text, "Bonjour à tous")
        XCTAssertEqual(engine.requestAuthorizationCallCount, 1)
        XCTAssertEqual(engine.transcribeCallCount, 1)

        // Accordée une fois, iOS la mémorise : le vocal suivant ne redemande rien.
        sut.beginTranscription(attachmentId: "att-2", audioURL: makeAudioURL(), durationMs: 900, languageCode: "fr")
        _ = await sut.awaitTranscription(for: "att-2")
        XCTAssertEqual(engine.requestAuthorizationCallCount, 1, "Une seule boîte système, jamais deux")
    }

    /// Refusée, la demande rend `nil` sans reconnaissance : la bulle part sans
    /// texte et le serveur (Whisper) reste le repli.
    func test_beginTranscription_notAuthorized_denied_returnsNilWithoutRecognizing() async {
        let (sut, engine) = makeSUT()
        engine.isAuthorized = false

        sut.beginTranscription(attachmentId: "att-1", audioURL: makeAudioURL(), durationMs: 900, languageCode: "fr")
        let transcription = await sut.awaitTranscription(for: "att-1")

        XCTAssertNil(transcription)
        XCTAssertEqual(engine.requestAuthorizationCallCount, 1, "La demande a été faite")
        XCTAssertEqual(engine.transcribeCallCount, 0, "Aucune reconnaissance sans consentement")
    }

    func test_beginTranscription_alreadyAuthorized_neverAsksAgain() async {
        let (sut, engine) = makeSUT()

        sut.beginTranscription(attachmentId: "att-1", audioURL: makeAudioURL(), durationMs: 900, languageCode: "fr")
        _ = await sut.awaitTranscription(for: "att-1")

        XCTAssertEqual(engine.requestAuthorizationCallCount, 0, "Speech déjà accordé : aucune boîte système")
    }

    // MARK: - Délai / échec ⇒ nil, bulle intacte

    func test_awaitTranscription_engineTimesOut_returnsNil() async {
        let (sut, engine) = makeSUT()
        engine.transcribeResult = .failure(EdgeTranscriptionError.timedOut)

        sut.beginTranscription(attachmentId: "att-1", audioURL: makeAudioURL(), durationMs: 900, languageCode: "fr")
        let transcription = await sut.awaitTranscription(for: "att-1")

        XCTAssertNil(transcription)
        XCTAssertNil(sut.transcription(for: "att-1"))
    }

    func test_awaitTranscription_engineReturnsEmptyText_returnsNil() async {
        // Un silence transcrit en « » n'est pas une transcription : ne rien
        // poser plutôt qu'une bulle avec un sous-titre vide.
        let (sut, engine) = makeSUT()
        engine.transcribeResult = .success(OnDeviceTranscription(text: "   ", language: "fr-FR", confidence: 0.1))

        sut.beginTranscription(attachmentId: "att-1", audioURL: makeAudioURL(), durationMs: 900, languageCode: "fr")
        let transcription = await sut.awaitTranscription(for: "att-1")

        XCTAssertNil(transcription)
    }

    func test_awaitTranscription_unknownAttachment_returnsNil() async {
        let (sut, engine) = makeSUT()
        let transcription = await sut.awaitTranscription(for: "never-started")

        XCTAssertNil(transcription)
        XCTAssertEqual(engine.transcribeCallCount, 0)
    }

    // MARK: - Oubli

    func test_discard_inFlight_cancelsAndForgets() async {
        let (sut, engine) = makeSUT()
        engine.latency = .seconds(5)
        sut.beginTranscription(attachmentId: "att-1", audioURL: makeAudioURL(), durationMs: 900, languageCode: "fr")

        sut.discard(attachmentId: "att-1")
        let transcription = await sut.awaitTranscription(for: "att-1")

        XCTAssertNil(transcription)
    }

    func test_discard_known_forgets() async {
        let (sut, _) = makeSUT()
        sut.beginTranscription(attachmentId: "att-1", audioURL: makeAudioURL(), durationMs: 900, languageCode: "fr")
        _ = await sut.awaitTranscription(for: "att-1")

        sut.discard(attachmentId: "att-1")

        XCTAssertNil(sut.transcription(for: "att-1"))
    }

    func test_results_areBounded_oldestForgottenFirst() async {
        // Un vocal enregistré puis retiré du tiroir ne laisse pas sa
        // transcription en mémoire pour toujours : le magasin est borné.
        let (sut, _) = makeSUT()
        let count = VoiceNoteLocalTranscriber.retainedResultsCap + 1
        for index in 0..<count {
            sut.beginTranscription(attachmentId: "att-\(index)", audioURL: makeAudioURL(), durationMs: 900, languageCode: "fr")
            _ = await sut.awaitTranscription(for: "att-\(index)")
        }

        XCTAssertNil(sut.transcription(for: "att-0"))
        XCTAssertNotNil(sut.transcription(for: "att-\(count - 1)"))
    }

    // MARK: - Composition du slice optimiste (protocole, via le mock)

    func test_knownTranscriptions_keepsAttachmentOrder_andSkipsUnknown() {
        let mock = MockVoiceNoteLocalTranscriber()
        mock.knownResults = [
            "b": MessageTranscription(attachmentId: "b", text: "deux", language: "fr"),
            "a": MessageTranscription(attachmentId: "a", text: "un", language: "fr"),
        ]

        let known = mock.knownTranscriptions(for: ["a", "missing", "b"])

        XCTAssertEqual(known.map(\.attachmentId), ["a", "b"])
    }

    func test_awaitTranscriptions_awaitsEachAndSkipsFailures() async {
        let mock = MockVoiceNoteLocalTranscriber()
        mock.awaitedResults = [
            "a": .success(MessageTranscription(attachmentId: "a", text: "un", language: "fr")),
            "b": .failure(EdgeTranscriptionError.timedOut),
        ]

        let awaited = await mock.awaitTranscriptions(for: ["a", "b"])

        XCTAssertEqual(awaited.map(\.attachmentId), ["a"])
        XCTAssertEqual(mock.awaitCallCount, 2)
    }

    // MARK: - L'ENVOI a son propre budget, distinct du plafond du MOTEUR

    /// Le plafond du transcripteur (8 s) dit quand la reconnaissance est
    /// perdue ; il ne dit pas ce qu'un ENVOI a le droit d'attendre. Les faire
    /// coïncider retenait le fichier — bulle bloquée en « envoi », destinataire
    /// sans rien — pendant toute la fenêtre Apple Speech.
    func test_awaitTranscriptionsWithinBudget_slowEngine_rendLaMainAvantLePlafondDuMoteur() async {
        let (sut, engine) = makeSUT(timeout: 8)
        engine.latency = .seconds(5)
        sut.beginTranscription(attachmentId: "att-1", audioURL: makeAudioURL(), durationMs: 1_000, languageCode: "fr")

        let debut = ContinuousClock.now
        let awaited = await sut.awaitTranscriptions(for: ["att-1"], within: .milliseconds(120))
        let ecoule = debut.duration(to: ContinuousClock.now)

        XCTAssertTrue(awaited.isEmpty, "Passé le budget d'envoi, l'upload part sans texte — Whisper reste le repli")
        XCTAssertLessThan(ecoule, .seconds(2), "L'envoi ne doit jamais attendre le plafond du moteur")
        sut.discard(attachmentId: "att-1")
    }

    /// Le cas nominal d'un vocal court : la reconnaissance a déjà rendu, le
    /// budget ne coûte rien et le texte part avec l'upload.
    func test_awaitTranscriptionsWithinBudget_dejaConnue_rendImmediatement() async {
        let (sut, _) = makeSUT()
        sut.beginTranscription(attachmentId: "att-1", audioURL: makeAudioURL(), durationMs: 900, languageCode: "fr")
        _ = await sut.awaitTranscription(for: "att-1")

        let awaited = await sut.awaitTranscriptions(for: ["att-1"], within: .milliseconds(700))

        XCTAssertEqual(awaited.map(\.attachmentId), ["att-1"])
    }

    // MARK: - Le texte voyage avec l'upload TUS

    func test_tusUploadMetadata_carriesTextLanguageConfidenceDurationAndSegments() {
        let transcription = MessageTranscription(
            attachmentId: "att-1", text: "Bonjour", language: "fr", confidence: 0.9, durationMs: 1_500,
            segments: [MessageTranscriptionSegment(text: "Bonjour", startTime: 0.25, endTime: 0.75)]
        )

        let payload = transcription.tusUploadMetadata

        XCTAssertEqual(payload.text, "Bonjour")
        XCTAssertEqual(payload.language, "fr")
        XCTAssertEqual(payload.confidence, 0.9)
        XCTAssertEqual(payload.durationMs, 1_500)
        XCTAssertEqual(payload.segments?.first?.startMs, 250)
        XCTAssertEqual(payload.segments?.first?.endMs, 750)
    }

    func test_tusUploadMetadata_segmentWithoutTiming_isDropped() {
        let transcription = MessageTranscription(
            attachmentId: "att-1", text: "Bonjour", language: "fr",
            segments: [MessageTranscriptionSegment(text: "Bonjour")]
        )

        XCTAssertNil(transcription.tusUploadMetadata.segments)
    }

    func test_uploadMetadataValue_isBase64OfCamelCaseJSON() throws {
        let payload = TusUploadTranscriptionMetadata(
            text: "Bonjour", language: "fr", confidence: 0.9, durationMs: 1_500,
            segments: [.init(text: "Bonjour", startMs: 0, endMs: 750)]
        )

        let value = try XCTUnwrap(payload.uploadMetadataValue())
        let data = try XCTUnwrap(Data(base64Encoded: value))
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])

        XCTAssertEqual(json["text"] as? String, "Bonjour")
        XCTAssertEqual(json["language"] as? String, "fr")
        XCTAssertEqual(json["durationMs"] as? Int, 1_500)
        let segments = try XCTUnwrap(json["segments"] as? [[String: Any]])
        XCTAssertEqual(segments.first?["startMs"] as? Int, 0)
        XCTAssertEqual(segments.first?["endMs"] as? Int, 750)
    }

    func test_uploadMetadataValue_oversizedSegments_dropsSegmentsBeforeText() throws {
        let heavy = (0..<4_000).map { TusUploadTranscriptionMetadata.Segment(text: "mot", startMs: $0, endMs: $0 + 1) }
        let payload = TusUploadTranscriptionMetadata(text: "Bonjour", language: "fr", confidence: 0.9, durationMs: 1_500, segments: heavy)

        let value = try XCTUnwrap(payload.uploadMetadataValue())
        let data = try XCTUnwrap(Data(base64Encoded: value))
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])

        XCTAssertEqual(json["text"] as? String, "Bonjour")
        XCTAssertNil(json["segments"], "Les segments cèdent avant le texte quand `maxEncodedBytes` est dépassé")
    }

    func test_uploadMetadataValue_staysWithinAnHTTPHeaderBudget() throws {
        // Le budget n'est pas celui du JSON mais celui de la LIGNE
        // `Upload-Metadata` : le base64 enfle de 4/3, et l'en-tête porte déjà
        // filename / filetype / uploadcontext / thumbhash. Une charge AU
        // PLAFOND doit tenir largement sous 8 Kio — au-delà, l'upload ÉCHOUE
        // (limite d'en-têtes du serveur), alors que la transcription est
        // facultative et ne doit jamais coûter le vocal.
        let heavy = (0..<4_000).map { TusUploadTranscriptionMetadata.Segment(text: "mot", startMs: $0, endMs: $0 + 1) }
        let payload = TusUploadTranscriptionMetadata(
            text: String(repeating: "a", count: 3_000), language: "fr",
            confidence: 0.9, durationMs: 60_000, segments: heavy
        )

        let value = try XCTUnwrap(payload.uploadMetadataValue())

        XCTAssertLessThan(value.utf8.count, 8 * 1024)
    }

    func test_uploadMetadataValue_oversizedText_returnsNil() {
        let payload = TusUploadTranscriptionMetadata(
            text: String(repeating: "a", count: TusUploadTranscriptionMetadata.maxEncodedBytes + 1),
            language: "fr", confidence: nil, durationMs: nil, segments: nil
        )

        XCTAssertNil(payload.uploadMetadataValue())
    }

    func test_rekeyed_replacesAttachmentIdOnly() {
        let local = MessageTranscription(attachmentId: "local", text: "Bonjour", language: "fr", confidence: 0.9, durationMs: 1_500)

        let server = local.rekeyed(attachmentId: "server-1")

        XCTAssertEqual(server.attachmentId, "server-1")
        XCTAssertEqual(server.text, "Bonjour")
        XCTAssertEqual(server.durationMs, 1_500)
    }
}
