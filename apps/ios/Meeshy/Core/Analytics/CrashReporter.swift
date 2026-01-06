//
//  CrashReporter.swift
//  Meeshy
//
//  Created on 2025-11-22.
//  Crashlytics Integration for Crash Reporting and Non-Fatal Errors
//

import Foundation
// TODO: Install Firebase via CocoaPods or SPM to enable crashlytics
// import FirebaseCrashlytics
import UIKit

// MARK: - Firebase Crashlytics Stubs (Remove when Firebase is properly installed)
#if !canImport(FirebaseCrashlytics)
class Crashlytics {
    static func crashlytics() -> Crashlytics { return Crashlytics() }

    func log(_ message: String) {}
    func setUserID(_ userID: String) {}
    func setCustomValue(_ value: Any, forKey key: String) {}
    func record(error: Error) {}
}
#endif

// MARK: - Exception and Frame Models for Crashlytics compatibility

struct ExceptionModel {
    let name: String
    let reason: String?

    init(name: String, reason: String? = nil) {
        self.name = name
        self.reason = reason
    }
}

struct FrameModel {
    let symbol: String
    let file: String?
    let line: Int?

    init(symbol: String, file: String? = nil, line: Int? = nil) {
        self.symbol = symbol
        self.file = file
        self.line = line
    }
}

// MARK: - Crash Reporter

@MainActor
final class CrashReporter {

    // MARK: - Singleton

    static let shared = CrashReporter()

    // MARK: - Properties

    private let crashlytics = Crashlytics.crashlytics()
    private var isEnabled: Bool = true

    private var crashlyticsCollectionEnabled: Bool {
        get { UserDefaults.standard.bool(forKey: "crashlytics_enabled") }
        set { UserDefaults.standard.set(newValue, forKey: "crashlytics_enabled") }
    }

    // MARK: - Initialization

    private init() {
        setupCrashlytics()
    }

    // MARK: - Setup

    private func setupCrashlytics() {
        #if DEBUG
        // crashlytics.setCrashlyticsCollectionEnabled(false)
        print("[Crashlytics] Disabled in Debug mode")
        #else
        // crashlytics.setCrashlyticsCollectionEnabled(crashlyticsCollectionEnabled)
        print("[Crashlytics] Enabled: \(crashlyticsCollectionEnabled)")
        #endif
    }

    // MARK: - Privacy Controls

    func enableCrashReporting() {
        crashlyticsCollectionEnabled = true
        // crashlytics.setCrashlyticsCollectionEnabled(true)
        isEnabled = true
        // Note: Don't use crashReporterLogger here to avoid circular dependency
        print("[CrashReporter] Crash reporting enabled")
    }

    func disableCrashReporting() {
        crashlyticsCollectionEnabled = false
        // crashlytics.setCrashlyticsCollectionEnabled(false)
        isEnabled = false
        print("[CrashReporter] Crash reporting disabled")
    }

    func deleteUnsentReports() {
        // crashlytics.deleteUnsentReports()
        print("[CrashReporter] Unsent crash reports deleted")
    }

    // MARK: - User Identification

    func setUserID(_ userID: String) {
        guard isEnabled else { return }
        crashlytics.setUserID(userID)
        #if DEBUG
        print("[CrashReporter] Crashlytics user ID set: \(userID)")
        #endif
    }

    func clearUserID() {
        guard isEnabled else { return }
        crashlytics.setUserID("")
        #if DEBUG
        print("[CrashReporter] Crashlytics user ID cleared")
        #endif
    }

    // MARK: - Custom Keys

    func setCustomValue(_ value: String, forKey key: String) {
        guard isEnabled else { return }
        crashlytics.setCustomValue(value, forKey: key)
    }

    func setCustomValue(_ value: Int, forKey key: String) {
        guard isEnabled else { return }
        crashlytics.setCustomValue(value, forKey: key)
    }

    func setCustomValue(_ value: Bool, forKey key: String) {
        guard isEnabled else { return }
        crashlytics.setCustomValue(value, forKey: key)
    }

    func setCustomValue(_ value: Double, forKey key: String) {
        guard isEnabled else { return }
        crashlytics.setCustomValue(value, forKey: key)
    }

    // MARK: - Context Keys

