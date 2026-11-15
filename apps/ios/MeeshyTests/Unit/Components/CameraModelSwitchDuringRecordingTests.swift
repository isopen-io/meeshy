import XCTest
import AVFoundation
@testable import Meeshy

/// Source-analysis guards for the camera-switch-mid-recording fix (2026-07-09).
///
/// Bug: `switchCamera()` used to unconditionally remove/re-add the video input
/// inside a single `beginConfiguration()/commitConfiguration()` transaction,
/// with no check on `isRecordingVideo`. `AVCaptureMovieFileOutput`'s active
/// recording connection breaks when its video input is removed — even
/// transiently — which silently ended the recording early
/// (`didFinishRecordingTo` fires, `CameraView.onReceive($capturedVideoId)`
/// immediately dismisses the whole camera screen with a truncated clip). The
/// fix closes the current segment cleanly, swaps cameras once truly stopped,
/// and reopens a new segment. These guards pin the state-machine wiring
/// (and, further down, `mergeSegments`'s own structure) that can't be
/// exercised without camera hardware — see `CameraModelSegmentMergeTests`
/// for why the merge/export pipeline itself is pinned here rather than via
/// synthetic media.
final class CameraModelSwitchDuringRecordingTests: XCTestCase {

    private func cameraViewSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Components/CameraModel.swift")
        let video = url.deletingLastPathComponent().appendingPathComponent("CameraModel+Video.swift")
        return try String(contentsOf: url, encoding: .utf8) + "\n" + String(contentsOf: video, encoding: .utf8)
    }

    private func body(from startMarker: String, to endMarker: String, in source: String) throws -> String {
        guard let start = source.range(of: startMarker) else {
            XCTFail("Marker not found: \(startMarker)"); throw XCTSkip()
        }
        let end = source.range(of: endMarker, range: start.upperBound..<source.endIndex)?.lowerBound ?? source.endIndex
        return String(source[start.lowerBound..<end])
    }

    func test_switchCamera_whileRecording_doesNotReconfigureInputInPlace() throws {
        let source = try cameraViewSource()
        let fn = try body(from: "func switchCamera() {", to: "func performCameraSwitch", in: source)

        XCTAssertTrue(
            fn.contains("if isRecordingVideo"),
            "switchCamera() must branch on isRecordingVideo — reconfiguring the " +
            "video input in place while AVCaptureMovieFileOutput is recording " +
            "breaks its active connection and silently ends the recording."
        )
        XCTAssertTrue(
            fn.contains("videoOutput.stopRecording()"),
            "The recording branch must cleanly stop the current segment before " +
            "any input swap, instead of removing the input while still recording."
        )
        XCTAssertFalse(
            fn.contains("session.beginConfiguration()"),
            "switchCamera() must not touch the session directly while recording — " +
            "the swap only happens after the segment finishes, in performCameraSwitch."
        )
    }

    func test_switchCamera_guardsReentrancyWhileAlreadySwitching() throws {
        let source = try cameraViewSource()
        let fn = try body(from: "func switchCamera() {", to: "func performCameraSwitch", in: source)
        XCTAssertTrue(
            fn.contains("guard !isSwitchingCameraDuringRecording else { return }"),
            "switchCamera() must no-op while a previous switch is still settling — " +
            "otherwise a rapid double-tap could start a second stopRecording() " +
            "before the first segment has finished closing."
        )
    }

    func test_stopRecording_queuesRequestWhenCalledMidSwitch() throws {
        let source = try cameraViewSource()
        let fn = try body(from: "func stopRecording() {", to: "private func handleSegmentFinished", in: source)
        XCTAssertTrue(
            fn.contains("pendingStopRequested = true"),
            "stopRecording() called while a camera switch is mid-flight must " +
            "queue the stop instead of calling videoOutput.stopRecording() " +
            "directly — the movie output has no active recording at that instant " +
            "(the segment just closed), so an immediate second stop is a no-op " +
            "that silently drops the user's tap."
        )
    }

    func test_startRecording_resetsSwitchStateForANewSession() throws {
        let source = try cameraViewSource()
        let fn = try body(from: "func startRecording() {", to: "private func startSegment()", in: source)
        for expected in ["recordedSegmentURLs = []", "isSwitchingCameraDuringRecording = false", "pendingStopRequested = false"] {
            XCTAssertTrue(
                fn.contains(expected),
                "startRecording() must reset \(expected) — stale state from a " +
                "previous recording session must never leak into a new one."
            )
        }
    }

    func test_handleSegmentFinished_onlyMergesWhenMoreThanOneSegment() throws {
        let source = try cameraViewSource()
        let fn = try body(from: "func handleSegmentFinished", to: "nonisolated static func mergeSegments", in: source)
        XCTAssertTrue(
            fn.contains("segments.count > 1 ? await Self.mergeSegments(segments) : segments.first"),
            "The fast path (no camera switch occurred, exactly one segment) must " +
            "skip the composition/export round-trip entirely and use the raw " +
            "recording file directly — re-encoding a single untouched segment " +
            "would be a pointless quality/CPU cost."
        )
    }

    func test_handleSegmentFinished_midSwitch_neverTogglesIsRecordingVideoFalse() throws {
        let source = try cameraViewSource()
        let fn = try body(from: "func handleSegmentFinished", to: "nonisolated static func mergeSegments", in: source)
        guard let switchBranchStart = fn.range(of: "if isSwitchingCameraDuringRecording {") else {
            XCTFail("Could not locate the mid-switch branch in handleSegmentFinished"); return
        }
        let switchBranchEnd = fn.range(of: "\n        }\n\n        // Final stop.", range: switchBranchStart.upperBound..<fn.endIndex)?.lowerBound ?? fn.endIndex
        let switchBranch = String(fn[switchBranchStart.lowerBound..<switchBranchEnd])
        XCTAssertFalse(
            switchBranch.contains("isRecordingVideo = false"),
            "The mid-switch branch must never set isRecordingVideo = false — " +
            "doing so would flash the 'not recording' UI state during a segment " +
            "restart the user never asked to pause."
        )
    }

    // MARK: - mergeSegments structure (see CameraModelSegmentMergeTests for why
    // this is pinned structurally rather than via synthetic AVFoundation media)

    private func mergeSegmentsBody() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Components/CameraSegmentMerger.swift")
        let source = try String(contentsOf: url, encoding: .utf8)
        return try body(from: "static func merge(_ urls: [URL]) async -> URL? {", to: "\n}", in: source)
    }

    func test_mergeSegments_skipsUnreadableSegmentsInsteadOfFailingEntirely() throws {
        let fn = try mergeSegmentsBody()
        XCTAssertTrue(
            fn.contains("duration = try await asset.load(.duration)"),
            "Loading a segment's duration must be attempted with a real `try`, " +
            "not a silently-swallowing `try?` — a genuine failure is worth a log."
        )
        XCTAssertTrue(
            fn.contains("guard duration.isValid, duration > .zero else { continue }"),
            "A segment whose duration can't be loaded (e.g. a URL that no " +
            "longer resolves to a real file) must be skipped with `continue`, " +
            "not abort the whole merge — the surviving segments still deserve " +
            "a best-effort stitched result."
        )
        let catchBlock = try body(from: "duration = try await asset.load(.duration)", to: "guard duration.isValid", in: fn)
        XCTAssertTrue(
            catchBlock.contains("continue"),
            "The catch branch for a failed duration load must itself `continue` " +
            "to the next segment — the same fail-soft guarantee `try?` used to " +
            "provide silently, now with a diagnostic log alongside it."
        )
    }

    func test_mergeSegments_accumulatesDurationAcrossSegments() throws {
        let fn = try mergeSegmentsBody()
        XCTAssertTrue(
            fn.contains("cursor = cursor + duration"),
            "Each segment must be inserted at the running `cursor` and advance " +
            "it by its own duration — concatenating segments back-to-back, not " +
            "overlapping them at time zero."
        )
        XCTAssertTrue(
            fn.contains("guard cursor > .zero"),
            "If every segment was unreadable (cursor never advanced), the " +
            "export must be skipped rather than exporting an empty composition."
        )
    }

    /// Depuis que le micro n'est demandé qu'au passage en mode Vidéo (et qu'un
    /// refus laisse filmer sans son), les segments peuvent n'avoir AUCUNE piste
    /// audio. Le stitching doit rester tolérant piste par piste : traiter
    /// l'absence de piste audio comme une erreur ferait perdre toute la
    /// capture d'un utilisateur ayant refusé le micro.
    func test_mergeSegments_toleratesSegmentsWithoutAudioTrack() throws {
        let fn = try mergeSegmentsBody()
        XCTAssertTrue(
            fn.contains("if let assetAudioTrack = try await asset.loadTracks(withMediaType: .audio).first"),
            "L'insertion de la piste audio doit être conditionnelle — un segment " +
            "filmé sans micro autorisé n'a pas de piste audio et ne doit pas " +
            "faire échouer le merge. `try` (pas `try?`) car l'appel est désormais " +
            "protégé par un `do/catch` qui journalise un VRAI échec, distinct " +
            "de l'absence de piste (qui ne lève rien, juste .first == nil)."
        )
        XCTAssertTrue(
            fn.contains("if let assetVideoTrack = try await asset.loadTracks(withMediaType: .video).first"),
            "Même tolérance côté vidéo : une piste manquante saute, elle n'annule pas le merge."
        )
        XCTAssertFalse(
            fn.contains("guard let assetAudioTrack"),
            "Un `guard` sur la piste audio abandonnerait la capture entière d'un " +
            "enregistrement muet — exactement le cas d'un refus micro."
        )
        XCTAssertFalse(
            fn.contains("try?"),
            "Chaque erreur possible de mergeSegments doit maintenant être " +
            "journalisée via Logger.media plutôt qu'avalée silencieusement par " +
            "`try?` — le comportement de repli (continue / piste sautée) reste " +
            "identique, seule la trace de diagnostic est nouvelle."
        )
    }

    /// **Le preset se DÉCIDE, il ne se cite plus** (#5052).
    ///
    /// Ce témoin épinglait le littéral `AVAssetExportPresetHighestQuality`, sur
    /// une intention juste : « ceci est une prise vue par l'utilisateur, pas un
    /// rendu de vignette ». `CameraSegmentMergePolicy` sert désormais cette
    /// intention MIEUX que le littéral — `Passthrough` ne ré-encode pas du tout
    /// quand les segments sont homogènes, et le littéral y payait un transcodage
    /// complet pour rien. La garde était donc périmée par un correctif, pas
    /// contredite par lui.
    ///
    /// Elle se RE-VISE sur ce qui reste vrai : l'export délègue à la politique.
    /// Ce que la politique décide est éprouvé ailleurs, par des témoins de
    /// COMPORTEMENT sur une fonction pure — `CameraSegmentMergePolicyTests`, six
    /// cas dont celui qui refuse d'affirmer une homogénéité non mesurée. Une
    /// garde de source n'a pas à redire ce qu'un test de comportement établit.
    func test_mergeSegments_exportsToMovViaThePolicyDecidedPreset() throws {
        let fn = try mergeSegmentsBody()
        XCTAssertTrue(
            fn.contains("CameraSegmentMergePolicy.preset(formats:"),
            "Le preset d'export se DÉCIDE depuis les formats des segments — " +
            "un littéral rendrait la vue 4b impossible à tenir (« concatène des " +
            "pistes déjà encodées, quasi instantané quelle que soit la durée »)."
        )
        XCTAssertTrue(
            fn.contains("AVAssetExportSession(asset: composition, presetName: preset)"),
            "…et la valeur décidée est celle que l'export REÇOIT : une politique " +
            "calculée puis ignorée serait pire qu'un littéral, parce qu'elle " +
            "aurait l'air d'être appliquée."
        )
        XCTAssertTrue(
            fn.contains("exportSession.outputFileType = .mov"),
            "Output must stay .mov, matching every segment's own format " +
            "(startSegment() records to .mov temp files)."
        )
        XCTAssertTrue(
            fn.contains("exportSession.status == .completed ? outputURL : nil"),
            "mergeSegments must only return the output URL when the export " +
            "genuinely reports .completed — a failed/cancelled export must " +
            "surface as nil so callers fail soft to the last segment instead " +
            "of handing off a broken/partial file."
        )
    }
}

