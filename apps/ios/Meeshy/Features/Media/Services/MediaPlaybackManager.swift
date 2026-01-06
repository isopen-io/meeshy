//
//  MediaPlaybackManager.swift
//  Meeshy
//
//  Global manager for audio/video playback - ensures only one media plays at a time
//  Tracks current playback position for seamless fullscreen transitions
//
//  Fixes applied:
//  - Exception handling for callbacks
//  - Comprehensive logging for debugging
//  - Cleanup of stale registrations
//

import Foundation
import AVFoundation
import Combine

// Uses global mediaLogger from LoggerGlobal.swift

// MARK: - Media Registration Info

private struct MediaRegistration {
    let id: String
    let registeredAt: Date
    let stopCallback: () -> Void

    var age: TimeInterval {
        Date().timeIntervalSince(registeredAt)
    }
}

// MARK: - Media Playback Manager

@MainActor
final class MediaPlaybackManager: ObservableObject {

    // MARK: - Singleton

    static let shared = MediaPlaybackManager()

    // MARK: - Published Properties

    @Published private(set) var currentlyPlayingId: String?
    @Published private(set) var currentPlaybackTime: Double = 0
    @Published private(set) var isPlaying: Bool = false
    @Published private(set) var registeredMediaCount: Int = 0

    // MARK: - Private Properties

    /// Registered media players with their stop callbacks
    private var registrations: [String: MediaRegistration] = [:]

    /// Maximum age for stale registrations (5 minutes)
    private let maxRegistrationAge: TimeInterval = 300

    /// Cleanup timer
    private var cleanupTask: Task<Void, Never>?

    // MARK: - Initialization

    private init() {
        mediaLogger.info("🎬 [MediaPlaybackManager] Initialized")
        startCleanupTimer()
    }

    deinit {
        cleanupTask?.cancel()
    }

    // MARK: - Cleanup Timer

