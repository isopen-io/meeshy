//
//  UserPropertyManager.swift
//  Meeshy
//
//  Created on 2025-11-22.
//  User Property Management for Analytics Segmentation
//

import Foundation
#if canImport(UIKit)
import UIKit
#endif
// import FirebaseAnalytics

// MARK: - User Property Manager

@MainActor
final class UserPropertyManager {

    // MARK: - Singleton

    static let shared = UserPropertyManager()

    // MARK: - Properties

    private var isEnabled: Bool = true
    // private let queue = DispatchQueue(label: "com.meeshy.userproperties", qos: .utility)

    // MARK: - Initialization

    private init() {}

    // MARK: - User Properties

    func setUserID(_ userID: String?) {
        guard isEnabled else { return }

        Analytics.setUserID(userID)

        if let userID = userID {
            userLogger.info("Analytics user ID set: \(userID)")
            CrashReporter.shared.setUserID(userID)
        } else {
            userLogger.info("Analytics user ID cleared")
            CrashReporter.shared.clearUserID()
        }
    }

    func setUserProperty(_ value: String?, forName name: String) {
        guard isEnabled else { return }

        Analytics.setUserProperty(value, forName: name)
        userLogger.debug("User property set: \(name) = \(value ?? "nil")")

        if let value = value {
            CrashReporter.shared.setCustomValue(value, forKey: name)
        }
    }

    // MARK: - Standard User Properties

    func setUserEmail(_ email: String?) {
        setUserProperty(email, forName: "email")
    }

    func setUsername(_ username: String?) {
        setUserProperty(username, forName: "username")
    }

    func setUserPhoneNumber(_ phoneNumber: String?) {
        setUserProperty(phoneNumber, forName: "phone_number")
    }

    func setUserLanguage(_ language: String) {
        setUserProperty(language, forName: "language")
    }

    func setUserCountry(_ country: String) {
        setUserProperty(country, forName: "country")
    }

    func setUserTimezone(_ timezone: String) {
        setUserProperty(timezone, forName: "timezone")
    }

    // MARK: - Account Properties

    func setAccountType(_ type: AccountType) {
        setUserProperty(type.rawValue, forName: "account_type")
    }

    func setAccountAge(days: Int) {
        setUserProperty(String(days), forName: "account_age_days")
    }

    func setEmailVerified(_ verified: Bool) {
        setUserProperty(verified ? "true" : "false", forName: "email_verified")
    }

    func setPhoneVerified(_ verified: Bool) {
        setUserProperty(verified ? "true" : "false", forName: "phone_verified")
    }

    func setTwoFactorEnabled(_ enabled: Bool) {
        setUserProperty(enabled ? "true" : "false", forName: "2fa_enabled")
    }

    // MARK: - Premium/Subscription Properties

    func setPremiumStatus(_ isPremium: Bool) {
        setUserProperty(isPremium ? "premium" : "free", forName: "subscription_status")
        CrashReporter.shared.setCustomValue(isPremium, forKey: "is_premium")
    }

    func setSubscriptionPlan(_ plan: String?) {
        setUserProperty(plan, forName: "subscription_plan")
    }

    func setSubscriptionExpiryDate(_ date: Date?) {
        if let date = date {
            let timestamp = Int64(date.timeIntervalSince1970)
            setUserProperty(String(timestamp), forName: "subscription_expiry")
        } else {
            setUserProperty(nil, forName: "subscription_expiry")
        }
    }

    func setTrialUser(_ isTrial: Bool) {
        setUserProperty(isTrial ? "true" : "false", forName: "is_trial")
    }

    // MARK: - Engagement Properties

    func setTotalConversations(_ count: Int) {
        setUserProperty(String(count), forName: "total_conversations")
    }

    func setTotalMessages(_ count: Int) {
        setUserProperty(String(count), forName: "total_messages")
    }

    func setTotalCalls(_ count: Int) {
        setUserProperty(String(count), forName: "total_calls")
    }

    func setLastActiveDate(_ date: Date) {
        let timestamp = Int64(date.timeIntervalSince1970)
        setUserProperty(String(timestamp), forName: "last_active")
    }

    func setDaysSinceLastActive(_ days: Int) {
        setUserProperty(String(days), forName: "days_since_active")
    }

