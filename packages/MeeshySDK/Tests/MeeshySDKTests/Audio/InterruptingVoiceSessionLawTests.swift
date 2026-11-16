#if os(iOS)
import AVFoundation
import Testing
@testable import MeeshySDK

/// **La voix du talkie interrompt ce qu'on écoutait, puis le rend** (#18820) : elle ne se mêle jamais à une autre
/// app, et elle la prévient en se rendant.
struct InterruptingVoiceSessionLawTests {

    private typealias Law = InterruptingVoiceSessionLaw

    @Test func nothingElsePlays_theVoiceTakesSoloAmbient_whichDoesNotMix() {
        let plan = Law.activation(category: .ambient, options: [], otherAudioPlaying: false)

        #expect(plan == Law.Configuration(category: .soloAmbient, options: []))
    }

    @Test func anotherAppPlays_theVoiceTakesPlayback_andInterruptsIt() {
        let plan = Law.activation(category: .soloAmbient, options: [], otherAudioPlaying: true)

        #expect(plan == Law.Configuration(category: .playback, options: []))
    }

    @Test func aMixablePlaybackCategory_losesOnlyItsMixing() {
        let plan = Law.activation(category: .playback, options: [.mixWithOthers, .allowAirPlay], otherAudioPlaying: true)

        #expect(plan == Law.Configuration(category: .playback, options: [.allowAirPlay]))
    }

    @Test func aCategoryThatAlreadyInterrupts_isKept() {
        #expect(Law.activation(category: .playback, options: [], otherAudioPlaying: true) == nil)
        #expect(Law.activation(category: .playAndRecord, options: [.defaultToSpeaker], otherAudioPlaying: false) == nil)
    }

    @Test func theVoiceNeverActivatesAMixingCategory() {
        let categories: [AVAudioSession.Category] = [.ambient, .soloAmbient, .playback, .playAndRecord]
        let plans = categories.flatMap { category in
            [true, false].compactMap { Law.activation(category: category, options: [.mixWithOthers], otherAudioPlaying: $0) }
        }

        #expect(plans.allSatisfy { $0.category != .ambient && !$0.options.contains(.mixWithOthers) })
    }

    @Test func atTheEnd_theOtherAppsAreNotified() {
        #expect(Law.deactivationOptions.contains(.notifyOthersOnDeactivation))
    }

    @Test func aCallOrARecording_keepsTheSession() {
        #expect(Law.mayManageSession(callActive: false, recordingHoldsSession: false))
        #expect(!Law.mayManageSession(callActive: true, recordingHoldsSession: false))
        #expect(!Law.mayManageSession(callActive: false, recordingHoldsSession: true))
    }
}
#endif