/// **Une vidéo interrompue garde ce qui a été filmé** (OPUS-11).
///
/// Un appel entrant, le passage en arrière-plan ou Siri closent la prise avec
/// une erreur ET un fichier valide (`AVErrorRecordingSuccessfullyFinishedKey`).
/// `handleSegmentFinished` jetait tout dès `error != nil` : 40 s de vidéo
/// disparaissaient sans un mot.
@MainActor
final class CameraRecordingInterruptionTests: XCTestCase {

    private func erreur(fichierValide: Bool?) -> NSError {
        var info: [String: Any] = [:]
        if let fichierValide { info[AVErrorRecordingSuccessfullyFinishedKey] = fichierValide }
        return NSError(domain: AVFoundationErrorDomain, code: AVError.Code.sessionWasInterrupted.rawValue, userInfo: info)
    }

    func test_sansErreur_laPriseSuitSonCours() {
        XCTAssertEqual(CameraRecordingEnding.of(nil), .finished)
        XCTAssertEqual(CameraRecordingEnding.finished.next(keptSegments: 1), .asUsual)
    }

    func test_erreurAvecFichierValide_laPriseEstGardee() {
        let fin = CameraRecordingEnding.of(erreur(fichierValide: true))
        XCTAssertEqual(fin, .interrupted)
        XCTAssertTrue(fin.keepsFile)
        XCTAssertEqual(fin.next(keptSegments: 1), .keepWhatWasFilmed)
    }

