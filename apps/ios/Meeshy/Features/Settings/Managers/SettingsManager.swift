import SwiftUI
import Foundation
import LocalAuthentication

// MARK: - Settings Manager
/// Complete settings persistence manager using @AppStorage
@MainActor
final class SettingsManager: ObservableObject {
    static let shared = SettingsManager()

    // MARK: - Account Settings
    @AppStorage("user.email") var userEmail: String = ""
    @AppStorage("user.phone") var userPhone: String = ""
    @AppStorage("user.twoFactorEnabled") var twoFactorEnabled: Bool = false
    @AppStorage("user.biometricEnabled") var biometricEnabled: Bool = false
    @AppStorage("user.biometricType") var biometricType: String = "none"

    // MARK: - Privacy Settings
    @AppStorage("privacy.onlineStatus") var showOnlineStatus: Bool = true
    @AppStorage("privacy.readReceipts") var sendReadReceipts: Bool = true
    @AppStorage("privacy.profilePhotoVisibility") var profilePhotoVisibility: ProfilePhotoVisibility = .everyone
    @AppStorage("privacy.lastSeenVisibility") var lastSeenVisibility: LastSeenVisibility = .everyone
    @AppStorage("privacy.typingIndicator") var showTypingIndicator: Bool = true
    @AppStorage("privacy.blockScreenshots") var blockScreenshots: Bool = false

    // MARK: - Notification Settings
    @AppStorage("notifications.push") var pushNotificationsEnabled: Bool = true
    @AppStorage("notifications.messagePreview") var showMessagePreview: Bool = true
    @AppStorage("notifications.sound") var notificationSound: String = "default"
    @AppStorage("notifications.vibration") var vibrationEnabled: Bool = true
    @AppStorage("notifications.calls") var callNotifications: Bool = true
    @AppStorage("notifications.groupMessages") var groupMessageNotifications: Bool = true
    @AppStorage("notifications.mentions") var mentionNotifications: Bool = true
    @AppStorage("notifications.dndEnabled") var dndEnabled: Bool = false

    // iOS 16+ compatible: Store time as hour/minute components instead of Date
    @AppStorage("notifications.dndStartHour") private var dndStartHour: Int = 22
    @AppStorage("notifications.dndStartMinute") private var dndStartMinute: Int = 0
    @AppStorage("notifications.dndEndHour") private var dndEndHour: Int = 7
    @AppStorage("notifications.dndEndMinute") private var dndEndMinute: Int = 0

    // Computed properties for Date access
    var dndStartTime: Date {
        get {
            Calendar.current.date(from: DateComponents(hour: dndStartHour, minute: dndStartMinute)) ?? Date()
        }
        set {
            let components = Calendar.current.dateComponents([.hour, .minute], from: newValue)
            dndStartHour = components.hour ?? 22
            dndStartMinute = components.minute ?? 0
        }
    }

    var dndEndTime: Date {
        get {
            Calendar.current.date(from: DateComponents(hour: dndEndHour, minute: dndEndMinute)) ?? Date()
        }
        set {
            let components = Calendar.current.dateComponents([.hour, .minute], from: newValue)
            dndEndHour = components.hour ?? 7
            dndEndMinute = components.minute ?? 0
        }
    }

    // MARK: - Appearance Settings
    @AppStorage("appearance.theme") var theme: AppTheme = .system
    @AppStorage("appearance.accentColor") var accentColorHex: String = "#007AFF"
    @AppStorage("appearance.fontSize") var fontSize: FontSize = .medium
    @AppStorage("appearance.bubbleStyle") var bubbleStyle: BubbleStyle = .rounded
    @AppStorage("appearance.appIcon") var appIcon: String = "Default"
    @AppStorage("appearance.chatBackground") var chatBackground: String = "default"
    @AppStorage("appearance.reducedMotion") var reducedMotion: Bool = false

