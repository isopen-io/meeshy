#if os(iOS) && DEBUG
import AVFoundation
import Foundation
import os
import Testing
@testable import MeeshySDK

/// Une session audio de témoin : elle note chaque écriture, son ordre, et
/// le fil qui l'a faite.
final class RecordingAudioSession: AudioSessionProviding, @unchecked Sendable {
    enum Call: Equatable {
        case setCategory(AVAudioSession.Category, AVAudioSession.Mode, AVAudioSession.CategoryOptions)
        case setActive(Bool)
    }

    private struct State {
        var category: AVAudioSession.Category = .soloAmbient
        var mode: AVAudioSession.Mode = .default
        var options: AVAudioSession.CategoryOptions = []
        var calls: [Call] = []
        var writesOnMainThread = 0
    }

    private let state = OSAllocatedUnfairLock(initialState: State())

    var calls: [Call] { state.withLock { $0.calls } }
    var writesOnMainThread: Int { state.withLock { $0.writesOnMainThread } }

    var category: AVAudioSession.Category { state.withLock { $0.category } }
    var mode: AVAudioSession.Mode { state.withLock { $0.mode } }
    var categoryOptions: AVAudioSession.CategoryOptions { state.withLock { $0.options } }

    func setCategory(
        _ category: AVAudioSession.Category,
        mode: AVAudioSession.Mode,
        options: AVAudioSession.CategoryOptions
    ) throws {
        let onMain = Thread.isMainThread
        state.withLock {
            $0.category = category
            $0.mode = mode
            $0.options = options
            $0.calls.append(.setCategory(category, mode, options))
            if onMain { $0.writesOnMainThread += 1 }
        }
    }

    func setActive(_ active: Bool, options: AVAudioSession.SetActiveOptions) throws {
        let onMain = Thread.isMainThread
        state.withLock {
            $0.calls.append(.setActive(active))
            if onMain { $0.writesOnMainThread += 1 }
        }
    }
}

/// **La session audio se configure sur la file du coordinateur, jamais sur
/// le fil principal** (#17038). HangTracer relevait 53 gels de l'iPhone,
/// jusqu'à 1,69 s, dans un `setCategory` / `setActive` appelé depuis le fil
/// principal. Les appels rendent la main tout de suite ; la file série
/// garantit que l'ordre des appels EST l'ordre des effets.
@MainActor
struct MediaSessionCoordinatorSessionQueueTests {

    private func makeSUT() -> (MediaSessionCoordinator, RecordingAudioSession) {
        let session = RecordingAudioSession()
        // Un centre à part : `aSystemInterruptionRevokesTheLease` publie une
        // interruption sur `.default` pendant que cette suite tourne en
        // parallèle, et révoquait le bail de ces témoins (rouge iOS SDK de dev).
        let center = NotificationCenter()
        return (MediaSessionCoordinator.makeForTesting(session: session, leaseNotificationCenter: center), session)
    }