    func test_erreurSansFichierValide_estUnePerte() {
        XCTAssertEqual(CameraRecordingEnding.of(erreur(fichierValide: false)), .lost)
        XCTAssertEqual(CameraRecordingEnding.of(erreur(fichierValide: nil)), .lost)
        XCTAssertFalse(CameraRecordingEnding.lost.keepsFile)
        XCTAssertEqual(CameraRecordingEnding.lost.next(keptSegments: 0), .nothingToKeep)
    }

    /// Après une bascule d'objectif, les segments déjà pris restent même si le
    /// dernier est illisible.
    func test_pertePartielle_gardeLesSegmentsDejaPris() {
        XCTAssertEqual(CameraRecordingEnding.lost.next(keptSegments: 2), .keepWhatWasFilmed)
    }

    private func source(_ chemin: String) throws -> String {
        let racine = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
        return try String(contentsOf: racine.appendingPathComponent(chemin), encoding: .utf8)
    }

    private func corps(_ texte: String, de debut: String, a fin: String) -> String {
        guard let d = texte.range(of: debut) else { return "" }
        let f = texte.range(of: fin, range: d.upperBound..<texte.endIndex)?.lowerBound ?? texte.endIndex
        return String(texte[d.lowerBound..<f])
    }

    func test_laFinDeSegmentLitLErreurAuLieuDeLaJeter() throws {
        let modele = try source("Meeshy/Features/Main/Components/CameraModel.swift")
            + "\n" + source("Meeshy/Features/Main/Components/CameraModel+Video.swift")
        let fn = corps(modele, de: "func handleSegmentFinished", a: "private func resumeRecordingAfterSwitch")
        XCTAssertFalse(fn.isEmpty)
        XCTAssertFalse(fn.contains("guard error == nil"),
                       "Une erreur n'est pas une perte : AVFoundation livre un fichier valide après une interruption.")
        XCTAssertTrue(fn.contains("CameraRecordingEnding.of(error)"))
        XCTAssertTrue(fn.contains("deliverInterruptedRecording(token: jeton)"))
    }

