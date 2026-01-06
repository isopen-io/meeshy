//
//  UserRequestModels.swift
//  Meeshy
//
//  Request and response models for user operations
//  iOS 16+
//

import Foundation

// MARK: - User API Request Models

/// Request for updating user profile information
struct UserProfileUpdateRequest: Codable, Sendable {
    var firstName: String?
    var lastName: String?
    var displayName: String?
    var bio: String?
    var phoneNumber: String?
    var avatar: String?
    
    // Language & Translation Settings
    var systemLanguage: String?
    var regionalLanguage: String?
    var customDestinationLanguage: String?
    var autoTranslateEnabled: Bool?
    var translateToSystemLanguage: Bool?
    var translateToRegionalLanguage: Bool?
    var useCustomDestination: Bool?
}

/// Request for reporting a user
struct ReportUserRequest: Codable, Sendable {
    let userId: String
    let reason: String
    let details: String?
}

// MARK: - User API Response Models

/// Response containing a single user
struct UserResponse: Codable, Sendable {
    let user: User
}

/// Response containing a list of blocked users
struct BlockedUsersResponse: Codable, Sendable {
    let users: [User]
}

/// Response containing user preferences
struct UserPreferencesResponse: Codable, Sendable {
    let preferences: UserPreferences
}

// MARK: - Legacy Support

/// Legacy user settings model (deprecated)
struct UserSettings: Codable, Sendable {
    var notificationsEnabled: Bool
    var pushNotificationsEnabled: Bool
    var emailNotificationsEnabled: Bool
    var onlineStatusVisible: Bool
    var readReceiptsEnabled: Bool
    var translationEnabled: Bool
    var autoTranslateEnabled: Bool
    var preferredLanguage: String
    var theme: String
    var textSize: String
    
    init(
        notificationsEnabled: Bool = true,
        pushNotificationsEnabled: Bool = true,
        emailNotificationsEnabled: Bool = true,
        onlineStatusVisible: Bool = true,
        readReceiptsEnabled: Bool = true,
        translationEnabled: Bool = true,
        autoTranslateEnabled: Bool = false,
        preferredLanguage: String = "en",
        theme: String = "system",
        textSize: String = "medium"
    ) {
        self.notificationsEnabled = notificationsEnabled
        self.pushNotificationsEnabled = pushNotificationsEnabled
        self.emailNotificationsEnabled = emailNotificationsEnabled
        self.onlineStatusVisible = onlineStatusVisible
        self.readReceiptsEnabled = readReceiptsEnabled
        self.translationEnabled = translationEnabled
        self.autoTranslateEnabled = autoTranslateEnabled
        self.preferredLanguage = preferredLanguage
        self.theme = theme
        self.textSize = textSize
    }
}