    @Test func anAudiblePlayback_isConfiguredOffTheMainThread() async {
        let (sut, session) = makeSUT()

        sut.activateContentPlayback(.audible)
        await sut.sessionSettled()

        #expect(session.calls == [
            .setCategory(.playback, .default, ContentPlaybackSessionLaw.audibleOptions),
            .setActive(true),
        ])
        #expect(session.writesOnMainThread == 0)
    }

    @Test func theCallReturnsBeforeTheSessionIsTouched() async {
        let (sut, session) = makeSUT()
        sut.sessionQueue.suspend()

        sut.activateContentPlayback(.audible)
        let touchedBeforeReturn = session.calls

        sut.sessionQueue.resume()
        await sut.sessionSettled()
        #expect(touchedBeforeReturn.isEmpty)
        #expect(session.calls.count == 2)
    }

    @Test func aDeactivationThenAnActivation_runInTheOrderTheyWereAsked() async {
        let (sut, session) = makeSUT()
        sut.sessionQueue.suspend()

        sut.activatePlaybackSync(options: [.duckOthers])
        sut.deactivatePlaybackSync()
        sut.activatePlaybackSync(options: [.duckOthers])

        sut.sessionQueue.resume()
        await sut.sessionSettled()
        #expect(session.calls == [
            .setCategory(.playback, .default, [.duckOthers]),
            .setActive(true),
            .setActive(false),
            .setActive(true),
        ])
        #expect(sut.playbackLeaseHeld)
    }

    /// La course que la file doit empêcher : une libération demandée AVANT
    /// une relance ne s'exécute jamais APRÈS elle et ne coupe pas le son.
    @Test func aDeferredReleaseAskedBeforeARelaunch_neverCutsTheRelaunchedSound() async {
        let (sut, session) = makeSUT()
        sut.activateContentPlayback(.audible)
        await sut.sessionSettled()
        sut.sessionQueue.suspend()

        sut.deactivatePlaybackDeferred()
        sut.activateContentPlayback(.audible)

        sut.sessionQueue.resume()
        await sut.sessionSettled()
        #expect(session.calls.last == .setActive(true))
        #expect(!session.calls.contains(.setActive(false)))
    }

    @Test func aPlaybackQueuedBeforeACallStarts_leavesTheCallSessionAlone() async {
        let (sut, session) = makeSUT()
        sut.sessionQueue.suspend()

        sut.activateContentPlayback(.audible)
        sut.setCallActive(true)

        sut.sessionQueue.resume()
        await sut.sessionSettled()
        #expect(session.calls.isEmpty)
        sut.setCallActive(false)
    }

    @Test func aMutedVideoQueuedAfterASound_doesNotDowngradeTheSession() async {
        let (sut, session) = makeSUT()
        sut.sessionQueue.suspend()

        sut.activateContentPlayback(.audible)
        sut.activateContentPlayback(.muted)

        sut.sessionQueue.resume()
        await sut.sessionSettled()
        #expect(!session.calls.contains(.setCategory(.ambient, .default, [])))
        #expect(session.category == .playback)
    }

    @Test func anIdenticalPlaybackUnderLease_touchesNothingAndWaitsForNothing() async {
        let (sut, session) = makeSUT()
        sut.activateContentPlayback(.audible)
        await sut.sessionSettled()
        let before = session.calls

        sut.activateContentPlayback(.audible)

        #expect(!sut.hasPendingSessionWork)
        await sut.sessionSettled()
        #expect(session.calls == before)
    }

    @Test func aRecording_waitsForItsSessionAndHoldsIt() async {
        let (sut, session) = makeSUT()
        let configuration = RecordingSessionLaw.configuration(for: .voiceMessage, meeshySoundPlaying: false)

        let accepted = await withCheckedContinuation { continuation in
            sut.configureRecordingSession(configuration, holding: true) { continuation.resume(returning: $0) }
        }

        #expect(accepted)
        #expect(sut.recordingHoldsSession)
        #expect(session.calls == [
            .setCategory(configuration.category, configuration.mode, configuration.options),
            .setActive(true),
        ])
        #expect(session.writesOnMainThread == 0)
        sut.releaseRecordingHold()
        await sut.sessionSettled()
        #expect(!sut.recordingHoldsSession)
    }

    @Test func aRecordingDuringACall_isRefusedWithoutTouchingTheSession() async {
        let (sut, session) = makeSUT()
        sut.setCallActive(true)
        let configuration = RecordingSessionLaw.configuration(for: .voiceMessage, meeshySoundPlaying: false)

        let accepted = await withCheckedContinuation { continuation in
            sut.configureRecordingSession(configuration, holding: true) { continuation.resume(returning: $0) }
        }

        #expect(!accepted)
        #expect(session.calls.isEmpty)
        sut.setCallActive(false)
    }

    /// La prise rendue AVANT que la session d'enregistrement ne soit posée
    /// ne laisse pas la session tenue par un enregistrement fini.
    @Test func aHoldReleasedBeforeTheRecordingSessionIsSet_isNotLeftHeld() async {
        let (sut, _) = makeSUT()
        let configuration = RecordingSessionLaw.configuration(for: .voiceMessage, meeshySoundPlaying: false)
        sut.sessionQueue.suspend()

        sut.configureRecordingSession(configuration, holding: true) { _ in }
        sut.releaseRecordingHold()

        sut.sessionQueue.resume()
        await sut.sessionSettled()
        #expect(!sut.recordingHoldsSession)
    }

    @Test func whenSessionSettled_runsAfterTheQueuedActivation() async {
        let (sut, session) = makeSUT()
        sut.sessionQueue.suspend()
        sut.activateContentPlayback(.audible)

        let seen = await withCheckedContinuation { continuation in
            sut.whenSessionSettled { continuation.resume(returning: session.calls.count) }
            sut.sessionQueue.resume()
        }

        #expect(seen == 2)
    }

    @Test func theRefcountedRequest_alsoRunsOnTheQueue() async throws {
        let (sut, session) = makeSUT()

        try await sut.request(role: .playback)
        await sut.release()
        await sut.sessionSettled()

        #expect(session.calls == [
            .setCategory(.playback, .default, ContentPlaybackSessionLaw.audibleOptions),
            .setActive(true),
            .setActive(false),
        ])
        #expect(session.writesOnMainThread == 0)
    }

    @Test func theBackgroundTeardown_runsOnTheQueue() async {
        let (sut, session) = makeSUT()

        await sut.deactivateForBackground()

        #expect(session.calls == [.setActive(false)])
        #expect(session.writesOnMainThread == 0)
    }
}
#endif
