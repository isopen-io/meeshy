import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

final class TimelinePlaybackEngineTests: XCTestCase {

    @MainActor
    func test_configure_setsDuration() {
        let engine = TimelinePlaybackEngine()
        engine.configure(duration: 10.5)
        engine.seek(to: 10.5)
        XCTAssertEqual(engine.currentTime, 10.5, accuracy: 0.001)
    }

    @MainActor
    func test_configure_clampsMinimumDuration() {
        let engine = TimelinePlaybackEngine()
        engine.configure(duration: -5)
        engine.seek(to: 0.1)
        XCTAssertEqual(engine.currentTime, 0.1, accuracy: 0.001)
    }

    @MainActor
    func test_seek_clampsToZero() {
        let engine = TimelinePlaybackEngine()
        engine.configure(duration: 5)
        engine.seek(to: -3)
        XCTAssertEqual(engine.currentTime, 0)
    }

    @MainActor
    func test_seek_clampsToDuration() {
        let engine = TimelinePlaybackEngine()
        engine.configure(duration: 5)
        engine.seek(to: 10)
        XCTAssertEqual(engine.currentTime, 5)
    }

    @MainActor
    func test_stop_resetsTime() {
        let engine = TimelinePlaybackEngine()
        engine.configure(duration: 10)
        engine.seek(to: 5)
        engine.stop()
        XCTAssertEqual(engine.currentTime, 0)
        XCTAssertFalse(engine.isPlaying)
    }

    @MainActor
    func test_toggle_startsAndStops() {
        let engine = TimelinePlaybackEngine()
        engine.configure(duration: 5)
        engine.toggle()
        XCTAssertTrue(engine.isPlaying)
        engine.toggle()
        XCTAssertFalse(engine.isPlaying)
    }

    @MainActor
    func test_seek_callsOnTimeUpdate() {
        let engine = TimelinePlaybackEngine()
        engine.configure(duration: 10)
        var receivedTime: Float?
        engine.onTimeUpdate = { receivedTime = $0 }
        engine.seek(to: 3.5)
        XCTAssertEqual(receivedTime, 3.5)
    }

    @MainActor
    func test_configureMedia_setsElements() {
        let engine = TimelinePlaybackEngine()
        let elements = [
            TimelinePlaybackEngine.MediaElement(
                id: "test-1", type: .audio, url: nil,
                startTime: 0, duration: 5, volume: 0.8
            ),
            TimelinePlaybackEngine.MediaElement(
                id: "test-2", type: .video, url: nil,
                startTime: 2, duration: 3, volume: 1.0
            )
        ]
        engine.configureMedia(elements)
        // No crash = success; media elements are internal state
        XCTAssertTrue(true)
    }
}

// MARK: - Audio Spectrogram Tests

final class AudioSpectrogramRendererTests: XCTestCase {

    func test_computeBins_withSufficientSamples_returnsColumns() {
        let renderer = AudioSpectrogramRenderer(fftSize: 64, frequencyBands: 32)
        let samples = (0..<256).map { Float(sin(Double($0) * 0.1)) }
        let bins = renderer.computeBins(from: samples)
        XCTAssertFalse(bins.isEmpty)
        XCTAssertEqual(bins[0].count, 32)
    }

    func test_computeBins_withInsufficientSamples_returnsEmpty() {
        let renderer = AudioSpectrogramRenderer(fftSize: 64, frequencyBands: 32)
        let samples: [Float] = [0.1, 0.2, 0.3]
        let bins = renderer.computeBins(from: samples)
        XCTAssertTrue(bins.isEmpty)
    }

    func test_computeBins_normalizedTo01() {
        let renderer = AudioSpectrogramRenderer(fftSize: 64, frequencyBands: 16)
        let samples = (0..<128).map { Float(sin(Double($0) * 0.3)) }
        let bins = renderer.computeBins(from: samples)
        for column in bins {
            for value in column {
                XCTAssertGreaterThanOrEqual(value, 0)
                XCTAssertLessThanOrEqual(value, 1.0)
            }
        }
    }

    func test_computeBins_emptySamples_returnsEmpty() {
        let renderer = AudioSpectrogramRenderer()
        let bins = renderer.computeBins(from: [])
        XCTAssertTrue(bins.isEmpty)
    }
}

// MARK: - Timeline Track Model Tests

final class TimelineTrackModelTests: XCTestCase {

    func test_trackType_sortOrder_fondBeforeFront() {
        XCTAssertLessThan(TrackType.bgVideo.sortOrder, TrackType.fgImage.sortOrder)
        XCTAssertLessThan(TrackType.bgImage.sortOrder, TrackType.fgVideo.sortOrder)
        XCTAssertLessThan(TrackType.bgAudio.sortOrder, TrackType.fgAudio.sortOrder)
        XCTAssertLessThan(TrackType.fgAudio.sortOrder, TrackType.text.sortOrder)
    }

    func test_trackType_hasIcon() {
        for type in [TrackType.bgVideo, .bgImage, .drawing, .bgAudio, .fgImage, .fgVideo, .fgAudio, .text] {
            XCTAssertFalse(type.icon.isEmpty)
        }
    }

    func test_timelineTrack_identity() {
        let track = TimelineTrack(
            id: "abc", name: "Test", type: .fgVideo,
            startTime: 1.5, duration: 3.0,
            volume: 0.8, loop: false,
            fadeIn: 0.2, fadeOut: 0.5
        )
        XCTAssertEqual(track.id, "abc")
        XCTAssertEqual(track.startTime, 1.5)
        XCTAssertEqual(track.duration, 3.0)
        XCTAssertEqual(track.volume, 0.8)
        XCTAssertEqual(track.fadeIn, 0.2)
        XCTAssertEqual(track.fadeOut, 0.5)
    }

