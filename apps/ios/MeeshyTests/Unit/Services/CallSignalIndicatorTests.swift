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

    func test_from_nilLevel_new_returnsFair() {
        XCTAssertEqual(CallSignalStrength.from(level: nil, connection: .new), .fair)
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
        let manager = try AppSourceGuard.unit("Meeshy/Features/Call/Services/CallManager.swift")
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
        let service = try source("Meeshy/Features/Call/Services/WebRTCService.swift")
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
        let client = try source("Meeshy/Features/Call/Services/WebRTC/P2PWebRTCClient.swift")
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
        let view = try AppSourceGuard.callViewSource()
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

        guard let cycleRange = view.range(of: "func advanceCaptionsMode() {") else {
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

    func test_captionsActionButton_actionIsAdvanceCaptionsMode() throws {
        let view = try AppSourceGuard.callViewSource()
        guard let range = view.range(of: "func captionsActionButton(") else {
            XCTFail("CallView must define captionsActionButton — the captions action of the rails / rows (#8394)")
            return
        }
        let end = view.index(range.lowerBound, offsetBy: 3200, limitedBy: view.endIndex) ?? view.endIndex
        let body = String(view[range.lowerBound ..< end])
        XCTAssertTrue(
            body.contains("Button(action: advanceCaptionsMode)"),
            "The captions action must drive its 3-state cycle via advanceCaptionsMode()."
        )
        let code = AppSourceGuard.stripComments(body)
        XCTAssertFalse(
            code.contains(".toggleStateAccessibility(isToggle: true"),
            "The captions action is a 3-state cycle, not a binary toggle — it must not use " +
            "the .isToggle accessibility trait (that implies exactly 2 states)."
        )
        XCTAssertTrue(
            view.contains("case .captions:\n            captionsActionButton("),
            "The captions action must be reachable from the « l'appel » actions."
        )
    }

    /// #8396 — une ligne de sous-titres porte la couleur STABLE de la
    /// personne (la même que le liseré de sa vignette de groupe), son nom en
    /// texte VISIBLE, et le même nom pour VoiceOver.
    func test_captionRow_namesTheSpeakerVisibly_inTheirStableColor() throws {
        let view = try AppSourceGuard.callViewSource()
        guard let start = view.range(of: "struct CallCaptionRow: View {"),
              let end = view.range(of: "struct CallCaptionsBand: View {", range: start.upperBound ..< view.endIndex) else {
            XCTFail("CallCaptionRow must exist")
            return
        }
        let row = String(view[start.upperBound ..< end.lowerBound])
        XCTAssertTrue(
            row.contains("private var speakerColor: Color { Color(hex: line.speakerColorHex) }"),
            "La couleur de la ligne est celle de son AUTEUR, dérivée de son identifiant (#16614)."
        )
        XCTAssertEqual(
            row.components(separatedBy: ".foregroundStyle(speakerColor)").count - 1, 1,
            "Le NOM porte toujours la couleur de son auteur (#16662)."
        )
        XCTAssertTrue(
            row.contains(".foregroundColor(line.textColorHex.map { Color(hex: $0) } ?? .white)"),
            "La phrase ne prend la couleur que traduite ; l'original reste à l'encre de l'appel (#16662)."
        )
        XCTAssertTrue(
            row.contains("Text(speakerHeading)"),
            "Le nom du locuteur est du texte VISIBLE, pas seulement une pastille."
        )
        XCTAssertTrue(
            row.contains(".accessibilityLabel(\"\\(line.speakerName) : \\(line.text)\")"),
            "…et VoiceOver l'annonce aussi : deux exigences distinctes."
        )
    }

    func test_advanceCaptionsMode_off_startsTranscriptionAndLandsOnTranslated() throws {
        let view = try AppSourceGuard.callViewSource()
        guard let range = view.range(of: "func advanceCaptionsMode() {") else {
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

    /// #8394 — tout ce qui flotte au-dessus de l'appel établi (pilule, rails,
    /// bandeau) partage UN conteneur de verre : le verre ne peut pas
    /// échantillonner le verre.
    func test_connectedView_sharesOneGlassContainer_forPillRailsAndBand() throws {
        let view = try AppSourceGuard.callViewSource()
        guard let range = view.range(of: "var connectedView: some View {") else {
            XCTFail("CallView must define connectedView")
            return
        }
        let end = view.index(range.lowerBound, offsetBy: 1500, limitedBy: view.endIndex) ?? view.endIndex
        let body = String(view[range.lowerBound ..< end])
        XCTAssertTrue(
            body.contains("AdaptiveGlassContainer(spacing: 12)"),
            "connectedView must wrap its floating chrome in one AdaptiveGlassContainer."
        )
    }

    /// #17343 — en audio aussi, les sous-titres vivent DANS la pilule : l'avatar garde sa
    /// place, plus aucun panneau de transcription ne le remplace hors de la pilule (la
    /// géométrie d'avant la décision, qui exigeait l'inverse, est retournée).
    func test_connectedView_audioPath_keepsTheAvatar_theCaptionsLiveInThePill() throws {
        let view = try AppSourceGuard.callViewSource()
        guard let range = view.range(of: "private var duoLayout: some View {") else {
            XCTFail("CallView must define duoLayout, the 1:1 layout of connectedView")
            return
        }
        let end = view.index(range.lowerBound, offsetBy: 4000, limitedBy: view.endIndex) ?? view.endIndex
        let body = String(view[range.lowerBound ..< end])
        XCTAssertFalse(body.contains("compactAudioCallHeader"), "L'avatar ne se réduit plus pour faire place à un panneau")
        XCTAssertFalse(body.contains("transcriptPanel"), "Aucun panneau de transcription hors de la pilule")
        XCTAssertTrue(body.contains("audioCallLayout"), "L'avatar et le nom restent au centre")
        XCTAssertTrue(body.contains("callControlsBlock"), "Les sous-titres vivent avec la pilule, en audio comme en vidéo")
    }

    /// #17343 — les sous-titres vivent DANS la pilule, au-dessus de sa rangée de base,
    /// dans le même verre, en duo comme en groupe : le bandeau à verre propre posé AU-DESSUS
    /// de la pilule (géométrie d'avant #17343) a disparu ; le seul verre à eux est celui de
    /// la pilule RANGÉE (loi 11), posé à sa place.
    func test_captions_liveInThePill_aboveItsBaseRow_inTheSameGlass() throws {
        let view = try AppSourceGuard.callViewSource()
        XCTAssertFalse(view.contains("transcriptOverlay"), "Le bandeau flottant a disparu.")
        guard let pillStart = view.range(of: "var callControlsPill: some View {"),
              let pillEnd = view.range(of: "var pillHairline: some View", range: pillStart.upperBound ..< view.endIndex) else {
            XCTFail("Les sous-titres se lisent dans callControlsPill")
            return
        }
        let pill = String(view[pillStart.upperBound ..< pillEnd.lowerBound])
        guard let band = pill.range(of: "captionsBand(hasOwnGlass: false)"),
              let base = pill.range(of: "baseRow") else {
            XCTFail("La pilule porte les sous-titres sans verre à eux, puis sa rangée de base")
            return
        }
        XCTAssertLessThan(band.lowerBound, base.lowerBound, "Au-dessus de la rangée de base")
        XCTAssertFalse(pill.contains("isGroupStage"), "En duo comme en groupe : la même pilule")
    }

    /// Chaque ligne porte un horodatage, et il vient de `segment.capturedAt`
    /// — JAMAIS de `startTime`/`endTime`, qui sont relatifs au buffer ASR
    /// (voir le doc comment de `CallTranscriptionSegment.capturedAt`).
    ///
    /// L'heure AFFICHÉE est celle de l'APPEL (mm:ss depuis son début), alignée à
    /// droite de la ligne méta, la même que celle des lignes de capture et du
    /// journal d'après l'appel (planche P6, #17510) : l'horloge murale entre
    /// parenthèses collée au pseudo, qu'avait posée le spec 2026-08-13, est
    /// supplantée. La date reste celle de l'appareil du LOCUTEUR (`capturedAt`),
    /// seule référence commune aux deux côtés ; seule sa MISE EN FORME change.
    func test_captionLine_isDatedByCaptureTime_shownAsTheTimeInTheCall() throws {
        let view = try AppSourceGuard.callViewSource()
        let line = try source("Meeshy/Features/Call/Models/CallCaptionLine.swift")
        XCTAssertTrue(
            line.contains("capturedAt: segment.capturedAt"),
            "Une ligne est datée par `segment.capturedAt` — l'horloge estampillée par " +
            "l'appareil du LOCUTEUR, la seule référence commune aux deux côtés de l'appel."
        )
        XCTAssertFalse(
            line.contains("segment.startTime") || line.contains("segment.endTime"),
            "Jamais startTime/endTime : relatifs au buffer ASR, ils dérivent à chaque " +
            "redémarrage du moteur et ne veulent rien dire pour le pair."
        )
        XCTAssertTrue(
            view.contains("line.timeLabel"),
            "L'heure de la ligne du journal est l'heure DANS l'appel, résolue une fois par la loi (`CallJournalClock`)."
        )
        XCTAssertFalse(
            view.contains("line.capturedAt.formatted(date: .omitted, time: .shortened)"),
            "Plus d'heure murale entre parenthèses collée au pseudo : l'heure dans l'appel va à droite (P6.4)."
        )
    }

    func test_connectedView_stillReferencesUnmovedElements() throws {
        // Regression guard: the layout restructuring must not drop or relocate
        // pipView / showEffectsToolbar's trigger — spec risk table. (The
        // reconnectingBanner this guard used to also name was removed
        // 2026-07-11 — see test_reconnecting_usesCompactStatusPill_notFullScreenBanner.)
        let view = try AppSourceGuard.callViewSource()
        guard let range = view.range(of: "var connectedView: some View {") else {
            XCTFail("CallView must define connectedView")
            return
        }
        let end = view.index(range.lowerBound, offsetBy: 16000, limitedBy: view.endIndex) ?? view.endIndex
        let body = String(view[range.lowerBound ..< end])
        XCTAssertTrue(body.contains("pipView"), "connectedView must still reference pipView")
    }

    /// #17342 — le journal garde TOUT l'appel, sous-titres allumés ou non : les
    /// phrases des autres arrivent par le relais serveur ET par le canal de
    /// données, et se rangent au journal quel que soit l'état du panneau. La porte
    /// de confidentialité (#13720) reste du côté de la CAPTURE : c'est elle qui
    /// décide si une phrase est dite à voix haute dans le micro, pas la lecture.
    ///
    /// Le garde vérifie que les DEUX points d'entrée (le sink du relais, dans
    /// `CallSignalingRouter`, et le routage `.transcriptEntry` du canal de
    /// données) ne reposent plus sur le panneau : un seul des deux laissé
    /// gardé creuserait un trou dans le journal, et celui d'après l'appel en
    /// hériterait.
    func test_remoteSegments_joinTheJournal_whateverTheCaptionsState() throws {
        let router = try source("Meeshy/Features/Call/Services/CallCollaborators/CallSignalingRouter.swift")
        guard let socketRange = router.range(of: "socket.callTranslatedSegmentReceived") else {
            XCTFail("CallSignalingRouter must subscribe to socket.callTranslatedSegmentReceived")
            return
        }
        let socketEnd = router.range(of: ".store(in: &cancellables)", range: socketRange.upperBound ..< router.endIndex)?
            .upperBound ?? router.endIndex
        let socketSink = String(router[socketRange.lowerBound ..< socketEnd])
        XCTAssertFalse(
            socketSink.contains("isShowingOverlay"),
            "Le relais serveur remet chaque phrase au journal, panneau fermé comme ouvert (#17342)."
        )
        XCTAssertTrue(socketSink.contains("receiveTranslatedSegment"))

        let dataChannel = try source("Meeshy/Features/Call/Services/CallManager+DataChannel.swift")
        guard let channelRange = dataChannel.range(of: "case .transcriptEntry(let entry):") else {
            XCTFail("CallManager must route the data channel's .transcriptEntry case")
            return
        }
        let channelEnd = dataChannel.range(of: "case .ignored:", range: channelRange.upperBound ..< dataChannel.endIndex)?
            .lowerBound ?? dataChannel.endIndex
        let channelRoute = String(dataChannel[channelRange.lowerBound ..< channelEnd])
        XCTAssertFalse(
            channelRoute.contains("isShowingOverlay"),
            "Le canal de données remet chaque entrée au journal, comme le relais : un seul transport gardé laisse un trou (#17342)."
        )
        XCTAssertTrue(channelRoute.contains("receivePeerEntry"))
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
            .appendingPathComponent("Meeshy/Features/Call/Components/CallSignalGlyph.swift")
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
