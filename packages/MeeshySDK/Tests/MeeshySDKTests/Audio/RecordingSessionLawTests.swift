#if os(iOS)
import Testing
import AVFoundation
@testable import MeeshySDK

/// #11042 — enregistrer dans Meeshy coupe les sons extérieurs, garde le son
/// Meeshy qui joue (plus bas), puis rend la session.
struct RecordingSessionLawTests {

    @Test(arguments: [RecordingSource.voiceMessage, .video], [false, true])
    func everyRecording_isANonMixablePlayAndRecordSession(source: RecordingSource, meeshySoundPlaying: Bool) {
        let configuration = RecordingSessionLaw.configuration(for: source, meeshySoundPlaying: meeshySoundPlaying)

        #expect(configuration.category == .playAndRecord)
        #expect(!configuration.options.contains(.mixWithOthers))
        #expect(!configuration.options.contains(.duckOthers))
        #expect(configuration.options.contains(.defaultToSpeaker))
    }

    @Test func aVoiceMessageAlone_keepsTheSystemVoiceProcessing() {
        let configuration = RecordingSessionLaw.configuration(for: .voiceMessage, meeshySoundPlaying: false)

        #expect(configuration.mode == .voiceChat)
        #expect(configuration.options.contains(.allowBluetoothHFP))
    }

    @Test func aVoiceMessageOverAMeeshySound_dropsTheVoiceProcessingThatWouldSilenceIt() {
        let configuration = RecordingSessionLaw.configuration(for: .voiceMessage, meeshySoundPlaying: true)

        #expect(configuration.mode == .default)
        #expect(configuration.options.contains(.allowBluetoothHFP))
    }

    @Test(arguments: [false, true])
    func aVideo_recordsInVideoModeWithHighQualityBluetoothOutput(meeshySoundPlaying: Bool) {
        let configuration = RecordingSessionLaw.configuration(for: .video, meeshySoundPlaying: meeshySoundPlaying)

        #expect(configuration.mode == .videoRecording)
        #expect(configuration.options.contains(.allowBluetoothA2DP))
        #expect(!configuration.options.contains(.allowBluetoothHFP))
    }

    @Test func afterRecording_aMeeshySoundStillPlaying_getsItsPlaybackSessionBack() {
        #expect(RecordingSessionLaw.handBack(meeshySoundStillPlaying: true) == .returnToContentPlayback)
    }

    @Test func afterRecording_withNothingPlaying_theSessionIsReleasedForTheOtherApps() {
        #expect(RecordingSessionLaw.handBack(meeshySoundStillPlaying: false) == .releaseSession)
    }

    /// #20579 — une voix de talkie reçue sonne encore : la session redevient la sienne, qui garde le bouton silencieux,
    /// jamais celle d'une lecture de contenu.
    @Test func afterRecording_anInterruptingVoiceStillSounding_getsItsOwnSessionBack() {
        #expect(
            RecordingSessionLaw.handBack(meeshySoundStillPlaying: false, interruptingVoiceStillPlaying: true)
                == .returnToInterruptingVoice
        )
    }

    @Test func afterRecording_aMeeshySoundStillPlaying_winsOverAnInterruptingVoice() {
        #expect(
            RecordingSessionLaw.handBack(meeshySoundStillPlaying: true, interruptingVoiceStillPlaying: true)
                == .returnToContentPlayback
        )
    }

    @Test func theSessionIsReleasedOnlyIfItIsStillTheRecordingOne() {
        #expect(RecordingSessionLaw.mayReleaseSession(currentCategory: .playAndRecord))
        #expect(!RecordingSessionLaw.mayReleaseSession(currentCategory: .playback))
        #expect(!RecordingSessionLaw.mayReleaseSession(currentCategory: .ambient))
    }

    @Test func whileRecording_noContentPlayerMayReconfigureTheSession() {
        #expect(!RecordingSessionLaw.contentMayReconfigureSession(recordingHoldsSession: true))
        #expect(RecordingSessionLaw.contentMayReconfigureSession(recordingHoldsSession: false))
    }
}
#endif
