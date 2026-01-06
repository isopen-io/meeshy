//
//  AnalyticsManager.swift
//  Meeshy
//
//  Created on 2025-11-22.
//  Central Analytics Manager for Firebase Analytics Integration
//

import Foundation
import os.log
// TODO: Install Firebase via CocoaPods or SPM to enable analytics
// import FirebaseAnalytics


// MARK: - Firebase Analytics Stubs (Remove when Firebase is properly installed)
#if !canImport(FirebaseAnalytics)
enum Analytics {
    static func logEvent(_ name: String, parameters: [String: Any]?) {}
    static func setUserProperty(_ value: String?, forName name: String) {}
    static func setUserID(_ userID: String?) {}
    static func setAnalyticsCollectionEnabled(_ enabled: Bool) {}
    static func setSessionTimeoutInterval(_ interval: TimeInterval) {}
    static func resetAnalyticsData() {}
}

let AnalyticsEventScreenView = "screen_view"
let AnalyticsParameterScreenName = "screen_name"
let AnalyticsParameterScreenClass = "screen_class"
#endif

// MARK: - Analytics Manager

@MainActor
final class AnalyticsManager {

    // MARK: - Singleton

    static let shared = AnalyticsManager()

    // MARK: - Properties

    private var isEnabled: Bool = true
    private var sessionStartTime: Date?


    // Privacy settings
    private var analyticsCollectionEnabled: Bool {
        get { UserDefaults.standard.bool(forKey: "analytics_enabled") }
        set { UserDefaults.standard.set(newValue, forKey: "analytics_enabled") }
    }

    // MARK: - Initialization

    private init() {
        setupAnalytics()
        startSession()
    }

    // MARK: - Setup

    private func setupAnalytics() {
        #if DEBUG
        Analytics.setAnalyticsCollectionEnabled(false)
        print("[Analytics] Disabled in Debug mode")
        #else
        Analytics.setAnalyticsCollectionEnabled(analyticsCollectionEnabled)
        print("[Analytics] Enabled: \(analyticsCollectionEnabled)")
        #endif

        // Set default session timeout (30 minutes)
        Analytics.setSessionTimeoutInterval(1800)
    }

    // MARK: - Privacy Controls

    func enableAnalytics() {
        analyticsCollectionEnabled = true
        Analytics.setAnalyticsCollectionEnabled(true)
        isEnabled = true
        analyticsLogger.info("Analytics enabled")
    }

    func disableAnalytics() {
        analyticsCollectionEnabled = false
        Analytics.setAnalyticsCollectionEnabled(false)
        isEnabled = false
        analyticsLogger.info("Analytics disabled")
    }

    func resetAnalyticsData() {
        Analytics.resetAnalyticsData()
        analyticsLogger.info("Analytics data reset")
    }

    // MARK: - Session Management

    private func startSession() {
        sessionStartTime = Date()
        // TODO: Fix SessionEvent reference
        // track(SessionEvent.sessionStarted)
    }

    func endSession() {
        guard let startTime = sessionStartTime else { return }
        // let duration = Date().timeIntervalSince(startTime)
        // TODO: Fix SessionEvent reference
        // let event = SessionEvent.sessionEnded(duration: duration)
        // track(event)
        sessionStartTime = nil
    }

    // MARK: - Event Tracking

    func track(_ event: AnalyticsEvent) {
        guard isEnabled else { return }

        var parameters = event.parameters

        // Add standard metadata
        parameters["event_category"] = event.category.rawValue
        parameters["timestamp"] = ISO8601DateFormatter().string(from: Date())
        parameters["platform"] = "ios"

        // Log event
        Analytics.logEvent(event.eventName, parameters: parameters)

        #if DEBUG
        self.logEventToConsole(event: event, parameters: parameters)
        #endif

        analyticsLogger.debug("Analytics event tracked: \(event.eventName)")
    }

    // MARK: - Convenience Tracking Methods

    // Authentication
    func trackLogin(method: AuthMethod, duration: TimeInterval? = nil) {
        if let duration = duration {
            track(AuthenticationEvent.loginSuccess(method: method, duration: duration))
        } else {
            track(AuthenticationEvent.loginStarted(method: method))
        }
    }

    func trackLoginFailure(method: AuthMethod, error: String) {
        track(AuthenticationEvent.loginFailed(method: method, error: error))
    }

    func trackRegister(method: AuthMethod, success: Bool = true) {
        if success {
            track(AuthenticationEvent.registerSuccess(method: method))
        } else {
            track(AuthenticationEvent.registerStarted(method: method))
        }
    }

