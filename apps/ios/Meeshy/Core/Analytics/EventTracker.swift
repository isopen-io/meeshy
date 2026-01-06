//
//  EventTracker.swift
//  Meeshy
//
//  Created on 2025-11-22.
//  Analytics Event Tracking Protocol and Event Definitions
//

import Foundation

// MARK: - Event Protocol

protocol AnalyticsEvent {
    var eventName: String { get }
    var parameters: [String: Any] { get }
    var category: EventCategory { get }
}

// MARK: - Event Categories

enum EventCategory: String {
    case authentication = "auth"
    case messaging = "messaging"
    case conversation = "conversation"
    case call = "call"
    case media = "media"
    case settings = "settings"
    case error = "error"
    case performance = "performance"
    case navigation = "navigation"
    case engagement = "engagement"
}

// MARK: - Authentication Events

enum AuthenticationEvent: AnalyticsEvent {
    case loginStarted(method: AuthMethod)
    case loginSuccess(method: AuthMethod, duration: TimeInterval)
    case loginFailed(method: AuthMethod, error: String)
    case registerStarted(method: AuthMethod)
    case registerSuccess(method: AuthMethod)
    case registerFailed(method: AuthMethod, error: String)
    case logoutInitiated
    case logoutCompleted
    case twoFactorRequested
    case twoFactorSuccess
    case twoFactorFailed(attempts: Int)
    case passwordReset
    case emailVerificationSent
    case emailVerified
    case phoneVerificationSent
    case phoneVerified
    case sessionExpired

    var eventName: String {
        switch self {
        case .loginStarted: return "login_started"
        case .loginSuccess: return "login_success"
        case .loginFailed: return "login_failed"
        case .registerStarted: return "register_started"
        case .registerSuccess: return "register_success"
        case .registerFailed: return "register_failed"
        case .logoutInitiated: return "logout_initiated"
        case .logoutCompleted: return "logout_completed"
        case .twoFactorRequested: return "2fa_requested"
        case .twoFactorSuccess: return "2fa_success"
        case .twoFactorFailed: return "2fa_failed"
        case .passwordReset: return "password_reset"
        case .emailVerificationSent: return "email_verification_sent"
        case .emailVerified: return "email_verified"
        case .phoneVerificationSent: return "phone_verification_sent"
        case .phoneVerified: return "phone_verified"
        case .sessionExpired: return "session_expired"
        }
    }

    var parameters: [String: Any] {
        var params: [String: Any] = [:]

        switch self {
        case .loginStarted(let method), .registerStarted(let method):
            params["method"] = method.rawValue
        case .loginSuccess(let method, let duration):
            params["method"] = method.rawValue
            params["duration"] = duration
        case .loginFailed(let method, let error), .registerFailed(let method, let error):
            params["method"] = method.rawValue
            params["error"] = error
        case .registerSuccess(let method):
            params["method"] = method.rawValue
        case .twoFactorFailed(let attempts):
            params["attempts"] = attempts
        default:
            break
        }

        return params
    }

    var category: EventCategory { .authentication }
}

enum AuthMethod: String {
    case email
    case phone
    case google
    case apple
    case facebook
}

// MARK: - Messaging Events

enum MessagingEvent: AnalyticsEvent {
    case messageSent(type: MessageType, length: Int, hasMedia: Bool)
    case messageReceived(type: MessageType, hasMedia: Bool)
    case messageEdited(type: MessageType)
    case messageDeleted(type: MessageType, deleteForEveryone: Bool)
    case messageReacted(emoji: String)
    case messageReactionRemoved
    case messageForwarded(count: Int)
    case messageCopied
    case messageTranslated(from: String, to: String)
    case messageSearched(query: String, resultsCount: Int)
    case typingStarted
    case typingStopped
    case voiceRecordingStarted
    case voiceRecordingSent(duration: TimeInterval)
    case voiceRecordingCancelled

    var eventName: String {
        switch self {
        case .messageSent: return "message_sent"
        case .messageReceived: return "message_received"
        case .messageEdited: return "message_edited"
        case .messageDeleted: return "message_deleted"
        case .messageReacted: return "message_reacted"
        case .messageReactionRemoved: return "message_reaction_removed"
        case .messageForwarded: return "message_forwarded"
        case .messageCopied: return "message_copied"
        case .messageTranslated: return "message_translated"
        case .messageSearched: return "message_searched"
        case .typingStarted: return "typing_started"
        case .typingStopped: return "typing_stopped"
        case .voiceRecordingStarted: return "voice_recording_started"
        case .voiceRecordingSent: return "voice_recording_sent"
        case .voiceRecordingCancelled: return "voice_recording_cancelled"
        }
    }