    func setUserContext(
        userID: String?,
        email: String? = nil,
        username: String? = nil,
        isPremium: Bool = false
    ) {
        guard isEnabled else { return }

        if let userID = userID {
            setUserID(userID)
            setCustomValue(userID, forKey: "user_id")
        }

        if let email = email {
            setCustomValue(email, forKey: "email")
        }

        if let username = username {
            setCustomValue(username, forKey: "username")
        }

        setCustomValue(isPremium, forKey: "is_premium")
        setCustomValue(Date().timeIntervalSince1970, forKey: "last_active")

        #if DEBUG
        print("[CrashReporter] Crashlytics user context updated")
        #endif
    }

    func setDeviceContext() {
        guard isEnabled else { return }

        setCustomValue(UIDevice.current.systemVersion, forKey: "ios_version")
        setCustomValue(UIDevice.current.model, forKey: "device_model")
        setCustomValue(UIDevice.current.name, forKey: "device_name")

        if let appVersion = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String {
            setCustomValue(appVersion, forKey: "app_version")
        }

        if let buildNumber = Bundle.main.infoDictionary?["CFBundleVersion"] as? String {
            setCustomValue(buildNumber, forKey: "build_number")
        }

        setCustomValue(Locale.current.identifier, forKey: "locale")
        setCustomValue(TimeZone.current.identifier, forKey: "timezone")

        #if DEBUG
        print("[CrashReporter] Crashlytics device context updated")
        #endif
    }

    func setNetworkContext(networkType: String, isConnected: Bool) {
        guard isEnabled else { return }

        setCustomValue(networkType, forKey: "network_type")
        setCustomValue(isConnected, forKey: "network_connected")
    }

    func setAppContext(
        isLoggedIn: Bool,
        activeConversations: Int = 0,
        unreadMessages: Int = 0
    ) {
        guard isEnabled else { return }

        setCustomValue(isLoggedIn, forKey: "is_logged_in")
        setCustomValue(activeConversations, forKey: "active_conversations")
        setCustomValue(unreadMessages, forKey: "unread_messages")
    }

    // MARK: - Error Recording

    func recordError(_ error: Error, additionalInfo: [String: Any]? = nil) {
        guard isEnabled else { return }

        // Set additional context
        if let info = additionalInfo {
            for (key, value) in info {
                if let stringValue = value as? String {
                    setCustomValue(stringValue, forKey: key)
                } else if let intValue = value as? Int {
                    setCustomValue(intValue, forKey: key)
                } else if let boolValue = value as? Bool {
                    setCustomValue(boolValue, forKey: key)
                } else if let doubleValue = value as? Double {
                    setCustomValue(doubleValue, forKey: key)
                }
            }
        }

        // Record error
        crashlytics.record(error: error)

        #if DEBUG
        print("[CrashReporter] Crashlytics error recorded: \(error.localizedDescription)")
        #endif
    }

    func recordError(
        domain: String,
        code: Int,
        message: String,
        additionalInfo: [String: Any]? = nil
    ) {
        let error = NSError(
            domain: domain,
            code: code,
            userInfo: [NSLocalizedDescriptionKey: message]
        )

        recordError(error, additionalInfo: additionalInfo)
    }

    // MARK: - Non-Fatal Exceptions

    func recordNonFatalException(
        name: String,
        reason: String,
        stackTrace: [String]? = nil
    ) {
        guard isEnabled else { return }

        // Create error and record it
        let error = NSError(
            domain: "com.meeshy.exception",
            code: 0,
            userInfo: [
                NSLocalizedDescriptionKey: "\(name): \(reason)",
                "exception_name": name,
                "exception_reason": reason
            ]
        )

        crashlytics.record(error: error)

        #if DEBUG
        print("[CrashReporter] Non-fatal exception: \(name) - \(reason)")
        #endif
    }

    // MARK: - Custom Logs

    func log(_ message: String) {
        guard isEnabled else { return }
        crashlytics.log(message)
    }

    func log(format: String, arguments: CVarArg...) {
        guard isEnabled else { return }
        let message = String(format: format, arguments: arguments)
        crashlytics.log(message)
    }

    // MARK: - Specific Error Types

    // Authentication Errors
    func recordAuthenticationError(
        type: String,
        method: String,
        error: Error
    ) {
        recordError(error, additionalInfo: [
            "error_type": "authentication",
            "auth_type": type,
            "auth_method": method
        ])
    }

