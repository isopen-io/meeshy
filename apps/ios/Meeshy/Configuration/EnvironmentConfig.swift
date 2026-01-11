//
//  EnvironmentConfig.swift
//  Meeshy
//
//  Centralized environment configuration for the entire application
//  - Backend URL selection (production/local)
//  - API endpoints
//  - WebSocket configuration
//  - Socket.IO events
//
//  Minimum iOS 16+
//

import Foundation
import SwiftUI

// MARK: - Notification Names

extension Notification.Name {
    /// Posted when the backend URL changes
    static let backendDidChange = Notification.Name("backendDidChange")
}

// MARK: - Environment Configuration

final class EnvironmentConfig: ObservableObject {
    // MARK: - Singleton

    nonisolated(unsafe) static let shared = EnvironmentConfig()

    // MARK: - API Versioning

    /// Current API version - configurable via environment variable MEESHY_API_VERSION
    /// Default: "v1". Change to "v2" etc. to switch all endpoints globally.
    /// Set in Xcode scheme: Edit Scheme → Run → Arguments → Environment Variables
    static var apiVersion: String {
        ProcessInfo.processInfo.environment["MEESHY_API_VERSION"] ?? "v1"
    }

    /// API path prefix including version (e.g., "/api/v1")
    static var apiPath: String { "/api/\(apiVersion)" }

    // MARK: - Preset URLs

    /// Production server URL
    static let productionURL = "https://gate.meeshy.me"

    /// Local development server URL (HTTPS via Traefik reverse proxy)
    static let localURL = "https://gate.meeshy.local"

    // MARK: - Storage

    private static let storageKey = "MEESHY_SELECTED_BACKEND_URL"
    private let lock = NSLock()
    private let defaults = UserDefaults.standard

    // MARK: - Published Properties

    /// User-selected URL (persisted in UserDefaults)
    @Published var selectedURL: String = "" {
        didSet {
            guard oldValue != selectedURL else { return }

            let value = selectedURL
            if Thread.isMainThread {
                defaults.set(value, forKey: EnvironmentConfig.storageKey)
            } else {
                DispatchQueue.main.async {
                    UserDefaults.standard.set(value, forKey: EnvironmentConfig.storageKey)
                }
            }

            // Clear all caches when backend changes
            onBackendChanged()
        }
    }

    // MARK: - Backend Change Handler

    /// Called when backend URL changes - clears all caches and disconnects WebSocket
    private func onBackendChanged() {
        // Clear all caches
        CacheManager.shared.clearAll()

        // Disconnect WebSocket (will reconnect with new URL on next use)
        Task { @MainActor in
            WebSocketService.shared.disconnect()
        }

        // Post notification for any listeners that need to refresh
        NotificationCenter.default.post(name: .backendDidChange, object: nil)
    }

    // MARK: - Computed Properties

    /// Active URL used by API and WebSocket services (thread-safe)
    var activeURL: String {
        lock.lock()
        defer { lock.unlock() }

        let stored = defaults.string(forKey: EnvironmentConfig.storageKey) ?? ""
        if !stored.isEmpty { return stored }

        // Default to production
        return EnvironmentConfig.productionURL
    }

    /// Base URL for HTTP requests
    static var baseURL: String {
        shared.activeURL
    }

    /// WebSocket URL - automatically converts HTTP(S) to WS(S)
    static var websocketURL: String {
        let url = shared.activeURL
        if url.hasPrefix("https://") {
            return url.replacingOccurrences(of: "https://", with: "wss://")
        } else {
            return url.replacingOccurrences(of: "http://", with: "ws://")
        }
    }

    /// Preset options for the backend selector UI
    var presetOptions: [String] {
        [EnvironmentConfig.productionURL, EnvironmentConfig.localURL]
    }

    /// Whether current selection is production
    var isProduction: Bool {
        activeURL == EnvironmentConfig.productionURL
    }

    // MARK: - Initialization

    private init() {
        self.selectedURL = defaults.string(forKey: EnvironmentConfig.storageKey) ?? ""
    }

    // MARK: - API Configuration
    // Note: All API endpoints are defined in Meeshy/API/Endpoints/*Endpoints.swift files

    static let requestTimeout: TimeInterval = 30.0
    static let enableLogging = true

