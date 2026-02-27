import Foundation

// MARK: - CodableValue (type-erased JSON value for extensible preferences)

public enum CodableValue: Codable, Equatable {
    case bool(Bool)
    case int(Int)
    case double(Double)
    case string(String)
    case array([CodableValue])
    case dict([String: CodableValue])
    case null

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            self = .null
        } else if let v = try? container.decode(Bool.self) {
            self = .bool(v)
        } else if let v = try? container.decode(Int.self) {
            self = .int(v)
        } else if let v = try? container.decode(Double.self) {
            self = .double(v)
        } else if let v = try? container.decode(String.self) {
            self = .string(v)
        } else if let v = try? container.decode([CodableValue].self) {
            self = .array(v)
        } else if let v = try? container.decode([String: CodableValue].self) {
            self = .dict(v)
        } else {
            self = .null
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .bool(let v): try container.encode(v)
        case .int(let v): try container.encode(v)
        case .double(let v): try container.encode(v)
        case .string(let v): try container.encode(v)
        case .array(let v): try container.encode(v)
        case .dict(let v): try container.encode(v)
        case .null: try container.encodeNil()
        }
    }

    public var boolValue: Bool? { if case .bool(let v) = self { return v }; return nil }
    public var intValue: Int? { if case .int(let v) = self { return v }; return nil }
    public var doubleValue: Double? { if case .double(let v) = self { return v }; return nil }
    public var stringValue: String? { if case .string(let v) = self { return v }; return nil }
}

// MARK: - Preference Category

public enum PreferenceCategory: String, CaseIterable, Codable {
    case privacy, audio, message, notification, video, document, application
}

// MARK: - Enums

public enum EncryptionPreference: String, Codable, CaseIterable {
    case disabled, optional, always
}

public enum AudioQuality: String, Codable, CaseIterable {
    case low, medium, high, lossless
}

public enum TranscriptionSource: String, Codable, CaseIterable {
    case auto, mobile, server
}

public enum TranslatedAudioFormat: String, Codable, CaseIterable {
    case mp3, wav, ogg
}

public enum VoiceCloneQuality: String, Codable, CaseIterable {
    case fast, balanced, quality
}

public enum VideoQuality: String, Codable, CaseIterable {
    case low, medium, high, auto
}

public enum VideoFrameRate: String, Codable, CaseIterable {
    case fps15 = "15"
    case fps24 = "24"
    case fps30 = "30"
    case fps60 = "60"
}

public enum VideoResolution: String, Codable, CaseIterable {
    case r480p = "480p"
    case r720p = "720p"
    case r1080p = "1080p"
    case auto
}

public enum VideoCodec: String, Codable, CaseIterable {
    case vp8 = "VP8"
    case vp9 = "VP9"
    case h264 = "H264"
    case h265 = "H265"
    case av1 = "AV1"
}

public enum VideoLayout: String, Codable, CaseIterable {
    case grid, speaker, sidebar
}

public enum SelfViewPosition: String, Codable, CaseIterable {
    case topLeft = "top-left"
    case topRight = "top-right"
    case bottomLeft = "bottom-left"
    case bottomRight = "bottom-right"
}

public enum EmojiSkinTone: String, Codable, CaseIterable {
    case `default`, light, mediumLight = "medium-light", medium, mediumDark = "medium-dark", dark
}

public enum FontSize: String, Codable, CaseIterable {
    case small, medium, large
}

public enum TextAlign: String, Codable, CaseIterable {
    case left, center, right
}

public enum AppThemeMode: String, Codable, CaseIterable {
    case light, dark, auto
}

public enum LineHeight: String, Codable, CaseIterable {
    case tight, normal, relaxed, loose
}

public enum SidebarPosition: String, Codable, CaseIterable {
    case left, right
}

public enum DndDay: String, Codable, CaseIterable {
    case mon, tue, wed, thu, fri, sat, sun
}

// MARK: - Privacy Preferences

public struct PrivacyPreferences: Codable, Equatable {
    public var showOnlineStatus: Bool
    public var showLastSeen: Bool
    public var showReadReceipts: Bool
    public var showTypingIndicator: Bool
    public var allowContactRequests: Bool
    public var allowGroupInvites: Bool
    public var allowCallsFromNonContacts: Bool
    public var saveMediaToGallery: Bool
    public var allowAnalytics: Bool
    public var shareUsageData: Bool
    public var blockScreenshots: Bool
    public var hideProfileFromSearch: Bool
    public var encryptionPreference: EncryptionPreference
    public var autoEncryptNewConversations: Bool
    public var showEncryptionStatus: Bool
    public var warnOnUnencrypted: Bool
    public var extras: [String: CodableValue]

    public static let defaults = PrivacyPreferences(
        showOnlineStatus: true, showLastSeen: true, showReadReceipts: true,
        showTypingIndicator: true, allowContactRequests: true, allowGroupInvites: true,
        allowCallsFromNonContacts: false, saveMediaToGallery: false, allowAnalytics: true,
        shareUsageData: false, blockScreenshots: false, hideProfileFromSearch: false,
        encryptionPreference: .optional, autoEncryptNewConversations: false,
        showEncryptionStatus: true, warnOnUnencrypted: false, extras: [:]
    )

    public init(
        showOnlineStatus: Bool = true, showLastSeen: Bool = true, showReadReceipts: Bool = true,
        showTypingIndicator: Bool = true, allowContactRequests: Bool = true, allowGroupInvites: Bool = true,
        allowCallsFromNonContacts: Bool = false, saveMediaToGallery: Bool = false, allowAnalytics: Bool = true,
        shareUsageData: Bool = false, blockScreenshots: Bool = false, hideProfileFromSearch: Bool = false,
        encryptionPreference: EncryptionPreference = .optional, autoEncryptNewConversations: Bool = false,
        showEncryptionStatus: Bool = true, warnOnUnencrypted: Bool = false, extras: [String: CodableValue] = [:]
    ) {
        self.showOnlineStatus = showOnlineStatus; self.showLastSeen = showLastSeen
        self.showReadReceipts = showReadReceipts; self.showTypingIndicator = showTypingIndicator
        self.allowContactRequests = allowContactRequests; self.allowGroupInvites = allowGroupInvites
        self.allowCallsFromNonContacts = allowCallsFromNonContacts; self.saveMediaToGallery = saveMediaToGallery
        self.allowAnalytics = allowAnalytics; self.shareUsageData = shareUsageData
        self.blockScreenshots = blockScreenshots; self.hideProfileFromSearch = hideProfileFromSearch
        self.encryptionPreference = encryptionPreference; self.autoEncryptNewConversations = autoEncryptNewConversations
        self.showEncryptionStatus = showEncryptionStatus; self.warnOnUnencrypted = warnOnUnencrypted
        self.extras = extras
    }

