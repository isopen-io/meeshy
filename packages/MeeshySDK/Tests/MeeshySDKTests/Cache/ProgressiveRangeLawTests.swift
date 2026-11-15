import Testing
@testable import MeeshySDK

/// #9881 — la loi qui sert au lecteur les plages d'un fichier en cours de
/// téléchargement : servir ce qui est arrivé, attendre le reste, finir quand
/// la plage est couverte.
struct ProgressiveRangeLawTests {

    private func request(offset: Int64 = 0, length: Int64 = 2, current: Int64? = nil, toEnd: Bool = false) -> ProgressiveRangeRequest {
        ProgressiveRangeRequest(requestedOffset: offset, requestedLength: length, currentOffset: current ?? offset, toEndOfResource: toEnd)
    }

    private func file(available: Int64, expected: Int64? = 1_000, complete: Bool = false) -> ProgressiveFileState {
        ProgressiveFileState(availableBytes: available, expectedBytes: expected, isComplete: complete)
    }

    @Test func headOfFileArrived_servesTheRequestedBytesAtOnce() {
        let answer = ProgressiveRangeLaw.answer(for: request(offset: 0, length: 2), file: file(available: 500))
        #expect(answer == .serve(offset: 0, length: 2))
    }

    @Test func partOfTheRangeArrived_servesWhatIsThere_notMore() {
        let answer = ProgressiveRangeLaw.answer(for: request(offset: 100, length: 400), file: file(available: 300))
        #expect(answer == .serve(offset: 100, length: 200))
    }

    @Test func rangeBeyondTheArrivedBytes_waits_neverAsksTheNetworkAgain() {
        let answer = ProgressiveRangeLaw.answer(for: request(offset: 800, length: 100), file: file(available: 300))
        #expect(answer == .wait)
    }

    @Test func servedUpToItsEnd_finishes() {
        let answer = ProgressiveRangeLaw.answer(for: request(offset: 0, length: 300, current: 300), file: file(available: 600))
        #expect(answer == .finished)
    }

    @Test func toEndOfResource_isBoundedByTheAnnouncedLength() {
        let pending = ProgressiveRangeLaw.answer(for: request(offset: 0, length: 2, current: 600, toEnd: true), file: file(available: 600))
        let done = ProgressiveRangeLaw.answer(for: request(offset: 0, length: 2, current: 1_000, toEnd: true), file: file(available: 1_000))
        #expect(pending == .wait)
        #expect(done == .finished)
    }

    @Test func toEndOfResource_withoutAnnouncedLength_endsWithTheFile() {
        let open = ProgressiveRangeLaw.answer(for: request(current: 300, toEnd: true), file: file(available: 300, expected: nil))
        let closed = ProgressiveRangeLaw.answer(for: request(current: 300, toEnd: true), file: file(available: 300, expected: nil, complete: true))
        #expect(open == .wait)
        #expect(closed == .finished)
    }

    @Test func fileEndedBeforeTheRange_finishesInsteadOfWaitingForever() {
        let answer = ProgressiveRangeLaw.answer(for: request(offset: 900, length: 50), file: file(available: 600, complete: true))
        #expect(answer == .finished)
    }

    @Test func largeRanges_areServedInBoundedChunks() {
        let answer = ProgressiveRangeLaw.answer(for: request(offset: 0, length: 900), file: file(available: 900), maxChunk: 256)
        #expect(answer == .serve(offset: 0, length: 256))
    }
}
