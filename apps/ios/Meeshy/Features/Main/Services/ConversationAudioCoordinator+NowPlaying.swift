import Foundation
import Combine
import MediaPlayer
import MeeshyUI
import MeeshySDK
import UIKit
import os

/// MPNowPlayingInfoCenter + MPRemoteCommandCenter bridge for the
/// `ConversationAudioCoordinator`.
///
/// Surfaces the active audio context, transport state and progress to the
/// system lock screen, control center, AirPods controls and CarPlay. Honors
/// remote commands (play/pause/next/previous/seek) by routing them back to the
/// coordinator. `currentTime` is throttled to 0.25s to avoid spamming the
/// system NowPlaying info center.
///
/// Phase 8 of `docs/superpowers/plans/2026-05-26-audio-playback-persistence-plan.md`.
///
/// The extension lives in its own file (`+NowPlaying.swift`) to keep the
/// coordinator itself focused on queue + lifecycle orchestration. State
/// (`_isNowPlayingActivated`, `_nowPlayingCancellables`) is held on the
/// class with default (`internal`) access so this same-module extension
/// can read/write it.
extension ConversationAudioCoordinator {

    /// Named magic numbers for the system NowPlaying bridge.
    private enum NowPlayingConstants {
        /// Throttle window for `currentTime → MPNowPlayingInfoCenter`
        /// updates. The engine emits ~50Hz tick updates; pushing each of
        /// them to the system widget would be wasteful and noisy. 250ms
        /// keeps the lock-screen scrubber smooth to the eye without
        /// spamming the framework.
        static let currentTimeThrottle: DispatchQueue.SchedulerTimeType.Stride = .milliseconds(250)
    }

    private static let nowPlayingLog = Logger(
        subsystem: "me.meeshy.app", category: "audio-nowplaying"
    )

    /// Activates the system NowPlaying + RemoteCommand bridge. Idempotent —
    /// subsequent calls are no-ops. Call once at app root mount (from the
    /// root view's `.task { ... }`).
    public func activateNowPlayingBridge() {
        guard !_isNowPlayingActivated else { return }
        _isNowPlayingActivated = true

        // Throttle currentTime → 0.25s, latest value only. Avoids spamming
        // MPNowPlayingInfoCenter (~50Hz from the engine timer would be
        // wasteful and noisy in the system widget).
        $currentTime
            .throttle(for: NowPlayingConstants.currentTimeThrottle,
                      scheduler: DispatchQueue.main, latest: true)
            .sink { [weak self] _ in self?.pushNowPlayingInfo() }
            .store(in: &_nowPlayingCancellables)

        $isPlaying
            .removeDuplicates()
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in self?.pushNowPlayingInfo() }
            .store(in: &_nowPlayingCancellables)

        $activeContext
            .removeDuplicates()
            .receive(on: DispatchQueue.main)
            .sink { [weak self] context in
                guard let self else { return }
                if context == nil {
                    self.clearNowPlaying()
                } else {
                    self.pushNowPlayingInfo()
                }
            }
            .store(in: &_nowPlayingCancellables)

