//
//  LocalizationManager.swift
//  Meeshy
//
//  Complete localization manager for app language switching
//  Supports EN, FR, RU, PT with dynamic language changes
//  iOS 16+
//

import Foundation
import SwiftUI
import Combine

// MARK: - App Language

enum AppLanguage: String, CaseIterable, Codable {
    case english = "en"
    case french = "fr"
    case russian = "ru"
    case portuguese = "pt"
    case system = "system"

    var displayName: String {
        switch self {
        case .english: return "English"
        case .french: return "Français"
        case .russian: return "Русский"
        case .portuguese: return "Português"
        case .system: return "System Default"
        }
    }

    var nativeName: String {
        switch self {
        case .english: return "English"
        case .french: return "Français"
        case .russian: return "Русский"
        case .portuguese: return "Português"
        case .system: return NSLocalizedString("language.system", comment: "System Default")
        }
    }

    var flagEmoji: String {
        switch self {
        case .english: return "🇬🇧"
        case .french: return "🇫🇷"
        case .russian: return "🇷🇺"
        case .portuguese: return "🇵🇹"
        case .system: return "🌐"
        }
    }

    var locale: Locale {
        switch self {
        case .english: return Locale(identifier: "en_US")
        case .french: return Locale(identifier: "fr_FR")
        case .russian: return Locale(identifier: "ru_RU")
        case .portuguese: return Locale(identifier: "pt_PT")
        case .system: return Locale.current
        }
    }

    static var availableLanguages: [AppLanguage] {
        [.system, .english, .french, .russian, .portuguese]
    }
}

// MARK: - Localization Manager

@MainActor
final class LocalizationManager: ObservableObject {
    // MARK: - Published Properties

    @Published var currentLanguage: AppLanguage {
        didSet {
            saveLanguagePreference()
            updateLocalization()
        }
    }

    @Published var isRTL: Bool = false

    // MARK: - Properties

    private var bundle: Bundle = Bundle.main
    private let userDefaults = UserDefaults.standard

    // MARK: - Singleton

    static let shared = LocalizationManager()

    // MARK: - Initialization

    private init() {
        // Load saved language preference or use system default
        if let savedLanguageRaw = userDefaults.string(forKey: "appLanguage"),
           let savedLanguage = AppLanguage(rawValue: savedLanguageRaw) {
            self.currentLanguage = savedLanguage
        } else {
            self.currentLanguage = .system
        }

        updateLocalization()
    }

    // MARK: - Public Methods

    /// Change app language
    func changeLanguage(to language: AppLanguage) {
        currentLanguage = language
    }

    /// Get localized string
    func localizedString(for key: String, comment: String = "") -> String {
        return bundle.localizedString(forKey: key, value: nil, table: nil)
    }

    /// Get localized string with arguments
    func localizedString(for key: String, arguments: CVarArg...) -> String {
        let format = localizedString(for: key)
        return String(format: format, arguments: arguments)
    }

    /// Check if current language is RTL
    var isCurrentLanguageRTL: Bool {
        let language = effectiveLanguage
        return Locale.characterDirection(forLanguage: language.rawValue) == .rightToLeft
    }

    /// Get effective language (resolves system language)
    var effectiveLanguage: AppLanguage {
        if currentLanguage == .system {
            return detectSystemLanguage()
        }
        return currentLanguage
    }

    // MARK: - Private Methods

    private func updateLocalization() {
        let language = effectiveLanguage

        // Get the path for the language bundle
        guard let path = Bundle.main.path(forResource: language.rawValue, ofType: "lproj"),
              let bundle = Bundle(path: path) else {
            // Fallback to main bundle if language bundle not found
            self.bundle = Bundle.main
            self.isRTL = false
            return
        }

        self.bundle = bundle
        self.isRTL = isCurrentLanguageRTL

        // Post notification for UI updates
        NotificationCenter.default.post(name: .languageDidChange, object: language)
    }

    private func saveLanguagePreference() {
        userDefaults.set(currentLanguage.rawValue, forKey: "appLanguage")
        userDefaults.synchronize()
    }

    private func detectSystemLanguage() -> AppLanguage {
        guard let preferredLanguage = Locale.preferredLanguages.first else {
            return .english
        }

        let languageCode = String(preferredLanguage.prefix(2))

        switch languageCode {
        case "en": return .english
        case "fr": return .french
        case "ru": return .russian
        case "pt": return .portuguese
        default: return .english
        }
    }
}

// MARK: - Notification Name Extension

extension Notification.Name {
    static let languageDidChange = Notification.Name("languageDidChange")
}

// MARK: - LocalizedString Helper

struct LocalizedString {
    // MARK: - Authentication