    enum CodingKeys: String, CodingKey {
        case showOnlineStatus, showLastSeen, showReadReceipts, showTypingIndicator
        case allowContactRequests, allowGroupInvites, allowCallsFromNonContacts
        case saveMediaToGallery, allowAnalytics, shareUsageData
        case blockScreenshots, hideProfileFromSearch
        case encryptionPreference, autoEncryptNewConversations, showEncryptionStatus, warnOnUnencrypted
        case extras
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        showOnlineStatus = try c.decodeIfPresent(Bool.self, forKey: .showOnlineStatus) ?? Self.defaults.showOnlineStatus
        showLastSeen = try c.decodeIfPresent(Bool.self, forKey: .showLastSeen) ?? Self.defaults.showLastSeen
        showReadReceipts = try c.decodeIfPresent(Bool.self, forKey: .showReadReceipts) ?? Self.defaults.showReadReceipts
        showTypingIndicator = try c.decodeIfPresent(Bool.self, forKey: .showTypingIndicator) ?? Self.defaults.showTypingIndicator
        allowContactRequests = try c.decodeIfPresent(Bool.self, forKey: .allowContactRequests) ?? Self.defaults.allowContactRequests
        allowGroupInvites = try c.decodeIfPresent(Bool.self, forKey: .allowGroupInvites) ?? Self.defaults.allowGroupInvites
        allowCallsFromNonContacts = try c.decodeIfPresent(Bool.self, forKey: .allowCallsFromNonContacts) ?? Self.defaults.allowCallsFromNonContacts
        saveMediaToGallery = try c.decodeIfPresent(Bool.self, forKey: .saveMediaToGallery) ?? Self.defaults.saveMediaToGallery
        allowAnalytics = try c.decodeIfPresent(Bool.self, forKey: .allowAnalytics) ?? Self.defaults.allowAnalytics
        shareUsageData = try c.decodeIfPresent(Bool.self, forKey: .shareUsageData) ?? Self.defaults.shareUsageData
        blockScreenshots = try c.decodeIfPresent(Bool.self, forKey: .blockScreenshots) ?? Self.defaults.blockScreenshots
        hideProfileFromSearch = try c.decodeIfPresent(Bool.self, forKey: .hideProfileFromSearch) ?? Self.defaults.hideProfileFromSearch
        encryptionPreference = try c.decodeIfPresent(EncryptionPreference.self, forKey: .encryptionPreference) ?? Self.defaults.encryptionPreference
        autoEncryptNewConversations = try c.decodeIfPresent(Bool.self, forKey: .autoEncryptNewConversations) ?? Self.defaults.autoEncryptNewConversations
        showEncryptionStatus = try c.decodeIfPresent(Bool.self, forKey: .showEncryptionStatus) ?? Self.defaults.showEncryptionStatus
        warnOnUnencrypted = try c.decodeIfPresent(Bool.self, forKey: .warnOnUnencrypted) ?? Self.defaults.warnOnUnencrypted
        extras = try c.decodeIfPresent([String: CodableValue].self, forKey: .extras) ?? [:]
    }
}

// MARK: - Audio Preferences

public struct AudioPreferences: Codable, Equatable {
    public var transcriptionEnabled: Bool
    public var transcriptionSource: TranscriptionSource
    public var autoTranscribeIncoming: Bool
    public var audioTranslationEnabled: Bool
    public var translatedAudioFormat: TranslatedAudioFormat
    public var ttsEnabled: Bool
    public var ttsVoice: String?
    public var ttsSpeed: Double
    public var ttsPitch: Double
    public var audioQuality: AudioQuality
    public var noiseSuppression: Bool
    public var echoCancellation: Bool
    public var voiceProfileEnabled: Bool
    public var voiceCloneQuality: VoiceCloneQuality
    public var extras: [String: CodableValue]

    public static let defaults = AudioPreferences(
        transcriptionEnabled: true, transcriptionSource: .auto, autoTranscribeIncoming: false,
        audioTranslationEnabled: false, translatedAudioFormat: .mp3,
        ttsEnabled: false, ttsVoice: nil, ttsSpeed: 1.0, ttsPitch: 1.0,
        audioQuality: .high, noiseSuppression: true, echoCancellation: true,
        voiceProfileEnabled: false, voiceCloneQuality: .balanced, extras: [:]
    )

    public init(
        transcriptionEnabled: Bool = true, transcriptionSource: TranscriptionSource = .auto,
        autoTranscribeIncoming: Bool = false, audioTranslationEnabled: Bool = false,
        translatedAudioFormat: TranslatedAudioFormat = .mp3,
        ttsEnabled: Bool = false, ttsVoice: String? = nil, ttsSpeed: Double = 1.0, ttsPitch: Double = 1.0,
        audioQuality: AudioQuality = .high, noiseSuppression: Bool = true, echoCancellation: Bool = true,
        voiceProfileEnabled: Bool = false, voiceCloneQuality: VoiceCloneQuality = .balanced,
        extras: [String: CodableValue] = [:]
    ) {
        self.transcriptionEnabled = transcriptionEnabled; self.transcriptionSource = transcriptionSource
        self.autoTranscribeIncoming = autoTranscribeIncoming; self.audioTranslationEnabled = audioTranslationEnabled
        self.translatedAudioFormat = translatedAudioFormat; self.ttsEnabled = ttsEnabled
        self.ttsVoice = ttsVoice; self.ttsSpeed = ttsSpeed; self.ttsPitch = ttsPitch
        self.audioQuality = audioQuality; self.noiseSuppression = noiseSuppression
        self.echoCancellation = echoCancellation; self.voiceProfileEnabled = voiceProfileEnabled
        self.voiceCloneQuality = voiceCloneQuality; self.extras = extras
    }

