//
//  WebSocketEndpoints.swift
//  Meeshy
//
//  WebSocket real-time endpoints and events documentation
//  Aligned with backend API: meeshy-backend WebSocket events
//

import Foundation

// MARK: - WebSocket Endpoints Documentation
/// This file documents all WebSocket channels and events for real-time communication.
/// Use `EnvironmentConfig.SocketEvent` for actual event names.
/// Use `WebSocketService.shared` for sending/receiving events.

enum WebSocketEndpoints {

    // MARK: - Connection
    /// WebSocket URL: wss://gate.meeshy.me/ws
    /// Authentication: Bearer token via extraHeaders or "authenticate" event

    // MARK: - Messages

    /// Real-time message events
    enum Messages {
        // MARK: Client → Server

        /// Send a new message
        /// - Event: `message:send`
        /// - Data: `{ conversationId, content, originalLanguage?, replyToId? }`
        case send(conversationId: String, content: String, originalLanguage: String?, replyToId: String?)

        /// Send a message with attachments
        /// - Event: `message:send-with-attachments`
        /// - Data: `{ conversationId, content, attachmentIds[], originalLanguage?, replyToId? }`
        case sendWithAttachments(conversationId: String, content: String, attachmentIds: [String], originalLanguage: String?, replyToId: String?)

        /// Edit a message
        /// - Event: `message:edit`
        /// - Data: `{ messageId, content }`
        case edit(messageId: String, content: String)

        /// Delete a message
        /// - Event: `message:delete`
        /// - Data: `{ messageId }`
        case delete(messageId: String)

        // MARK: Server → Client (Broadcast)

        /// New message received
        /// - Event: `message:new`
        /// - Data: `SocketIOMessage` (full message object with sender, attachments, etc.)
        case new

        /// Message was edited
        /// - Event: `message:edited`
        /// - Data: `SocketIOMessage`
        case edited

        /// Message was deleted
        /// - Event: `message:deleted`
        /// - Data: `{ messageId, conversationId }`
        case deleted

        /// Translation received for a message
        /// - Event: `message:translation`
        /// - Data: `TranslationEvent { messageId, translatedContent, targetLanguage, sourceLanguage }`
        case translation
    }

    // MARK: - Typing Indicator

    /// Real-time typing indicator events
    /// No REST API - WebSocket only (temporary state, no persistence needed)
    enum Typing {
        // MARK: Client → Server

        /// Start typing indicator
        /// - Event: `typing:start`
        /// - Data: `{ conversationId }`
        case start(conversationId: String)

        /// Stop typing indicator
        /// - Event: `typing:stop`
        /// - Data: `{ conversationId }`
        case stop(conversationId: String)

        // MARK: Server → Client (Broadcast)

        /// User started typing (broadcast to other participants)
        /// - Event: `typing:start`
        /// - Data: `{ userId, username, conversationId, isTyping: true }`
        case userStarted

        /// User stopped typing (broadcast to other participants)
        /// - Event: `typing:stop`
        /// - Data: `{ userId, username, conversationId, isTyping: false }`
        case userStopped
    }

    // MARK: - Reactions

    /// Real-time reaction events
    enum Reactions {
        // MARK: Client → Server

        /// Add a reaction to a message
        /// - Event: `reaction:add`
        /// - Data: `{ messageId, emoji }`
        /// - Note: Prefer WebSocket over REST for real-time broadcast
        case add(messageId: String, emoji: String)

        /// Remove a reaction from a message
        /// - Event: `reaction:remove`
        /// - Data: `{ messageId, emoji }`
        case remove(messageId: String, emoji: String)

        /// Request sync of reactions (after reconnection)
        /// - Event: `reaction:request_sync`
        /// - Data: `messageId` (string)
        case requestSync(messageId: String)

        // MARK: Server → Client (Broadcast)

        /// Reaction added (broadcast to all participants)
        /// - Event: `reaction:added`
        /// - Data: `ReactionUpdateEvent { messageId, userId, emoji, aggregation, timestamp }`
        case added

        /// Reaction removed (broadcast to all participants)
        /// - Event: `reaction:removed`
        /// - Data: `ReactionUpdateEvent`
        case removed

        /// Reaction sync response
        /// - Event: `reaction:sync`
        /// - Data: `ReactionSync { messageId, reactions: [ReactionAggregation], totalCount }`
        case sync
    }

    // MARK: - User Presence

    /// Real-time user presence events
    enum Presence {
        // MARK: Server → Client

        /// User came online
        /// - Event: `user:online`
        /// - Data: `{ userId, timestamp }`
        case online

        /// User went offline
        /// - Event: `user:offline`
        /// - Data: `{ userId, timestamp }`
        case offline

        /// Generic presence update
        /// - Event: `user:presence`
        /// - Data: `{ userId, status: "online"|"away"|"offline", lastSeen? }`
        case update
    }

    // MARK: - Conversations

    /// Real-time conversation events
    enum Conversations {
        // MARK: Server → Client

        /// Conversation updated (name, avatar, settings changed)
        /// - Event: `conversation:updated`
        /// - Data: `Conversation` object
        case updated

        /// Conversation deleted
        /// - Event: `conversation:deleted`
        /// - Data: `{ conversationId }`
        case deleted
    }

    // MARK: - Calls

    /// Real-time call events (aligned with gateway API)
    enum Calls {
        // MARK: Client → Server

