import XCTest
@testable import Meeshy

// MARK: - CallSignalStrength mapping

/// Le glyphe signal (barres + code couleur) est un MAPPING PUR des niveaux de
/// qualité déjà mesurés (`VideoQualityLevel` stats RTT+perte, `PeerConnectionState`
/// en repli) — aucune heuristique nouvelle. Ces tests verrouillent le mapping.
@MainActor
final class CallSignalStrengthTests: XCTestCase {

    // MARK: - Stats level takes precedence

    func test_from_excellentLevel_returnsExcellent() {
        XCTAssertEqual(CallSignalStrength.from(level: .excellent, connection: .failed), .excellent)
    }

    func test_from_goodLevel_returnsGood() {
        XCTAssertEqual(CallSignalStrength.from(level: .good, connection: .disconnected), .good)
    }

    func test_from_fairLevel_returnsFair() {
        XCTAssertEqual(CallSignalStrength.from(level: .fair, connection: .connected), .fair)
    }

    func test_from_poorLevel_returnsPoor() {
        XCTAssertEqual(CallSignalStrength.from(level: .poor, connection: .connected), .poor)
    }

    func test_from_criticalLevel_returnsLost() {
        XCTAssertEqual(CallSignalStrength.from(level: .critical, connection: .connected), .lost)
    }

    // MARK: - ICE state fallback (no stats tick yet)

    func test_from_nilLevel_connected_returnsGood() {
        XCTAssertEqual(CallSignalStrength.from(level: nil, connection: .connected), .good)
    }

    func test_from_nilLevel_reconnecting_returnsFair() {
        XCTAssertEqual(CallSignalStrength.from(level: nil, connection: .reconnecting), .fair)
    }

    func test_from_nilLevel_failed_returnsLost() {
        XCTAssertEqual(CallSignalStrength.from(level: nil, connection: .failed), .lost)
    }

    func test_from_nilLevel_connecting_returnsConnecting() {
        XCTAssertEqual(CallSignalStrength.from(level: nil, connection: .connecting), .connecting)
    }

    // MARK: - Bars fraction (cellularbars variable value)

    func test_barsFraction_decreasesMonotonically_withDegradation() {
        XCTAssertGreaterThan(CallSignalStrength.excellent.barsFraction, CallSignalStrength.good.barsFraction)
        XCTAssertGreaterThan(CallSignalStrength.good.barsFraction, CallSignalStrength.fair.barsFraction)
        XCTAssertGreaterThan(CallSignalStrength.fair.barsFraction, CallSignalStrength.poor.barsFraction)
        XCTAssertGreaterThan(CallSignalStrength.poor.barsFraction, CallSignalStrength.lost.barsFraction)
    }

    // MARK: - isDegraded (drives glyph visibility)

    func test_isDegraded_trueForFairPoorLost() {
        XCTAssertTrue(CallSignalStrength.fair.isDegraded)
        XCTAssertTrue(CallSignalStrength.poor.isDegraded)
        XCTAssertTrue(CallSignalStrength.lost.isDegraded)
    }

    func test_isDegraded_falseForHealthyAndInitialConnecting() {
        // `.connecting` n'est pas dégradé : la négociation initiale ne doit
        // pas faire surgir le glyphe — seule une dégradation réelle le montre.
        XCTAssertFalse(CallSignalStrength.excellent.isDegraded)
        XCTAssertFalse(CallSignalStrength.good.isDegraded)
        XCTAssertFalse(CallSignalStrength.connecting.isDegraded)
    }

    // MARK: - Recovery linger window

    func test_recoveryLinger_is30Seconds() {
        // Retour user 2026-07-04 : après récupération le glyphe reste VERT
        // 30 s puis disparaît — assez long pour rassurer, pas permanent.
        XCTAssertEqual(TransientCallSignalGlyph.recoveryLingerSeconds, 30)
    }

    // MARK: - Accessibility label must describe signal QUALITY, never a connection EVENT