    enum CodingKeys: String, CodingKey {
        case transcriptionEnabled, transcriptionSource, autoTranscribeIncoming
        case audioTranslationEnabled, translatedAudioFormat
        case ttsEnabled, ttsVoice, ttsSpeed, ttsPitch
        case audioQuality, noiseSuppression, echoCancellation
        case voiceProfileEnabled, voiceCloneQuality, extras
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        transcriptionEnabled = try c.decodeIfPresent(Bool.self, forKey: .transcriptionEnabled) ?? Self.defaults.transcriptionEnabled
        transcriptionSource = try c.decodeIfPresent(TranscriptionSource.self, forKey: .transcriptionSource) ?? Self.defaults.transcriptionSource
        autoTranscribeIncoming = try c.decodeIfPresent(Bool.self, forKey: .autoTranscribeIncoming) ?? Self.defaults.autoTranscribeIncoming
        audioTranslationEnabled = try c.decodeIfPresent(Bool.self, forKey: .audioTranslationEnabled) ?? Self.defaults.audioTranslationEnabled
        translatedAudioFormat = try c.decodeIfPresent(TranslatedAudioFormat.self, forKey: .translatedAudioFormat) ?? Self.defaults.translatedAudioFormat
        ttsEnabled = try c.decodeIfPresent(Bool.self, forKey: .ttsEnabled) ?? Self.defaults.ttsEnabled
        ttsVoice = try c.decodeIfPresent(String.self, forKey: .ttsVoice)
        ttsSpeed = try c.decodeIfPresent(Double.self, forKey: .ttsSpeed) ?? Self.defaults.ttsSpeed
        ttsPitch = try c.decodeIfPresent(Double.self, forKey: .ttsPitch) ?? Self.defaults.ttsPitch
        audioQuality = try c.decodeIfPresent(AudioQuality.self, forKey: .audioQuality) ?? Self.defaults.audioQuality
        noiseSuppression = try c.decodeIfPresent(Bool.self, forKey: .noiseSuppression) ?? Self.defaults.noiseSuppression
        echoCancellation = try c.decodeIfPresent(Bool.self, forKey: .echoCancellation) ?? Self.defaults.echoCancellation
        voiceProfileEnabled = try c.decodeIfPresent(Bool.self, forKey: .voiceProfileEnabled) ?? Self.defaults.voiceProfileEnabled
        voiceCloneQuality = try c.decodeIfPresent(VoiceCloneQuality.self, forKey: .voiceCloneQuality) ?? Self.defaults.voiceCloneQuality
        extras = try c.decodeIfPresent([String: CodableValue].self, forKey: .extras) ?? [:]
    }
}

// MARK: - Message Preferences

public struct MessagePreferences: Codable, Equatable {
    public var sendOnEnter: Bool
    public var showFormattingToolbar: Bool
    public var enableMarkdown: Bool
    public var enableEmoji: Bool
    public var emojiSkinTone: EmojiSkinTone
    public var autoCorrectEnabled: Bool
    public var spellCheckEnabled: Bool
    public var linkPreviewEnabled: Bool
    public var imagePreviewEnabled: Bool
    public var saveDrafts: Bool
    public var draftExpirationDays: Int
    public var defaultFontSize: FontSize
    public var defaultTextAlign: TextAlign
    public var autoTranslateIncoming: Bool
    public var autoTranslateLanguages: [String]
    public var maxCharacterLimit: Int
    public var extras: [String: CodableValue]

    public static let defaults = MessagePreferences(
        sendOnEnter: true, showFormattingToolbar: true, enableMarkdown: true, enableEmoji: true,
        emojiSkinTone: .default, autoCorrectEnabled: false, spellCheckEnabled: true,
        linkPreviewEnabled: true, imagePreviewEnabled: true, saveDrafts: true,
        draftExpirationDays: 30, defaultFontSize: .medium, defaultTextAlign: .left,
        autoTranslateIncoming: false, autoTranslateLanguages: [], maxCharacterLimit: 5000, extras: [:]
    )

    public init(
        sendOnEnter: Bool = true, showFormattingToolbar: Bool = true, enableMarkdown: Bool = true,
        enableEmoji: Bool = true, emojiSkinTone: EmojiSkinTone = .default,
        autoCorrectEnabled: Bool = false, spellCheckEnabled: Bool = true,
        linkPreviewEnabled: Bool = true, imagePreviewEnabled: Bool = true,
        saveDrafts: Bool = true, draftExpirationDays: Int = 30,
        defaultFontSize: FontSize = .medium, defaultTextAlign: TextAlign = .left,
        autoTranslateIncoming: Bool = false, autoTranslateLanguages: [String] = [],
        maxCharacterLimit: Int = 5000, extras: [String: CodableValue] = [:]
    ) {
        self.sendOnEnter = sendOnEnter; self.showFormattingToolbar = showFormattingToolbar
        self.enableMarkdown = enableMarkdown; self.enableEmoji = enableEmoji
        self.emojiSkinTone = emojiSkinTone; self.autoCorrectEnabled = autoCorrectEnabled
        self.spellCheckEnabled = spellCheckEnabled; self.linkPreviewEnabled = linkPreviewEnabled
        self.imagePreviewEnabled = imagePreviewEnabled; self.saveDrafts = saveDrafts
        self.draftExpirationDays = draftExpirationDays; self.defaultFontSize = defaultFontSize
        self.defaultTextAlign = defaultTextAlign; self.autoTranslateIncoming = autoTranslateIncoming
        self.autoTranslateLanguages = autoTranslateLanguages; self.maxCharacterLimit = maxCharacterLimit
        self.extras = extras
    }