    var parameters: [String: Any] {
        var params: [String: Any] = [:]

        switch self {
        case .messageSent(let type, let length, let hasMedia):
            params["message_type"] = type.rawValue
            params["message_length"] = length
            params["has_media"] = hasMedia
        case .messageReceived(let type, let hasMedia):
            params["message_type"] = type.rawValue
            params["has_media"] = hasMedia
        case .messageEdited(let type), .messageDeleted(let type, _):
            params["message_type"] = type.rawValue
            if case .messageDeleted(_, let deleteForEveryone) = self {
                params["delete_for_everyone"] = deleteForEveryone
            }
        case .messageReacted(let emoji):
            params["emoji"] = emoji
        case .messageForwarded(let count):
            params["recipient_count"] = count
        case .messageTranslated(let from, let to):
            params["from_language"] = from
            params["to_language"] = to
        case .messageSearched(let query, let resultsCount):
            params["query_length"] = query.count
            params["results_count"] = resultsCount
        case .voiceRecordingSent(let duration):
            params["duration"] = duration
        default:
            break
        }

        return params
    }

    var category: EventCategory { .messaging }
}

enum MessageType: String {
    case text
    case voice
    case image
    case video
    case document
    case location
    case contact
    case sticker
    case gif
}

// MARK: - Conversation Events

enum ConversationEvent: AnalyticsEvent {
    case conversationCreated(type: ConversationType, participantCount: Int)
    case conversationOpened(type: ConversationType)
    case conversationDeleted(type: ConversationType)
    case conversationMuted(duration: MuteDuration)
    case conversationUnmuted
    case conversationPinned
    case conversationUnpinned
    case conversationArchived
    case conversationUnarchived
    case conversationBlocked
    case conversationUnblocked
    case participantAdded(conversationType: ConversationType)
    case participantRemoved(conversationType: ConversationType)
    case conversationLeft
    case conversationInfoViewed
    case conversationMediaViewed

    var eventName: String {
        switch self {
        case .conversationCreated: return "conversation_created"
        case .conversationOpened: return "conversation_opened"
        case .conversationDeleted: return "conversation_deleted"
        case .conversationMuted: return "conversation_muted"
        case .conversationUnmuted: return "conversation_unmuted"
        case .conversationPinned: return "conversation_pinned"
        case .conversationUnpinned: return "conversation_unpinned"
        case .conversationArchived: return "conversation_archived"
        case .conversationUnarchived: return "conversation_unarchived"
        case .conversationBlocked: return "conversation_blocked"
        case .conversationUnblocked: return "conversation_unblocked"
        case .participantAdded: return "participant_added"
        case .participantRemoved: return "participant_removed"
        case .conversationLeft: return "conversation_left"
        case .conversationInfoViewed: return "conversation_info_viewed"
        case .conversationMediaViewed: return "conversation_media_viewed"
        }
    }

    var parameters: [String: Any] {
        var params: [String: Any] = [:]

        switch self {
        case .conversationCreated(let type, let participantCount):
            params["conversation_type"] = type.rawValue
            params["participant_count"] = participantCount
        case .conversationOpened(let type), .conversationDeleted(let type):
            params["conversation_type"] = type.rawValue
        case .conversationMuted(let duration):
            params["duration"] = duration.rawValue
        case .participantAdded(let type), .participantRemoved(let type):
            params["conversation_type"] = type.rawValue
        default:
            break
        }

        return params
    }

    var category: EventCategory { .conversation }
}

// Note: ConversationType is defined in Meeshy/Core/Models/Conversation.swift

enum MuteDuration: String {
    case oneHour = "1h"
    case eightHours = "8h"
    case oneWeek = "1w"
    case forever = "forever"
}

// MARK: - Call Events

enum CallEvent: AnalyticsEvent {
    case callInitiated(type: CallType, participantCount: Int)
    case callRinging
    case callAnswered(type: CallType)
    case callDeclined(type: CallType, reason: String?)
    case callEnded(type: CallType, duration: TimeInterval, endReason: CallEndReason)
    case callMissed(type: CallType)
    case callFailed(type: CallType, error: String)
    case videoToggled(enabled: Bool)
    case microphoneToggled(enabled: Bool)
    case speakerToggled(enabled: Bool)
    case participantJoined
    case participantLeft
    case screenShareStarted
    case screenShareEnded

