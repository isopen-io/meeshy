//
//  AppDelegate+Notifications.swift
//  Meeshy
//
//  Created by Claude on 2025-11-22.
//

import UIKit
import UserNotifications

#if canImport(FirebaseMessaging)
import FirebaseMessaging
#endif

// MARK: - Notification Handling

extension AppDelegate {
    func setupNotifications() {
        // Request notification authorization
        Task {
            do {
                try await NotificationManager.shared.requestAuthorization()
                await NotificationManager.shared.updateAuthorizationStatus()
            } catch {
                print("Failed to request notification authorization: \(error)")
            }
        }
    }

    // MARK: - Remote Notifications

    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        print("Successfully registered for remote notifications")

        #if canImport(FirebaseMessaging)
        // Set APNS token in Firebase Messaging (required for FCM on iOS)
        Messaging.messaging().apnsToken = deviceToken
        #endif

        // Set device token in NotificationManager
        NotificationManager.shared.setDeviceToken(deviceToken)

        // Also send APNS token to backend as fallback
        Task {
            await registerDeviceToken(deviceToken)
        }
    }

    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        print("Failed to register for remote notifications: \(error.localizedDescription)")
    }

    func application(
        _ application: UIApplication,
        didReceiveRemoteNotification userInfo: [AnyHashable: Any],
        fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void
    ) {
        print("Received remote notification: \(userInfo)")

        // Handle notification
        Task {
            await NotificationManager.shared.handleRemoteNotification(userInfo)
            completionHandler(.newData)
        }
    }

    // MARK: - Firebase Messaging

    func setupFirebaseMessaging() {
        // Get FCM token (delegate is already set in MeeshyApp)
        Task {
            if let token = await FirebaseConfiguration.getFCMToken() {
                logger.info("FCM token available: \(token.prefix(20))...")
            }
        }
    }

    // MARK: - Token Registration

    private func registerDeviceToken(_ deviceToken: Data) async {
        let tokenString = deviceToken.map { String(format: "%02.2hhx", $0) }.joined()

        do {
            guard let url = URL(string: "\(APIConfiguration.shared.currentBaseURL)/users/device-token") else {
                throw APIError.invalidURL
            }

            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")

            if let token = AuthenticationManager.shared.accessToken {
                request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            } else if let sessionToken = await MainActor.run(body: { AuthenticationManager.shared.sessionToken }) {
                request.setValue("\(sessionToken)", forHTTPHeaderField: "X-Session-Token")
            }

            // Body format expected by backend:
            // { apnsToken: string (for iOS native), platform: "ios" | "android" | "web" }
            let body: [String: Any] = [
                "apnsToken": tokenString,
                "platform": "ios"
            ]

            request.httpBody = try? JSONSerialization.data(withJSONObject: body)

            let (data, response) = try await URLSession.shared.data(for: request)

            if let httpResponse = response as? HTTPURLResponse {
                if httpResponse.statusCode == 200 || httpResponse.statusCode == 201 {
                    logger.info("✅ APNS device token registered successfully")

                    // Parse response for confirmation
                    if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                       let success = json["success"] as? Bool, success {
                        logger.info("Device token confirmed by server")
                    }
                } else if httpResponse.statusCode == 401 {
                    logger.warn("Device token registration failed: not authenticated")
                } else {
                    logger.error("Failed to register device token: HTTP \(httpResponse.statusCode)")
                }
            }
        } catch {
            logger.error("Error registering device token: \(error)")
        }
    }

    // Note: FCM token registration is now handled in MeeshyApp.swift via MessagingDelegate
}

// MARK: - Push Notification Categories Setup

extension AppDelegate {
    func setupPushNotificationCategories() {
        // This is handled by NotificationManager
        // NotificationManager.shared already sets up categories in init
    }
}

// MARK: - Background Notification Handling

extension AppDelegate {
    func handleBackgroundNotification(_ userInfo: [AnyHashable: Any]) {
        // Extract notification type
        guard let type = userInfo["type"] as? String else { return }

        switch type {
        case "message":
            handleBackgroundMessage(userInfo)
        case "call":
            handleBackgroundCall(userInfo)
        case "mention":
            handleBackgroundMention(userInfo)
        default:
            break
        }
    }