    enum CodingKeys: String, CodingKey {
        case sendOnEnter, showFormattingToolbar, enableMarkdown, enableEmoji, emojiSkinTone
        case autoCorrectEnabled, spellCheckEnabled, linkPreviewEnabled, imagePreviewEnabled
        case saveDrafts, draftExpirationDays, defaultFontSize, defaultTextAlign
        case autoTranslateIncoming, autoTranslateLanguages, maxCharacterLimit, extras
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        sendOnEnter = try c.decodeIfPresent(Bool.self, forKey: .sendOnEnter) ?? Self.defaults.sendOnEnter
        showFormattingToolbar = try c.decodeIfPresent(Bool.self, forKey: .showFormattingToolbar) ?? Self.defaults.showFormattingToolbar
        enableMarkdown = try c.decodeIfPresent(Bool.self, forKey: .enableMarkdown) ?? Self.defaults.enableMarkdown
        enableEmoji = try c.decodeIfPresent(Bool.self, forKey: .enableEmoji) ?? Self.defaults.enableEmoji
        emojiSkinTone = try c.decodeIfPresent(EmojiSkinTone.self, forKey: .emojiSkinTone) ?? Self.defaults.emojiSkinTone
        autoCorrectEnabled = try c.decodeIfPresent(Bool.self, forKey: .autoCorrectEnabled) ?? Self.defaults.autoCorrectEnabled
        spellCheckEnabled = try c.decodeIfPresent(Bool.self, forKey: .spellCheckEnabled) ?? Self.defaults.spellCheckEnabled
        linkPreviewEnabled = try c.decodeIfPresent(Bool.self, forKey: .linkPreviewEnabled) ?? Self.defaults.linkPreviewEnabled
        imagePreviewEnabled = try c.decodeIfPresent(Bool.self, forKey: .imagePreviewEnabled) ?? Self.defaults.imagePreviewEnabled
        saveDrafts = try c.decodeIfPresent(Bool.self, forKey: .saveDrafts) ?? Self.defaults.saveDrafts
        draftExpirationDays = try c.decodeIfPresent(Int.self, forKey: .draftExpirationDays) ?? Self.defaults.draftExpirationDays
        defaultFontSize = try c.decodeIfPresent(FontSize.self, forKey: .defaultFontSize) ?? Self.defaults.defaultFontSize
        defaultTextAlign = try c.decodeIfPresent(TextAlign.self, forKey: .defaultTextAlign) ?? Self.defaults.defaultTextAlign
        autoTranslateIncoming = try c.decodeIfPresent(Bool.self, forKey: .autoTranslateIncoming) ?? Self.defaults.autoTranslateIncoming
        autoTranslateLanguages = try c.decodeIfPresent([String].self, forKey: .autoTranslateLanguages) ?? Self.defaults.autoTranslateLanguages
        maxCharacterLimit = try c.decodeIfPresent(Int.self, forKey: .maxCharacterLimit) ?? Self.defaults.maxCharacterLimit
        extras = try c.decodeIfPresent([String: CodableValue].self, forKey: .extras) ?? [:]
    }
}

// MARK: - Notification Preferences

public struct UserNotificationPreferences: Codable, Equatable {
    public var pushEnabled: Bool
    public var emailEnabled: Bool
    public var soundEnabled: Bool
    public var vibrationEnabled: Bool
    public var newMessageEnabled: Bool
    public var missedCallEnabled: Bool
    public var voicemailEnabled: Bool
    public var systemEnabled: Bool
    public var conversationEnabled: Bool
    public var replyEnabled: Bool
    public var mentionEnabled: Bool
    public var reactionEnabled: Bool
    public var contactRequestEnabled: Bool
    public var groupInviteEnabled: Bool
    public var memberJoinedEnabled: Bool
    public var memberLeftEnabled: Bool
    public var postLikeEnabled: Bool
    public var postCommentEnabled: Bool
    public var postRepostEnabled: Bool
    public var storyReactionEnabled: Bool
    public var commentReplyEnabled: Bool
    public var commentLikeEnabled: Bool
    public var dndEnabled: Bool
    public var dndStartTime: String
    public var dndEndTime: String
    public var dndDays: [DndDay]
    public var showPreview: Bool
    public var showSenderName: Bool
    public var groupNotifications: Bool
    public var notificationBadgeEnabled: Bool
    public var extras: [String: CodableValue]

    public static let defaults = UserNotificationPreferences(
        pushEnabled: true, emailEnabled: true, soundEnabled: true, vibrationEnabled: true,
        newMessageEnabled: true, missedCallEnabled: true, voicemailEnabled: true, systemEnabled: true,
        conversationEnabled: true, replyEnabled: true, mentionEnabled: true, reactionEnabled: true,
        contactRequestEnabled: true, groupInviteEnabled: true, memberJoinedEnabled: true, memberLeftEnabled: false,
        postLikeEnabled: true, postCommentEnabled: true, postRepostEnabled: true, storyReactionEnabled: true,
        commentReplyEnabled: true, commentLikeEnabled: false,
        dndEnabled: false, dndStartTime: "22:00", dndEndTime: "08:00", dndDays: [],
        showPreview: true, showSenderName: true, groupNotifications: true, notificationBadgeEnabled: true,
        extras: [:]
    )

    public init(
        pushEnabled: Bool = true, emailEnabled: Bool = true, soundEnabled: Bool = true, vibrationEnabled: Bool = true,
        newMessageEnabled: Bool = true, missedCallEnabled: Bool = true, voicemailEnabled: Bool = true,
        systemEnabled: Bool = true, conversationEnabled: Bool = true, replyEnabled: Bool = true,
        mentionEnabled: Bool = true, reactionEnabled: Bool = true, contactRequestEnabled: Bool = true,
        groupInviteEnabled: Bool = true, memberJoinedEnabled: Bool = true, memberLeftEnabled: Bool = false,
        postLikeEnabled: Bool = true, postCommentEnabled: Bool = true, postRepostEnabled: Bool = true,
        storyReactionEnabled: Bool = true, commentReplyEnabled: Bool = true, commentLikeEnabled: Bool = false,
        dndEnabled: Bool = false, dndStartTime: String = "22:00", dndEndTime: String = "08:00", dndDays: [DndDay] = [],
        showPreview: Bool = true, showSenderName: Bool = true, groupNotifications: Bool = true,
        notificationBadgeEnabled: Bool = true, extras: [String: CodableValue] = [:]
    ) {
        self.pushEnabled = pushEnabled; self.emailEnabled = emailEnabled
        self.soundEnabled = soundEnabled; self.vibrationEnabled = vibrationEnabled
        self.newMessageEnabled = newMessageEnabled; self.missedCallEnabled = missedCallEnabled
        self.voicemailEnabled = voicemailEnabled; self.systemEnabled = systemEnabled
        self.conversationEnabled = conversationEnabled; self.replyEnabled = replyEnabled
        self.mentionEnabled = mentionEnabled; self.reactionEnabled = reactionEnabled
        self.contactRequestEnabled = contactRequestEnabled; self.groupInviteEnabled = groupInviteEnabled
        self.memberJoinedEnabled = memberJoinedEnabled; self.memberLeftEnabled = memberLeftEnabled
        self.postLikeEnabled = postLikeEnabled; self.postCommentEnabled = postCommentEnabled
        self.postRepostEnabled = postRepostEnabled; self.storyReactionEnabled = storyReactionEnabled
        self.commentReplyEnabled = commentReplyEnabled; self.commentLikeEnabled = commentLikeEnabled
        self.dndEnabled = dndEnabled; self.dndStartTime = dndStartTime; self.dndEndTime = dndEndTime
        self.dndDays = dndDays; self.showPreview = showPreview; self.showSenderName = showSenderName
        self.groupNotifications = groupNotifications; self.notificationBadgeEnabled = notificationBadgeEnabled
        self.extras = extras
    }