        /// Initiate a new call
        /// - Event: `call:initiate`
        /// - Data: `{ conversationId, type: 'video'|'audio', settings? }`
        case initiate(conversationId: String, type: String)

        /// Accept an incoming call
        /// - Event: `call:accept`
        /// - Data: `{ callId }`
        case accept(callId: String)

        /// Reject an incoming call
        /// - Event: `call:reject`
        /// - Data: `{ callId, reason? }`
        case reject(callId: String, reason: String?)

        /// Join an existing call
        /// - Event: `call:join`
        /// - Data: `{ callId, settings? }`
        case join(callId: String)

        /// Leave a call
        /// - Event: `call:leave`
        /// - Data: `{ callId }`
        case leave(callId: String)

        /// WebRTC signaling (offer/answer/ICE candidates)
        /// - Event: `call:signal`
        /// - Data: `{ callId, signal: { type, from, to, sdp?, candidate?, sdpMLineIndex?, sdpMid? } }`
        case signal(callId: String, signal: Any)

        /// Toggle audio
        /// - Event: `call:toggle-audio`
        /// - Data: `{ callId, enabled }`
        case toggleAudio(callId: String, enabled: Bool)

        /// Toggle video
        /// - Event: `call:toggle-video`
        /// - Data: `{ callId, enabled }`
        case toggleVideo(callId: String, enabled: Bool)

        /// End call
        /// - Event: `call:end`
        /// - Data: `{ callId }`
        case end(callId: String)

        // MARK: Server → Client

        /// Call initiated (incoming call for callee, confirmation for initiator)
        /// - Event: `call:initiated`
        /// - Data: `{ callId, conversationId, mode, initiator: { userId, username, avatar }, participants }`
        /// - Note: For callee (isInitiator=false), this IS the incoming call notification
        case initiated

        /// Call accepted by callee
        /// - Event: `call:accepted`
        /// - Data: `{ callId, acceptedBy: { userId, username, avatar } }`
        case accepted

        /// Call rejected by callee
        /// - Event: `call:rejected`
        /// - Data: `{ callId, rejectedBy: { userId, username, avatar }, reason? }`
        case rejected

        /// Participant joined the call
        /// - Event: `call:participant-joined`
        /// - Data: `{ callId, participant, mode, iceServers? }`
        case participantJoined

        /// Participant left the call
        /// - Event: `call:participant-left`
        /// - Data: `{ callId, participantId, userId?, anonymousId?, mode }`
        case participantLeft

        /// Media state changed
        /// - Event: `call:media-toggled`
        /// - Data: `{ callId, participantId, mediaType, enabled }`
        case mediaToggled

        /// Call ended
        /// - Event: `call:ended`
        /// - Data: `{ callId, duration, endedBy }`
        case ended

        /// Call error
        /// - Event: `call:error`
        /// - Data: `{ code, message, details? }`
        case error
    }

    // MARK: - Notifications

    /// Real-time notification events
    enum Notifications {
        // MARK: Server → Client

        /// New notification received
        /// - Event: `notification:new`
        /// - Data: `MeeshyNotification` object
        case new

        /// Notification marked as read
        /// - Event: `notification:read`
        /// - Data: `{ notificationId }`
        case read
    }
}

// MARK: - REST vs WebSocket Usage Guide

/// When to use REST vs WebSocket:
///
/// | Feature                    | REST (HTTP)        | WebSocket          | Recommendation        |
/// |----------------------------|--------------------|--------------------|------------------------|
/// | Send message               | POST /messages     | message:send       | WebSocket (real-time)  |
/// | Edit message               | PUT /messages/:id  | message:edit       | Either works           |
/// | Delete message             | DELETE /messages/:id| message:delete    | Either works           |
/// | Load message history       | GET /conversations/:id/messages | -     | REST (pagination)      |
/// | Add/Remove reaction        | POST/DELETE        | reaction:add/remove| WebSocket (real-time)  |
/// | List reactions             | GET /reactions     | -                  | REST (pagination)      |
/// | Typing indicator           | -                  | typing:start/stop  | WebSocket ONLY         |
/// | Translation                | POST /translate    | message:translation| Both (REST to request, WS for result) |
/// | Sync after reconnect       | -                  | reaction:request_sync | WebSocket           |

// MARK: - Event Name Constants Reference
/// See `EnvironmentConfig.SocketEvent` for all event name constants
/// Example usage:
/// ```swift
/// // Using WebSocketService for sending events
/// WebSocketService.shared.startTyping(conversationId: "...")
/// WebSocketService.shared.stopTyping(conversationId: "...")
/// WebSocketService.shared.addReaction(messageId: "...", emoji: "...")
/// WebSocketService.shared.sendMessage(conversationId: "...", content: "...")
///
/// // Subscribing to events
/// webSocketService.on(EnvironmentConfig.SocketEvent.messageNew) { data in ... }
/// webSocketService.on(EnvironmentConfig.SocketEvent.reactionAdded) { data in ... }
/// webSocketService.on(EnvironmentConfig.SocketEvent.typingStart) { data in ... }
/// webSocketService.on(EnvironmentConfig.SocketEvent.messageTranslation) { data in ... }
///
/// // Unsubscribing from events
/// webSocketService.off(EnvironmentConfig.SocketEvent.messageNew)
/// ```