    // MARK: - Chat Settings
    @AppStorage("chat.enterToSend") var enterToSend: Bool = true
    @AppStorage("chat.autoDownloadMedia") var autoDownloadMedia: AutoDownloadOption = .wifiOnly
    @AppStorage("chat.autoplayVideos") var autoplayVideos: Bool = true
    @AppStorage("chat.autoplayGifs") var autoplayGifs: Bool = true
    @AppStorage("chat.saveToGallery") var saveToGallery: Bool = false
    @AppStorage("chat.chatBackupEnabled") var chatBackupEnabled: Bool = false
    @AppStorage("chat.chatBackupFrequency") var chatBackupFrequency: BackupFrequency = .weekly
    @AppStorage("chat.showMessageTimestamps") var showMessageTimestamps: Bool = true
    @AppStorage("chat.linkPreviews") var linkPreviews: Bool = true

    // MARK: - Translation Settings
    @AppStorage("translation.autoTranslate") var autoTranslate: Bool = false
    @AppStorage("translation.quality") var translationQuality: TranslationQuality = .balanced
    @AppStorage("translation.preferredLanguage") var preferredLanguage: String = "en"
    @AppStorage("translation.showOriginalText") var showOriginalText: Bool = true
    @AppStorage("translation.offlineMode") var offlineTranslation: Bool = false

    // MARK: - Transcription Settings (v2)
    /// Enable automatic transcription of audio/video messages when no transcription exists
    @AppStorage("transcription.autoTranscribe") var autoTranscribe: Bool = false
    /// Preferred transcription language (ISO 639-1 code)
    @AppStorage("transcription.preferredLanguage") var transcriptionPreferredLanguage: String = "fr"
    /// Show transcription automatically below audio/video messages
    @AppStorage("transcription.showAutomatically") var showTranscriptionAutomatically: Bool = true
    /// Use on-device transcription only (more private, but may be less accurate)
    @AppStorage("transcription.onDeviceOnly") var transcriptionOnDeviceOnly: Bool = true
    /// Automatically detect language for transcription
    @AppStorage("transcription.autoDetectLanguage") var transcriptionAutoDetectLanguage: Bool = true

    // MARK: - Encryption Settings (v2)
    /// Enable end-to-end encryption by default for new conversations
    @AppStorage("encryption.defaultEnabled") var defaultEncryptionEnabled: Bool = true
    /// Encryption mode for new conversations: signal, aes256, or none
    @AppStorage("encryption.defaultMode") var defaultEncryptionMode: String = "signal"
    /// Show encryption status indicator in conversations
    @AppStorage("encryption.showIndicator") var showEncryptionIndicator: Bool = true
    /// Require encryption for media attachments
    @AppStorage("encryption.requireForMedia") var requireEncryptionForMedia: Bool = true

    // MARK: - iOS Specific Settings
    @AppStorage("ios.hapticFeedback") var hapticFeedbackEnabled: Bool = true
    @AppStorage("ios.hapticIntensity") var hapticIntensity: HapticIntensity = .medium
    @AppStorage("ios.siriShortcuts") var siriShortcutsEnabled: Bool = true
    @AppStorage("ios.widgetEnabled") var widgetEnabled: Bool = true
    @AppStorage("ios.widgetConversations") var widgetConversationCount: Int = 4
    @AppStorage("ios.watchEnabled") var watchSyncEnabled: Bool = true
    @AppStorage("ios.handoffEnabled") var handoffEnabled: Bool = true
    @AppStorage("ios.keyboardHaptic") var keyboardHapticEnabled: Bool = true

    // MARK: - Data & Storage Settings
    @AppStorage("storage.cacheLimit") var cacheLimit: Int = 500 // MB
    @AppStorage("storage.autoDeleteOldMedia") var autoDeleteOldMedia: Bool = false
    @AppStorage("storage.autoDeleteDays") var autoDeleteDays: Int = 30
    @AppStorage("storage.keepImportantMessages") var keepImportantMessages: Bool = true

