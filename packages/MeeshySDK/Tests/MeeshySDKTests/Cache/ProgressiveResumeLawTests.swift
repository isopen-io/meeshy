import Testing
@testable import MeeshySDK

/// #11288 — ce qu'un transfert en flux accepte comme réponse, selon qu'il part
/// du début du fichier ou qu'il REPREND une tête déjà écrite. Une réponse qui
/// ne commence pas là où le fichier s'est arrêté ne s'écrit jamais à sa suite.
struct ProgressiveResumeLawTests {

    private typealias Law = ProgressiveResumeLaw

    // MARK: - L'en-tête Range

    @Test func headRange_asksTheFirstBytes_inclusive() {
        #expect(Law.rangeHeader(from: 0, length: 262_144) == "bytes=0-262143")
    }

    @Test func continuationRange_asksEverythingFromTheOffset() {
        #expect(Law.rangeHeader(from: 262_144, length: nil) == "bytes=262144-")
    }

    @Test func freshTransfer_sendsNoRange() {
        #expect(Law.rangeHeader(from: 0, length: nil) == nil)
    }

    // MARK: - Départ du début

    @Test func partialHead_isResumable_andAnnouncesTheWholeFile() {
        let answer = Law.acceptance(statusCode: 206, contentRange: "bytes 0-262143/5000000", contentLength: 262_144, resumingAt: 0)
        #expect(answer == Law.Acceptance(totalBytes: 5_000_000, resumable: true))
    }

    @Test func partialHead_withUnknownTotal_isResumable_withoutATotal() {
        let answer = Law.acceptance(statusCode: 206, contentRange: "bytes 0-1023/*", contentLength: 1_024, resumingAt: 0)
        #expect(answer == Law.Acceptance(totalBytes: nil, resumable: true))
    }

    @Test func serverIgnoringTheRange_sendsTheWholeFile_notResumable() {
        let answer = Law.acceptance(statusCode: 200, contentRange: nil, contentLength: 5_000_000, resumingAt: 0)
        #expect(answer == Law.Acceptance(totalBytes: 5_000_000, resumable: false))
    }

    @Test func plainTransfer_withoutLength_hasNoTotal() {
        let answer = Law.acceptance(statusCode: 200, contentRange: nil, contentLength: -1, resumingAt: 0)
        #expect(answer == Law.Acceptance(totalBytes: nil, resumable: false))
    }

    @Test func nonHTTPResponse_fromTheStart_isAPlainTransfer() {
        let answer = Law.acceptance(statusCode: nil, contentRange: nil, contentLength: 10, resumingAt: 0)
        #expect(answer == Law.Acceptance(totalBytes: 10, resumable: false))
    }

    @Test func errorStatus_isRejected() {
        #expect(Law.acceptance(statusCode: 404, contentRange: nil, contentLength: 20, resumingAt: 0) == nil)
        #expect(Law.acceptance(statusCode: 416, contentRange: "bytes */100", contentLength: 0, resumingAt: 100) == nil)
    }

    // MARK: - Reprise d'une tête

    @Test func continuation_startingWhereTheHeadStopped_isAccepted() {
        let answer = Law.acceptance(statusCode: 206, contentRange: "bytes 262144-4999999/5000000", contentLength: 4_737_856, resumingAt: 262_144)
        #expect(answer == Law.Acceptance(totalBytes: 5_000_000, resumable: true))
    }

    @Test func continuation_startingElsewhere_isRejected() {
        #expect(Law.acceptance(statusCode: 206, contentRange: "bytes 0-4999999/5000000", contentLength: 5_000_000, resumingAt: 262_144) == nil)
    }

    @Test func continuation_answeredWithTheWholeFile_isRejected_neverAppended() {
        #expect(Law.acceptance(statusCode: 200, contentRange: nil, contentLength: 5_000_000, resumingAt: 262_144) == nil)
    }

    @Test func partialAnswer_withoutContentRange_isRejected() {
        #expect(Law.acceptance(statusCode: 206, contentRange: nil, contentLength: 1_024, resumingAt: 0) == nil)
    }

    @Test func nonHTTPResponse_cannotResume() {
        #expect(Law.acceptance(statusCode: nil, contentRange: nil, contentLength: 10, resumingAt: 5) == nil)
    }
}
