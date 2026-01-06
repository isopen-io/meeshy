//
//  FirebaseConfiguration.swift
//  Meeshy
//
//  Firebase initialization and configuration for push notifications
//  Swift 6 compliant with Sendable conformance
//

import Foundation
import os.log

#if canImport(FirebaseCore)
import FirebaseCore
#endif

#if canImport(FirebaseMessaging)
import FirebaseMessaging
#endif

#if canImport(FirebaseAnalytics)
import FirebaseAnalytics
#endif

#if canImport(FirebaseCrashlytics)
import FirebaseCrashlytics
#endif

#if canImport(FirebasePerformance)
import FirebasePerformance
#endif

/// Firebase configuration and initialization
final class FirebaseConfiguration: @unchecked Sendable {

    // MARK: - Singleton

    static let shared = FirebaseConfiguration()

    private let lock = NSLock()
    private var _isConfigured: Bool = false

    private(set) var isConfigured: Bool {
        get {
            lock.lock()
            defer { lock.unlock() }
            return _isConfigured
        }
        set {
            lock.lock()
            defer { lock.unlock() }
            _isConfigured = newValue
        }
    }

    // MARK: - Initialization

    private init() {}

    // MARK: - Configuration

    /// Configure Firebase services
    static func configure() {
        guard !shared.isConfigured else {
            firebaseConfigLogger.info("Firebase already configured")
            return
        }

        #if canImport(FirebaseCore)
        // Configure Firebase with GoogleService-Info.plist
        FirebaseApp.configure()
        shared.isConfigured = true

        // Configure individual services
        configureMessaging()
        configureAnalytics()
        configureCrashlytics()
        configurePerformance()

        firebaseConfigLogger.info("Firebase configured successfully")
        #else
        firebaseConfigLogger.info("Firebase SDK not available - skipping configuration")
        #endif
    }

    // MARK: - Analytics Configuration

    private static func configureAnalytics() {
        #if canImport(FirebaseAnalytics)
        // Analytics is auto-configured, just log
        firebaseConfigLogger.debug("Firebase Analytics enabled")
        #endif
    }

    // MARK: - Crashlytics Configuration

    private static func configureCrashlytics() {
        #if canImport(FirebaseCrashlytics)
        // Crashlytics is auto-configured
        firebaseConfigLogger.debug("Firebase Crashlytics enabled")
        #else
        firebaseConfigLogger.debug("Firebase Crashlytics not available")
        #endif
    }

    // MARK: - Messaging Configuration

    private static func configureMessaging() {
        #if canImport(FirebaseMessaging)
        // Enable auto-initialization of FCM token
        Messaging.messaging().isAutoInitEnabled = true
        firebaseConfigLogger.info("Firebase Messaging enabled with auto-init")
        #endif
    }

    // MARK: - Performance Monitoring Configuration

    private static func configurePerformance() {
        #if canImport(FirebasePerformance)
        firebaseConfigLogger.debug("Firebase Performance enabled")
        #else
        firebaseConfigLogger.debug("Firebase Performance not available")
        #endif
    }

    // MARK: - User Management

    /// Set user identifier for analytics and crash reporting
    static func setUserIdentifier(_ userId: String) {
        #if canImport(FirebaseAnalytics)
        Analytics.setUserID(userId)
        #endif

        #if canImport(FirebaseCrashlytics)
        Crashlytics.crashlytics().setUserID(userId)
        #endif

        firebaseConfigLogger.info("Firebase user identifier set: \(userId.prefix(8))...")
    }

    /// Set user properties for analytics
    static func setUserProperties(_ properties: [String: String]) {
        #if canImport(FirebaseAnalytics)
        for (key, value) in properties {
            Analytics.setUserProperty(value, forName: key)
        }
        firebaseConfigLogger.debug("Firebase user properties set - count: \(properties.count)")
        #endif
    }

    /// Clear user data (on logout)
    static func clearUserData() {
        #if canImport(FirebaseAnalytics)
        Analytics.setUserID(nil)
        #endif

        #if canImport(FirebaseCrashlytics)
        Crashlytics.crashlytics().setUserID("")
        #endif

        firebaseConfigLogger.info("Firebase user data cleared")
    }

    // MARK: - Logging Events

    /// Log analytics event
    static func logEvent(_ name: String, parameters: [String: Any]? = nil) {
        #if canImport(FirebaseAnalytics)
        Analytics.logEvent(name, parameters: parameters)
        firebaseConfigLogger.debug("Event logged: \(name)")
        #endif
    }