    static let signIn = "auth.signIn"
    static let signUp = "auth.signUp"
    static let email = "auth.email"
    static let password = "auth.password"
    static let forgotPassword = "auth.forgotPassword"
    static let resetPassword = "auth.resetPassword"
    static let authLogout = "auth.logout"
    static let confirmPassword = "auth.confirmPassword"
    static let twoFactorAuth = "auth.twoFactorAuth"
    static let verificationCode = "auth.verificationCode"

    // MARK: - Chat

    static let chats = "chat.chats"
    static let newChat = "chat.newChat"
    static let typeMessage = "chat.typeMessage"
    static let sendMessage = "chat.sendMessage"
    static let editMessage = "chat.editMessage"
    static let deleteMessage = "chat.deleteMessage"
    static let replyMessage = "chat.replyMessage"
    static let forwardMessage = "chat.forwardMessage"
    static let copyMessage = "chat.copyMessage"
    static let searchMessages = "chat.searchMessages"

    // MARK: - Translation

    static let translate = "translation.translate"
    static let translating = "translation.translating"
    static let translated = "translation.translated"
    static let showOriginal = "translation.showOriginal"
    static let autoTranslate = "translation.autoTranslate"
    static let translationQuality = "translation.quality"
    static let detectLanguage = "translation.detectLanguage"
    static let sourceLanguage = "translation.sourceLanguage"
    static let targetLanguage = "translation.targetLanguage"
    static let translationHistory = "translation.history"
    static let clearHistory = "translation.clearHistory"

    // MARK: - Settings

    static let settings = "settings.title"
    static let profile = "settings.profile"
    static let privacy = "settings.privacy"
    static let notifications = "settings.notifications"
    static let language = "settings.language"
    static let appearance = "settings.appearance"
    static let about = "settings.about"
    static let version = "settings.version"
    static let logout = "settings.logout"

    // MARK: - Profile

    static let editProfile = "profile.edit"
    static let displayName = "profile.displayName"
    static let username = "profile.username"
    static let bio = "profile.bio"
    static let phoneNumber = "profile.phoneNumber"
    static let avatar = "profile.avatar"
    static let changeAvatar = "profile.changeAvatar"

    // MARK: - Notifications

    static let messageNotification = "notification.message"
    static let callNotification = "notification.call"
    static let enableNotifications = "notification.enable"
    static let disableNotifications = "notification.disable"
    static let notificationSound = "notification.sound"
    static let notificationVibration = "notification.vibration"

    // MARK: - Calls

    static let voiceCall = "call.voice"
    static let videoCall = "call.video"
    static let incomingCall = "call.incoming"
    static let outgoingCall = "call.outgoing"
    static let endCall = "call.end"
    static let muteCall = "call.mute"
    static let unmuteCall = "call.unmute"
    static let switchCamera = "call.switchCamera"

    // MARK: - Media

    static let camera = "media.camera"
    static let photoLibrary = "media.photoLibrary"
    static let document = "media.document"
    static let location = "media.location"
    static let contact = "media.contact"
    static let voiceMessage = "media.voiceMessage"

    // MARK: - Errors

    static let errorGeneric = "error.generic"
    static let errorNetwork = "error.network"
    static let errorAuth = "error.auth"
    static let errorPermission = "error.permission"
    static let errorNotFound = "error.notFound"
    static let errorServerError = "error.server"

    // MARK: - Common

    static let ok = "common.ok"
    static let cancel = "common.cancel"
    static let save = "common.save"
    static let delete = "common.delete"
    static let edit = "common.edit"
    static let done = "common.done"
    static let close = "common.close"
    static let share = "common.share"
    static let copy = "common.copy"
    static let search = "common.search"
    static let loading = "common.loading"
    static let retry = "common.retry"
    static let yes = "common.yes"
    static let no = "common.no"
}

// MARK: - String Extension for Localization

extension String {
    /// Get localized string
    @MainActor var localized: String {
        LocalizationManager.shared.localizedString(for: self)
    }

    /// Get localized string with arguments
    @MainActor func localized(with arguments: CVarArg...) -> String {
        let format = LocalizationManager.shared.localizedString(for: self)
        return String(format: format, arguments: arguments)
    }

    /// Get localized string with default value
    @MainActor func localized(default defaultValue: String) -> String {
        let value = LocalizationManager.shared.localizedString(for: self)
        return value == self ? defaultValue : value
    }
}

// MARK: - Localization View Modifier

struct LocalizationModifier: ViewModifier {
    @ObservedObject var localizationManager = LocalizationManager.shared

    func body(content: Content) -> some View {
        content
            .environment(\.layoutDirection, localizationManager.isRTL ? .rightToLeft : .leftToRight)
            .environment(\.locale, localizationManager.effectiveLanguage.locale)
    }
}

extension View {
    func withLocalization() -> some View {
        modifier(LocalizationModifier())
    }
}