    private func handleBackgroundMessage(_ userInfo: [AnyHashable: Any]) {
        // Update badge count
        if let aps = userInfo["aps"] as? [String: Any],
           let badge = aps["badge"] as? Int {
            Task {
                await NotificationManager.shared.updateBadgeCount(badge)
            }
        }

        // Sync messages in background
        Task {
            await syncMessagesInBackground(userInfo)
        }
    }

    private func syncMessagesInBackground(_ userInfo: [AnyHashable: Any]) async {
        guard let conversationId = userInfo["conversationId"] as? String else {
            logger.warn("No conversation ID in background message")
            return
        }

        do {
            // Fetch latest messages for this conversation
            guard let url = URL(string: "\(APIConfiguration.shared.currentBaseURL)/conversations/\(conversationId)/messages?limit=20") else {
                return
            }

            var request = URLRequest(url: url)
            request.httpMethod = "GET"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")

            if let token = AuthenticationManager.shared.accessToken {
                request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            }

            let (data, response) = try await URLSession.shared.data(for: request)

            if let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 {
                let decoder = JSONDecoder()
                decoder.dateDecodingStrategy = .iso8601

                if let messagesResponse = try? decoder.decode(APIResponse<MessageListResponse>.self, from: data),
                   let messageList = messagesResponse.data {
                    // Cache messages for offline access using MessageStore (SQLite)
                    await MessageStore.shared.saveMessages(messageList.messages)
                    logger.info("Background sync: cached \(messageList.messages.count) messages")
                }
            }
        } catch {
            logger.error("Background message sync failed: \(error)")
        }
    }

    private func handleBackgroundCall(_ userInfo: [AnyHashable: Any]) {
        // Handle incoming call via CallKit
        guard let callId = userInfo["callId"] as? String,
              let userId = userInfo["userId"] as? String,
              let userName = userInfo["userName"] as? String else {
            return
        }

        let callType = userInfo["callType"] as? String ?? "audio"
        let hasVideo = callType == "video"

        let callUUID = UUID()

        CallKitManager.shared.reportIncomingCall(
            uuid: callUUID,
            handle: userName,
            hasVideo: hasVideo
        ) { error in
            if let error = error {
                print("Failed to report incoming call: \(error)")
            }
        }
    }

    private func handleBackgroundMention(_ userInfo: [AnyHashable: Any]) {
        // Handle mention notification
        Task {
            await processMention(userInfo)
        }
    }

    private func processMention(_ userInfo: [AnyHashable: Any]) async {
        guard let conversationId = userInfo["conversationId"] as? String,
              let messageId = userInfo["messageId"] as? String,
              let mentionedBy = userInfo["mentionedBy"] as? String else {
            logger.warn("Incomplete mention data")
            return
        }

        do {
            // Mark mention as received
            guard let url = URL(string: "\(APIConfiguration.shared.currentBaseURL)/mentions/\(messageId)/received") else {
                return
            }

            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")

            if let token = AuthenticationManager.shared.accessToken {
                request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            }

            let (_, response) = try await URLSession.shared.data(for: request)

            if let httpResponse = response as? HTTPURLResponse {
                if httpResponse.statusCode == 200 || httpResponse.statusCode == 201 {
                    logger.info("Mention marked as received: \(messageId)")
                } else if httpResponse.statusCode == 404 {
                    logger.warn("Mention endpoint not implemented")
                }
            }
        } catch {
            logger.error("Failed to process mention: \(error)")
        }
    }
}

// MARK: - VoIP Push Notifications (PushKit)

extension AppDelegate {
    /// Initialize VoIP push notifications for reliable incoming call delivery
    /// Call this early in the app lifecycle (after Firebase initialization)
    func setupVoIPPush() {
        Task { @MainActor in
            VoIPPushManager.shared.setup()
        }
    }

    /// Refresh VoIP token registration after user authentication
    func refreshVoIPRegistration() {
        Task { @MainActor in
            await VoIPPushManager.shared.refreshRegistration()
        }
    }

    /// Unregister VoIP token on logout
    func unregisterVoIPToken() {
        Task { @MainActor in
            await VoIPPushManager.shared.unregisterToken()
        }
    }
}
