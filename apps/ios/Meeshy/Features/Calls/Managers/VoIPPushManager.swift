//
//  VoIPPushManager.swift
//  Meeshy
//
//  PushKit integration for VoIP push notifications
//  Enables reliable incoming call delivery even when app is terminated
//
//  Minimum iOS 16+
//

import Foundation
import PushKit
import CallKit
import UIKit

// MARK: - VoIP Push Manager

/// Manages VoIP push notifications using PushKit
/// VoIP pushes are high-priority and wake the app even when terminated
@MainActor
final class VoIPPushManager: NSObject, ObservableObject {

    // MARK: - Singleton

    static let shared = VoIPPushManager()

    // MARK: - Published Properties

    @Published private(set) var voipToken: String?
    @Published private(set) var isRegistered: Bool = false

    // MARK: - Private Properties

    private var voipRegistry: PKPushRegistry?
    private let callKitManager = CallKitManager.shared

    // MARK: - Initialization

    private override init() {
        super.init()
    }

    // MARK: - Setup

    /// Initialize and register for VoIP push notifications
    /// Call this early in app lifecycle (e.g., AppDelegate.didFinishLaunching)
    func setup() {
        #if !targetEnvironment(simulator)
        voipRegistry = PKPushRegistry(queue: DispatchQueue.main)
        voipRegistry?.delegate = self
        voipRegistry?.desiredPushTypes = [.voIP]

        voipLogger.info("VoIP push registry initialized")
        #else
        voipLogger.info("VoIP push not available on simulator")
        #endif
    }

    // MARK: - Token Management

    /// Register VoIP token with backend server
    /// Uses APIService.registerDeviceToken aligned with gateway API
    private func registerTokenWithServer(_ token: String) async {
        guard AuthenticationManager.shared.isAuthenticated else {
            voipLogger.info("Skipping VoIP token registration - user not authenticated")
            return
        }

        voipLogger.info("Registering VoIP token with server...")

        do {
            try await APIService.shared.registerDeviceToken(apnsToken: token, platform: "ios")
            voipLogger.info("VoIP token registered successfully")
            await MainActor.run {
                self.isRegistered = true
            }
        } catch let error as MeeshyError {
            switch error {
            case .auth:
                voipLogger.warn("VoIP token registration failed: authentication required")
            case .network:
                voipLogger.error("VoIP token registration failed: network error")
            default:
                voipLogger.error("VoIP token registration failed: \(error.localizedDescription)")
            }
        } catch {
            voipLogger.error("Error registering VoIP token: \(error.localizedDescription)")
        }
    }

    /// Unregister VoIP token from server (call on logout)
    /// Uses APIService.unregisterDeviceToken aligned with gateway API
    func unregisterToken() async {
        guard voipToken != nil else { return }

        voipLogger.info("Unregistering VoIP token from server...")

        do {
            try await APIService.shared.unregisterDeviceToken()
            voipLogger.info("VoIP token unregistered successfully")
        } catch {
            voipLogger.error("Error unregistering VoIP token: \(error)")
        }

        await MainActor.run {
            self.isRegistered = false
        }
    }

    /// Re-register token after user authentication
    func refreshRegistration() async {
        guard let token = voipToken else {
            voipLogger.info("No VoIP token to refresh")
            return
        }

        await registerTokenWithServer(token)
    }
}

// MARK: - PKPushRegistryDelegate

extension VoIPPushManager: PKPushRegistryDelegate {

    nonisolated func pushRegistry(
        _ registry: PKPushRegistry,
        didUpdate pushCredentials: PKPushCredentials,
        for type: PKPushType
    ) {
        guard type == .voIP else { return }

        let token = pushCredentials.token.map { String(format: "%02.2hhx", $0) }.joined()

        Task { @MainActor in
            self.voipToken = token
            voipLogger.info("VoIP push token received: \(token.prefix(20))...")

            // Register with server
            await self.registerTokenWithServer(token)
        }
    }

    nonisolated func pushRegistry(
        _ registry: PKPushRegistry,
        didInvalidatePushTokenFor type: PKPushType
    ) {
        guard type == .voIP else { return }

        Task { @MainActor in
            voipLogger.warn("VoIP push token invalidated")
            self.voipToken = nil
            self.isRegistered = false
        }
    }

    nonisolated func pushRegistry(
        _ registry: PKPushRegistry,
        didReceiveIncomingPushWith payload: PKPushPayload,
        for type: PKPushType,
        completion: @escaping () -> Void
    ) {
        guard type == .voIP else {
            completion()
            return
        }

        voipLogger.info("Received VoIP push notification")

        // CRITICAL: Must report incoming call to CallKit IMMEDIATELY
        // Failure to do so will cause iOS to terminate the app
        Task { @MainActor in
            await self.handleIncomingVoIPPush(payload.dictionaryPayload)
            completion()
        }
    }
}