    enum CodingKeys: String, CodingKey {
        case pushEnabled, emailEnabled, soundEnabled, vibrationEnabled
        case newMessageEnabled, missedCallEnabled, voicemailEnabled, systemEnabled
        case conversationEnabled, replyEnabled, mentionEnabled, reactionEnabled
        case contactRequestEnabled, groupInviteEnabled, memberJoinedEnabled, memberLeftEnabled
        case postLikeEnabled, postCommentEnabled, postRepostEnabled, storyReactionEnabled
        case commentReplyEnabled, commentLikeEnabled
        case dndEnabled, dndStartTime, dndEndTime, dndDays
        case showPreview, showSenderName, groupNotifications, notificationBadgeEnabled
        case extras
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        pushEnabled = try c.decodeIfPresent(Bool.self, forKey: .pushEnabled) ?? Self.defaults.pushEnabled
        emailEnabled = try c.decodeIfPresent(Bool.self, forKey: .emailEnabled) ?? Self.defaults.emailEnabled
        soundEnabled = try c.decodeIfPresent(Bool.self, forKey: .soundEnabled) ?? Self.defaults.soundEnabled
        vibrationEnabled = try c.decodeIfPresent(Bool.self, forKey: .vibrationEnabled) ?? Self.defaults.vibrationEnabled
        newMessageEnabled = try c.decodeIfPresent(Bool.self, forKey: .newMessageEnabled) ?? Self.defaults.newMessageEnabled
        missedCallEnabled = try c.decodeIfPresent(Bool.self, forKey: .missedCallEnabled) ?? Self.defaults.missedCallEnabled
        voicemailEnabled = try c.decodeIfPresent(Bool.self, forKey: .voicemailEnabled) ?? Self.defaults.voicemailEnabled
        systemEnabled = try c.decodeIfPresent(Bool.self, forKey: .systemEnabled) ?? Self.defaults.systemEnabled
        conversationEnabled = try c.decodeIfPresent(Bool.self, forKey: .conversationEnabled) ?? Self.defaults.conversationEnabled
        replyEnabled = try c.decodeIfPresent(Bool.self, forKey: .replyEnabled) ?? Self.defaults.replyEnabled
        mentionEnabled = try c.decodeIfPresent(Bool.self, forKey: .mentionEnabled) ?? Self.defaults.mentionEnabled
        reactionEnabled = try c.decodeIfPresent(Bool.self, forKey: .reactionEnabled) ?? Self.defaults.reactionEnabled
        contactRequestEnabled = try c.decodeIfPresent(Bool.self, forKey: .contactRequestEnabled) ?? Self.defaults.contactRequestEnabled
        groupInviteEnabled = try c.decodeIfPresent(Bool.self, forKey: .groupInviteEnabled) ?? Self.defaults.groupInviteEnabled
        memberJoinedEnabled = try c.decodeIfPresent(Bool.self, forKey: .memberJoinedEnabled) ?? Self.defaults.memberJoinedEnabled
        memberLeftEnabled = try c.decodeIfPresent(Bool.self, forKey: .memberLeftEnabled) ?? Self.defaults.memberLeftEnabled
        postLikeEnabled = try c.decodeIfPresent(Bool.self, forKey: .postLikeEnabled) ?? Self.defaults.postLikeEnabled
        postCommentEnabled = try c.decodeIfPresent(Bool.self, forKey: .postCommentEnabled) ?? Self.defaults.postCommentEnabled
        postRepostEnabled = try c.decodeIfPresent(Bool.self, forKey: .postRepostEnabled) ?? Self.defaults.postRepostEnabled
        storyReactionEnabled = try c.decodeIfPresent(Bool.self, forKey: .storyReactionEnabled) ?? Self.defaults.storyReactionEnabled
        commentReplyEnabled = try c.decodeIfPresent(Bool.self, forKey: .commentReplyEnabled) ?? Self.defaults.commentReplyEnabled
        commentLikeEnabled = try c.decodeIfPresent(Bool.self, forKey: .commentLikeEnabled) ?? Self.defaults.commentLikeEnabled
        dndEnabled = try c.decodeIfPresent(Bool.self, forKey: .dndEnabled) ?? Self.defaults.dndEnabled
        dndStartTime = try c.decodeIfPresent(String.self, forKey: .dndStartTime) ?? Self.defaults.dndStartTime
        dndEndTime = try c.decodeIfPresent(String.self, forKey: .dndEndTime) ?? Self.defaults.dndEndTime
        dndDays = try c.decodeIfPresent([DndDay].self, forKey: .dndDays) ?? Self.defaults.dndDays
        showPreview = try c.decodeIfPresent(Bool.self, forKey: .showPreview) ?? Self.defaults.showPreview
        showSenderName = try c.decodeIfPresent(Bool.self, forKey: .showSenderName) ?? Self.defaults.showSenderName
        groupNotifications = try c.decodeIfPresent(Bool.self, forKey: .groupNotifications) ?? Self.defaults.groupNotifications
        notificationBadgeEnabled = try c.decodeIfPresent(Bool.self, forKey: .notificationBadgeEnabled) ?? Self.defaults.notificationBadgeEnabled
        extras = try c.decodeIfPresent([String: CodableValue].self, forKey: .extras) ?? [:]
    }
}

// MARK: - Video Preferences

public struct VideoPreferences: Codable, Equatable {
    public var videoQuality: VideoQuality
    public var videoBitrate: Int?
    public var videoFrameRate: VideoFrameRate
    public var videoResolution: VideoResolution
    public var videoCodec: VideoCodec
    public var defaultCamera: String?
    public var mirrorLocalVideo: Bool
    public var videoLayout: VideoLayout
    public var showSelfView: Bool
    public var selfViewPosition: SelfViewPosition
    public var backgroundBlurEnabled: Bool
    public var virtualBackgroundEnabled: Bool
    public var virtualBackgroundUrl: String?
    public var hardwareAccelerationEnabled: Bool
    public var adaptiveBitrateEnabled: Bool
    public var autoStartVideo: Bool
    public var autoMuteOnJoin: Bool
    public var extras: [String: CodableValue]