    /// `.fair`/`.poor`/`.lost` are reachable both via a live, fully `.connected`
    /// link (real-time RTT/loss stats) AND via the pre-first-sample ICE fallback
    /// — the case alone cannot tell which. A VoiceOver label claiming
    /// "Reconnecting"/"Connection lost" on a healthy-but-degraded `.connected`
    /// call is actively false; only signal-strength wording is honest in both
    /// branches. Asserted on the resolved live property (not source text) —
    /// none of the 5 locale translations for these keys contain the old
    /// connection-event wording, so this holds regardless of test-runtime locale.
    func test_accessibilityLabel_fairOnHealthyConnection_doesNotClaimReconnecting() {
        let strength = CallSignalStrength.from(level: .fair, connection: .connected)
        XCTAssertEqual(strength, .fair)
        XCTAssertFalse(
            strength.accessibilityLabel.localizedCaseInsensitiveContains("reconnec"),
            "`.fair` on a `.connected` link is a live quality metric, not a reconnection " +
            "event — the label must describe signal strength, e.g. \"Fair signal\"."
        )
    }

    func test_accessibilityLabel_poorOnHealthyConnection_doesNotClaimConnectionLost() {
        let strength = CallSignalStrength.from(level: .poor, connection: .connected)
        XCTAssertEqual(strength, .poor)
        XCTAssertFalse(
            strength.accessibilityLabel.localizedCaseInsensitiveContains("lost")
                && !strength.accessibilityLabel.localizedCaseInsensitiveContains("signal"),
            "`.poor` on a `.connected` link must not be announced as \"Connection lost\"."
        )
        XCTAssertFalse(strength.accessibilityLabel.localizedCaseInsensitiveContains("perdu"))
    }

    func test_accessibilityLabel_poorAndLost_areDistinctStrings() {
        // Before this fix both cases shared the single "Connexion perdue"/
        // "Connection lost" label — a VoiceOver user could not tell mild
        // degradation (`.poor`) from a near-total loss (`.lost`) apart.
        XCTAssertNotEqual(
            CallSignalStrength.poor.accessibilityLabel,
            CallSignalStrength.lost.accessibilityLabel
        )
    }
}

// MARK: - DataChannel inbound routing

/// Le raccroché in-band (`{"type":"bye"}`) partage le data channel avec la
/// transcription et le ping keep-alive — le routage doit isoler chaque cas
/// sans jamais confondre un segment avec un ordre de teardown.
final class DataChannelInboundTests: XCTestCase {