    private func startCleanupTimer() {
        cleanupTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 60_000_000_000) // Every 60 seconds
                await self?.cleanupStaleRegistrations()
            }
        }
    }

    private func cleanupStaleRegistrations() {
        let now = Date()
        var staleIds: [String] = []

        for (id, registration) in registrations {
            // Don't clean up currently playing media
            if id == currentlyPlayingId {
                continue
            }

            if registration.age > maxRegistrationAge {
                staleIds.append(id)
            }
        }

        for id in staleIds {
            registrations.removeValue(forKey: id)
            mediaLogger.debug("🎬 [MediaPlaybackManager] Cleaned up stale registration: \(id.prefix(20))...")
        }

        if !staleIds.isEmpty {
            registeredMediaCount = registrations.count
            mediaLogger.info("🎬 [MediaPlaybackManager] Cleaned up \(staleIds.count) stale registrations, \(self.registrations.count) remaining")
        }
    }

    // MARK: - Registration

    /// Register a media player with a stop callback
    /// - Parameters:
    ///   - id: Unique identifier for this media (URL string or attachment ID)
    ///   - stopCallback: Callback to stop playback
    func register(id: String, stopCallback: @escaping () -> Void) {
        let registration = MediaRegistration(
            id: id,
            registeredAt: Date(),
            stopCallback: stopCallback
        )
        registrations[id] = registration
        registeredMediaCount = registrations.count

        mediaLogger.info("🎬 [MediaPlaybackManager] Registered: \(id.prefix(30))... (total: \(self.registrations.count))")
    }

    /// Unregister a media player
    func unregister(id: String) {
        guard registrations.removeValue(forKey: id) != nil else {
            mediaLogger.warn("🎬 [MediaPlaybackManager] Tried to unregister unknown id: \(id.prefix(30))...")
            return
        }

        registeredMediaCount = registrations.count

        if currentlyPlayingId == id {
            currentlyPlayingId = nil
            currentPlaybackTime = 0
            isPlaying = false
            mediaLogger.info("🎬 [MediaPlaybackManager] Unregistered currently playing: \(id.prefix(30))...")
        } else {
            mediaLogger.debug("🎬 [MediaPlaybackManager] Unregistered: \(id.prefix(30))... (remaining: \(self.registrations.count))")
        }
    }

    // MARK: - Playback Control

    /// Request to start playing media - stops all other media first
    /// - Parameters:
    ///   - id: Unique identifier for the media
    ///   - currentTime: Current playback position (for resuming)
    /// - Returns: true if playback can proceed
    func requestPlay(id: String, currentTime: Double = 0) -> Bool {
        mediaLogger.info("🎬 [MediaPlaybackManager] Play requested: \(id.prefix(30))... at \(String(format: "%.1f", currentTime))s")

        // Stop any currently playing media (with exception handling)
        if let currentId = currentlyPlayingId, currentId != id {
            stopMedia(id: currentId, reason: "new media requested")
        }

        currentlyPlayingId = id
        currentPlaybackTime = currentTime
        isPlaying = true

        mediaLogger.info("🎬 [MediaPlaybackManager] ▶️ Now playing: \(id.prefix(30))...")
        return true
    }

    /// Safely stop a media with exception handling
    private func stopMedia(id: String, reason: String) {
        guard let registration = registrations[id] else {
            mediaLogger.warn("🎬 [MediaPlaybackManager] Stop requested for unregistered id: \(id.prefix(30))...")
            return
        }

        mediaLogger.info("🎬 [MediaPlaybackManager] Stopping \(id.prefix(30))... (reason: \(reason))")

        // FIX: Wrap callback in exception handling to prevent crashes
        do {
            try withoutActuallyEscaping(registration.stopCallback) { callback in
                callback()
            }
        } catch {
            mediaLogger.error("🎬 [MediaPlaybackManager] ❌ Stop callback threw exception: \(error.localizedDescription)")
        }
    }

    /// Notify that playback has stopped
    func notifyStop(id: String) {
        if currentlyPlayingId == id {
            isPlaying = false
            mediaLogger.info("🎬 [MediaPlaybackManager] ⏹️ Stopped: \(id.prefix(30))...")
        }
    }

    /// Notify that playback has paused (but not stopped)
    func notifyPause(id: String, at time: Double) {
        if currentlyPlayingId == id {
            currentPlaybackTime = time
            isPlaying = false
            mediaLogger.info("🎬 [MediaPlaybackManager] ⏸️ Paused: \(id.prefix(30))... at \(String(format: "%.1f", time))s")
        }
    }

    /// Update current playback time (for position tracking)
    func updatePlaybackTime(id: String, time: Double) {
        if currentlyPlayingId == id {
            currentPlaybackTime = time
            // Don't log every update (too verbose)
        }
    }

    /// Get saved playback position for a media ID
    func getSavedPosition(for id: String) -> Double? {
        if currentlyPlayingId == id && currentPlaybackTime > 0 {
            mediaLogger.debug("🎬 [MediaPlaybackManager] Saved position for \(id.prefix(30))...: \(String(format: "%.1f", currentPlaybackTime))s")
            return currentPlaybackTime
        }
        return nil
    }

    /// Stop all playback
    func stopAll() {
        mediaLogger.info("🎬 [MediaPlaybackManager] Stopping ALL playback (\(registrations.count) registered)")

        for (id, registration) in registrations {
            // FIX: Wrap each callback in exception handling
            do {
                try withoutActuallyEscaping(registration.stopCallback) { callback in
                    callback()
                }
                mediaLogger.debug("🎬 [MediaPlaybackManager] Stopped: \(id.prefix(30))...")
            } catch {
                mediaLogger.error("🎬 [MediaPlaybackManager] ❌ Stop callback failed for \(id.prefix(30))...: \(error.localizedDescription)")
            }
        }

        currentlyPlayingId = nil
        currentPlaybackTime = 0
        isPlaying = false

        mediaLogger.info("🎬 [MediaPlaybackManager] All playback stopped")
    }

    /// Check if a specific media is currently playing
    func isCurrentlyPlaying(id: String) -> Bool {
        return currentlyPlayingId == id && isPlaying
    }

    // MARK: - Debug Info

    /// Get debug information about current state
    func debugInfo() -> String {
        var info = "MediaPlaybackManager State:\n"
        info += "  Currently Playing: \(currentlyPlayingId?.prefix(30) ?? "none")\n"
        info += "  Playback Time: \(String(format: "%.1f", currentPlaybackTime))s\n"
        info += "  Is Playing: \(isPlaying)\n"
        info += "  Registered Media: \(registrations.count)\n"

        for (id, registration) in registrations {
            let isCurrent = id == currentlyPlayingId ? " [CURRENT]" : ""
            info += "    - \(id.prefix(40))... (age: \(String(format: "%.0f", registration.age))s)\(isCurrent)\n"
        }

        return info
    }

    /// Log current state (for debugging)
    func logState() {
        mediaLogger.info("🎬 [MediaPlaybackManager] \(self.debugInfo())")
    }
}