    public static let defaults = VideoPreferences(
        videoQuality: .auto, videoBitrate: nil, videoFrameRate: .fps30, videoResolution: .auto,
        videoCodec: .vp8, defaultCamera: nil, mirrorLocalVideo: true,
        videoLayout: .speaker, showSelfView: true, selfViewPosition: .bottomRight,
        backgroundBlurEnabled: false, virtualBackgroundEnabled: false, virtualBackgroundUrl: nil,
        hardwareAccelerationEnabled: true, adaptiveBitrateEnabled: true,
        autoStartVideo: true, autoMuteOnJoin: false, extras: [:]
    )

    public init(
        videoQuality: VideoQuality = .auto, videoBitrate: Int? = nil, videoFrameRate: VideoFrameRate = .fps30,
        videoResolution: VideoResolution = .auto, videoCodec: VideoCodec = .vp8,
        defaultCamera: String? = nil, mirrorLocalVideo: Bool = true,
        videoLayout: VideoLayout = .speaker, showSelfView: Bool = true, selfViewPosition: SelfViewPosition = .bottomRight,
        backgroundBlurEnabled: Bool = false, virtualBackgroundEnabled: Bool = false, virtualBackgroundUrl: String? = nil,
        hardwareAccelerationEnabled: Bool = true, adaptiveBitrateEnabled: Bool = true,
        autoStartVideo: Bool = true, autoMuteOnJoin: Bool = false, extras: [String: CodableValue] = [:]
    ) {
        self.videoQuality = videoQuality; self.videoBitrate = videoBitrate
        self.videoFrameRate = videoFrameRate; self.videoResolution = videoResolution
        self.videoCodec = videoCodec; self.defaultCamera = defaultCamera
        self.mirrorLocalVideo = mirrorLocalVideo; self.videoLayout = videoLayout
        self.showSelfView = showSelfView; self.selfViewPosition = selfViewPosition
        self.backgroundBlurEnabled = backgroundBlurEnabled; self.virtualBackgroundEnabled = virtualBackgroundEnabled
        self.virtualBackgroundUrl = virtualBackgroundUrl
        self.hardwareAccelerationEnabled = hardwareAccelerationEnabled; self.adaptiveBitrateEnabled = adaptiveBitrateEnabled
        self.autoStartVideo = autoStartVideo; self.autoMuteOnJoin = autoMuteOnJoin; self.extras = extras
    }

    enum CodingKeys: String, CodingKey {
        case videoQuality, videoBitrate, videoFrameRate, videoResolution, videoCodec
        case defaultCamera, mirrorLocalVideo, videoLayout, showSelfView, selfViewPosition
        case backgroundBlurEnabled, virtualBackgroundEnabled, virtualBackgroundUrl
        case hardwareAccelerationEnabled, adaptiveBitrateEnabled, autoStartVideo, autoMuteOnJoin
        case extras
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        videoQuality = try c.decodeIfPresent(VideoQuality.self, forKey: .videoQuality) ?? Self.defaults.videoQuality
        videoBitrate = try c.decodeIfPresent(Int.self, forKey: .videoBitrate)
        videoFrameRate = try c.decodeIfPresent(VideoFrameRate.self, forKey: .videoFrameRate) ?? Self.defaults.videoFrameRate
        videoResolution = try c.decodeIfPresent(VideoResolution.self, forKey: .videoResolution) ?? Self.defaults.videoResolution
        videoCodec = try c.decodeIfPresent(VideoCodec.self, forKey: .videoCodec) ?? Self.defaults.videoCodec
        defaultCamera = try c.decodeIfPresent(String.self, forKey: .defaultCamera)
        mirrorLocalVideo = try c.decodeIfPresent(Bool.self, forKey: .mirrorLocalVideo) ?? Self.defaults.mirrorLocalVideo
        videoLayout = try c.decodeIfPresent(VideoLayout.self, forKey: .videoLayout) ?? Self.defaults.videoLayout
        showSelfView = try c.decodeIfPresent(Bool.self, forKey: .showSelfView) ?? Self.defaults.showSelfView
        selfViewPosition = try c.decodeIfPresent(SelfViewPosition.self, forKey: .selfViewPosition) ?? Self.defaults.selfViewPosition
        backgroundBlurEnabled = try c.decodeIfPresent(Bool.self, forKey: .backgroundBlurEnabled) ?? Self.defaults.backgroundBlurEnabled
        virtualBackgroundEnabled = try c.decodeIfPresent(Bool.self, forKey: .virtualBackgroundEnabled) ?? Self.defaults.virtualBackgroundEnabled
        virtualBackgroundUrl = try c.decodeIfPresent(String.self, forKey: .virtualBackgroundUrl)
        hardwareAccelerationEnabled = try c.decodeIfPresent(Bool.self, forKey: .hardwareAccelerationEnabled) ?? Self.defaults.hardwareAccelerationEnabled
        adaptiveBitrateEnabled = try c.decodeIfPresent(Bool.self, forKey: .adaptiveBitrateEnabled) ?? Self.defaults.adaptiveBitrateEnabled
        autoStartVideo = try c.decodeIfPresent(Bool.self, forKey: .autoStartVideo) ?? Self.defaults.autoStartVideo
        autoMuteOnJoin = try c.decodeIfPresent(Bool.self, forKey: .autoMuteOnJoin) ?? Self.defaults.autoMuteOnJoin
        extras = try c.decodeIfPresent([String: CodableValue].self, forKey: .extras) ?? [:]
    }
}

// MARK: - Document Preferences

public struct DocumentPreferences: Codable, Equatable {
    public var autoDownloadEnabled: Bool
    public var autoDownloadOnWifi: Bool
    public var autoDownloadMaxSize: Int
    public var downloadPath: String?
    public var inlinePreviewEnabled: Bool
    public var previewPdfEnabled: Bool
    public var previewImagesEnabled: Bool
    public var previewVideosEnabled: Bool
    public var storageQuota: Int
    public var autoDeleteOldFiles: Bool
    public var fileRetentionDays: Int
    public var compressImagesOnUpload: Bool
    public var imageCompressionQuality: Int
    public var allowedFileTypes: [String]
    public var scanFilesForMalware: Bool
    public var allowExternalLinks: Bool
    public var extras: [String: CodableValue]