    func setActiveConversations(_ count: Int) {
        setUserProperty(String(count), forName: "active_conversations")
        CrashReporter.shared.setCustomValue(count, forKey: "active_conversations")
    }

    func setUnreadMessages(_ count: Int) {
        setUserProperty(String(count), forName: "unread_messages")
        CrashReporter.shared.setCustomValue(count, forKey: "unread_messages")
    }

    // MARK: - Usage Properties

    func setDailyActiveUser(_ isActive: Bool) {
        setUserProperty(isActive ? "true" : "false", forName: "daily_active_user")
    }

    func setWeeklyActiveUser(_ isActive: Bool) {
        setUserProperty(isActive ? "true" : "false", forName: "weekly_active_user")
    }

    func setMonthlyActiveUser(_ isActive: Bool) {
        setUserProperty(isActive ? "true" : "false", forName: "monthly_active_user")
    }

    func setSessionCount(_ count: Int) {
        setUserProperty(String(count), forName: "session_count")
    }

    func setAverageSessionDuration(_ duration: TimeInterval) {
        let minutes = Int(duration / 60)
        setUserProperty(String(minutes), forName: "avg_session_duration_min")
    }

    // MARK: - Feature Usage Properties

    func setMessagingFrequency(_ frequency: UsageFrequency) {
        setUserProperty(frequency.rawValue, forName: "messaging_frequency")
    }

    func setCallingFrequency(_ frequency: UsageFrequency) {
        setUserProperty(frequency.rawValue, forName: "calling_frequency")
    }

    func setMediaSharingFrequency(_ frequency: UsageFrequency) {
        setUserProperty(frequency.rawValue, forName: "media_sharing_frequency")
    }

    func setTranslationUser(_ isUser: Bool) {
        setUserProperty(isUser ? "true" : "false", forName: "uses_translation")
    }

    func setVoiceMessagingUser(_ isUser: Bool) {
        setUserProperty(isUser ? "true" : "false", forName: "uses_voice_messages")
    }

    func setVideoCallingUser(_ isUser: Bool) {
        setUserProperty(isUser ? "true" : "false", forName: "uses_video_calls")
    }

    // MARK: - Device Properties

    func setDeviceModel(_ model: String) {
        setUserProperty(model, forName: "device_model")
    }

    func setIOSVersion(_ version: String) {
        setUserProperty(version, forName: "ios_version")
    }

    func setAppVersion(_ version: String) {
        setUserProperty(version, forName: "app_version")
    }

    func setNetworkType(_ type: NetworkType) {
        setUserProperty(type.rawValue, forName: "network_type")
        CrashReporter.shared.setCustomValue(type.rawValue, forKey: "network_type")
    }

    // MARK: - Preferences Properties

    func setThemePreference(_ theme: String) {
        setUserProperty(theme, forName: "theme_preference")
    }

    func setNotificationsEnabled(_ enabled: Bool) {
        setUserProperty(enabled ? "true" : "false", forName: "notifications_enabled")
    }

    func setSoundEnabled(_ enabled: Bool) {
        setUserProperty(enabled ? "true" : "false", forName: "sound_enabled")
    }

    func setPreferredLanguage(_ language: String) {
        setUserProperty(language, forName: "preferred_language")
    }

    // MARK: - Segmentation Properties

    func setUserSegment(_ segment: String) {
        setUserProperty(segment, forName: "user_segment")
    }

    func setUserCohort(_ cohort: String) {
        setUserProperty(cohort, forName: "user_cohort")
    }

    func setABTestVariant(_ testName: String, variant: String) {
        setUserProperty(variant, forName: "ab_test_\(testName)")
    }

    // MARK: - Acquisition Properties

    func setAcquisitionSource(_ source: String) {
        setUserProperty(source, forName: "acquisition_source")
    }

    func setAcquisitionMedium(_ medium: String) {
        setUserProperty(medium, forName: "acquisition_medium")
    }

    func setAcquisitionCampaign(_ campaign: String) {
        setUserProperty(campaign, forName: "acquisition_campaign")
    }

    func setReferralCode(_ code: String?) {
        setUserProperty(code, forName: "referral_code")
    }