    var eventName: String {
        switch self {
        case .callInitiated: return "call_initiated"
        case .callRinging: return "call_ringing"
        case .callAnswered: return "call_answered"
        case .callDeclined: return "call_declined"
        case .callEnded: return "call_ended"
        case .callMissed: return "call_missed"
        case .callFailed: return "call_failed"
        case .videoToggled: return "video_toggled"
        case .microphoneToggled: return "microphone_toggled"
        case .speakerToggled: return "speaker_toggled"
        case .participantJoined: return "participant_joined"
        case .participantLeft: return "participant_left"
        case .screenShareStarted: return "screen_share_started"
        case .screenShareEnded: return "screen_share_ended"
        }
    }

    var parameters: [String: Any] {
        var params: [String: Any] = [:]

        switch self {
        case .callInitiated(let type, let participantCount):
            params["call_type"] = type.rawValue
            params["participant_count"] = participantCount
        case .callAnswered(let type), .callMissed(let type):
            params["call_type"] = type.rawValue
        case .callDeclined(let type, let reason):
            params["call_type"] = type.rawValue
            if let reason = reason {
                params["reason"] = reason
            }
        case .callEnded(let type, let duration, let endReason):
            params["call_type"] = type.rawValue
            params["duration"] = duration
            params["end_reason"] = endReason.rawValue
        case .callFailed(let type, let error):
            params["call_type"] = type.rawValue
            params["error"] = error
        case .videoToggled(let enabled), .microphoneToggled(let enabled), .speakerToggled(let enabled):
            params["enabled"] = enabled
        default:
            break
        }

        return params
    }

    var category: EventCategory { .call }
}

enum CallType: String {
    case audio
    case video
    case group
}

enum CallEndReason: String {
    case userEnded = "user_ended"
    case otherUserEnded = "other_user_ended"
    case networkError = "network_error"
    case timeout = "timeout"
    case declined = "declined"
}

// MARK: - Media Events

enum MediaEvent: AnalyticsEvent {
    case photoSelected(source: MediaSource)
    case photoSent(size: Int64)
    case photoViewed
    case photoDownloaded
    case videoSelected(source: MediaSource)
    case videoSent(size: Int64, duration: TimeInterval)
    case videoViewed
    case videoDownloaded
    case documentSelected(type: String)
    case documentSent(size: Int64, type: String)
    case documentViewed(type: String)
    case documentDownloaded(type: String)
    case locationShared
    case locationViewed
    case contactShared
    case cameraOpened
    case galleryOpened

    var eventName: String {
        switch self {
        case .photoSelected: return "photo_selected"
        case .photoSent: return "photo_sent"
        case .photoViewed: return "photo_viewed"
        case .photoDownloaded: return "photo_downloaded"
        case .videoSelected: return "video_selected"
        case .videoSent: return "video_sent"
        case .videoViewed: return "video_viewed"
        case .videoDownloaded: return "video_downloaded"
        case .documentSelected: return "document_selected"
        case .documentSent: return "document_sent"
        case .documentViewed: return "document_viewed"
        case .documentDownloaded: return "document_downloaded"
        case .locationShared: return "location_shared"
        case .locationViewed: return "location_viewed"
        case .contactShared: return "contact_shared"
        case .cameraOpened: return "camera_opened"
        case .galleryOpened: return "gallery_opened"
        }
    }

    var parameters: [String: Any] {
        var params: [String: Any] = [:]

        switch self {
        case .photoSelected(let source), .videoSelected(let source):
            params["source"] = source.rawValue
        case .photoSent(let size):
            params["size_bytes"] = size
        case .videoSent(let size, let duration):
            params["size_bytes"] = size
            params["duration"] = duration
        case .documentSelected(let type), .documentViewed(let type), .documentDownloaded(let type):
            params["document_type"] = type
        case .documentSent(let size, let type):
            params["size_bytes"] = size
            params["document_type"] = type
        default:
            break
        }

        return params
    }

    var category: EventCategory { .media }
}

enum MediaSource: String {
    case camera
    case gallery
    case files
}

// MARK: - Settings Events