    // MARK: - Advanced Settings
    @AppStorage("advanced.developerMode") var developerMode: Bool = false
    @AppStorage("advanced.analyticsEnabled") var analyticsEnabled: Bool = true
    @AppStorage("advanced.crashReportingEnabled") var crashReportingEnabled: Bool = true
    @AppStorage("advanced.betaFeatures") var betaFeaturesEnabled: Bool = false

    // MARK: - Computed Properties
    var accentColor: Color {
        Color(hex: accentColorHex) ?? .blue
    }

    var currentCacheSize: Int {
        calculateCacheSize()
    }

    private init() {
        setupBiometricType()
    }

    // MARK: - Methods
    func setupBiometricType() {
        let context = LAContext()
        var error: NSError?

        if context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error) {
            switch context.biometryType {
            case .faceID:
                biometricType = "faceID"
            case .touchID:
                biometricType = "touchID"
            case .opticID:
                if #available(iOS 17.0, *) {
                    biometricType = "opticID"
                }
            case .none:
                biometricType = "none"
            @unknown default:
                biometricType = "none"
            }
        }
    }

    func resetToDefaults() {
        // Reset all settings to default values
        guard let bundleIdentifier = Bundle.main.bundleIdentifier else {
            settingLogger.error("Failed to get bundle identifier for settings reset")
            return
        }
        UserDefaults.standard.removePersistentDomain(forName: bundleIdentifier)
        UserDefaults.standard.synchronize()
    }

    func exportSettings() -> Data? {
        let settings = getAllSettings()
        return try? JSONSerialization.data(withJSONObject: settings, options: .prettyPrinted)
    }

    func importSettings(from data: Data) -> Bool {
        guard let settings = try? JSONSerialization.jsonObject(with: data, options: []) as? [String: Any] else {
            return false
        }
        // Apply imported settings
        applySettings(settings)
        return true
    }

    private func getAllSettings() -> [String: Any] {
        var settings: [String: Any] = [:]

        // Collect all settings
        settings["appearance"] = [
            "theme": theme.rawValue,
            "accentColor": accentColorHex,
            "fontSize": fontSize.rawValue,
            "bubbleStyle": bubbleStyle.rawValue
        ]

        settings["privacy"] = [
            "onlineStatus": showOnlineStatus,
            "readReceipts": sendReadReceipts,
            "profilePhotoVisibility": profilePhotoVisibility.rawValue,
            "lastSeenVisibility": lastSeenVisibility.rawValue
        ]

        settings["notifications"] = [
            "push": pushNotificationsEnabled,
            "messagePreview": showMessagePreview,
            "sound": notificationSound,
            "vibration": vibrationEnabled
        ]

        settings["chat"] = [
            "enterToSend": enterToSend,
            "autoDownloadMedia": autoDownloadMedia.rawValue,
            "autoplayVideos": autoplayVideos,
            "autoplayGifs": autoplayGifs
        ]

        settings["translation"] = [
            "autoTranslate": autoTranslate,
            "quality": translationQuality.rawValue,
            "preferredLanguage": preferredLanguage
        ]

        return settings
    }

    private func applySettings(_ settings: [String: Any]) {
        // Apply imported settings to @AppStorage properties
        // Implementation details...
    }

    private func calculateCacheSize() -> Int {
        // Calculate actual cache size
        let cacheURL = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first!
        let fileSize = try? FileManager.default.allocatedSizeOfDirectory(at: cacheURL)
        return Int((fileSize ?? 0) / 1_048_576) // Convert to MB
    }

    func clearCache() async throws {
        let cacheURL = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first!
        let contents = try FileManager.default.contentsOfDirectory(at: cacheURL, includingPropertiesForKeys: nil)

        for file in contents {
            try FileManager.default.removeItem(at: file)
        }
    }
}

// MARK: - Enums
enum AppTheme: String, CaseIterable, Codable {
    case light = "light"
    case dark = "dark"
    case system = "system"

    var displayName: String {
        switch self {
        case .light: return "Light"
        case .dark: return "Dark"
        case .system: return "System"
        }
    }
}

