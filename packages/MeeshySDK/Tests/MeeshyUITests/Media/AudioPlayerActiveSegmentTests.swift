import Testing
@testable import MeeshyUI
@testable import MeeshySDK

@Suite("AudioPlayerView.activeSegmentIndex")
struct AudioPlayerActiveSegmentTests {

    private func seg(_ text: String, _ start: Double, _ end: Double) -> TranscriptionDisplaySegment {
        TranscriptionDisplaySegment(text: text, startTime: start, endTime: end, speakerId: nil, speakerColor: "08D9D6")
    }

    // MARK: - Idle / empty

    @Test("not playing -> nil even with valid segments")
    func test_notPlaying_returnsNil() {
        let segments = [seg("a", 0, 1), seg("b", 1, 2)]
        #expect(AudioPlayerView.activeSegmentIndex(segments: segments, currentTime: 1.5, progress: 0.75, isPlaying: false) == nil)
    }

    @Test("empty segments -> nil")
    func test_emptySegments_returnsNil() {
        #expect(AudioPlayerView.activeSegmentIndex(segments: [], currentTime: 1, progress: 0.5, isPlaying: true) == nil)
    }

    // MARK: - Real timestamps

    @Test("real timestamps -> index of the segment containing currentTime")
    func test_realTimestamps_returnsContainingIndex() {
        let segments = [seg("a", 0, 1), seg("b", 1, 2), seg("c", 2, 3)]
        #expect(AudioPlayerView.activeSegmentIndex(segments: segments, currentTime: 1.4, progress: 0.46, isPlaying: true) == 1)
        #expect(AudioPlayerView.activeSegmentIndex(segments: segments, currentTime: 2.9, progress: 0.96, isPlaying: true) == 2)
    }

    @Test("real timestamps, currentTime past the last segment -> nil (finished)")
    func test_realTimestamps_pastEnd_returnsNil() {
        let segments = [seg("a", 0, 1), seg("b", 1, 2)]
        #expect(AudioPlayerView.activeSegmentIndex(segments: segments, currentTime: 9, progress: 0.69, isPlaying: true) == nil)
    }

    // MARK: - Degenerate timestamps (the reported bug)

    @Test("all-zero timestamps -> proportional fallback advances with progress")
    func test_degenerateTimestamps_proportionalFallback() {
        // Bug réel : transcription sans découpe temporelle (start==end==0).
        // Sans le fallback, `currentTime < endTime` resterait toujours faux → aucun
        // segment surligné. Le fallback proportionnel doit faire avancer le karaoké.
        let segments = [seg("un", 0, 0), seg("deux", 0, 0), seg("trois", 0, 0)]
        #expect(AudioPlayerView.activeSegmentIndex(segments: segments, currentTime: 0, progress: 0.0, isPlaying: true) == 0)
        #expect(AudioPlayerView.activeSegmentIndex(segments: segments, currentTime: 0, progress: 0.5, isPlaying: true) == 1)
        #expect(AudioPlayerView.activeSegmentIndex(segments: segments, currentTime: 0, progress: 0.9, isPlaying: true) == 2)
        // progress clampé : 1.0 ne déborde pas hors des bornes.
        #expect(AudioPlayerView.activeSegmentIndex(segments: segments, currentTime: 0, progress: 1.0, isPlaying: true) == 2)
    }

    @Test("single degenerate segment -> active (index 0) for the whole playback")
    func test_singleDegenerateSegment_activeWhilePlaying() {
        let segments = [seg("phrase entière sans timing", 0, 0)]
        #expect(AudioPlayerView.activeSegmentIndex(segments: segments, currentTime: 9, progress: 0.69, isPlaying: true) == 0)
        #expect(AudioPlayerView.activeSegmentIndex(segments: segments, currentTime: 9, progress: 0.69, isPlaying: false) == nil)
    }
}