    func test_laPriseInterrompueEstAnnoncee() throws {
        let modele = try source("Meeshy/Features/Main/Components/CameraModel.swift")
            + "\n" + source("Meeshy/Features/Main/Components/CameraModel+Video.swift")
        let fn = corps(modele, de: "private func deliverInterruptedRecording", a: "private func deliverRecording")
        XCTAssertTrue(fn.contains("await deliverRecording(token: token)"))
        XCTAssertTrue(fn.contains("CameraTakeNotice.announceInterruptedRecording()"),
                      "La coupure doit se dire : l'auteur croyait filmer encore.")
    }

    /// Une photo sans données ne sort plus en silence.
    func test_unePhotoSansDonnees_seDit() throws {
        let modele = try source("Meeshy/Features/Main/Components/CameraModel+PhotoCapture.swift")
        let fn = corps(modele, de: "didFinishProcessingPhoto photo:", a: "let nom = ComposerPhotoEncoding")
        XCTAssertEqual(fn.components(separatedBy: "self.photoWasLost()").count - 1, 2)
        let perte = corps(modele, de: "func photoWasLost()", a: "/// Le tic du cadre")
        XCTAssertTrue(perte.contains("CameraTakeNotice.announceLostPhoto()"))
    }

    /// Un assemblage raté garde le dernier segment ; les autres ne restent pas dans `tmp/`.
    func test_assemblageRate_neLaissePasDeSegmentsOrphelins() throws {
        let modele = try source("Meeshy/Features/Main/Components/CameraModel.swift")
            + "\n" + source("Meeshy/Features/Main/Components/CameraModel+Video.swift")
        let fn = corps(modele, de: "private func deliverRecording", a: "nonisolated static func mergeSegments")
        XCTAssertTrue(fn.contains("for segment in segments.dropLast()"))
    }

    /// Le viseur, encore « en prise », se clôt lui aussi : sinon le cadenas et le
    /// chrono restent affichés sur une caméra qui ne filme plus.
    func test_leViseurClotUnePriseCloseParLeSysteme() throws {
        let prises = try source("Meeshy/Features/Composer/ComposerCaptureSession+Takes.swift")
        let fn = corps(prises, de: "func videoArrived(", a: "switch intent {")
        XCTAssertTrue(fn.contains("if stage == .recording { closeTake() }"))
    }
}
