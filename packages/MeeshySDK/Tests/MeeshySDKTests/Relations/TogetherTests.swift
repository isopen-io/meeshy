import Foundation
import Testing
@testable import MeeshySDK

/// REGARDER OU ÉCOUTER ENSEMBLE SUR iOS (#17097) — la lecture Swift du contrat `packages/shared/types/together.ts`, la
/// loi de synchronisation portée à l'identique du web (`together-sync.test.ts`) et l'état de séance de l'appareil.
struct TogetherTests {

    private static let sessionId = String(repeating: "a", count: 32)
    private static let me = "111111111111111111111111"
    private static let proche = "222222222222222222222222"
    private static let conversation = "333333333333333333333333"
    private static let attachment = "444444444444444444444444"

    private func decode<T: Decodable>(_ type: T.Type, _ object: [String: Any]) -> T? {
        guard let data = try? JSONSerialization.data(withJSONObject: object) else { return nil }
        return try? JSONDecoder().decode(type, from: data)
    }

    private func playbackWire(playing: Bool = true, positionMs: Double = 10_000, at: Double = 1_000_000, rev: Int = 1) -> [String: Any] {
        ["playing": playing, "positionMs": positionMs, "at": at, "rev": rev, "byUserId": Self.proche]
    }

    private func playback(playing: Bool = true, positionMs: Double = 10_000, at: Double = 1_000_000, rev: Int = 1) -> TogetherPlayback {
        TogetherPlayback(playing: playing, positionMs: positionMs, at: at, rev: rev, byUserId: Self.proche)
    }

    private func started(host: String = TogetherTests.proche, guest: String = TogetherTests.me, rev: Int = 1, at: Double = 1_000_000) -> TogetherStarted {
        TogetherStarted(
            sessionId: Self.sessionId, hostUserId: host, guestUserId: guest,
            conversationId: Self.conversation, attachmentId: Self.attachment, media: .video,
            playback: playback(at: at, rev: rev)
        )
    }

    private func invited(from: String = TogetherTests.proche, sessionId: String = TogetherTests.sessionId) -> TogetherInvited {
        TogetherInvited(
            sessionId: sessionId, fromUserId: from, conversationId: Self.conversation,
            attachmentId: Self.attachment, media: .audio, expiresAt: "2026-11-08T20:00:00.000Z"
        )
    }

    // MARK: - Les charges du serveur

    @Test func uneInvitationServie_seDecode() {
        let read = decode(TogetherInvited.self, [
            "sessionId": Self.sessionId, "fromUserId": Self.proche, "conversationId": Self.conversation,
            "attachmentId": Self.attachment, "media": "audio", "expiresAt": "2026-11-08T20:00:00.000Z",
        ])
        #expect(read == invited())
    }

    @Test func unGenreDeMediaInconnu_ouUnChampVide_rendLaChargeIllisible() {
        let base: [String: Any] = [
            "sessionId": Self.sessionId, "fromUserId": Self.proche, "conversationId": Self.conversation,
            "attachmentId": Self.attachment, "media": "audio", "expiresAt": "x",
        ]
        #expect(decode(TogetherInvited.self, base.merging(["media": "image"]) { $1 }) == nil)
        #expect(decode(TogetherInvited.self, base.merging(["fromUserId": ""]) { $1 }) == nil)
    }

    @Test func uneSeanceOuverte_seDecodeAvecSonEtatDeLecture() {
        let read = decode(TogetherStarted.self, [
            "sessionId": Self.sessionId, "hostUserId": Self.proche, "guestUserId": Self.me,
            "conversationId": Self.conversation, "attachmentId": Self.attachment, "media": "video",
            "playback": playbackWire(),
        ])
        #expect(read == started())
    }

    @Test func uneLectureAuxNombresAbsurdes_estIllisible() {
        #expect(decode(TogetherSynced.self, ["sessionId": Self.sessionId, "playback": playbackWire(positionMs: -1)]) == nil)
        #expect(decode(TogetherSynced.self, ["sessionId": Self.sessionId, "playback": ["playing": true]]) == nil)
        #expect(decode(TogetherSynced.self, ["sessionId": Self.sessionId, "playback": playbackWire()]) != nil)
    }

