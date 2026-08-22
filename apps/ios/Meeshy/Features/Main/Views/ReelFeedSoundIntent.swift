import Foundation
import Combine
import MeeshySDK

/// Pure decisions for the feed's video sound toggle (exigence produit
/// 2026-08-22, S2). Extracted so BOTH `ReelFeedCard` (réel natif) and
/// `ReelRepostEmbedCell` (repost de réel vidéo) call the SAME predicates
/// rather than recomputing their own — the "un prédicat, écrit une fois"
/// doctrine `MuteButtonExistenceGuardTests.test_readingSurfaces_
/// neverRecomputeExistenceLocally` already enforces for the unrelated
/// background-sound button (B3.6).
enum ReelFeedSoundButtonPolicy {

    /// Should the sound-toggle button be MOUNTED right now? Three inputs, all
    /// load-bearing:
    /// - `isActive`: this card is the one elected by the feed's autoplay
    ///   coordinator — a non-elected card owns no engine to pilot;
    /// - `isEngineOwned`: THIS surface instance has actually driven the
    ///   shared engine while active (`ownsEngine && isShowingThis` in
    ///   `ReelFeedVideoSurface`). `isActive` alone can be true for one render
    ///   pass BEFORE `drive()` has loaded anything (media still downloading,
    ///   a call just started) — mounting on that pass would be exactly the
    ///   "button exists, tap pilots nothing" defect the lot E review
    ///   rejected twice (`MuteButtonExistenceGuardTests`);
    /// - `hasAudioTrack`: the clip's own probed audio-track presence — a
    ///   button on a track-less clip is dead chrome.
    nonisolated static func showsSoundButton(isActive: Bool, isEngineOwned: Bool, hasAudioTrack: Bool) -> Bool {
        isActive && isEngineOwned && hasAudioTrack
    }

    /// `SharedAVPlayerManager.isForceMuted` resolution: the feed's autoplay
    /// silence is an EXPRESSED intention now, not a hardcoded `true` —
    /// `ReelFeedVideoSurface.drive()` calls this instead of writing `true` in
    /// the raw, so toggling the feed's sound button actually reaches the
    /// shared player.
    nonisolated static func isForceMuted(soundOn: Bool) -> Bool {
        !soundOn
    }
}

/// Session-scoped intention of the FEED's own sound — survives scroll and the
/// next elected card, never persisted across launches (the feed reopens
/// muted at the next cold start, honoring "démarrent en muet"). Deliberately
/// SEPARATE from `SharedAVPlayerManager.isMuted` (the fullscreen viewer's
/// GLOBAL preference): writing `isMuted` from the feed would reopen the exact
/// leak `isForceMuted` was built to close — `ReelsPlayerView.drive()` forces
/// `manager.isMuted = false` unconditionally on every fullscreen entry (no
/// restore on exit), and a conversation gallery would inherit a feed-authored
/// `isMuted = true` it never asked for. The feed instead flips
/// `isForceMuted` — see `ReelFeedSoundButtonPolicy.isForceMuted(soundOn:)`.
///
/// Also holds the per-media audio-track probe cache, keyed by `FeedMedia.id`,
/// shared across the native card and any repost cell showing the same reel.
/// `StoryAudioAvailability.merging` (SDK) is reused AS-IS for the one-way
/// "unresolved → resolved" write — the SAME contract the story viewer relies
/// on: a probe failure never locks in a false negative that a later, slower
/// probe could still resolve.
@MainActor
final class ReelFeedSoundIntent: ObservableObject {
    static let shared = ReelFeedSoundIntent()

    @Published private(set) var isSoundOn: Bool = false
    @Published private(set) var audioTrackPresence: [String: Bool] = [:]

    /// `internal`, not `private` — `.shared` is the production entry point,
    /// but tests need an ISOLATED instance so mutating sound-on/probe state
    /// in one test can never bleed into another (see `makeForTesting()`).
    init() {}

    /// Fresh, non-shared instance for tests — never share `.shared` across
    /// test cases, it would make them order-dependent.
    static func makeForTesting() -> ReelFeedSoundIntent { ReelFeedSoundIntent() }

    func setSoundOn(_ on: Bool) {
        isSoundOn = on
    }

    func toggleSound() {
        isSoundOn.toggle()
    }

    /// `probedTrackCount` — `nil` when the probe itself failed (unreachable
    /// asset); `0` or more when it resolved. Never overwrites an ALREADY
    /// resolved entry — caught by `test_intent_recordAudioProbe_
    /// neverOverwritesResolvedEntry`: `StoryAudioAvailability.merging` on its
    /// own does NOT guard this (it only skips a `nil` probe result); the
    /// story viewer gets the one-way guarantee from ITS OWN callers, both of
    /// which skip any id already present before calling `merging`
    /// (`if videoAudioTrackPresence[video.id] != nil { continue }`). This
    /// store enforces the same invariant itself, so it holds regardless of
    /// caller discipline — `probeAudioTrackIfNeeded()` already avoids a
    /// redundant probe via `isProbed(mediaId:)`, but a late/duplicate call
    /// must still be a safe no-op, not a silent regression from a resolved
    /// "has track" back to "no track".
    func recordAudioProbe(mediaId: String, probedTrackCount: Int?) {
        guard audioTrackPresence[mediaId] == nil else { return }
        audioTrackPresence = StoryAudioAvailability.merging(audioTrackPresence, id: mediaId, probedTrackCount: probedTrackCount)
    }

    func hasAudioTrack(mediaId: String) -> Bool {
        audioTrackPresence[mediaId] ?? false
    }

    func isProbed(mediaId: String) -> Bool {
        audioTrackPresence[mediaId] != nil
    }
}
