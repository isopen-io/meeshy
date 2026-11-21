#if os(iOS)
import AVFoundation
import Foundation
import os

private let logger = MeeshyLog.logger(.audioSession, subsystem: .legacySDK)

/// La file ordonnée de la prise de session (#9879).
extension MediaSessionCoordinator {

    // MARK: - File ordonnée (#9879)

    /// Prend la session `.playback` à son rang dans la file.
    public nonisolated func requestPlaybackInOrder() { enqueue(.request) }

    /// Rend la prise à son rang dans la file. Le dernier détenteur ne désactive
    /// qu'au bout de `ContentSessionReleaseLaw.swipeHandoverGrace` : la requête
    /// du canvas suivant, au balayage, annule la désactivation (la musique des
    /// autres apps ne baisse plus puis ne remonte plus).
    public nonisolated func releasePlaybackInOrder() { enqueue(.release) }

    nonisolated func enqueue(_ op: PlaybackSessionOp) {
        let continuation = _opsLock.withLock { state -> AsyncStream<PlaybackSessionOp>.Continuation in
            if let existing = state { return existing }
            let (stream, continuation) = AsyncStream.makeStream(of: PlaybackSessionOp.self)
            state = continuation
            Task { [weak self] in
                for await next in stream {
                    guard let self else { return }
                    await self.perform(next)
                }
            }
            return continuation
        }
        continuation.yield(op)
    }

    /// Rend quand tout ce qui a été mis en file avant l'appel est exécuté.
    func settled() async {
        await withCheckedContinuation { enqueue(.barrier($0)) }
    }

    private func perform(_ op: PlaybackSessionOp) async {
        switch op {
        case .request:
            do {
                try await request(role: .playback)
            } catch {
                logger.error("ordered request failed — \(error.localizedDescription, privacy: .public)")
            }
        case .release:
            releaseHandingOver()
        case .deactivateIfIdle(let generation):
            guard activationCount == 0, _activationGeneration.withLock({ $0 }) == generation else { return }
            deactivateSession()
        case .barrier(let continuation):
            continuation.resume()
        }
    }

    private func releaseHandingOver() {
        guard activationCount > 0 else { return }
        activationCount -= 1
        guard activationCount == 0 else { return }
        let generation = _activationGeneration.withLock { $0 }
        scheduleAfter(ContentSessionReleaseLaw.swipeHandoverGrace, .main) { [weak self] in
            self?.enqueue(.deactivateIfIdle(generation: generation))
        }
    }

    /// Called during the `.background` scene transition. Forces the session
    /// to release even if the refcount is still > 0 — individual players are
    /// expected to have been stopped by `PlaybackCoordinator.stopAll()`
    /// beforehand. Fails quietly if the session is already inactive.
    ///
    /// During an active call the audio session is owned by RTCAudioSession /
    /// CallKit, NOT by this coordinator — tearing it down here would mute a
    /// live VoIP call the moment the user locks the screen. Mirror the
    /// `callActive` guard every other method in this class already applies.
    public func deactivateForBackground() async {
        playbackLeaseHeld = false
        audibleContentHoldsSession = false
        guard Self.shouldManageSession(callActive: callActive), contentMayReconfigureSession else { return }
        activationCount = 0
        #if DEBUG
        testProbe?.deactivateCount += 1
        #endif
        await sessionSettled(after: { [self] in
            guard Self.shouldManageSession(callActive: callActive), contentMayReconfigureSession else { return }
            do {
                try audioSession.setActive(false, options: .notifyOthersOnDeactivation)
            } catch {
                logger.error("deactivateForBackground failed: \(error.localizedDescription, privacy: .public)")
            }
        })
    }

    /// Exécute `work` sur `sessionQueue` et rend quand il est fait.
    private nonisolated func sessionSettled(after work: @escaping @Sendable () -> Void) async {
        await withCheckedContinuation { continuation in
            onSessionQueue {
                work()
                continuation.resume()
            }
        }
    }
}
#endif