    /// Log screen view
    static func logScreenView(_ screenName: String, screenClass: String? = nil) {
        #if canImport(FirebaseAnalytics)
        Analytics.logEvent(AnalyticsEventScreenView, parameters: [
            AnalyticsParameterScreenName: screenName,
            AnalyticsParameterScreenClass: screenClass ?? screenName
        ])
        firebaseConfigLogger.debug("Screen view logged: \(screenName)")
        #endif
    }

    // MARK: - Crash Reporting

    /// Record custom error
    static func recordError(_ error: Error, userInfo: [String: Any]? = nil) {
        #if canImport(FirebaseCrashlytics)
        Crashlytics.crashlytics().record(error: error)
        #endif
        firebaseConfigLogger.error("Error recorded: \(error.localizedDescription)")
    }

    /// Record custom exception
    static func recordException(_ name: String, reason: String? = nil) {
        #if canImport(FirebaseCrashlytics)
        let exception = ExceptionModel(name: name, reason: reason ?? "Unknown")
        Crashlytics.crashlytics().record(exceptionModel: exception)
        #endif
        firebaseConfigLogger.error("Exception recorded: \(name) - \(reason ?? "no reason")")
    }

    /// Add custom log message to crash reports
    static func log(_ message: String) {
        #if canImport(FirebaseCrashlytics)
        Crashlytics.crashlytics().log(message)
        #endif
        firebaseConfigLogger.debug("Crashlytics log: \(message)")
    }

    // MARK: - FCM Token Management

    /// Get current FCM token
    static func getFCMToken() async -> String? {
        #if canImport(FirebaseMessaging)
        do {
            let token = try await Messaging.messaging().token()
            firebaseConfigLogger.info("FCM token retrieved: \(token.prefix(20))...")
            return token
        } catch {
            firebaseConfigLogger.error("Failed to get FCM token: \(error.localizedDescription)")
            return nil
        }
        #else
        return nil
        #endif
    }

    /// Delete FCM token (for logout)
    static func deleteFCMToken() async {
        #if canImport(FirebaseMessaging)
        do {
            try await Messaging.messaging().deleteToken()
            firebaseConfigLogger.info("FCM token deleted")
        } catch {
            firebaseConfigLogger.error("Failed to delete FCM token: \(error.localizedDescription)")
        }
        #endif
    }

    /// Subscribe to topic
    static func subscribeToTopic(_ topic: String) async {
        #if canImport(FirebaseMessaging)
        do {
            try await Messaging.messaging().subscribe(toTopic: topic)
            firebaseConfigLogger.info("Subscribed to topic: \(topic)")
        } catch {
            firebaseConfigLogger.error("Failed to subscribe to topic \(topic): \(error.localizedDescription)")
        }
        #endif
    }

    /// Unsubscribe from topic
    static func unsubscribeFromTopic(_ topic: String) async {
        #if canImport(FirebaseMessaging)
        do {
            try await Messaging.messaging().unsubscribe(fromTopic: topic)
            firebaseConfigLogger.info("Unsubscribed from topic: \(topic)")
        } catch {
            firebaseConfigLogger.error("Failed to unsubscribe from topic \(topic): \(error.localizedDescription)")
        }
        #endif
    }
}

// MARK: - Helper Extensions

extension FirebaseConfiguration {

    /// Get Firebase project information
    static var projectInfo: [String: String] {
        #if canImport(FirebaseCore)
        guard let app = FirebaseApp.app() else {
            return [
                "projectId": "not_configured",
                "bundleId": Bundle.main.bundleIdentifier ?? "unknown"
            ]
        }

        return [
            "projectId": app.options.projectID ?? "unknown",
            "bundleId": Bundle.main.bundleIdentifier ?? "unknown",
            "gcmSenderId": app.options.gcmSenderID ?? "unknown",
            "googleAppId": app.options.googleAppID ?? "unknown"
        ]
        #else
        return [
            "projectId": "not_available",
            "bundleId": Bundle.main.bundleIdentifier ?? "unknown"
        ]
        #endif
    }

    /// Check if Firebase is properly configured
    static var isValid: Bool {
        #if canImport(FirebaseCore)
        return shared.isConfigured && FirebaseApp.app() != nil
        #else
        return false
        #endif
    }
}