    public static let defaults = DocumentPreferences(
        autoDownloadEnabled: false, autoDownloadOnWifi: true, autoDownloadMaxSize: 10, downloadPath: nil,
        inlinePreviewEnabled: true, previewPdfEnabled: true, previewImagesEnabled: true, previewVideosEnabled: true,
        storageQuota: 5000, autoDeleteOldFiles: false, fileRetentionDays: 90,
        compressImagesOnUpload: false, imageCompressionQuality: 85,
        allowedFileTypes: ["image/*", "video/*", "audio/*", "application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.*"],
        scanFilesForMalware: true, allowExternalLinks: true, extras: [:]
    )

    public init(
        autoDownloadEnabled: Bool = false, autoDownloadOnWifi: Bool = true, autoDownloadMaxSize: Int = 10,
        downloadPath: String? = nil, inlinePreviewEnabled: Bool = true, previewPdfEnabled: Bool = true,
        previewImagesEnabled: Bool = true, previewVideosEnabled: Bool = true,
        storageQuota: Int = 5000, autoDeleteOldFiles: Bool = false, fileRetentionDays: Int = 90,
        compressImagesOnUpload: Bool = false, imageCompressionQuality: Int = 85,
        allowedFileTypes: [String] = ["image/*", "video/*", "audio/*", "application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.*"],
        scanFilesForMalware: Bool = true, allowExternalLinks: Bool = true, extras: [String: CodableValue] = [:]
    ) {
        self.autoDownloadEnabled = autoDownloadEnabled; self.autoDownloadOnWifi = autoDownloadOnWifi
        self.autoDownloadMaxSize = autoDownloadMaxSize; self.downloadPath = downloadPath
        self.inlinePreviewEnabled = inlinePreviewEnabled; self.previewPdfEnabled = previewPdfEnabled
        self.previewImagesEnabled = previewImagesEnabled; self.previewVideosEnabled = previewVideosEnabled
        self.storageQuota = storageQuota; self.autoDeleteOldFiles = autoDeleteOldFiles
        self.fileRetentionDays = fileRetentionDays; self.compressImagesOnUpload = compressImagesOnUpload
        self.imageCompressionQuality = imageCompressionQuality; self.allowedFileTypes = allowedFileTypes
        self.scanFilesForMalware = scanFilesForMalware; self.allowExternalLinks = allowExternalLinks
        self.extras = extras
    }

    enum CodingKeys: String, CodingKey {
        case autoDownloadEnabled, autoDownloadOnWifi, autoDownloadMaxSize, downloadPath
        case inlinePreviewEnabled, previewPdfEnabled, previewImagesEnabled, previewVideosEnabled
        case storageQuota, autoDeleteOldFiles, fileRetentionDays
        case compressImagesOnUpload, imageCompressionQuality, allowedFileTypes
        case scanFilesForMalware, allowExternalLinks, extras
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        autoDownloadEnabled = try c.decodeIfPresent(Bool.self, forKey: .autoDownloadEnabled) ?? Self.defaults.autoDownloadEnabled
        autoDownloadOnWifi = try c.decodeIfPresent(Bool.self, forKey: .autoDownloadOnWifi) ?? Self.defaults.autoDownloadOnWifi
        autoDownloadMaxSize = try c.decodeIfPresent(Int.self, forKey: .autoDownloadMaxSize) ?? Self.defaults.autoDownloadMaxSize
        downloadPath = try c.decodeIfPresent(String.self, forKey: .downloadPath)
        inlinePreviewEnabled = try c.decodeIfPresent(Bool.self, forKey: .inlinePreviewEnabled) ?? Self.defaults.inlinePreviewEnabled
        previewPdfEnabled = try c.decodeIfPresent(Bool.self, forKey: .previewPdfEnabled) ?? Self.defaults.previewPdfEnabled
        previewImagesEnabled = try c.decodeIfPresent(Bool.self, forKey: .previewImagesEnabled) ?? Self.defaults.previewImagesEnabled
        previewVideosEnabled = try c.decodeIfPresent(Bool.self, forKey: .previewVideosEnabled) ?? Self.defaults.previewVideosEnabled
        storageQuota = try c.decodeIfPresent(Int.self, forKey: .storageQuota) ?? Self.defaults.storageQuota
        autoDeleteOldFiles = try c.decodeIfPresent(Bool.self, forKey: .autoDeleteOldFiles) ?? Self.defaults.autoDeleteOldFiles
        fileRetentionDays = try c.decodeIfPresent(Int.self, forKey: .fileRetentionDays) ?? Self.defaults.fileRetentionDays
        compressImagesOnUpload = try c.decodeIfPresent(Bool.self, forKey: .compressImagesOnUpload) ?? Self.defaults.compressImagesOnUpload
        imageCompressionQuality = try c.decodeIfPresent(Int.self, forKey: .imageCompressionQuality) ?? Self.defaults.imageCompressionQuality
        allowedFileTypes = try c.decodeIfPresent([String].self, forKey: .allowedFileTypes) ?? Self.defaults.allowedFileTypes
        scanFilesForMalware = try c.decodeIfPresent(Bool.self, forKey: .scanFilesForMalware) ?? Self.defaults.scanFilesForMalware
        allowExternalLinks = try c.decodeIfPresent(Bool.self, forKey: .allowExternalLinks) ?? Self.defaults.allowExternalLinks
        extras = try c.decodeIfPresent([String: CodableValue].self, forKey: .extras) ?? [:]
    }
}

// MARK: - Application Preferences

public struct ApplicationPreferences: Codable, Equatable {
    public var theme: AppThemeMode
    public var accentColor: String
    public var interfaceLanguage: String
    public var fontSize: FontSize
    public var fontFamily: String
    public var lineHeight: LineHeight
    public var compactMode: Bool
    public var sidebarPosition: SidebarPosition
    public var showAvatars: Bool
    public var animationsEnabled: Bool
    public var reducedMotion: Bool
    public var highContrastMode: Bool
    public var screenReaderOptimized: Bool
    public var keyboardShortcutsEnabled: Bool
    public var tutorialsCompleted: [String]
    public var betaFeaturesEnabled: Bool
    public var telemetryEnabled: Bool
    public var extras: [String: CodableValue]

    public static let defaults = ApplicationPreferences(
        theme: .auto, accentColor: "blue", interfaceLanguage: "en",
        fontSize: .medium, fontFamily: "inter", lineHeight: .normal,
        compactMode: false, sidebarPosition: .left, showAvatars: true,
        animationsEnabled: true, reducedMotion: false,
        highContrastMode: false, screenReaderOptimized: false, keyboardShortcutsEnabled: true,
        tutorialsCompleted: [], betaFeaturesEnabled: false, telemetryEnabled: true, extras: [:]
    )