    // MARK: - URL Resolution
    // Centralized URL building for attachments, images, etc.
    // Matches frontend pattern: buildAttachmentUrl()

    /// Attachment file endpoint prefix
    static let attachmentFilePrefix = "/api/attachments/file/"

    /// Attachment thumbnail endpoint prefix
    static let attachmentThumbnailPrefix = "/api/attachments/thumbnail/"

    /// Build a complete URL from a path
    /// Handles:
    /// - Already complete URLs (http:// or https://) → passthrough
    /// - Relative paths starting with / → prepend baseURL
    /// - File paths without prefix → prepend baseURL + attachmentFilePrefix
    ///
    /// Examples:
    /// - "https://example.com/file.jpg" → "https://example.com/file.jpg"
    /// - "/api/attachments/file/2024/11/user/file.jpg" → "https://gate.meeshy.me/api/attachments/file/2024/11/user/file.jpg"
    /// - "2024/11/user/file.jpg" → "https://gate.meeshy.me/api/attachments/file/2024/11/user/file.jpg"
    static func buildURL(_ path: String?) -> String? {
        guard let path = path, !path.isEmpty else {
            return nil
        }

        // Already a complete URL
        if path.hasPrefix("http://") || path.hasPrefix("https://") {
            return path
        }

        let base = baseURL

        // Path starts with / - it's a relative API path
        if path.hasPrefix("/") {
            return "\(base)\(path)"
        }

        // Just a file path - add the attachment prefix
        return "\(base)\(attachmentFilePrefix)\(path)"
    }

    /// Build attachment file URL from file path
    /// Input: "2024/11/userId/filename.jpg" or "/api/attachments/file/..."
    /// Output: "https://gate.meeshy.me/api/attachments/file/2024/11/userId/filename.jpg"
    static func buildAttachmentURL(_ filePath: String?) -> String? {
        return buildURL(filePath)
    }

    /// Build thumbnail URL from file path
    /// Input: "2024/11/userId/filename_thumb.jpg" or "/api/attachments/thumbnail/..."
    /// Output: "https://gate.meeshy.me/api/attachments/thumbnail/2024/11/userId/filename_thumb.jpg"
    static func buildThumbnailURL(_ filePath: String?) -> String? {
        guard let path = filePath, !path.isEmpty else {
            return nil
        }

        // Already a complete URL
        if path.hasPrefix("http://") || path.hasPrefix("https://") {
            return path
        }

        let base = baseURL

        // Already has the thumbnail prefix
        if path.hasPrefix("/api/attachments/thumbnail/") {
            return "\(base)\(path)"
        }

        // Already has any /api/ prefix - use as-is
        if path.hasPrefix("/") {
            return "\(base)\(path)"
        }

        // Just a file path - add the thumbnail prefix
        return "\(base)\(attachmentThumbnailPrefix)\(path)"
    }

    /// Extract just the file path from a URL (for storage optimization)
    /// Input: "https://gate.meeshy.me/api/attachments/file/2024/11/userId/filename.jpg"
    ///     or "/api/attachments/file/2024/11/userId/filename.jpg"
    /// Output: "2024/11/userId/filename.jpg"
    static func extractFilePath(from url: String?) -> String? {
        guard let url = url, !url.isEmpty else {
            return nil
        }

        // Remove base URL if present
        var path = url
        if path.hasPrefix(productionURL) {
            path = String(path.dropFirst(productionURL.count))
        } else if path.hasPrefix(localURL) {
            path = String(path.dropFirst(localURL.count))
        }

        // Remove attachment prefix
        if path.hasPrefix(attachmentFilePrefix) {
            return String(path.dropFirst(attachmentFilePrefix.count))
        }

        // Remove thumbnail prefix
        if path.hasPrefix(attachmentThumbnailPrefix) {
            return String(path.dropFirst(attachmentThumbnailPrefix.count))
        }

        // If it starts with /api/, return as-is (it's a different API endpoint)
        if path.hasPrefix("/api/") {
            return path
        }

        // Already just a path
        return path
    }

    // MARK: - Socket Events
    // Aligned with backend API: meeshy-backend WebSocket events

    enum SocketEvent {
        // Authentication
        static let authenticate = "authenticate"