    func setInstallDate(_ date: Date) {
        let timestamp = Int64(date.timeIntervalSince1970)
        setUserProperty(String(timestamp), forName: "install_date")
    }

    // MARK: - Behavioral Properties

    func setPowerUser(_ isPower: Bool) {
        setUserProperty(isPower ? "true" : "false", forName: "power_user")
    }

    func setChurnRisk(_ risk: ChurnRisk) {
        setUserProperty(risk.rawValue, forName: "churn_risk")
    }

    func setLifetimeValue(_ value: Double) {
        setUserProperty(String(format: "%.2f", value), forName: "lifetime_value")
    }

    func setEngagementScore(_ score: Int) {
        setUserProperty(String(score), forName: "engagement_score")
    }

    // MARK: - Social Properties

    func setTotalContacts(_ count: Int) {
        setUserProperty(String(count), forName: "total_contacts")
    }

    func setTotalGroups(_ count: Int) {
        setUserProperty(String(count), forName: "total_groups")
    }

    func setInvitesSent(_ count: Int) {
        setUserProperty(String(count), forName: "invites_sent")
    }

    func setInvitesAccepted(_ count: Int) {
        setUserProperty(String(count), forName: "invites_accepted")
    }

    // MARK: - Complete User Profile

    func setCompleteUserProfile(
        userID: String,
        email: String?,
        username: String?,
        isPremium: Bool,
        accountType: AccountType,
        language: String,
        deviceInfo: DeviceInfo
    ) {
        // Identity
        self.setUserID(userID)
        self.setUserEmail(email)
        self.setUsername(username)

        // Account
        self.setPremiumStatus(isPremium)
        self.setAccountType(accountType)
        self.setUserLanguage(language)

        // Device
        self.setDeviceModel(deviceInfo.model)
        self.setIOSVersion(deviceInfo.osVersion)
        self.setAppVersion(deviceInfo.appVersion)
        self.setUserTimezone(deviceInfo.timezone)
        self.setUserCountry(deviceInfo.country)

        userLogger.info("Complete user profile set for analytics")
    }

    // MARK: - Update Context

    func updateUserContext(
        isLoggedIn: Bool,
        activeConversations: Int,
        unreadMessages: Int,
        networkType: NetworkType
    ) {
        self.setActiveConversations(activeConversations)
        self.setUnreadMessages(unreadMessages)
        self.setNetworkType(networkType)
        self.setLastActiveDate(Date())

        CrashReporter.shared.setAppContext(
            isLoggedIn: isLoggedIn,
            activeConversations: activeConversations,
            unreadMessages: unreadMessages
        )
    }

    // MARK: - Clear User Data

    func clearUserProperties() {
        Analytics.setUserID(nil)

        // Clear sensitive properties
        self.setUserEmail(nil)
        self.setUsername(nil)
        self.setUserPhoneNumber(nil)

        CrashReporter.shared.clearUserID()

        userLogger.info("User properties cleared")
    }
}

// MARK: - Supporting Types

enum AccountType: String {
    case free
    case premium
    case business
    case enterprise
}

enum UsageFrequency: String {
    case never
    case rarely = "1-2_times_week"
    case occasionally = "3-5_times_week"
    case frequently = "daily"
    case veryFrequently = "multiple_daily"
}

enum NetworkType: String {
    case wifi = "WiFi"
    case cellular = "Cellular"
    case offline = "Offline"
    case unknown = "Unknown"
}

enum ChurnRisk: String {
    case low
    case medium
    case high
    case critical
}

struct DeviceInfo {
    let model: String
    let osVersion: String
    let appVersion: String
    let timezone: String
    let country: String

    static var current: DeviceInfo {
        #if canImport(UIKit)
        let device = UIDevice.current
        let model = device.model
        let osVersion = device.systemVersion
        #else
        let model = "Unknown"
        let osVersion = "Unknown"
        #endif

        let appVersion = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "Unknown"
        let timezone = TimeZone.current.identifier
        let country = Locale.current.region?.identifier ?? "Unknown"

        return DeviceInfo(
            model: model,
            osVersion: osVersion,
            appVersion: appVersion,
            timezone: timezone,
            country: country
        )
    }
}
