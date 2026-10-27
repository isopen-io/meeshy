import Foundation

/// Every in-flight video-transition / renegotiation task of a call, captured at
/// one instant (#11522).
///
/// Six paths drive the peer connection's local or remote description
/// (`createOffer()`, `createAnswer()`, `performICERestart()`) or the shared
/// `RTCCameraVideoCapturer` (`stopCapture()`/`startCapture()`), and none of
/// them is re-entrant: a manual toggle, a CallKit hold/unhold, a network
/// survival suspend/resume, an ICE restart, a peer-offer answer and a camera
/// switch (see `CallManager.survivalVideoTask`). A new one snapshots the six
/// slots — its own predecessor included — BEFORE replacing its slot, then
/// `settle()`s before actuating, so at most one actuation runs at a time.
/// `cancel()` alone is cooperative and never stops one already mid-flight,
/// which is why a waiter settles even when it is itself cancelled.
///
/// Awaiting already-started tasks in sequence only returns once all of them
/// have finished, whatever the order: the order of the awaits is not part of
/// the contract.
struct VideoTransitionChain: Sendable {
    let toggle: Task<Void, Never>?
    let hold: Task<Void, Never>?
    let survival: Task<Bool, Never>?
    let iceRestart: Task<Void, Never>?
    let answer: Task<Void, Never>?
    let cameraSwitch: Task<Void, Never>?

    func settle() async {
        for task in [toggle, hold, iceRestart, answer, cameraSwitch] {
            await task?.value
        }
        _ = await survival?.value
    }
}

extension CallManager {
    /// The six slots, read at once. Every serialized video-transition site
    /// calls this before assigning its own slot — never a hand-rolled copy.
    func videoTransitionsInFlight() -> VideoTransitionChain {
        VideoTransitionChain(
            toggle: videoToggleTask,
            hold: holdVideoTask,
            survival: survivalVideoTask,
            iceRestart: iceRestartTask,
            answer: signalOfferAnswerTask,
            cameraSwitch: cameraSwitchTask
        )
    }
}
