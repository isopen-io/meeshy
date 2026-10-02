import XCTest

/// Le câblage de l'appel de groupe dans `CallManager`, singleton sans
/// injection : les règles vivent dans le maillage et `CallOfferData`, testées
/// par comportement ; ces témoins gardent que `CallManager` les consulte.
final class GroupCallWiringSourceTests: XCTestCase {

    private func source(_ path: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Services/
            .deletingLastPathComponent()   // Unit/
            .deletingLastPathComponent()   // MeeshyTests/
            .deletingLastPathComponent()   // ios/
            .appendingPathComponent(path)
        return try String(contentsOf: url, encoding: .utf8)
    }

    private func body(of signature: String, in path: String, length: Int = 2_400) throws -> String {
        let text = try source(path)
        guard let start = text.range(of: signature) else {
            XCTFail("\(signature) introuvable dans \(path)")
            return ""
        }
        let end = text.index(start.lowerBound, offsetBy: length, limitedBy: text.endIndex) ?? text.endIndex
        return String(text[start.lowerBound ..< end])
    }

    // MARK: - #9084 — l'invité répond à l'invitant

    func test_handleCallOffer_ringsThePrincipal_notTheInitiator() throws {
        let handler = try body(
            of: "func handleCallOffer(",
            in: "Meeshy/Features/Main/Services/CallManager+IncomingOffer.swift"
        )

        XCTAssertTrue(
            handler.contains("fromUserId: event.principalUserId"),
            "l'invité d'un appel en cours reçoit l'offre de l'INVITANT : c'est lui le pair "
            + "principal, sinon sa réponse part à l'initiateur et une seule liaison s'établit"
        )
    }

    // MARK: - #9085 — un départ ne rompt pas le groupe

    private let manager = "Meeshy/Features/Main/Services/CallManager.swift"

    func test_endCall_groupCall_sendsNoInBandBye() throws {
        let hangup = try body(of: "func endCall() {", in: manager, length: 4_000)

        XCTAssertTrue(
            hangup.contains("if !isGroupMeshCall { webRTCService.sendHangupBye() }"),
            "en groupe, le bye in-band ferait raccrocher le principal : la passerelle "
            + "résout le départ en `participant-left`"
        )
    }

    func test_inBandBye_goesThroughTheGroupAwareHandler() throws {
        let channel = try body(
            of: "didReceiveTranscriptionData data: Data",
            in: "Meeshy/Features/Main/Services/CallManager+DataChannel.swift",
            length: 800
        )

        XCTAssertTrue(channel.contains("self.handleRemoteBye(callId: callId, rawReason: reason)"))
        XCTAssertFalse(channel.contains("handleRemoteEnd("), "un bye du principal ne finit pas un groupe qui continue")
    }

    func test_handleRemoteBye_endsOnlyWhenTheGroupDoesNotContinue() throws {
        let bye = try body(
            of: "func handleRemoteBye(",
            in: "Meeshy/Features/Main/Services/CallManager+GroupMesh.swift",
            length: 500
        )

        XCTAssertTrue(bye.contains("primaryDidLeave() == true"))
        XCTAssertTrue(bye.contains("handleRemoteEnd(callId: callId, rawReason: rawReason)"), "le 1:1 finit comme avant")
    }

    func test_attemptReconnection_neverChasesADepartedPrimary() throws {
        let reconnect = try body(of: "func attemptReconnection(escalate: Bool = false) {", in: manager, length: 300)

        XCTAssertTrue(reconnect.contains("guard !isGroupPrimaryVacated else { return }"))
    }

    func test_groupPrimaryDidVacate_settlesTheCallAsConnected() throws {
        let vacate = try body(of: "func groupPrimaryDidVacate() {", in: manager, length: 600)

        XCTAssertTrue(vacate.contains("iceRestartTask?.cancel()"))
        XCTAssertTrue(vacate.contains("transitionToConnected()"))
    }

    /// #9111 — le plafond de reconnexion d'un groupe QUITTE (`call:leave`) au
    /// lieu de terminer l'appel pour tous : la décision est
    /// `CallResumePolicy.teardownSignal(for: .reconnectCeiling, …)`.
    func test_connectionLost_groupCall_tellsTheGatewayWithoutEndingTheGroup() throws {
        let reconnect = try body(of: "func attemptReconnection(escalate: Bool = false) {", in: manager, length: 3_000)

        XCTAssertTrue(
            reconnect.contains("abandonOnServer(cause: .reconnectCeiling)"),
            "sans un mot au serveur, les autres membres gardent une tuile fantôme jusqu'au nettoyage serveur"
        )
        XCTAssertFalse(reconnect.contains("emitCallEndReliably(callId: callId)"), "jamais `call:end` au plafond")
    }

    // MARK: - #9090 — la liaison du principal parti ne dégrade plus les autres

    func test_collectedStats_ofAVacatedPrimary_driveNoQualitySignal() throws {
        let stats = try body(of: "didCollectStats stats: CallStats", in: manager, length: 1_400)

        XCTAssertTrue(
            stats.contains("guard case .connected = self.callState, !self.isGroupPrimaryVacated else { return }"),
            "les relevés d'une liaison vers un pair parti diraient « connexion faible » à tout le "
            + "groupe et pousseraient la survie vidéo, alors que le maillage se porte bien"
        )
    }

    func test_qualityLevelChange_ofAVacatedPrimary_playsNoHaptic() throws {
        let level = try body(of: "didChangeQualityLevel level: VideoQualityLevel", in: manager, length: 400)

        XCTAssertTrue(level.contains("guard let self, case .connected = self.callState, !self.isGroupPrimaryVacated else { return }"))
    }

    // MARK: - #9091 — l'en-tête d'un groupe qui continue

    func test_groupCallTitleDidChange_retitlesTheWholeCallChrome() throws {
        let retitle = try body(
            of: "func groupCallTitleDidChange(",
            in: "Meeshy/Features/Main/Services/CallManager+GroupMesh.swift",
            length: 300
        )

        XCTAssertTrue(retitle.contains("remoteUsername = title"), "en-tête, pastille et bulle lisent `remoteUsername`")
    }

    func test_participantName_ofADepartedPrimary_isNotTheGroupTitle() throws {
        let name = try body(
            of: "func participantName(for userId: String) -> String {",
            in: "Meeshy/Features/Main/Services/CallManager+Controls.swift",
            length: 400
        )

        XCTAssertTrue(name.contains("userId == remoteUserId, !isGroupPrimaryVacated, let name = remoteUsername"))
    }
}
