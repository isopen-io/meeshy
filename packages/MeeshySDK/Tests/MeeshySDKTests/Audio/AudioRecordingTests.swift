import XCTest
@testable import MeeshySDK

@MainActor
final class AudioRecordingTests: XCTestCase {

    // MARK: - AudioRecordingResult

    func test_audioRecordingResult_init_setsProperties() {
        let url = URL(fileURLWithPath: "/tmp/test.m4a")
        let result = AudioRecordingResult(url: url, duration: 5.0, data: Data([1, 2, 3]))

        XCTAssertEqual(result.url, url)
        XCTAssertEqual(result.duration, 5.0)
        XCTAssertEqual(result.data, Data([1, 2, 3]))
    }

    func test_audioRecordingResult_init_dataDefaultsToNil() {
        let url = URL(fileURLWithPath: "/tmp/test.m4a")
        let result = AudioRecordingResult(url: url, duration: 3.0)

        XCTAssertNil(result.data)
    }

    func test_audioRecordingResult_init_zeroDuration() {
        let url = URL(fileURLWithPath: "/tmp/empty.m4a")
        let result = AudioRecordingResult(url: url, duration: 0)

        XCTAssertEqual(result.duration, 0)
    }

    // MARK: - AudioRecordingSettings Presets

    func test_audioRecordingSettings_standard_hasCorrectValues() {
        let settings = AudioRecordingSettings.standard

        XCTAssertNil(settings.maxDuration)
        XCTAssertEqual(settings.minimumDuration, 0.5)
        XCTAssertEqual(settings.sampleRate, 44100)
        XCTAssertEqual(settings.numberOfChannels, 2)
    }

    func test_audioRecordingSettings_story_hasCorrectValues() {
        let settings = AudioRecordingSettings.story

        XCTAssertEqual(settings.maxDuration, 60)
        XCTAssertEqual(settings.minimumDuration, 0.5)
        XCTAssertEqual(settings.sampleRate, 44100)
        XCTAssertEqual(settings.numberOfChannels, 2)
    }

    func test_audioRecordingSettings_voiceSample_hasCorrectValues() {
        let settings = AudioRecordingSettings.voiceSample

        XCTAssertNil(settings.maxDuration)
        XCTAssertEqual(settings.minimumDuration, 10)
        XCTAssertEqual(settings.sampleRate, 44100)
        XCTAssertEqual(settings.numberOfChannels, 2)
    }

    // MARK: - Custom Settings

    func test_audioRecordingSettings_customInit_setsAllValues() {
        let settings = AudioRecordingSettings(
            maxDuration: 30,
            minimumDuration: 2.0,
            sampleRate: 22050,
            numberOfChannels: 1
        )

        XCTAssertEqual(settings.maxDuration, 30)
        XCTAssertEqual(settings.minimumDuration, 2.0)
        XCTAssertEqual(settings.sampleRate, 22050)
        XCTAssertEqual(settings.numberOfChannels, 1)
    }

    func test_audioRecordingSettings_customInit_defaultSampleRateAndChannels() {
        let settings = AudioRecordingSettings(maxDuration: nil, minimumDuration: 1.0)

        XCTAssertEqual(settings.sampleRate, 44100)
        XCTAssertEqual(settings.numberOfChannels, 2)
    }

    // MARK: - DefaultSDKAudioRecorder

    func test_defaultSDKAudioRecorder_initialState() {
        let recorder = DefaultSDKAudioRecorder()

        XCTAssertFalse(recorder.isRecording)
        XCTAssertEqual(recorder.duration, 0)
        XCTAssertEqual(recorder.audioLevels.count, 15)
        XCTAssertNil(recorder.recordedFileURL)
    }

    func test_defaultSDKAudioRecorder_conformsToProtocol() {
        let recorder = DefaultSDKAudioRecorder()
        let _: any AudioRecordingProviding = recorder
        XCTAssertNotNil(recorder)
    }
}