enum SettingsEvent: AnalyticsEvent {
    case settingsOpened
    case languageChanged(from: String, to: String)
    case themeChanged(theme: String)
    case notificationsEnabled
    case notificationsDisabled
    case notificationSoundChanged(sound: String)
    case privacySettingChanged(setting: String, value: Bool)
    case profileUpdated(field: String)
    case profilePhotoChanged
    case statusUpdated
    case backupEnabled
    case backupDisabled
    case storageCleared(size: Int64)
    case accountDeleted

    var eventName: String {
        switch self {
        case .settingsOpened: return "settings_opened"
        case .languageChanged: return "language_changed"
        case .themeChanged: return "theme_changed"
        case .notificationsEnabled: return "notifications_enabled"
        case .notificationsDisabled: return "notifications_disabled"
        case .notificationSoundChanged: return "notification_sound_changed"
        case .privacySettingChanged: return "privacy_setting_changed"
        case .profileUpdated: return "profile_updated"
        case .profilePhotoChanged: return "profile_photo_changed"
        case .statusUpdated: return "status_updated"
        case .backupEnabled: return "backup_enabled"
        case .backupDisabled: return "backup_disabled"
        case .storageCleared: return "storage_cleared"
        case .accountDeleted: return "account_deleted"
        }
    }

    var parameters: [String: Any] {
        var params: [String: Any] = [:]

        switch self {
        case .languageChanged(let from, let to):
            params["from_language"] = from
            params["to_language"] = to
        case .themeChanged(let theme):
            params["theme"] = theme
        case .notificationSoundChanged(let sound):
            params["sound"] = sound
        case .privacySettingChanged(let setting, let value):
            params["setting"] = setting
            params["value"] = value
        case .profileUpdated(let field):
            params["field"] = field
        case .storageCleared(let size):
            params["size_bytes"] = size
        default:
            break
        }

        return params
    }

    var category: EventCategory { .settings }
}

// MARK: - Error Events

enum ErrorEvent: AnalyticsEvent {
    case apiError(endpoint: String, statusCode: Int, error: String)
    case networkError(error: String, context: String)
    case syncError(type: String, error: String)
    case mediaUploadError(mediaType: String, error: String)
    case mediaDownloadError(mediaType: String, error: String)
    case databaseError(error: String)
    case authenticationError(error: String)
    case permissionDenied(permission: String)
    case crashDetected(error: String)

    var eventName: String {
        switch self {
        case .apiError: return "api_error"
        case .networkError: return "network_error"
        case .syncError: return "sync_error"
        case .mediaUploadError: return "media_upload_error"
        case .mediaDownloadError: return "media_download_error"
        case .databaseError: return "database_error"
        case .authenticationError: return "authentication_error"
        case .permissionDenied: return "permission_denied"
        case .crashDetected: return "crash_detected"
        }
    }

    var parameters: [String: Any] {
        var params: [String: Any] = [:]

        switch self {
        case .apiError(let endpoint, let statusCode, let error):
            params["endpoint"] = endpoint
            params["status_code"] = statusCode
            params["error"] = error
        case .networkError(let error, let context):
            params["error"] = error
            params["context"] = context
        case .syncError(let type, let error):
            params["sync_type"] = type
            params["error"] = error
        case .mediaUploadError(let mediaType, let error), .mediaDownloadError(let mediaType, let error):
            params["media_type"] = mediaType
            params["error"] = error
        case .databaseError(let error), .authenticationError(let error), .crashDetected(let error):
            params["error"] = error
        case .permissionDenied(let permission):
            params["permission"] = permission
        }

        return params
    }

    var category: EventCategory { .error }
}

// MARK: - Performance Events

enum PerformanceEvent: AnalyticsEvent {
    case appLaunched(coldStart: Bool, duration: TimeInterval)
    case screenLoaded(screen: String, duration: TimeInterval)
    case apiCallCompleted(endpoint: String, duration: TimeInterval, success: Bool)
    case imageLoaded(size: Int64, duration: TimeInterval)
    case databaseQuery(query: String, duration: TimeInterval, resultCount: Int)
    case syncCompleted(duration: TimeInterval, itemCount: Int)
    case memoryWarning(level: String)
    case lowBattery(percentage: Int)

