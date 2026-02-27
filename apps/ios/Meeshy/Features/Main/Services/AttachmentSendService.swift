import Foundation
import Combine
import MeeshySDK

// MARK: - AttachmentSendService
// Future: extract the full send pipeline from ConversationView+AttachmentHandlers.swift
// (socket reconnection, TUS upload with progress, auto-send, messageType detection)
// into this service for reuse across composers (conversation, story, status).
// Current pipeline lives in sendMessageWithAttachments() and works well.

@MainActor
final class AttachmentSendService: ObservableObject {
    static let shared = AttachmentSendService()
}