// MARK: - VoIP Push Handling

extension VoIPPushManager {

    /// Handle incoming VoIP push payload
    /// Must report to CallKit immediately or iOS will terminate the app
    private func handleIncomingVoIPPush(_ payload: [AnyHashable: Any]) async {
        voipLogger.info("Processing VoIP push payload: \(payload)")

        // Extract call information from payload
        guard let callData = extractCallData(from: payload) else {
            voipLogger.error("Invalid VoIP push payload - missing required call data")

            // IMPORTANT: Still need to report a call to CallKit even if invalid
            // Otherwise iOS will terminate the app
            reportInvalidCall()
            return
        }

        // Report incoming call to CallKit
        let callUUID = UUID()

        callKitManager.reportIncomingCall(
            uuid: callUUID,
            handle: callData.callerName,
            hasVideo: callData.hasVideo
        ) { [weak self] error in
            if let error = error {
                voipLogger.error("Failed to report incoming call to CallKit: \(error)")
            } else {
                voipLogger.info("Incoming call reported to CallKit: \(callUUID)")

                // Notify CallService to handle the call
                Task { @MainActor in
                    await self?.notifyCallService(
                        callId: callData.callId,
                        conversationId: callData.conversationId,
                        callerId: callData.callerId,
                        callerName: callData.callerName,
                        callerAvatar: callData.callerAvatar,
                        hasVideo: callData.hasVideo,
                        callUUID: callUUID
                    )
                }
            }
        }
    }

    /// Extract call data from VoIP push payload
    private func extractCallData(from payload: [AnyHashable: Any]) -> VoIPCallData? {
        // Expected payload structure from backend:
        // {
        //   "callId": "uuid",
        //   "conversationId": "uuid",
        //   "caller": {
        //     "id": "uuid",
        //     "name": "John Doe",
        //     "avatar": "https://..."
        //   },
        //   "type": "video" | "audio"
        // }

        guard let callId = payload["callId"] as? String,
              let conversationId = payload["conversationId"] as? String else {
            voipLogger.error("Missing callId or conversationId in payload")
            return nil
        }

        // Extract caller info
        let callerInfo = payload["caller"] as? [String: Any]
        let callerId = callerInfo?["id"] as? String ?? payload["callerId"] as? String ?? ""
        let callerName = callerInfo?["name"] as? String ?? payload["callerName"] as? String ?? "Unknown Caller"
        let callerAvatar = callerInfo?["avatar"] as? String ?? payload["callerAvatar"] as? String

        // Call type
        let callType = payload["type"] as? String ?? "audio"
        let hasVideo = callType == "video"

        return VoIPCallData(
            callId: callId,
            conversationId: conversationId,
            callerId: callerId,
            callerName: callerName,
            callerAvatar: callerAvatar,
            hasVideo: hasVideo
        )
    }

    /// Report an invalid call to CallKit to prevent app termination
    /// Then immediately end it
    private func reportInvalidCall() {
        let uuid = UUID()

        callKitManager.reportIncomingCall(
            uuid: uuid,
            handle: "Unknown",
            hasVideo: false
        ) { error in
            // Immediately end the invalid call
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                CallKitManager.shared.endCall(uuid: uuid, completion: nil)
            }
        }
    }

    /// Notify CallService about incoming call
    private func notifyCallService(
        callId: String,
        conversationId: String,
        callerId: String,
        callerName: String,
        callerAvatar: String?,
        hasVideo: Bool,
        callUUID: UUID
    ) async {
        let userInfo: [AnyHashable: Any] = [
            "callId": callId,
            "conversationId": conversationId,
            "initiator": [
                "userId": callerId,
                "username": callerName,
                "avatar": callerAvatar ?? ""
            ],
            "type": hasVideo ? "video" : "audio",
            "callUUID": callUUID.uuidString
        ]

        // Post notification for CallService to handle
        NotificationCenter.default.post(
            name: .didReceiveCall,
            object: nil,
            userInfo: userInfo as? [String: Any]
        )

        // Also directly notify CallService
        await CallService.shared.handleIncomingCallNotification(userInfo)
    }
}

// MARK: - VoIP Call Data

private struct VoIPCallData {
    let callId: String
    let conversationId: String
    let callerId: String
    let callerName: String
    let callerAvatar: String?
    let hasVideo: Bool
}

// MARK: - Logger

private let voipLogger = PinoLogger(name: "VoIPPush")