        installRemoteCommands()
    }

    // MARK: - NowPlayingInfoCenter

    private func pushNowPlayingInfo() {
        guard let context = activeContext else {
            clearNowPlaying()
            return
        }
        let totalDuration = duration > 0 ? duration : Double(context.durationMs) / 1000.0
        let info: [String: Any] = [
            MPMediaItemPropertyTitle: context.senderName,
            MPMediaItemPropertyAlbumTitle: context.conversationName,
            MPMediaItemPropertyPlaybackDuration: totalDuration,
            MPNowPlayingInfoPropertyElapsedPlaybackTime: currentTime,
            MPNowPlayingInfoPropertyPlaybackRate: isPlaying ? Float(speed.rawValue) : 0.0,
            MPNowPlayingInfoPropertyMediaType: MPNowPlayingInfoMediaType.audio.rawValue
        ]
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info

        // Best-effort artwork — async, non-blocking. Cache hit returns
        // immediately; cache miss falls back to URLSession. Re-checks the
        // active context after the await to avoid stamping artwork for a
        // stale playback once the queue has already advanced.
        if let urlString = context.conversationArtworkURL,
           !urlString.isEmpty {
            let pinnedAttachmentId = context.attachmentId
            Task { [weak self] in
                guard let self else { return }
                guard let img = await Self.loadArtworkImage(for: urlString) else { return }
                await MainActor.run {
                    guard self.activeContext?.attachmentId == pinnedAttachmentId,
                          var currentInfo = MPNowPlayingInfoCenter.default().nowPlayingInfo
                    else { return }
                    let artwork = MPMediaItemArtwork(boundsSize: img.size) { _ in img }
                    currentInfo[MPMediaItemPropertyArtwork] = artwork
                    MPNowPlayingInfoCenter.default().nowPlayingInfo = currentInfo
                }
            }
        }
    }

    private func clearNowPlaying() {
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
    }

    // MARK: - RemoteCommandCenter

    private func installRemoteCommands() {
        let cc = MPRemoteCommandCenter.shared()

        // System remote command handlers may be invoked from system-owned
        // queues (not guaranteed main). The coordinator is `@MainActor`, so
        // we hop via `Task { @MainActor in }` before calling into it.
        let playToken = cc.playCommand.addTarget { [weak self] _ in
            guard let self else { return .commandFailed }
            Task { @MainActor in self.togglePlayPause() }
            return .success
        }
        let pauseToken = cc.pauseCommand.addTarget { [weak self] _ in
            guard let self else { return .commandFailed }
            Task { @MainActor in self.togglePlayPause() }
            return .success
        }
        let nextToken = cc.nextTrackCommand.addTarget { [weak self] _ in
            guard let self else { return .commandFailed }
            Task { @MainActor in self.playNext() }
            return .success
        }
        let previousToken = cc.previousTrackCommand.addTarget { [weak self] _ in
            guard let self else { return .commandFailed }
            Task { @MainActor in self.playPrevious() }
            return .success
        }
        let seekToken = cc.changePlaybackPositionCommand.addTarget { [weak self] event in
            guard let positionEvent = event as? MPChangePlaybackPositionCommandEvent,
                  let self else { return .commandFailed }
            let position = positionEvent.positionTime
            Task { @MainActor in
                let fraction = self.duration > 0
                    ? position / self.duration
                    : 0
                self.seek(toFraction: max(0, min(1, fraction)))
            }
            return .success
        }

        // Tokens stored for future `deactivateNowPlayingBridge()` symmetry —
        // currently unused since the bridge is process-long.
        _remoteCommandTokens = [playToken, pauseToken, nextToken, previousToken, seekToken]

        cc.playCommand.isEnabled = true
        cc.pauseCommand.isEnabled = true
        cc.nextTrackCommand.isEnabled = true
        // Always enabled: with no prior track `playPrevious()` simply restarts
        // the current one (standard media-player behavior), so the control is
        // never a dead no-op.
        cc.previousTrackCommand.isEnabled = true
        cc.changePlaybackPositionCommand.isEnabled = true
    }

    // MARK: - Artwork loading

    /// Loads artwork for the given URL string. Best-effort: returns `nil`
    /// on any failure. Tries `CacheCoordinator.shared.images.image(for:)`
    /// first (3-tier cache: NSCache memory → FileManager disk → network),
    /// then falls back to a raw URLSession fetch.
    ///
    /// `nonisolated` so it can be called from any actor — the `images`
    /// store is itself an actor and synchronizes internally.
    nonisolated private static func loadArtworkImage(for urlString: String) async -> UIImage? {
        if let img = await CacheCoordinator.shared.images.image(for: urlString) {
            return img
        }
        guard let url = URL(string: urlString),
              let (data, _) = try? await URLSession.shared.data(from: url),
              let img = UIImage(data: data) else {
            return nil
        }
        return img
    }
}
