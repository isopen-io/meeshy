//
//  LoggerGlobal.swift
//  Meeshy
//
//  Global logger instances for convenient access
//

import Foundation

// MARK: - Global Logger Instances

/// Main app logger
public let logger = PinoLogger.shared

/// API logger
public let apiLogger = PinoLogger.shared.child(name: "API")

/// WebSocket logger
public let wsLogger = PinoLogger.shared.child(name: "WebSocket")

/// Auth logger
public let authLogger = PinoLogger.shared.child(name: "Auth")

/// User logger
public let userLogger = PinoLogger.shared.child(name: "User")

/// Profile logger
public let profileLogger = PinoLogger.shared.child(name: "Profile")

/// Settings logger
public let settingLogger = PinoLogger.shared.child(name: "Settings")

/// Chat logger
public let chatLogger = PinoLogger.shared.child(name: "Chat")

/// Call logger
public let callLogger = PinoLogger.shared.child(name: "Calls")

/// Media logger
public let mediaLogger = PinoLogger.shared.child(name: "Media")

/// Sync logger
public let syncLogger = PinoLogger.shared.child(name: "Sync")

/// Analytics logger
public let analyticsLogger = PinoLogger.shared.child(name: "Analytics")

/// Crash Reporter logger
public let crashReporterLogger = PinoLogger.shared.child(name: "CrashReporter")

/// Performance Monitor  logger
public let performanceMonitorLogger = PinoLogger.shared.child(name: "PerformanceMonitor")

/// Firebase Config  logger
public let firebaseConfigLogger = PinoLogger.shared.child(name: "FirebaseConfig")

/// Conversation logger - for conversation operations
public let conversationLogger = PinoLogger.shared.child(name: "Conversation")

/// Message logger - for message operations
public let messageLogger = PinoLogger.shared.child(name: "Message")

/// Notification logger - for notification operations
public let notificationLogger = PinoLogger.shared.child(name: "Notification")

/// Network logger - for network operations
public let networkLogger = PinoLogger.shared.child(name: "Network")

/// Cache logger - for cache operations
public let cacheLogger = PinoLogger.shared.child(name: "Cache")

/// Persistence logger - for database/persistence operations
public let persistenceLogger = PinoLogger.shared.child(name: "Persistence")

/// Security logger - for security operations (keychain, encryption)
public let securityLogger = PinoLogger.shared.child(name: "Security")

/// Navigation logger - for navigation operations
public let navigationLogger = PinoLogger.shared.child(name: "Navigation")

/// ViewModel logger - for general ViewModel operations
public let viewModelLogger = PinoLogger.shared.child(name: "ViewModel")

/// Attachment logger - for attachment operations
public let attachmentLogger = PinoLogger.shared.child(name: "Attachment")

/// Sentiment logger - for sentiment analysis operations
public let sentimentLogger = PinoLogger.shared.child(name: "Sentiment")

/// Language logger - for language detection operations
public let languageLogger = PinoLogger.shared.child(name: "Language")

// MARK: - Logger Configuration

public func configurePinoLogger(environment: AppEnvironment) {
    var config = PinoLogger.Configuration()

    switch environment {
    case .development:
        config.minimumLevel = .trace
        config.prettyPrint = true
        config.enableFileLogging = true
        config.enableOSLog = true
        config.enableCrashlytics = false

    case .staging:
        config.minimumLevel = .debug
        config.prettyPrint = false
        config.enableFileLogging = true
        config.enableOSLog = true
        config.enableCrashlytics = true

    case .production:
        config.minimumLevel = .warn
        config.prettyPrint = false
        config.enableFileLogging = false // Disabled for security
        config.enableOSLog = false // Use Crashlytics instead
        config.enableCrashlytics = true
    }

    PinoLogger.configure(config)

    logger.info("📱 Pino logger configured", [
        "environment": environment.rawValue,
        "minimumLevel": config.minimumLevel.name,
        "prettyPrint": config.prettyPrint
    ])
}

// MARK: - App Environment

public enum AppEnvironment: String {
    case development = "Development"
    case staging = "Staging"
    case production = "Production"

    static var current: AppEnvironment {
        #if DEBUG
        return .development
        #elseif STAGING
        return .staging
        #else
        return .production
        #endif
    }
}