    func test_decode_bye_withReason_returnsBye() {
        let data = Data(#"{"type":"bye","reason":"completed"}"#.utf8)
        XCTAssertEqual(DataChannelInbound.decode(data), .bye(reason: "completed"))
    }

    func test_decode_bye_withoutReason_returnsBye() {
        let data = Data(#"{"type":"bye"}"#.utf8)
        XCTAssertEqual(DataChannelInbound.decode(data), .bye(reason: nil))
    }

    func test_decode_ping_isIgnored() {
        let data = Data(#"{"type":"ping"}"#.utf8)
        XCTAssertEqual(DataChannelInbound.decode(data), .ignored)
    }

    func test_decode_garbage_isIgnored() {
        XCTAssertEqual(DataChannelInbound.decode(Data("not json".utf8)), .ignored)
        XCTAssertEqual(DataChannelInbound.decode(Data(#"{"type":"unknown-future"}"#.utf8)), .ignored)
    }

    func test_decode_transcriptEntry_returnsTypedEntry() {
        let data = Data("""
        {"type":"transcript-entry","entry":{"id":"w-1","callId":"call-1","speakerId":"user-2",\
        "speakerDisplayName":"Alice","text":"Bonjour","language":"fr",\
        "capturedAtMs":1765650000000,"isFinal":true,"confidence":0.9}}
        """.utf8)
        let expected = DataChannelTranscriptEntry(
            id: "w-1", callId: "call-1", speakerId: "user-2",
            speakerDisplayName: "Alice", text: "Bonjour", language: "fr",
            capturedAtMs: 1_765_650_000_000, isFinal: true, confidence: 0.9
        )
        XCTAssertEqual(DataChannelInbound.decode(data), .transcriptEntry(expected))
    }

    func test_decode_transcriptEntry_missingRequiredField_isIgnored() {
        // A future peer sending a richer shape must degrade to .ignored, never
        // crash or mis-route — same tolerance as unknown control types.
        let data = Data(#"{"type":"transcript-entry","entry":{"id":"w-1"}}"#.utf8)
        XCTAssertEqual(DataChannelInbound.decode(data), .ignored)
    }

    func test_decode_transcriptEntry_roundTripsThroughEncoder() throws {
        // Sender (WebRTCService.sendTranscriptEntry) and receiver
        // (DataChannelInbound.decode) must agree on the envelope.
        let entry = DataChannelTranscriptEntry(
            id: "w-2", callId: "call-9", speakerId: "user-1",
            speakerDisplayName: "Bob", text: "Hola", language: "es",
            capturedAtMs: 42, isFinal: true, confidence: 1.0
        )
        let encoded = try JSONEncoder().encode(DataChannelTranscriptMessage(type: "transcript-entry", entry: entry))
        XCTAssertEqual(DataChannelInbound.decode(encoded), .transcriptEntry(entry))
    }
}

// MARK: - Hangup fast-path wiring (source inspection)

/// Le « bye » in-band n'a de valeur que s'il part AVANT le teardown local
/// (qui ferme la peer connection) et que le canal existe côté offreur.
@MainActor
final class CallHangupFastPathTests: XCTestCase {

    private func source(_ path: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Services/
            .deletingLastPathComponent()   // Unit/
            .deletingLastPathComponent()   // MeeshyTests/
            .deletingLastPathComponent()   // ios/
            .appendingPathComponent(path)
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_endCall_sendsInBandBye_beforeLocalTeardown() throws {
        let manager = try source("Meeshy/Features/Main/Services/CallManager.swift")
        guard let endCallRange = manager.range(of: "func endCall()") else {
            XCTFail("CallManager must define endCall()")
            return
        }
        let end = manager.range(
            of: "// MARK: - System Picture-in-Picture",
            range: endCallRange.upperBound ..< manager.endIndex
        )?.lowerBound ?? manager.endIndex
        let body = String(manager[endCallRange.lowerBound ..< end])
        guard let byeIndex = body.range(of: "sendHangupBye()"),
              let teardownIndex = body.range(of: "endCallInternal(reason:") else {
            XCTFail("endCall() must send the in-band bye AND perform the local teardown")
            return
        }
        XCTAssertLessThan(
            byeIndex.lowerBound, teardownIndex.lowerBound,
            "The DataChannel bye must be sent BEFORE endCallInternal — the teardown closes " +
            "the peer connection, after which the bye can no longer reach the peer."
        )
    }

    func test_createOffer_createsControlChannel_beforeTheOffer() throws {
        let service = try source("Meeshy/Features/Main/Services/WebRTCService.swift")
        guard let offerRange = service.range(of: "func createOffer()") else {
            XCTFail("WebRTCService must define createOffer()")
            return
        }
        let end = service.index(offerRange.lowerBound, offsetBy: 1200, limitedBy: service.endIndex) ?? service.endIndex
        let body = String(service[offerRange.lowerBound ..< end])
        XCTAssertTrue(
            body.contains("createDataChannel(label: \"transcription\")"),
            "createOffer() must create the data channel BEFORE the SDP offer so the " +
            "m=application section is negotiated — without it neither the in-band bye " +
            "nor the remote transcription segments have a transport."
        )
    }

    func test_dataChannelCreation_isIdempotent_acrossRenegotiations() throws {
        let client = try source("Meeshy/Features/Main/Services/WebRTC/P2PWebRTCClient.swift")
        guard let range = client.range(of: "func createDataChannel(label: String) -> Bool {") else {
            XCTFail("P2PWebRTCClient must define createDataChannel")
            return
        }
        let end = client.index(range.lowerBound, offsetBy: 700, limitedBy: client.endIndex) ?? client.endIndex
        let body = String(client[range.lowerBound ..< end])
        XCTAssertTrue(
            body.contains("if transcriptionDataChannel != nil { return true }"),
            "createDataChannel must be idempotent — renegotiation offers (ICE restart, " +
            "video escalation) must not stack a second channel on the same peer connection."
        )
    }

    /// A start failure (permission denied, no on-device recognizer for the
    /// user's language — never falls back to Apple's server-side recognizer,
    /// privacy decision — or an AVAudioEngine failure) used to leave the
    /// transcript panel open and silently empty, with zero user feedback —
    /// user-reported 2026-07-11 "on dirait que la transcription ne fonctionne
    /// pas" (observed on Mac). Le toast reste la réponse à ce signalement.
    ///
    /// Ce que le spec 2026-08-13 (« Cycle de vie du panneau », itération 2) a
    /// CHANGÉ : l'échec du moteur LOCAL ne ferme plus le panneau. La réception
    /// des segments du pair est désormais gâtée sur la visibilité du panneau
    /// (`isShowingOverlay`, gardes dans `CallManager`) — le fermer ici
    /// couperait aussi le flux du correspondant, alors que seule MA
    /// transcription a échoué. Le panneau reste donc ouvert en RÉCEPTION
    /// SEULE. Ce garde protège maintenant les deux moitiés de cette décision :
    /// le toast part, le panneau ne se ferme pas — et il reste FERMABLE parce
    /// que le cycle est dérivé du PANNEAU (`isShowingOverlay`) depuis le
    /// 2026-08-19, plus de `isTranscribing`. La branche-rustine qui rendait le
    /// panneau fermable après un échec moteur a disparu avec sa cause.
    func test_lastError_surfacesAsToast_andKeepsTranscriptPanelOpenForReceiveOnly() throws {
        let view = try source("Meeshy/Features/Main/Views/CallView.swift")
        guard let range = view.range(of: "adaptiveOnChange(of: transcriptionService.lastError)") else {
            XCTFail("CallView must observe transcriptionService.lastError")
            return
        }
        // Borné à l'accolade fermante du handler (indentation 8) plutôt qu'à
        // une fenêtre d'octets : l'assertion négative ci-dessous n'a de sens
        // que si la découpe s'arrête vraiment à la fin du closure.
        let end = view.range(of: "\n        }", range: range.upperBound ..< view.endIndex)?.upperBound
            ?? view.endIndex
        let body = String(view[range.lowerBound ..< end])
        XCTAssertTrue(
            body.contains("FeedbackToastManager.shared.showError(transcriptionErrorMessage(for: newError))"),
            "A fresh transcription error must surface as a local-action error toast " +
            "(FeedbackToastManager, not NotificationToastManager — this is feedback on a " +
            "user-initiated tap, not a network-originated event)."
        )
        XCTAssertFalse(
            body.contains("showTranscript = false") || body.contains("isShowingOverlay = false"),
            "A failed LOCAL engine must NOT close the transcript panel: reception of the " +
            "peer's segments is gated on the panel being visible (spec 2026-08-13), so " +
            "closing it here would also cut the interlocutor's stream — the panel stays " +
            "open in receive-only mode."
        )

        // Contrepartie indissociable : le panneau resté ouvert doit rester
        // FERMABLE. C'était assuré par une branche-rustine dédiée tant que le
        // cycle se dérivait de `isTranscribing` — un moteur en échec laissait
        // `captionsMode == .off` avec le panneau visible, et le tap suivant
        // relançait le démarrage au lieu de fermer. Depuis le 2026-08-19 le
        // cycle se dérive du PANNEAU : `isShowingOverlay == true` ⇒ le mode
        // n'est jamais `.off`, le cycle avance normalement et `.off` ferme.
        // La rustine a disparu avec sa cause ; c'est l'invariant qui est gardé
        // ici, pas la ligne qui l'implémentait.
        XCTAssertTrue(
            view.contains("CaptionsMode(isShowingCaptions: transcriptionService.isShowingOverlay"),
            "captionsMode doit se dériver du PANNEAU. Le dériver d'`isTranscribing` rend le " +
            "panneau infermable après un échec du moteur local — et, depuis que la capture " +
            "démarre aussi pour servir un pair, allumerait le bouton sans que l'utilisateur " +
            "local ait rien demandé."
        )

        guard let cycleRange = view.range(of: "private func advanceCaptionsMode() {") else {
            XCTFail("CallView must define advanceCaptionsMode()")
            return
        }
        let cycleEnd = view.range(of: "\n    }", range: cycleRange.upperBound ..< view.endIndex)?.upperBound
            ?? view.endIndex
        let cycleBody = String(view[cycleRange.lowerBound ..< cycleEnd])
        guard let offRange = cycleBody.range(of: "case .off:") else {
            XCTFail("advanceCaptionsMode must handle .off")
            return
        }
        let offBranch = String(cycleBody[offRange.upperBound...])
        XCTAssertTrue(
            offBranch.contains("showTranscript = false") && offBranch.contains("isShowingOverlay = false"),
            "La branche .off doit fermer le panneau — c'est la sortie du cycle, quelle que soit " +
            "la santé du moteur local."
        )
    }

    func test_captionsCycleButton_actionIsAdvanceCaptionsMode() throws {
        let view = try source("Meeshy/Features/Main/Views/CallView.swift")
        guard let range = view.range(of: "private var captionsCycleButton: some View {") else {
            XCTFail("CallView must define captionsCycleButton")
            return
        }
        let end = view.index(range.lowerBound, offsetBy: 2200, limitedBy: view.endIndex) ?? view.endIndex
        let body = String(view[range.lowerBound ..< end])
        XCTAssertTrue(
            body.contains("Button(action: advanceCaptionsMode)"),
            "captionsCycleButton must drive its 3-state cycle via advanceCaptionsMode() — " +
            "replaces the old transcriptionToggleButton/translationToggleButton pair."
        )
        // The button's own doc comment (Step 3) NAMES .toggleStateAccessibility(isToggle:
        // true, ...) to explain why it's deliberately NOT used — strip comment lines
        // before asserting, or that comment's own text trips a false positive here.
        let code = body
            .split(separator: "\n", omittingEmptySubsequences: false)
            .filter { !$0.trimmingCharacters(in: .whitespaces).hasPrefix("//") }
            .joined(separator: "\n")
        XCTAssertFalse(
            code.contains(".toggleStateAccessibility(isToggle: true"),
            "captionsCycleButton is a 3-state cycle, not a binary toggle — it must not use " +
            "the .isToggle accessibility trait (that implies exactly 2 states)."
        )
    }

    /// Le corps de `transcriptSegmentRow(_:)`, borné à son accolade fermante
    /// (indentation 4) au lieu d'une fenêtre de 2000 caractères. Le spec
    /// 2026-08-13 a allongé la ligne de journal (nom + heure + badge de
    /// langue) et le corps dépasse désormais cette fenêtre : les gardes
    /// mesuraient une portée qui n'était plus celle de la fonction.
    private func transcriptSegmentRowBody(_ view: String) -> String? {
        guard let decl = view.range(of: "func transcriptSegmentRow(") else { return nil }
        let end = view.range(of: "\n    }", range: decl.upperBound ..< view.endIndex)?.upperBound
            ?? view.endIndex
        return String(view[decl.lowerBound ..< end])
    }

    func test_transcriptSegmentRow_usesPrimarySecondaryColorsPerSpeaker() throws {
        let view = try source("Meeshy/Features/Main/Views/CallView.swift")
        guard let body = transcriptSegmentRowBody(view) else {
            XCTFail("CallView must define transcriptSegmentRow(_:)")
            return
        }
        XCTAssertTrue(
            body.contains("MeeshyColors.indigo400"),
            "transcriptSegmentRow must color the local speaker (\"Moi\") with MeeshyColors.indigo400 " +
            "— the codebase's established \"secondary elements\" tone."
        )
        XCTAssertTrue(
            body.contains("MeeshyColors.brandPrimary"),
            "transcriptSegmentRow must color the remote speaker with MeeshyColors.brandPrimary " +
            "— the signature brand color, used for the interlocutor."
        )
    }

    /// Le nom du locuteur reste du TEXTE VISIBLE, pas seulement une pastille
    /// colorée (demande utilisateur 2026-07-11) ni seulement un label
    /// VoiceOver. Le spec 2026-08-13 a fusionné nom et heure dans une seule
    /// ligne de journal `displayName (heure)` : `Text(speakerName)` est devenu
    /// `Text("\(speakerName) (\(timeLabel))")`. La garantie tient toujours,
    /// l'expression a changé — le garde suit l'expression nouvelle.
    func test_transcriptSegmentRow_showsSpeakerNameAsVisibleText() throws {
        let view = try source("Meeshy/Features/Main/Views/CallView.swift")
        guard let body = transcriptSegmentRowBody(view) else {
            XCTFail("CallView must define transcriptSegmentRow(_:)")
            return
        }
        XCTAssertTrue(
            body.contains("Text(\"\\(speakerName)"),
            "transcriptSegmentRow must render the speaker's name inside a visible Text, " +
            "not just a colored dot — user-requested 2026-07-11."
        )
        // Discriminant : `speakerName` est aussi interpolé dans
        // `.accessibilityLabel`. Sans cette assertion, un rendu qui
        // n'exposerait le nom qu'à VoiceOver satisferait le garde ci-dessus si
        // l'ordre des deux occurrences venait à changer.
        XCTAssertTrue(
            body.contains(".accessibilityLabel(\"\\(speakerName)"),
            "the combined row must ALSO announce the speaker to VoiceOver — visible text and " +
            "accessibility label are two distinct requirements, neither substitutes for the other."
        )
    }

    func test_advanceCaptionsMode_off_startsTranscriptionAndLandsOnTranslated() throws {
        let view = try source("Meeshy/Features/Main/Views/CallView.swift")
        guard let range = view.range(of: "private func advanceCaptionsMode() {") else {
            XCTFail("CallView must define advanceCaptionsMode()")
            return
        }
        // Borné à l'accolade fermante de la fonction, commentaires retirés.
        // La fenêtre de 900 caractères qu'utilisait ce garde a été mangée par
        // le commentaire de douze lignes qui documente la branche d'échappement
        // « réception seule » (spec 2026-08-13) : le `switch` tombait hors
        // fenêtre alors qu'il n'avait pas bougé.
        let end = view.range(of: "\n    }", range: range.upperBound ..< view.endIndex)?.upperBound
            ?? view.endIndex
        let body = String(view[range.lowerBound ..< end])
            .split(separator: "\n", omittingEmptySubsequences: false)
            .filter { !$0.trimmingCharacters(in: .whitespaces).hasPrefix("//") }
            .joined(separator: "\n")

        guard
            let translatedRange = body.range(of: "case .translated:"),
            let originalRange = body.range(of: "case .original:"),
            let offRange = body.range(of: "case .off:")
        else {
            XCTFail("advanceCaptionsMode must switch over the 3 captions modes")
            return
        }
        // Assertions PAR BRANCHE : chercher les jetons dans le corps entier
        // laisserait la branche .off — qui appelle elle aussi
        // toggleTranscription() — satisfaire le garde de la branche
        // .translated.
        let translatedBranch = String(body[translatedRange.upperBound ..< originalRange.lowerBound])
        let originalBranch = String(body[originalRange.upperBound ..< offRange.lowerBound])

        XCTAssertTrue(
            translatedBranch.contains("callManager.toggleTranscription()"),
            "advanceCaptionsMode's .translated branch must call callManager.toggleTranscription() " +
            "— this is the entry point that actually starts transcription."
        )
        XCTAssertTrue(
            originalBranch.contains("showOriginalText = true"),
            "advanceCaptionsMode's .original branch must flip showOriginalText."
        )
        XCTAssertFalse(
            originalBranch.contains("toggleTranscription"),
            "advanceCaptionsMode's .original branch must NOT call toggleTranscription() again — " +
            "transcription keeps running, only the display flag changes; toggling here would " +
            "stop the engine one third of the way round the cycle."
        )
    }

    func test_connectedView_floatingStack_wrapsCaptionsCycleButtonInAdaptiveGlassContainer() throws {
        let view = try source("Meeshy/Features/Main/Views/CallView.swift")
        guard let range = view.range(of: "captionsCycleButton") else {
            XCTFail("CallView must reference captionsCycleButton")
            return
        }
        // Search backward up to 200 chars from the reference for AdaptiveGlassContainer,
        // confirming the floating stack shares a glass container (glass can't sample glass).
        let searchStart = view.index(range.lowerBound, offsetBy: -200, limitedBy: view.startIndex) ?? view.startIndex
        let body = String(view[searchStart ..< range.lowerBound])
        XCTAssertTrue(
            body.contains("AdaptiveGlassContainer"),
            "The floating trailing-edge stack must wrap captionsCycleButton in " +
            "AdaptiveGlassContainer, matching controlBar's own pattern."
        )
    }

    func test_connectedView_audioPath_usesStructuralTranscriptPanel_notFloatingOverlay() throws {
        let view = try source("Meeshy/Features/Main/Views/CallView.swift")
        guard let range = view.range(of: "private var connectedView: some View {") else {
            XCTFail("CallView must define connectedView")
            return
        }
        let end = view.index(range.lowerBound, offsetBy: 4000, limitedBy: view.endIndex) ?? view.endIndex
        let body = String(view[range.lowerBound ..< end])
        XCTAssertTrue(
            body.contains("compactAudioCallHeader"),
            "connectedView must show a compacted header (avatar + name, no status pills) " +
            "when captions are active on an audio call — user-requested 2026-07-11."
        )
        XCTAssertTrue(
            body.contains("transcriptPanel"),
            "connectedView must show the structural (non-overlay) transcriptPanel " +
            "for the audio-call captions layout."
        )
    }

    func test_transcriptOverlay_callSite_isGatedOnVideoUIActive() throws {
        // Regression guard for the 2026-07-11 fix: transcriptOverlay used to
        // run unconditionally, so on an audio call with captions on, the SAME
        // transcriptSegmentsList rendered TWICE — once via the structural
        // transcriptPanel, once via the floating transcriptOverlay.
        let view = try source("Meeshy/Features/Main/Views/CallView.swift")
        guard let range = view.range(of: "if callManager.isVideoUIActive {\n                transcriptOverlay\n            }") else {
            XCTFail("transcriptOverlay's call site must be gated on callManager.isVideoUIActive")
            return
        }
        _ = range
    }

    /// Chaque ligne porte un horodatage, et il vient de `segment.capturedAt`
    /// — JAMAIS de `startTime`/`endTime`, qui sont relatifs au buffer ASR
    /// (voir le doc comment de `TranscriptionSegment.capturedAt`). C'est la
    /// moitié portante de la demande utilisateur 2026-07-11 et elle est
    /// intacte.
    ///
    /// Ce qui a changé : l'heure affichée n'est plus l'ÉCOULÉ depuis le début
    /// de l'appel (`capturedAt.timeIntervalSince(callManager.callStartDate)`
    /// mis en forme par `CallManager.formatDuration`) mais l'HORLOGE MURALE de
    /// capture — spec 2026-08-13, tableau « Composants modifiés » : « ligne
    /// `displayName (heure)` (horloge murale, plus l'écoulé) », objectif §1
    /// « ordonnées par l'horloge murale de CAPTURE », décision §3
    /// « `capturedAtMs` est la clé d'ordre du journal ». Un écoulé n'a plus de
    /// sens dans un journal fusionné entre appareils : `callStartDate` est
    /// local à CE device (il est même nil avant l'établissement média), alors
    /// que `capturedAt` est estampillé par le device du LOCUTEUR et transporté
    /// par le wire — c'est la seule référence commune aux deux côtés de
    /// l'appel.
    func test_transcriptSegmentRow_showsCaptureWallClockTime_neverASRRelativeOffsets() throws {
        let view = try source("Meeshy/Features/Main/Views/CallView.swift")
        guard let body = transcriptSegmentRowBody(view) else {
            XCTFail("CallView must define transcriptSegmentRow(_:)")
            return
        }
        XCTAssertTrue(
            body.contains("let timeLabel = segment.capturedAt.formatted("),
            "transcriptSegmentRow must derive its timestamp from segment.capturedAt — the wall " +
            "clock stamped by the SPEAKER's device and carried over the wire, the only reference " +
            "both sides of the call share (callStartDate is local to this device, and nil before " +
            "media is established)."
        )
        XCTAssertTrue(
            body.contains("(\\(timeLabel))"),
            "the resolved timeLabel must actually reach the rendered journal line — computing it " +
            "and not displaying it would satisfy the assertion above while showing nothing."
        )
        XCTAssertFalse(
            body.contains("segment.startTime") || body.contains("segment.endTime"),
            "transcriptSegmentRow must NEVER timestamp a line from startTime/endTime: those are " +
            "ASR-buffer-relative (see TranscriptionSegment.capturedAt's own doc comment), so they " +
            "drift with every recognizer restart and mean nothing to the peer."
        )
    }

    func test_connectedView_stillReferencesUnmovedElements() throws {
        // Regression guard: the layout restructuring must not drop or relocate
        // pipView / showEffectsToolbar's trigger — spec risk table. (The
        // reconnectingBanner this guard used to also name was removed
        // 2026-07-11 — see test_reconnecting_usesCompactStatusPill_notFullScreenBanner.)
        let view = try source("Meeshy/Features/Main/Views/CallView.swift")
        guard let range = view.range(of: "private var connectedView: some View {") else {
            XCTFail("CallView must define connectedView")
            return
        }
        let end = view.index(range.lowerBound, offsetBy: 9000, limitedBy: view.endIndex) ?? view.endIndex
        let body = String(view[range.lowerBound ..< end])
        XCTAssertTrue(body.contains("pipView"), "connectedView must still reference pipView")
    }

    /// Transparence du consentement : un appareil ne doit JAMAIS accumuler en
    /// silence les paroles de l'autre participant sans rien afficher.
    ///
    /// Cette garantie était d'abord tenue par une AUTO-RÉVÉLATION du panneau
    /// au premier segment reçu (spec 2026-07-11 §4). Le spec 2026-08-13
    /// (« Cycle de vie du panneau », itération 2 §1) l'a RETIRÉE au profit
    /// d'un mécanisme plus fort, à la source : la réception elle-même est liée
    /// au panneau — « Panneau caché ⇒ désabonnement des canaux de réception ET
    /// d'émission […] L'auto-révélation du panneau au premier segment reçu
    /// (spec 2026-07-11 §4) est RETIRÉE — panneau caché ⇒ plus aucun segment
    /// ne peut arriver, la règle n'a plus d'objet. »
    ///
    /// Le garde suit la garantie, pas sa vieille forme : il vérifie désormais
    /// que les DEUX points d'entrée de réception de `CallManager` (le sink
    /// socket `callTranslatedSegmentReceived` et le routage data channel
    /// `.transcriptEntry`) refusent tout segment panneau fermé. Un seul des
    /// deux gardé laisserait le trou ouvert sur l'autre transport.
    func test_passiveSegments_neverAccumulateWhileTranscriptPanelHidden() throws {
        // L'ancienne forme ne doit pas revenir sans que ce garde soit revu :
        // ré-ouvrir le panneau tout seul, alors que rien ne peut plus arriver
        // panneau fermé, ne ferait qu'afficher un panneau vide.
        let view = try source("Meeshy/Features/Main/Views/CallView.swift")
        XCTAssertFalse(
            view.contains("adaptiveOnChange(of: transcriptionService.segments.isEmpty)"),
            "The 2026-07-11 auto-reveal observer was retired by spec 2026-08-13 — reception is " +
            "now gated on the panel being visible, so nothing can arrive while it is hidden."
        )

        let manager = try source("Meeshy/Features/Main/Services/CallManager.swift")
        let gate = "guard self.transcriptionService.isShowingOverlay else { return }"

        guard let socketRange = manager.range(of: "socket.callTranslatedSegmentReceived") else {
            XCTFail("CallManager must subscribe to socket.callTranslatedSegmentReceived")
            return
        }
        let socketEnd = manager.range(of: ".store(in: &cancellables)", range: socketRange.upperBound ..< manager.endIndex)?
            .upperBound ?? manager.endIndex
        let socketSink = String(manager[socketRange.lowerBound ..< socketEnd])
        XCTAssertTrue(
            socketSink.contains(gate),
            "The relayed (server) reception path must drop segments while the transcript panel " +
            "is hidden — otherwise the device silently accumulates the other participant's " +
            "words with nothing shown, the exact consent-transparency gap this guard exists for."
        )

        guard let channelRange = manager.range(of: "case .transcriptEntry(let entry):") else {
            XCTFail("CallManager must route the data channel's .transcriptEntry case")
            return
        }
        let channelEnd = manager.range(of: "case .ignored:", range: channelRange.upperBound ..< manager.endIndex)?
            .lowerBound ?? manager.endIndex
        let channelRoute = String(manager[channelRange.lowerBound ..< channelEnd])
        XCTAssertTrue(
            channelRoute.contains(gate),
            "The P2P (data channel) reception path must carry the SAME panel gate as the socket " +
            "sink — gating only one transport leaves the peer's words flowing in over the other."
        )
    }
}

// MARK: - CallSignalGlyph Reduce Motion (source inspection)

/// Audit P2-iOS-9 covered every other animated element in the call chrome
/// (pulsingAvatar, IncomingCallView's ring/bounce, IslandEmergingBanner,
/// FloatingCallPillView's slide-in, CallWaitingBannerView's slide-in) but
/// missed the signal glyph — its bars-changing and appear/disappear
/// animations ran unconditionally regardless of Reduce Motion.
@MainActor
final class CallSignalGlyphReduceMotionTests: XCTestCase {

    private func glyphSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Components/CallSignalGlyph.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_glyph_declaresReduceMotionEnvironment() throws {
        let source = try glyphSource()
        XCTAssertTrue(
            source.contains("@Environment(\\.accessibilityReduceMotion) private var reduceMotion"),
            "CallSignalGlyph and TransientCallSignalGlyph must read accessibilityReduceMotion " +
            "like every other animated element in the call chrome."
        )
    }

    func test_barsAnimation_isGatedByReduceMotion() throws {
        let source = try glyphSource()
        XCTAssertTrue(
            source.contains(".animation(reduceMotion ? nil : .easeInOut(duration: 0.3), value: strength)"),
            "the bars-strength-change animation must be skipped under Reduce Motion, matching " +
            "the codebase's established `reduceMotion ? nil : .easeInOut(...)` pattern."
        )
    }

    func test_appearDisappearAnimations_areGatedByReduceMotion() throws {
        let source = try glyphSource()
        XCTAssertTrue(
            source.contains("withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.25)) { isVisible = true }"),
            "the glyph's appear transition must be skipped under Reduce Motion."
        )
        XCTAssertTrue(
            source.contains("withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.4)) { isVisible = false }"),
            "the glyph's disappear transition must be skipped under Reduce Motion."
        )
    }
}