    func trackLogout() {
        track(AuthenticationEvent.logoutCompleted)
    }

    // Messaging
    func trackMessageSent(type: MessageType, length: Int, hasMedia: Bool = false) {
        track(MessagingEvent.messageSent(type: type, length: length, hasMedia: hasMedia))
    }

    func trackMessageReceived(type: MessageType, hasMedia: Bool = false) {
        track(MessagingEvent.messageReceived(type: type, hasMedia: hasMedia))
    }

    func trackMessageEdited(type: MessageType) {
        track(MessagingEvent.messageEdited(type: type))
    }

    func trackMessageDeleted(type: MessageType, deleteForEveryone: Bool) {
        track(MessagingEvent.messageDeleted(type: type, deleteForEveryone: deleteForEveryone))
    }

    func trackMessageReaction(emoji: String) {
        track(MessagingEvent.messageReacted(emoji: emoji))
    }

    func trackMessageTranslation(from: String, to: String) {
        track(MessagingEvent.messageTranslated(from: from, to: to))
    }

    // Conversations
    func trackConversationCreated(type: ConversationType, participantCount: Int) {
        track(ConversationEvent.conversationCreated(type: type, participantCount: participantCount))
    }

    func trackConversationOpened(type: ConversationType) {
        track(ConversationEvent.conversationOpened(type: type))
    }

    func trackConversationDeleted(type: ConversationType) {
        track(ConversationEvent.conversationDeleted(type: type))
    }

    func trackConversationMuted(duration: MuteDuration) {
        track(ConversationEvent.conversationMuted(duration: duration))
    }

    func trackConversationPinned() {
        track(ConversationEvent.conversationPinned)
    }

    // Calls
    func trackCallInitiated(type: CallType, participantCount: Int = 2) {
        track(CallEvent.callInitiated(type: type, participantCount: participantCount))
    }

    func trackCallAnswered(type: CallType) {
        track(CallEvent.callAnswered(type: type))
    }

    func trackCallDeclined(type: CallType, reason: String? = nil) {
        track(CallEvent.callDeclined(type: type, reason: reason))
    }

    func trackCallEnded(type: CallType, duration: TimeInterval, endReason: CallEndReason) {
        track(CallEvent.callEnded(type: type, duration: duration, endReason: endReason))
    }

    func trackCallMissed(type: CallType) {
        track(CallEvent.callMissed(type: type))
    }

    func trackVideoToggled(enabled: Bool) {
        track(CallEvent.videoToggled(enabled: enabled))
    }

    func trackMicrophoneToggled(enabled: Bool) {
        track(CallEvent.microphoneToggled(enabled: enabled))
    }

    // Media
    func trackPhotoSent(size: Int64) {
        track(MediaEvent.photoSent(size: size))
    }

    func trackVideoSent(size: Int64, duration: TimeInterval) {
        track(MediaEvent.videoSent(size: size, duration: duration))
    }

    func trackDocumentSent(size: Int64, type: String) {
        track(MediaEvent.documentSent(size: size, type: type))
    }

    func trackLocationShared() {
        track(MediaEvent.locationShared)
    }

    public func trackMediaViewed(type: MessageType) {
        switch type {
        case .image:
            track(MediaEvent.photoViewed)
        case .video:
            track(MediaEvent.videoViewed)
        case .document:
            track(MediaEvent.documentViewed(type: "document"))
        default:
            break
        }
    }

    // Settings
    func trackSettingsOpened() {
        track(SettingsEvent.settingsOpened)
    }

    func trackLanguageChanged(from: String, to: String) {
        track(SettingsEvent.languageChanged(from: from, to: to))
    }

    func trackThemeChanged(theme: String) {
        track(SettingsEvent.themeChanged(theme: theme))
    }

    func trackNotificationsToggled(enabled: Bool) {
        if enabled {
            track(SettingsEvent.notificationsEnabled)
        } else {
            track(SettingsEvent.notificationsDisabled)
        }
    }

    func trackProfileUpdated(field: String) {
        track(SettingsEvent.profileUpdated(field: field))
    }

    func trackStorageCleared(size: Int64) {
        track(SettingsEvent.storageCleared(size: size))
    }

    // Errors
    func trackAPIError(endpoint: String, statusCode: Int, error: String) {
        track(ErrorEvent.apiError(endpoint: endpoint, statusCode: statusCode, error: error))
    }

    func trackNetworkError(error: String, context: String) {
        track(ErrorEvent.networkError(error: error, context: context))
    }

    func trackSyncError(type: String, error: String) {
        track(ErrorEvent.syncError(type: type, error: error))
    }