    var eventName: String {
        switch self {
        case .appLaunched: return "app_launched"
        case .screenLoaded: return "screen_loaded"
        case .apiCallCompleted: return "api_call_completed"
        case .imageLoaded: return "image_loaded"
        case .databaseQuery: return "database_query"
        case .syncCompleted: return "sync_completed"
        case .memoryWarning: return "memory_warning"
        case .lowBattery: return "low_battery"
        }
    }

    var parameters: [String: Any] {
        var params: [String: Any] = [:]

        switch self {
        case .appLaunched(let coldStart, let duration):
            params["cold_start"] = coldStart
            params["duration"] = duration
        case .screenLoaded(let screen, let duration):
            params["screen"] = screen
            params["duration"] = duration
        case .apiCallCompleted(let endpoint, let duration, let success):
            params["endpoint"] = endpoint
            params["duration"] = duration
            params["success"] = success
        case .imageLoaded(let size, let duration):
            params["size_bytes"] = size
            params["duration"] = duration
        case .databaseQuery(let query, let duration, let resultCount):
            params["query_type"] = query
            params["duration"] = duration
            params["result_count"] = resultCount
        case .syncCompleted(let duration, let itemCount):
            params["duration"] = duration
            params["item_count"] = itemCount
        case .memoryWarning(let level):
            params["level"] = level
        case .lowBattery(let percentage):
            params["percentage"] = percentage
        }

        return params
    }

    var category: EventCategory { .performance }
}

// MARK: - Navigation Events

enum NavigationEvent: AnalyticsEvent {
    case screenViewed(screen: String)
    case tabChanged(from: String, to: String)
    case deepLinkOpened(url: String)
    case pushNotificationOpened(type: String)
    case searchInitiated(context: String)

    var eventName: String {
        switch self {
        case .screenViewed: return "screen_viewed"
        case .tabChanged: return "tab_changed"
        case .deepLinkOpened: return "deep_link_opened"
        case .pushNotificationOpened: return "push_notification_opened"
        case .searchInitiated: return "search_initiated"
        }
    }

    var parameters: [String: Any] {
        var params: [String: Any] = [:]

        switch self {
        case .screenViewed(let screen):
            params["screen_name"] = screen
        case .tabChanged(let from, let to):
            params["from_tab"] = from
            params["to_tab"] = to
        case .deepLinkOpened(let url):
            params["url"] = url
        case .pushNotificationOpened(let type):
            params["notification_type"] = type
        case .searchInitiated(let context):
            params["context"] = context
        }

        return params
    }

    var category: EventCategory { .navigation }
}

// MARK: - Engagement Events

enum EngagementEvent: AnalyticsEvent {
    case dailyActiveUser
    case weeklyActiveUser
    case monthlyActiveUser
    case sessionStarted
    case sessionEnded(duration: TimeInterval)
    case featureUsed(feature: String)
    case tutorialStarted
    case tutorialCompleted(step: Int)
    case tutorialSkipped(step: Int)
    case shareInvite(method: String)
    case ratingsPromptShown
    case ratingsSubmitted(rating: Int)
    case feedbackSubmitted(type: String)

    var eventName: String {
        switch self {
        case .dailyActiveUser: return "daily_active_user"
        case .weeklyActiveUser: return "weekly_active_user"
        case .monthlyActiveUser: return "monthly_active_user"
        case .sessionStarted: return "session_started"
        case .sessionEnded: return "session_ended"
        case .featureUsed: return "feature_used"
        case .tutorialStarted: return "tutorial_started"
        case .tutorialCompleted: return "tutorial_completed"
        case .tutorialSkipped: return "tutorial_skipped"
        case .shareInvite: return "share_invite"
        case .ratingsPromptShown: return "ratings_prompt_shown"
        case .ratingsSubmitted: return "ratings_submitted"
        case .feedbackSubmitted: return "feedback_submitted"
        }
    }

    var parameters: [String: Any] {
        var params: [String: Any] = [:]

        switch self {
        case .sessionEnded(let duration):
            params["duration"] = duration
        case .featureUsed(let feature):
            params["feature"] = feature
        case .tutorialCompleted(let step), .tutorialSkipped(let step):
            params["step"] = step
        case .shareInvite(let method):
            params["method"] = method
        case .ratingsSubmitted(let rating):
            params["rating"] = rating
        case .feedbackSubmitted(let type):
            params["type"] = type
        default:
            break
        }

        return params
    }

    var category: EventCategory { .engagement }
}
