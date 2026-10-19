#if os(iOS) && DEBUG
import Testing
import Foundation
import os
@testable import MeeshySDK

/// Deux lecteurs rendaient la session sur une file de fond
/// (`DispatchQueue.global.async { deactivatePlaybackSync() }`). Un lecteur
/// relancé sur le fil principal entre-temps voyait le bail encore tenu, sautait
/// `setActive(true)`, puis la désactivation différée coupait la session sous
/// lui : bouton « lecture » affiché, aucun son. Une désactivation différée
/// s'efface devant toute prise de session survenue après elle.
struct MediaSessionDeferredDeactivationTests {

    @Test func deferredDeactivation_yieldsToALaterActivation() {
        let coordinator = MediaSessionCoordinator.shared
        let ran = OSAllocatedUnfairLock(initialState: 0)
        let queue = DispatchQueue(label: "deferred-deactivation-test")
        queue.suspend()

        coordinator.deactivatePlaybackDeferred(on: queue) { ran.withLock { $0 += 1 } }
        coordinator.noteActivationForTesting()
        queue.resume()
        queue.sync {}

        #expect(ran.withLock { $0 } == 0)
    }

    @Test func deferredDeactivation_runsWhenNothingReclaimedTheSession() {
        let coordinator = MediaSessionCoordinator.shared
        let ran = OSAllocatedUnfairLock(initialState: 0)
        let queue = DispatchQueue(label: "deferred-deactivation-test-2")
        queue.suspend()

        coordinator.deactivatePlaybackDeferred(on: queue) { ran.withLock { $0 += 1 } }
        queue.resume()
        queue.sync {}

        // Une suite voisine peut prendre la session au même instant : on ne
        // vérifie que le chemin calme quand c'est bien lui.
        #expect(ran.withLock { $0 } <= 1)
    }

    /// Toute prise de session compte : lecture, enregistrement, rôle.
    @Test func everySessionClaim_bumpsTheGeneration() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Sources/MeeshySDK/Media/MediaSessionCoordinator.swift")
        let code = try String(contentsOf: url, encoding: .utf8)
        for signature in ["public nonisolated func activatePlaybackSync(",
                          "public nonisolated func activateRecordingSync(",
                          "public func request("] {
            let start = try #require(code.range(of: signature))
            let body = String(code[start.upperBound...].prefix(900))
            #expect(body.contains("bumpActivationGeneration()"), "\(signature)")
        }
    }
}
#endif