    func trackMediaUploadError(mediaType: String, error: String) {
        track(ErrorEvent.mediaUploadError(mediaType: mediaType, error: error))
    }

    func trackDatabaseError(error: String) {
        track(ErrorEvent.databaseError(error: error))
    }

    func trackPermissionDenied(permission: String) {
        track(ErrorEvent.permissionDenied(permission: permission))
    }

    // Performance
    func trackAppLaunched(coldStart: Bool, duration: TimeInterval) {
        track(PerformanceEvent.appLaunched(coldStart: coldStart, duration: duration))
    }

    func trackScreenLoaded(screen: String, duration: TimeInterval) {
        track(PerformanceEvent.screenLoaded(screen: screen, duration: duration))
    }

    func trackAPICall(endpoint: String, duration: TimeInterval, success: Bool) {
        track(PerformanceEvent.apiCallCompleted(endpoint: endpoint, duration: duration, success: success))
    }

    func trackMemoryWarning(level: String) {
        track(PerformanceEvent.memoryWarning(level: level))
    }

    func trackLowBattery(percentage: Int) {
        track(PerformanceEvent.lowBattery(percentage: percentage))
    }

    // Navigation
    func trackScreenViewed(screen: String) {
        track(NavigationEvent.screenViewed(screen: screen))

        // Also set screen name in Firebase
        Analytics.logEvent(AnalyticsEventScreenView, parameters: [
            AnalyticsParameterScreenName: screen,
            AnalyticsParameterScreenClass: screen
        ])
    }

    func trackTabChanged(from: String, to: String) {
        track(NavigationEvent.tabChanged(from: from, to: to))
    }

    func trackDeepLinkOpened(url: String) {
        track(NavigationEvent.deepLinkOpened(url: url))
    }

    func trackPushNotificationOpened(type: String) {
        track(NavigationEvent.pushNotificationOpened(type: type))
    }

    // Engagement
    func trackDailyActiveUser() {
        track(EngagementEvent.dailyActiveUser)
    }

    func trackFeatureUsed(feature: String) {
        track(EngagementEvent.featureUsed(feature: feature))
    }

    func trackShareInvite(method: String) {
        track(EngagementEvent.shareInvite(method: method))
    }

    func trackRating(rating: Int) {
        track(EngagementEvent.ratingsSubmitted(rating: rating))
    }

    func trackFeedback(type: String) {
        track(EngagementEvent.feedbackSubmitted(type: type))
    }

    // MARK: - Custom Events

    func trackCustomEvent(name: String, parameters: [String: Any] = [:]) {
        guard isEnabled else { return }

        Analytics.logEvent(name, parameters: parameters)
        analyticsLogger.debug("Custom analytics event: \(name)")
    }

    // MARK: - Conversion Tracking

    func trackConversion(type: String, value: Double? = nil) {
        var parameters: [String: Any] = ["conversion_type": type]
        if let value = value {
            parameters["value"] = value
            parameters["currency"] = "USD"
        }

        Analytics.logEvent("conversion", parameters: parameters)
    }

    // MARK: - User Journey Tracking

    private var userJourneySteps: [String] = []

    func startUserJourney(name: String) {
        userJourneySteps = [name]
        trackCustomEvent(name: "journey_started", parameters: ["journey_name": name])
    }

    func addJourneyStep(step: String) {
        userJourneySteps.append(step)
    }

    func completeUserJourney(success: Bool = true) {
        guard !userJourneySteps.isEmpty else { return }

        let journeyName = userJourneySteps.first ?? "unknown"
        trackCustomEvent(name: "journey_completed", parameters: [
            "journey_name": journeyName,
            "steps": userJourneySteps.joined(separator: " > "),
            "step_count": userJourneySteps.count,
            "success": success
        ])

        userJourneySteps.removeAll()
    }

    // MARK: - A/B Testing Support

    func trackExperiment(name: String, variant: String) {
        Analytics.logEvent("experiment_impression", parameters: [
            "experiment_name": name,
            "variant": variant
        ])
    }

    // MARK: - Debug Logging

    private func logEventToConsole(event: AnalyticsEvent, parameters: [String: Any]) {
        print("""

        ═══════════════════════════════════════
        📊 ANALYTICS EVENT
        ═══════════════════════════════════════
        Event: \(event.eventName)
        Category: \(event.category.rawValue)
        Parameters:
        \(parameters.map { "  • \($0.key): \($0.value)" }.joined(separator: "\n"))
        ═══════════════════════════════════════

        """)
    }
}