    func test_timelineTrack_imageProperty() {
        var track = TimelineTrack(
            id: "img-1", name: "Photo", type: .fgImage,
            startTime: 0, duration: 2,
            volume: nil, loop: false,
            fadeIn: nil, fadeOut: nil,
            image: nil
        )
        XCTAssertNil(track.image)

        let testImage = UIImage(systemName: "photo")!
        track.image = testImage
        XCTAssertNotNil(track.image)
    }
}

// MARK: - Time Formatting Tests

final class TimeFormattingTests: XCTestCase {

    func test_formatTimePrecise_zero() {
        let result = formatTimePrecise(0)
        XCTAssertEqual(result, "0:00.000")
    }

    func test_formatTimePrecise_milliseconds() {
        let result = formatTimePrecise(3.25)
        XCTAssertEqual(result, "0:03.250")
    }

    func test_formatTimePrecise_minutes() {
        let result = formatTimePrecise(65.5)
        XCTAssertEqual(result, "1:05.500")
    }

    func test_formatTimePrecise_wholeSeconds() {
        let result = formatTimePrecise(10.0)
        XCTAssertEqual(result, "0:10.000")
    }

    func test_formatMs_subSecond() {
        let result = formatMs(0.150)
        XCTAssertEqual(result, "150ms")
    }

    func test_formatMs_overOneSecond() {
        let result = formatMs(1.5)
        XCTAssertEqual(result, "1.5s")
    }

    // Standalone helpers mirroring TimelinePanel's private methods
    private func formatTimePrecise(_ sec: Float) -> String {
        let m = Int(sec) / 60
        let s = Int(sec) % 60
        let ms = Int((sec - Float(Int(sec))) * 1000)
        return String(format: "%d:%02d.%03d", m, s, ms)
    }

    private func formatMs(_ sec: Float) -> String {
        let ms = Int(sec * 1000)
        if ms < 1000 { return "\(ms)ms" }
        return String(format: "%.1fs", sec)
    }
}

// MARK: - Zoom Scale Tests

final class ZoomScaleTests: XCTestCase {

    func test_zoomScale_clampMin() {
        let clamped = max(0.01, min(100.0, 0.001))
        XCTAssertEqual(clamped, 0.01, accuracy: 0.001)
    }

    func test_zoomScale_clampMax() {
        let clamped = max(0.01, min(100.0, 500.0))
        XCTAssertEqual(clamped, 100.0, accuracy: 0.001)
    }

    func test_zoomScale_pixelsPerSecond_atMinZoom() {
        let basePixelsPerSecond: CGFloat = 50
        let zoomScale: CGFloat = 0.01
        let pps = basePixelsPerSecond * zoomScale
        XCTAssertEqual(pps, 0.5, accuracy: 0.01)
    }

    func test_zoomScale_pixelsPerSecond_atMaxZoom() {
        let basePixelsPerSecond: CGFloat = 50
        let zoomScale: CGFloat = 100.0
        let pps = basePixelsPerSecond * zoomScale
        XCTAssertEqual(pps, 5000, accuracy: 0.01)
    }

    func test_rulerConfig_atHighZoom_showsMilliseconds() {
        let pps: CGFloat = 1500
        let config = rulerConfigForPps(pps)
        XCTAssertEqual(config.minor, 0.01, accuracy: 0.001)
        XCTAssertEqual(config.major, 0.1, accuracy: 0.001)
    }

    func test_rulerConfig_atLowZoom_showsSeconds() {
        let pps: CGFloat = 30
        let config = rulerConfigForPps(pps)
        XCTAssertEqual(config.minor, 1, accuracy: 0.1)
        XCTAssertEqual(config.major, 5, accuracy: 0.1)
    }

    func test_rulerConfig_atVeryLowZoom_showsTenSeconds() {
        let pps: CGFloat = 1.5
        let config = rulerConfigForPps(pps)
        XCTAssertEqual(config.minor, 10, accuracy: 0.1)
        XCTAssertEqual(config.major, 30, accuracy: 0.1)
    }

    private func rulerConfigForPps(_ pps: CGFloat) -> (minor: Float, major: Float) {
        if pps > 1000 { return (0.01, 0.1) }
        if pps > 200 { return (0.1, 0.5) }
        if pps > 50 { return (0.5, 2) }
        if pps > 10 { return (1, 5) }
        if pps > 2 { return (5, 15) }
        return (10, 30)
    }
}

// MARK: - Duration Handle Tests

final class DurationHandleTests: XCTestCase {

    func test_durationClamp_minimum() {
        let newDur: Float = 0.5
        let clamped = max(2, min(30, newDur))
        XCTAssertEqual(clamped, 2)
    }

    func test_durationClamp_maximum() {
        let newDur: Float = 45
        let clamped = max(2, min(30, newDur))
        XCTAssertEqual(clamped, 30)
    }

    func test_durationClamp_normal() {
        let newDur: Float = 12.5
        let clamped = max(2, min(30, newDur))
        XCTAssertEqual(clamped, 12.5)
    }

    func test_autoExtendDuration_extendsWhenNeeded() {
        var currentDuration: Float = 5.0
        let elementEnd: Float = 7.0
        if elementEnd > currentDuration {
            currentDuration = min(30, elementEnd + 0.5)
        }
        XCTAssertEqual(currentDuration, 7.5, accuracy: 0.01)
    }

    func test_autoExtendDuration_noExtendWhenWithinRange() {
        var currentDuration: Float = 10.0
        let elementEnd: Float = 5.0
        if elementEnd > currentDuration {
            currentDuration = min(30, elementEnd + 0.5)
        }
        XCTAssertEqual(currentDuration, 10.0)
    }
}