    public init(
        theme: AppThemeMode = .auto, accentColor: String = "blue", interfaceLanguage: String = "en",
        fontSize: FontSize = .medium, fontFamily: String = "inter", lineHeight: LineHeight = .normal,
        compactMode: Bool = false, sidebarPosition: SidebarPosition = .left, showAvatars: Bool = true,
        animationsEnabled: Bool = true, reducedMotion: Bool = false,
        highContrastMode: Bool = false, screenReaderOptimized: Bool = false, keyboardShortcutsEnabled: Bool = true,
        tutorialsCompleted: [String] = [], betaFeaturesEnabled: Bool = false, telemetryEnabled: Bool = true,
        extras: [String: CodableValue] = [:]
    ) {
        self.theme = theme; self.accentColor = accentColor; self.interfaceLanguage = interfaceLanguage
        self.fontSize = fontSize; self.fontFamily = fontFamily; self.lineHeight = lineHeight
        self.compactMode = compactMode; self.sidebarPosition = sidebarPosition; self.showAvatars = showAvatars
        self.animationsEnabled = animationsEnabled; self.reducedMotion = reducedMotion
        self.highContrastMode = highContrastMode; self.screenReaderOptimized = screenReaderOptimized
        self.keyboardShortcutsEnabled = keyboardShortcutsEnabled; self.tutorialsCompleted = tutorialsCompleted
        self.betaFeaturesEnabled = betaFeaturesEnabled; self.telemetryEnabled = telemetryEnabled
        self.extras = extras
    }

    enum CodingKeys: String, CodingKey {
        case theme, accentColor, interfaceLanguage, fontSize, fontFamily, lineHeight
        case compactMode, sidebarPosition, showAvatars, animationsEnabled, reducedMotion
        case highContrastMode, screenReaderOptimized, keyboardShortcutsEnabled
        case tutorialsCompleted, betaFeaturesEnabled, telemetryEnabled, extras
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        theme = try c.decodeIfPresent(AppThemeMode.self, forKey: .theme) ?? Self.defaults.theme
        accentColor = try c.decodeIfPresent(String.self, forKey: .accentColor) ?? Self.defaults.accentColor
        interfaceLanguage = try c.decodeIfPresent(String.self, forKey: .interfaceLanguage) ?? Self.defaults.interfaceLanguage
        fontSize = try c.decodeIfPresent(FontSize.self, forKey: .fontSize) ?? Self.defaults.fontSize
        fontFamily = try c.decodeIfPresent(String.self, forKey: .fontFamily) ?? Self.defaults.fontFamily
        lineHeight = try c.decodeIfPresent(LineHeight.self, forKey: .lineHeight) ?? Self.defaults.lineHeight
        compactMode = try c.decodeIfPresent(Bool.self, forKey: .compactMode) ?? Self.defaults.compactMode
        sidebarPosition = try c.decodeIfPresent(SidebarPosition.self, forKey: .sidebarPosition) ?? Self.defaults.sidebarPosition
        showAvatars = try c.decodeIfPresent(Bool.self, forKey: .showAvatars) ?? Self.defaults.showAvatars
        animationsEnabled = try c.decodeIfPresent(Bool.self, forKey: .animationsEnabled) ?? Self.defaults.animationsEnabled
        reducedMotion = try c.decodeIfPresent(Bool.self, forKey: .reducedMotion) ?? Self.defaults.reducedMotion
        highContrastMode = try c.decodeIfPresent(Bool.self, forKey: .highContrastMode) ?? Self.defaults.highContrastMode
        screenReaderOptimized = try c.decodeIfPresent(Bool.self, forKey: .screenReaderOptimized) ?? Self.defaults.screenReaderOptimized
        keyboardShortcutsEnabled = try c.decodeIfPresent(Bool.self, forKey: .keyboardShortcutsEnabled) ?? Self.defaults.keyboardShortcutsEnabled
        tutorialsCompleted = try c.decodeIfPresent([String].self, forKey: .tutorialsCompleted) ?? Self.defaults.tutorialsCompleted
        betaFeaturesEnabled = try c.decodeIfPresent(Bool.self, forKey: .betaFeaturesEnabled) ?? Self.defaults.betaFeaturesEnabled
        telemetryEnabled = try c.decodeIfPresent(Bool.self, forKey: .telemetryEnabled) ?? Self.defaults.telemetryEnabled
        extras = try c.decodeIfPresent([String: CodableValue].self, forKey: .extras) ?? [:]
    }
}

// MARK: - UserPreferences (aggregate wrapper)

public struct UserPreferences: Codable, Equatable {
    public var privacy: PrivacyPreferences
    public var audio: AudioPreferences
    public var message: MessagePreferences
    public var notification: UserNotificationPreferences
    public var video: VideoPreferences
    public var document: DocumentPreferences
    public var application: ApplicationPreferences

    public static let defaults = UserPreferences(
        privacy: .defaults, audio: .defaults, message: .defaults,
        notification: .defaults, video: .defaults, document: .defaults,
        application: .defaults
    )

    public init(
        privacy: PrivacyPreferences = .defaults, audio: AudioPreferences = .defaults,
        message: MessagePreferences = .defaults, notification: UserNotificationPreferences = .defaults,
        video: VideoPreferences = .defaults, document: DocumentPreferences = .defaults,
        application: ApplicationPreferences = .defaults
    ) {
        self.privacy = privacy; self.audio = audio; self.message = message
        self.notification = notification; self.video = video; self.document = document
        self.application = application
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        privacy = try c.decodeIfPresent(PrivacyPreferences.self, forKey: .privacy) ?? .defaults
        audio = try c.decodeIfPresent(AudioPreferences.self, forKey: .audio) ?? .defaults
        message = try c.decodeIfPresent(MessagePreferences.self, forKey: .message) ?? .defaults
        notification = try c.decodeIfPresent(UserNotificationPreferences.self, forKey: .notification) ?? .defaults
        video = try c.decodeIfPresent(VideoPreferences.self, forKey: .video) ?? .defaults
        document = try c.decodeIfPresent(DocumentPreferences.self, forKey: .document) ?? .defaults
        application = try c.decodeIfPresent(ApplicationPreferences.self, forKey: .application) ?? .defaults
    }
}