        // MARK: - Messages (Client -> Server)
        static let messageSend = "message:send"
        static let messageSendWithAttachments = "message:send-with-attachments"
        static let messageEdit = "message:edit"
        static let messageDelete = "message:delete"

        // MARK: - Messages (Server -> Client)
        static let messageNew = "message:new"
        static let messageEdited = "message:edited"
        static let messageDeleted = "message:deleted"
        static let messageTranslation = "message:translation"

        // Legacy names (for backward compatibility)
        static let messageReceived = "message:new"
        static let messageSent = "message:sent"
        static let messageRead = "message:read"

        // MARK: - Message Status (Client -> Server)
        static let statusUpdate = "status:update"

        // MARK: - Read Status (Server -> Client)
        /// Read status updated: { conversationId, userId, type: 'received'|'read', messageId?, receivedBy?, updatedAt }
        static let readStatusUpdated = "read-status:updated"

        // MARK: - Typing (Client -> Server)
        static let typingStart = "typing:start"
        static let typingStop = "typing:stop"

        // MARK: - Typing (Server -> Client)
        static let typingStarted = "typing:start"
        static let typingStopped = "typing:stop"

        // Legacy names (for backward compatibility)
        static let userTyping = "typing:start"

        // MARK: - User Presence (Server -> Client)
        static let userOnline = "user:online"
        static let userOffline = "user:offline"
        static let userPresence = "user:presence"

        // MARK: - Reactions (Client -> Server)
        static let reactionAdd = "reaction:add"
        static let reactionRemove = "reaction:remove"
        static let reactionRequestSync = "reaction:request_sync"

        // MARK: - Reactions (Server -> Client)
        static let reactionAdded = "reaction:added"
        static let reactionRemoved = "reaction:removed"
        static let reactionSync = "reaction:sync"

        // MARK: - Conversations (Client -> Server)
        static let conversationJoin = "conversation:join"
        static let conversationLeave = "conversation:leave"
        static let conversationJoinMultiple = "conversation:join_multiple"

        // MARK: - Conversations (Server -> Client)
        static let conversationJoined = "conversation:joined"
        static let conversationUpdated = "conversation:updated"
        static let conversationDeleted = "conversation:deleted"

        // MARK: - Calls (Client -> Server)
        /// Initiate a new call: { conversationId, type: 'video'|'audio', settings? }
        static let callInitiate = "call:initiate"
        /// Join an existing call: { callId, settings? }
        static let callJoin = "call:join"
        /// Leave a call: { callId }
        static let callLeave = "call:leave"
        /// WebRTC signaling: { callId, signal: { type, from, to, sdp?, candidate?, sdpMLineIndex?, sdpMid? } }
        static let callSignal = "call:signal"
        /// Toggle audio: { callId, enabled }
        static let callToggleAudio = "call:toggle-audio"
        /// Toggle video: { callId, enabled }
        static let callToggleVideo = "call:toggle-video"
        /// Force end call: { callId }
        static let callEnd = "call:end"
        /// Force cleanup: { conversationId }
        static let callForceLeave = "call:force-leave"
        /// Accept incoming call: { callId }
        static let callAccept = "call:accept"
        /// Reject incoming call: { callId, reason? }
        static let callReject = "call:reject"

        // MARK: - Calls (Server -> Client)
        /// Call created: { callId, conversationId, mode, initiator, participants }
        static let callInitiated = "call:initiated"
        /// Call accepted by callee: { callId, acceptedBy }
        static let callAccepted = "call:accepted"
        /// Call rejected by callee: { callId, rejectedBy, reason? }
        static let callRejected = "call:rejected"
        /// Someone joined: { callId, participant, mode, iceServers? }
        static let callParticipantJoined = "call:participant-joined"
        /// Someone left: { callId, participantId, userId?, anonymousId?, mode }
        static let callParticipantLeft = "call:participant-left"
        /// Media state changed: { callId, participantId, mediaType, enabled }
        static let callMediaToggled = "call:media-toggled"
        /// Call ended: { callId, duration, endedBy }
        static let callEnded = "call:ended"
        /// Error: { code, message, details? }
        static let callError = "call:error"

        // MARK: - Notifications
        static let notificationNew = "notification:new"
        static let notificationRead = "notification:read"
    }
}