enum ProfilePhotoVisibility: String, CaseIterable, Codable {
    case everyone = "everyone"
    case contacts = "contacts"
    case nobody = "nobody"

    var displayName: String {
        switch self {
        case .everyone: return "Everyone"
        case .contacts: return "My Contacts"
        case .nobody: return "Nobody"
        }
    }
}

enum LastSeenVisibility: String, CaseIterable, Codable {
    case everyone = "everyone"
    case contacts = "contacts"
    case nobody = "nobody"

    var displayName: String {
        switch self {
        case .everyone: return "Everyone"
        case .contacts: return "My Contacts"
        case .nobody: return "Nobody"
        }
    }
}

enum FontSize: String, CaseIterable, Codable {
    case small = "small"
    case medium = "medium"
    case large = "large"
    case extraLarge = "extraLarge"

    var displayName: String {
        switch self {
        case .small: return "Small"
        case .medium: return "Medium"
        case .large: return "Large"
        case .extraLarge: return "Extra Large"
        }
    }

    var scaleFactor: CGFloat {
        switch self {
        case .small: return 0.85
        case .medium: return 1.0
        case .large: return 1.15
        case .extraLarge: return 1.3
        }
    }
}

enum BubbleStyle: String, CaseIterable, Codable {
    case rounded = "rounded"
    case minimal = "minimal"
    case classic = "classic"

    var displayName: String {
        switch self {
        case .rounded: return "Rounded"
        case .minimal: return "Minimal"
        case .classic: return "Classic"
        }
    }
}

enum AutoDownloadOption: String, CaseIterable, Codable {
    case always = "always"
    case wifiOnly = "wifiOnly"
    case never = "never"

    var displayName: String {
        switch self {
        case .always: return "Always"
        case .wifiOnly: return "Wi-Fi Only"
        case .never: return "Never"
        }
    }
}

enum BackupFrequency: String, CaseIterable, Codable {
    case daily = "daily"
    case weekly = "weekly"
    case monthly = "monthly"
    case never = "never"

    var displayName: String {
        switch self {
        case .daily: return "Daily"
        case .weekly: return "Weekly"
        case .monthly: return "Monthly"
        case .never: return "Never"
        }
    }
}

enum HapticIntensity: String, CaseIterable, Codable {
    case light = "light"
    case medium = "medium"
    case strong = "strong"

    var displayName: String {
        switch self {
        case .light: return "Light"
        case .medium: return "Medium"
        case .strong: return "Strong"
        }
    }

    var impactStyle: UIImpactFeedbackGenerator.FeedbackStyle {
        switch self {
        case .light: return .light
        case .medium: return .medium
        case .strong: return .heavy
        }
    }
}

// MARK: - Extensions
extension FileManager {
    func allocatedSizeOfDirectory(at url: URL) throws -> UInt64 {
        let resourceKeys: Set<URLResourceKey> = [.totalFileAllocatedSizeKey, .fileAllocatedSizeKey]
        guard let enumerator = self.enumerator(at: url, includingPropertiesForKeys: Array(resourceKeys)) else {
            return 0
        }

        var totalSize: UInt64 = 0

        for case let fileURL as URL in enumerator {
            let resourceValues = try fileURL.resourceValues(forKeys: resourceKeys)
            totalSize += UInt64(resourceValues.totalFileAllocatedSize ?? resourceValues.fileAllocatedSize ?? 0)
        }

        return totalSize
    }
}

extension Color {
    init?(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch hex.count {
        case 3: // RGB (12-bit)
            (a, r, g, b) = (255, (int >> 8) * 17, (int >> 4 & 0xF) * 17, (int & 0xF) * 17)
        case 6: // RGB (24-bit)
            (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)
        case 8: // ARGB (32-bit)
            (a, r, g, b) = (int >> 24, int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF)
        default:
            return nil
        }

        self.init(
            .sRGB,
            red: Double(r) / 255,
            green: Double(g) / 255,
            blue: Double(b) / 255,
            opacity: Double(a) / 255
        )
    }
}