import XCTest
import AVFoundation
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
        XCTAssertEqual(settings.numberOfChannels, 1)
        XCTAssertEqual(settings.bitRate, 64000)
    }

    func test_audioRecordingSettings_story_hasCorrectValues() {
        let settings = AudioRecordingSettings.story

        XCTAssertEqual(settings.maxDuration, 60)
        XCTAssertEqual(settings.minimumDuration, 0.5)
        XCTAssertEqual(settings.sampleRate, 44100)
        XCTAssertEqual(settings.numberOfChannels, 1)
        XCTAssertEqual(settings.bitRate, 64000)
    }

    func test_audioRecordingSettings_voiceSample_hasCorrectValues() {
        let settings = AudioRecordingSettings.voiceSample

        XCTAssertNil(settings.maxDuration)
        XCTAssertEqual(settings.minimumDuration, 10)
        XCTAssertEqual(settings.sampleRate, 44100)
        XCTAssertEqual(settings.numberOfChannels, 1)
        XCTAssertEqual(settings.bitRate, 96000)
    }

    // MARK: - Custom Settings

    func test_audioRecordingSettings_customInit_setsAllValues() {
        let settings = AudioRecordingSettings(
            maxDuration: 30,
            minimumDuration: 2.0,
            sampleRate: 22050,
            numberOfChannels: 2,
            bitRate: 128000
        )

        XCTAssertEqual(settings.maxDuration, 30)
        XCTAssertEqual(settings.minimumDuration, 2.0)
        XCTAssertEqual(settings.sampleRate, 22050)
        XCTAssertEqual(settings.numberOfChannels, 2)
        XCTAssertEqual(settings.bitRate, 128000)
    }

    func test_audioRecordingSettings_customInit_defaultSampleRateAndChannels() {
        let settings = AudioRecordingSettings(maxDuration: nil, minimumDuration: 1.0)

        XCTAssertEqual(settings.sampleRate, 44100)
        XCTAssertEqual(settings.numberOfChannels, 1)
        XCTAssertEqual(settings.bitRate, 64000)
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

    func test_defaultSDKAudioRecorder_configure_updatesSettings() {
        let recorder = DefaultSDKAudioRecorder()
        let customSettings = AudioRecordingSettings(maxDuration: 15.0, minimumDuration: 2.0)
        recorder.configure(with: customSettings)

        XCTAssertEqual(recorder.settings.maxDuration, 15.0)
        XCTAssertEqual(recorder.settings.minimumDuration, 2.0)
    }

    // MARK: - AudioCodec (E4 — Opus upload building block)

    func test_audioCodec_avFormatID_mapsToCoreAudioConstants() {
        XCTAssertEqual(AudioCodec.aac.avFormatID, kAudioFormatMPEG4AAC)
        XCTAssertEqual(AudioCodec.opus.avFormatID, kAudioFormatOpus)
    }

    func test_audioCodec_fileExtension() {
        XCTAssertEqual(AudioCodec.aac.fileExtension, "m4a")
        XCTAssertEqual(AudioCodec.opus.fileExtension, "caf")
    }

    func test_audioCodec_mimeType() {
        XCTAssertEqual(AudioCodec.aac.mimeType, "audio/mp4")
        XCTAssertEqual(AudioCodec.opus.mimeType, "audio/opus")
    }

    // MARK: - AudioRecordingSettings codec + opus preset

    func test_audioRecordingSettings_existingPresets_defaultToAAC() {
        XCTAssertEqual(AudioRecordingSettings.standard.codec, .aac)
        XCTAssertEqual(AudioRecordingSettings.story.codec, .aac)
        XCTAssertEqual(AudioRecordingSettings.voiceSample.codec, .aac)
    }

    func test_audioRecordingSettings_customInit_defaultsCodecToAAC() {
        let settings = AudioRecordingSettings(maxDuration: nil, minimumDuration: 1.0)
        XCTAssertEqual(settings.codec, .aac)
    }

    func test_audioRecordingSettings_opusVoiceMessage_hasCorrectValues() {
        let settings = AudioRecordingSettings.opusVoiceMessage
        XCTAssertEqual(settings.codec, .opus)
        // Opus does NOT support 44.1 kHz — the preset must use a valid Opus rate.
        XCTAssertEqual(settings.sampleRate, 48000)
        XCTAssertEqual(settings.numberOfChannels, 1)
        XCTAssertEqual(settings.bitRate, 24000)
    }

    // MARK: - avRecorderSettings dictionary

    /// `.aac` must reproduce the historical AVAudioRecorder dictionary exactly,
    /// including the AAC-only quality key — otherwise existing recordings change.
    func test_avRecorderSettings_aac_reproducesHistoricalDictionary() {
        let dict = AudioRecordingSettings.standard.avRecorderSettings

        XCTAssertEqual(dict[AVFormatIDKey] as? Int, Int(kAudioFormatMPEG4AAC))
        XCTAssertEqual(dict[AVSampleRateKey] as? Double, 44100)
        XCTAssertEqual(dict[AVNumberOfChannelsKey] as? Int, 1)
        XCTAssertEqual(dict[AVEncoderBitRateKey] as? Int, 64000)
        XCTAssertEqual(dict[AVEncoderAudioQualityKey] as? Int, AVAudioQuality.medium.rawValue)
    }

    /// `.opus` carries the Opus format id and drops the AAC-only quality key.
    func test_avRecorderSettings_opus_usesOpusFormatAndDropsQualityKey() {
        let dict = AudioRecordingSettings.opusVoiceMessage.avRecorderSettings

        XCTAssertEqual(dict[AVFormatIDKey] as? Int, Int(kAudioFormatOpus))
        XCTAssertEqual(dict[AVSampleRateKey] as? Double, 48000)
        XCTAssertEqual(dict[AVNumberOfChannelsKey] as? Int, 1)
        XCTAssertEqual(dict[AVEncoderBitRateKey] as? Int, 24000)
        XCTAssertNil(dict[AVEncoderAudioQualityKey], "AVEncoderAudioQualityKey is AAC-only; must be absent for Opus")
    }
}