    @Test func uneFinAuMotifInconnu_estIllisible_commeSurLeWeb() {
        #expect(decode(TogetherEnded.self, ["sessionId": Self.sessionId, "reason": "left", "endedAt": "x"])?.reason == .left)
        #expect(decode(TogetherEnded.self, ["sessionId": Self.sessionId, "reason": "cut", "endedAt": "x"]) == nil)
    }

    @Test func lAutreDeLaSeance_estLInviteQuandJeSuisLHote_etPersonneSinon() {
        #expect(started(host: Self.me, guest: Self.proche).partner(of: Self.me) == Self.proche)
        #expect(started().partner(of: Self.me) == Self.proche)
        #expect(started().partner(of: "999999999999999999999999") == nil)
    }

    // MARK: - Les accusés

    @Test func uneInvitationAcceptee_rendSaSeance_etChaqueRefusSonIssue() {
        func outcome(_ raw: Any?) -> TogetherInviteOutcome {
            TogetherInviteOutcome.read(SocketAck<TogetherInvitedWire>.parse(raw, payloadAt: .data))
        }
        #expect(outcome(["success": true, "data": ["sessionId": Self.sessionId, "media": "video", "expiresAt": "x"]])
            == .invited(sessionId: Self.sessionId, media: .video))
        #expect(outcome(["success": true, "data": ["sessionId": Self.sessionId, "media": "image"]]) == .failed)
        #expect(outcome(["success": false, "error": "x", "code": "TOGETHER_NOT_ALLOWED"]) == .notAllowed)
        #expect(outcome(["success": false, "error": "x", "code": "TOGETHER_RATE_LIMITED"]) == .rateLimited)
        #expect(outcome(["success": false, "error": "x", "code": "TOGETHER_UNAVAILABLE"]) == .failed)
        #expect(outcome("NO ACK") == .offline)
    }

    @Test func rejoindreUneSeanceFinieOuRefusee_ditSeulementQuElleNEstPlusValable() {
        func outcome(_ raw: Any?) -> TogetherJoinOutcome {
            TogetherJoinOutcome.read(SocketAck<TogetherStarted>.parse(raw, payloadAt: .data))
        }
        #expect(outcome(["success": false, "code": "TOGETHER_NOT_FOUND"]) == .gone)
        #expect(outcome(["success": false, "code": "TOGETHER_NOT_ALLOWED"]) == .gone)
        #expect(outcome(["success": false, "code": "TOGETHER_UNAVAILABLE"]) == .failed)
        #expect(outcome(nil) == .offline)
        let joined = outcome(["success": true, "data": [
            "sessionId": Self.sessionId, "hostUserId": Self.proche, "guestUserId": Self.me,
            "conversationId": Self.conversation, "attachmentId": Self.attachment, "media": "video",
            "playback": playbackWire(),
        ]])
        #expect(joined == .joined(started()))
    }

    // MARK: - La loi de synchronisation (iso `together-sync.test.ts`)

    @Test func enLecture_laPositionAvanceAvecLHorlogeDuServeur_enPauseElleReste_etNeReculeJamais() {
        #expect(TogetherSync.servedPositionMs(playback(), serverNowMs: 1_002_500) == 12_500)
        #expect(TogetherSync.servedPositionMs(playback(playing: false), serverNowMs: 1_090_000) == 10_000)
        #expect(TogetherSync.servedPositionMs(playback(), serverNowMs: 999_000) == 10_000)
    }

    @Test func lEcartDHorloge_garderLePlusGrandEchantillon() {
        #expect(TogetherSync.estimateClockOffset(current: nil, serverAt: 5_000, localAt: 4_000) == 1_000)
        #expect(TogetherSync.estimateClockOffset(current: 1_000, serverAt: 5_000, localAt: 4_500) == 1_000)
        #expect(TogetherSync.estimateClockOffset(current: 500, serverAt: 5_000, localAt: 4_200) == 800)
    }

    @Test func laDeriveSeRattrapeParLaVitesse_puisParUnSaut_etEnPauseParUnSautSeulement() {
        #expect(TogetherSync.correction(localMs: 10_100, targetMs: 10_000, playing: true) == .none)
        #expect(TogetherSync.correction(localMs: 9_600, targetMs: 10_000, playing: true) == .rate(1.05))
        #expect(TogetherSync.correction(localMs: 10_400, targetMs: 10_000, playing: true) == .rate(0.95))
        #expect(TogetherSync.correction(localMs: 2_000, targetMs: 10_000, playing: true) == .seek(toMs: 10_000))
        #expect(TogetherSync.correction(localMs: 10_400, targetMs: 10_000, playing: false) == .seek(toMs: 10_000))
        #expect(TogetherSync.correction(localMs: 10_050, targetMs: 10_000, playing: false) == .none)
    }

    @Test func seulUnGesteQuiChangeLEtatPartage_partChezLAutre() {
        #expect(TogetherSync.effect(of: .pause, localMs: 10_000, targetMs: 10_000, sharedPlaying: true) == .send)
        #expect(TogetherSync.effect(of: .play, localMs: 10_000, targetMs: 10_000, sharedPlaying: false) == .send)
        #expect(TogetherSync.effect(of: .seek, localMs: 40_000, targetMs: 10_000, sharedPlaying: true) == .send)
        #expect(TogetherSync.effect(of: .play, localMs: 0, targetMs: 30_000, sharedPlaying: true) == .align)
        #expect(TogetherSync.effect(of: .pause, localMs: 10_000, targetMs: 10_000, sharedPlaying: false) == .align)
        #expect(TogetherSync.effect(of: .seek, localMs: 10_400, targetMs: 10_000, sharedPlaying: true) == .align)
    }

    // MARK: - L'état de l'appareil

    private let t0 = Date(timeIntervalSince1970: 999)

    @Test func maPropreInvitation_partieDUnAutreDeMesAppareils_neSePresenteJamais() {
        let state = TogetherState().invited(invited(from: Self.me), viewerId: Self.me, at: t0)
        #expect(state.invitation == nil)
    }

    @Test func uneInvitation_seRetireQuandLaSeanceOuvre_etLEcartDHorlogeSeMesure() {
        let state = TogetherState()
            .invited(invited(), viewerId: Self.me, at: t0)
            .started(started(at: 1_000_500), viewerId: Self.me, at: t0)
        #expect(state.invitation == nil)
        #expect(state.session?.partnerId == Self.proche)
        #expect(state.clockOffsetMs == 1_000_500 - 999_000)
    }

    @Test func uneSeanceOuJeNeSuisPas_neSOuvrePas() {
        let state = TogetherState().started(started(host: "x", guest: "y"), viewerId: Self.me, at: t0)
        #expect(state.session == nil)
    }

    @Test func unRevDejaApplique_neRejoueRien() {
        let open = TogetherState().started(started(rev: 3), viewerId: Self.me, at: t0)
        let stale = open.synced(TogetherSynced(sessionId: Self.sessionId, playback: playback(playing: false, rev: 3)), at: t0)
        #expect(stale.session?.playback.playing == true)
        let fresh = open.synced(TogetherSynced(sessionId: Self.sessionId, playback: playback(playing: false, rev: 4)), at: t0)
        #expect(fresh.session?.playback.playing == false)
    }

    @Test func uneSeanceClose_neSeRouvrePasSurUnEvenementEnRetard() {
        let closed = TogetherState()
            .started(started(), viewerId: Self.me, at: t0)
            .ended(Self.sessionId)
        #expect(closed.session == nil)
        #expect(closed.started(started(), viewerId: Self.me, at: t0).session == nil)
        #expect(closed.invited(invited(), viewerId: Self.me, at: t0).invitation == nil)
        #expect(closed.waiting(TogetherOutgoing(sessionId: Self.sessionId, toUserId: Self.proche, media: .audio)).outgoing == nil)
    }

    @Test func lAttente_seFermeQuandLaSeanceOuvreChezLHote() {
        let state = TogetherState()
            .waiting(TogetherOutgoing(sessionId: Self.sessionId, toUserId: Self.proche, media: .video))
            .started(started(host: Self.me, guest: Self.proche), viewerId: Self.me, at: t0)
        #expect(state.outgoing == nil)
        #expect(state.session?.partnerId == Self.proche)
    }

    @Test func uneInvitationSansReponse_sEteintDeuxMinutesApresSaReception() {
        let state = TogetherState().invited(invited(), viewerId: Self.me, at: t0)
        #expect(state.expiringInvitation(at: t0.addingTimeInterval(119)).invitation != nil)
        let expired = state.expiringInvitation(at: t0.addingTimeInterval(121))
        #expect(expired.invitation == nil)
        #expect(expired.invited(invited(), viewerId: Self.me, at: t0).invitation == nil)
    }

    @Test func laMemoireDesSeancesCloses_estBornee() {
        let ids = (0..<(TogetherState.closedMemory + 1)).map { String(format: "%032d", $0) }
        let state = ids.reduce(TogetherState()) { $0.ended($1) }
        #expect(state.invited(invited(sessionId: ids[0]), viewerId: Self.me, at: t0).invitation != nil)
        #expect(state.invited(invited(sessionId: ids[1]), viewerId: Self.me, at: t0).invitation == nil)
    }

    // MARK: - Ce qu'on propose de lire ensemble (iso `togetherPieces`)

    @Test func seulsLesAudiosEtVideosLisibles_sontProposes_lesPlusRecentsDAbord_sansDoublon() {
        let pieces = TogetherPieces.select([
            TogetherListedAttachment(id: "a", originalName: "vieux.mp4", mimeType: "video/mp4", createdAt: "2026-11-01T10:00:00.000Z"),
            TogetherListedAttachment(id: "b", originalName: "photo.jpg", mimeType: "image/jpeg", createdAt: "2026-11-08T10:00:00.000Z"),
            TogetherListedAttachment(id: "c", originalName: "secret.mp4", mimeType: "video/mp4", isViewOnce: true),
            TogetherListedAttachment(id: "d", originalName: "chiffre.m4a", mimeType: "audio/mp4", isEncrypted: true),
            TogetherListedAttachment(id: "e", originalName: "recent.m4a", mimeType: "AUDIO/mp4", createdAt: "2026-11-07T10:00:00.000Z"),
            TogetherListedAttachment(id: "e", originalName: "recent.m4a", mimeType: "audio/mp4", createdAt: "2026-11-07T10:00:00.000Z"),
        ])
        #expect(pieces.map(\.id) == ["e", "a"])
        #expect(pieces.map(\.media) == [.audio, .video])
    }

    @Test func laListeEstBorneeASixPieces() {
        let many = (0..<9).map { TogetherListedAttachment(id: "\($0)", originalName: "v\($0)", mimeType: "video/mp4") }
        #expect(TogetherPieces.select(many).count == TogetherPieces.shown)
    }

    @Test func lesEvenementsDuContrat_ontLeursNomsDeFil() {
        #expect(SocketEvent.togetherInvite.rawValue == "together:invite")
        #expect(SocketEvent.togetherJoin.rawValue == "together:join")
        #expect(SocketEvent.togetherSync.rawValue == "together:sync")
        #expect(SocketEvent.togetherLeave.rawValue == "together:leave")
        #expect(SocketEvent.togetherInvited.rawValue == "together:invited")
        #expect(SocketEvent.togetherStarted.rawValue == "together:started")
        #expect(SocketEvent.togetherSynced.rawValue == "together:synced")
        #expect(SocketEvent.togetherEnded.rawValue == "together:ended")
    }
}