    // Network Errors
    func recordNetworkError(
        endpoint: String,
        statusCode: Int?,
        error: Error
    ) {
        var info: [String: Any] = [
            "error_type": "network",
            "endpoint": endpoint
        ]

        if let statusCode = statusCode {
            info["status_code"] = statusCode
        }

        recordError(error, additionalInfo: info)
    }

    // API Errors
    func recordAPIError(
        endpoint: String,
        method: String,
        statusCode: Int,
        responseBody: String? = nil
    ) {
        var info: [String: Any] = [
            "error_type": "api",
            "endpoint": endpoint,
            "method": method,
            "status_code": statusCode
        ]

        if let responseBody = responseBody {
            info["response_body"] = responseBody
        }

        recordError(
            domain: "com.meeshy.api",
            code: statusCode,
            message: "API Error: \(method) \(endpoint)",
            additionalInfo: info
        )
    }

    // Database Errors
    func recordDatabaseError(
        operation: String,
        error: Error
    ) {
        recordError(error, additionalInfo: [
            "error_type": "database",
            "operation": operation
        ])
    }

    // Media Errors
    func recordMediaError(
        type: String,
        operation: String,
        error: Error
    ) {
        recordError(error, additionalInfo: [
            "error_type": "media",
            "media_type": type,
            "operation": operation
        ])
    }

    // Sync Errors
    func recordSyncError(
        type: String,
        error: Error
    ) {
        recordError(error, additionalInfo: [
            "error_type": "sync",
            "sync_type": type
        ])
    }

    // Socket Errors
    func recordSocketError(
        event: String,
        error: Error
    ) {
        recordError(error, additionalInfo: [
            "error_type": "socket",
            "socket_event": event
        ])
    }

    // Permission Errors
    func recordPermissionError(permission: String) {
        recordError(
            domain: "com.meeshy.permissions",
            code: 403,
            message: "Permission denied: \(permission)",
            additionalInfo: [
                "error_type": "permission",
                "permission": permission
            ]
        )
    }

    // MARK: - Breadcrumbs

    func leaveBreadcrumb(
        message: String,
        category: String = "general",
        level: BreadcrumbLevel = .info
    ) {
        guard isEnabled else { return }

        let breadcrumb = "[\(category.uppercased())] [\(level.rawValue.uppercased())] \(message)"
        crashlytics.log(breadcrumb)
    }

    func leaveNavigationBreadcrumb(from: String, to: String) {
        leaveBreadcrumb(
            message: "Navigation: \(from) -> \(to)",
            category: "navigation",
            level: .info
        )
    }

    func leaveAPIBreadcrumb(endpoint: String, method: String, statusCode: Int?) {
        var message = "API: \(method) \(endpoint)"
        if let statusCode = statusCode {
            message += " [\(statusCode)]"
        }
        leaveBreadcrumb(
            message: message,
            category: "api",
            level: statusCode == nil || statusCode! >= 400 ? .error : .info
        )
    }

    func leaveUserActionBreadcrumb(action: String, details: String? = nil) {
        var message = "User Action: \(action)"
        if let details = details {
            message += " - \(details)"
        }
        leaveBreadcrumb(
            message: message,
            category: "user_action",
            level: .info
        )
    }

    // MARK: - Crash Test (Debug Only)

    #if DEBUG
    func testCrash() {
        fatalError("Test crash triggered")
    }

    func testNonFatalException() {
        recordNonFatalException(
            name: "TestException",
            reason: "This is a test non-fatal exception",
            stackTrace: Thread.callStackSymbols
        )
    }
    #endif

    // MARK: - Analytics Integration

    func recordAnalyticsError(eventName: String, error: String) {
        recordError(
            domain: "com.meeshy.analytics",
            code: 0,
            message: "Analytics Error: \(eventName)",
            additionalInfo: [
                "error_type": "analytics",
                "event_name": eventName,
                "error": error
            ]
        )
    }

    // MARK: - Performance Integration

    func recordPerformanceIssue(
        operation: String,
        duration: TimeInterval,
        threshold: TimeInterval
    ) {
        recordError(
            domain: "com.meeshy.performance",
            code: 0,
            message: "Performance Issue: \(operation)",
            additionalInfo: [
                "error_type": "performance",
                "operation": operation,
                "duration": duration,
                "threshold": threshold,
                "exceeded_by": duration - threshold
            ]
        )
    }
}

// MARK: - Breadcrumb Level

enum BreadcrumbLevel: String {
    case debug
    case info
    case warning
    case error
    case critical
}

