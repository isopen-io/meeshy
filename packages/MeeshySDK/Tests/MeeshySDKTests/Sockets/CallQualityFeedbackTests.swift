import Foundation
import Testing
@testable import MeeshySDK

/// #8072 — la note d'après-appel. La charge de `call:quality-feedback` est
/// celle que `socketCallQualityFeedbackSchema` valide côté passerelle :
/// `{ callId, rating 1…5, issues? ⊂ enum fermé }`.
struct CallQualityFeedbackTests {

    @Test func init_refuseUneNoteHorsDeUnACinq() {
        #expect(CallQualityFeedback(callId: "c1", rating: 0, issues: []) == nil)
        #expect(CallQualityFeedback(callId: "c1", rating: 6, issues: []) == nil)
        #expect(CallQualityFeedback(callId: "c1", rating: 1, issues: []) != nil)
        #expect(CallQualityFeedback(callId: "c1", rating: 5, issues: []) != nil)
    }

    @Test func init_refuseUnAppelSansIdentifiant() {
        #expect(CallQualityFeedback(callId: "", rating: 3, issues: []) == nil)
    }

    @Test func init_dedoublonneLesMotifsEnGardantLeurOrdre() {
        let feedback = CallQualityFeedback(callId: "c1", rating: 2, issues: [.echo, .dropped, .echo])
        #expect(feedback?.issues == [.echo, .dropped])
    }

    @Test func issues_parlentLeVocabulaireDeLaPasserelle() {
        #expect(CallFeedbackIssue.allCases.map(\.rawValue) == [
            "audio_quality", "video_quality", "echo", "dropped", "sync", "other"
        ])
    }

    @Test func socketPayload_sansMotif_neTransportePasDeListeVide() throws {
        let payload = try #require(CallQualityFeedback(callId: "c1", rating: 5, issues: [])).socketPayload
        #expect(payload["callId"] as? String == "c1")
        #expect(payload["rating"] as? Int == 5)
        #expect(payload["issues"] == nil)
    }

    @Test func socketPayload_avecMotifs_lesTransporteEnValeursBrutes() throws {
        let payload = try #require(CallQualityFeedback(callId: "c1", rating: 2, issues: [.audioQuality, .echo])).socketPayload
        #expect(payload["issues"] as? [String] == ["audio_quality", "echo"])
    }

    @Test func emission_passeParLEvenementDeclareDansLeContrat() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Sources/MeeshySDK/Sockets/MessageSocketManager+CallFeedback.swift")
        let source = try String(contentsOf: url, encoding: .utf8)
        #expect(source.contains("socket?.emit(\"call:quality-feedback\", feedback.socketPayload)"))
    }
}
