package me.meeshy.sdk.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

/**
 * User preference models — port of PreferenceModels.swift.
 *
 * Swift's type-erased `CodableValue` is represented here by [JsonElement] for
 * the extensible `extras` maps.
 */

/** Top-level preference category — port of PreferenceCategory (PreferenceModels.swift). */
@Serializable
enum class PreferenceCategory {
    @SerialName("privacy") PRIVACY,
    @SerialName("audio") AUDIO,
    @SerialName("message") MESSAGE,
    @SerialName("notification") NOTIFICATION,
    @SerialName("video") VIDEO,
    @SerialName("document") DOCUMENT,
    @SerialName("application") APPLICATION,
}

@Serializable
enum class EncryptionPreference {
    @SerialName("disabled") DISABLED,
    @SerialName("optional") OPTIONAL,
    @SerialName("always") ALWAYS,
}

@Serializable
enum class AudioQuality {
    @SerialName("low") LOW,
    @SerialName("medium") MEDIUM,
    @SerialName("high") HIGH,
    @SerialName("lossless") LOSSLESS,
}

@Serializable
enum class TranscriptionSource {
    @SerialName("auto") AUTO,
    @SerialName("mobile") MOBILE,
    @SerialName("server") SERVER,
}

@Serializable
enum class TranslatedAudioFormat {
    @SerialName("mp3") MP3,
    @SerialName("wav") WAV,
    @SerialName("ogg") OGG,
}

@Serializable
enum class VoiceCloneQuality {
    @SerialName("fast") FAST,
    @SerialName("balanced") BALANCED,
    @SerialName("quality") QUALITY,
}

@Serializable
enum class VideoQuality {
    @SerialName("low") LOW,
    @SerialName("medium") MEDIUM,
    @SerialName("high") HIGH,
    @SerialName("auto") AUTO,
}

@Serializable
enum class VideoFrameRate {
    @SerialName("15") FPS15,
    @SerialName("24") FPS24,
    @SerialName("30") FPS30,
    @SerialName("60") FPS60,
}

@Serializable
enum class VideoResolution {
    @SerialName("480p") R480P,
    @SerialName("720p") R720P,
    @SerialName("1080p") R1080P,
    @SerialName("auto") AUTO,
}

@Serializable
enum class VideoCodec {
    @SerialName("VP8") VP8,
    @SerialName("VP9") VP9,
    @SerialName("H264") H264,
    @SerialName("H265") H265,
    @SerialName("AV1") AV1,
}

@Serializable
enum class VideoLayout {
    @SerialName("grid") GRID,
    @SerialName("speaker") SPEAKER,
    @SerialName("sidebar") SIDEBAR,
}

@Serializable
enum class SelfViewPosition {
    @SerialName("top-left") TOP_LEFT,
    @SerialName("top-right") TOP_RIGHT,
    @SerialName("bottom-left") BOTTOM_LEFT,
    @SerialName("bottom-right") BOTTOM_RIGHT,
}

@Serializable
enum class EmojiSkinTone {
    @SerialName("default") DEFAULT,
    @SerialName("light") LIGHT,
    @SerialName("medium-light") MEDIUM_LIGHT,
    @SerialName("medium") MEDIUM,
    @SerialName("medium-dark") MEDIUM_DARK,
    @SerialName("dark") DARK,
}

@Serializable
enum class FontSize {
    @SerialName("small") SMALL,
    @SerialName("medium") MEDIUM,
    @SerialName("large") LARGE,
}

@Serializable
enum class TextAlign {
    @SerialName("left") LEFT,
    @SerialName("center") CENTER,
    @SerialName("right") RIGHT,
}

@Serializable
enum class AppThemeMode {
    @SerialName("light") LIGHT,
    @SerialName("dark") DARK,
    @SerialName("auto") AUTO,
}

@Serializable
enum class LineHeight {
    @SerialName("tight") TIGHT,
    @SerialName("normal") NORMAL,
    @SerialName("relaxed") RELAXED,
    @SerialName("loose") LOOSE,
}

@Serializable
enum class SidebarPosition {
    @SerialName("left") LEFT,
    @SerialName("right") RIGHT,
}

@Serializable
enum class DndDay {
    @SerialName("mon") MON,
    @SerialName("tue") TUE,
    @SerialName("wed") WED,
    @SerialName("thu") THU,
    @SerialName("fri") FRI,
    @SerialName("sat") SAT,
    @SerialName("sun") SUN,
}

/** Privacy preferences — port of PrivacyPreferences (PreferenceModels.swift). */
@Serializable
data class PrivacyPreferences(
    val showOnlineStatus: Boolean = true,
    val showLastSeen: Boolean = true,
    val showReadReceipts: Boolean = true,
    val showTypingIndicator: Boolean = true,
    val allowContactRequests: Boolean = true,
    val allowGroupInvites: Boolean = true,
    val allowCallsFromNonContacts: Boolean = false,
    val saveMediaToGallery: Boolean = false,
    val allowAnalytics: Boolean = true,
    val shareUsageData: Boolean = false,
    val blockScreenshots: Boolean = false,
    val hideProfileFromSearch: Boolean = false,
    val encryptionPreference: EncryptionPreference = EncryptionPreference.OPTIONAL,
    val autoEncryptNewConversations: Boolean = false,
    val showEncryptionStatus: Boolean = true,
    val warnOnUnencrypted: Boolean = false,
    val extras: Map<String, JsonElement> = emptyMap(),
)

/** Audio preferences — port of AudioPreferences (PreferenceModels.swift). */
@Serializable
data class AudioPreferences(
    val transcriptionEnabled: Boolean = true,
    val transcriptionSource: TranscriptionSource = TranscriptionSource.AUTO,
    val autoTranscribeIncoming: Boolean = false,
    val audioTranslationEnabled: Boolean = false,
    val translatedAudioFormat: TranslatedAudioFormat = TranslatedAudioFormat.MP3,
    val ttsEnabled: Boolean = false,
    val ttsVoice: String? = null,
    val ttsSpeed: Double = 1.0,
    val ttsPitch: Double = 1.0,
    val audioQuality: AudioQuality = AudioQuality.HIGH,
    val noiseSuppression: Boolean = true,
    val echoCancellation: Boolean = true,
    val voiceProfileEnabled: Boolean = false,
    val voiceCloneQuality: VoiceCloneQuality = VoiceCloneQuality.BALANCED,
    val extras: Map<String, JsonElement> = emptyMap(),
)

/** Message composition preferences — port of MessagePreferences (PreferenceModels.swift). */
@Serializable
data class MessagePreferences(
    val sendOnEnter: Boolean = true,
    val showFormattingToolbar: Boolean = true,
    val enableMarkdown: Boolean = true,
    val enableEmoji: Boolean = true,
    val emojiSkinTone: EmojiSkinTone = EmojiSkinTone.DEFAULT,
    val autoCorrectEnabled: Boolean = false,
    val spellCheckEnabled: Boolean = true,
    val linkPreviewEnabled: Boolean = true,
    val imagePreviewEnabled: Boolean = true,
    val saveDrafts: Boolean = true,
    val draftExpirationDays: Int = 30,
    val defaultFontSize: FontSize = FontSize.MEDIUM,
    val defaultTextAlign: TextAlign = TextAlign.LEFT,
    val autoTranslateIncoming: Boolean = false,
    val autoTranslateLanguages: List<String> = emptyList(),
    val maxCharacterLimit: Int = 5000,
    val extras: Map<String, JsonElement> = emptyMap(),
)

/** Notification preferences — port of UserNotificationPreferences (PreferenceModels.swift). */
@Serializable
data class UserNotificationPreferences(
    val pushEnabled: Boolean = true,
    val emailEnabled: Boolean = true,
    val soundEnabled: Boolean = true,
    val vibrationEnabled: Boolean = true,
    val newMessageEnabled: Boolean = true,
    val missedCallEnabled: Boolean = true,
    val voicemailEnabled: Boolean = true,
    val systemEnabled: Boolean = true,
    val conversationEnabled: Boolean = true,
    val replyEnabled: Boolean = true,
    val mentionEnabled: Boolean = true,
    val reactionEnabled: Boolean = true,
    val contactRequestEnabled: Boolean = true,
    val groupInviteEnabled: Boolean = true,
    val memberJoinedEnabled: Boolean = true,
    val memberLeftEnabled: Boolean = false,
    val postLikeEnabled: Boolean = true,
    val postCommentEnabled: Boolean = true,
    val postRepostEnabled: Boolean = true,
    val storyReactionEnabled: Boolean = true,
    val commentReplyEnabled: Boolean = true,
    val commentLikeEnabled: Boolean = false,
    val dndEnabled: Boolean = false,
    val dndStartTime: String = "22:00",
    val dndEndTime: String = "08:00",
    val dndDays: List<DndDay> = emptyList(),
    val showPreview: Boolean = true,
    val showSenderName: Boolean = true,
    val groupNotifications: Boolean = true,
    val notificationBadgeEnabled: Boolean = true,
    val extras: Map<String, JsonElement> = emptyMap(),
)

/** Video call preferences — port of VideoPreferences (PreferenceModels.swift). */
@Serializable
data class VideoPreferences(
    val videoQuality: VideoQuality = VideoQuality.AUTO,
    val videoBitrate: Int? = null,
    val videoFrameRate: VideoFrameRate = VideoFrameRate.FPS30,
    val videoResolution: VideoResolution = VideoResolution.AUTO,
    val videoCodec: VideoCodec = VideoCodec.VP8,
    val defaultCamera: String? = null,
    val mirrorLocalVideo: Boolean = true,
    val videoLayout: VideoLayout = VideoLayout.SPEAKER,
    val showSelfView: Boolean = true,
    val selfViewPosition: SelfViewPosition = SelfViewPosition.BOTTOM_RIGHT,
    val backgroundBlurEnabled: Boolean = false,
    val virtualBackgroundEnabled: Boolean = false,
    val virtualBackgroundUrl: String? = null,
    val hardwareAccelerationEnabled: Boolean = true,
    val adaptiveBitrateEnabled: Boolean = true,
    val autoStartVideo: Boolean = true,
    val autoMuteOnJoin: Boolean = false,
    val extras: Map<String, JsonElement> = emptyMap(),
)

/** Document/media handling preferences — port of DocumentPreferences (PreferenceModels.swift). */
@Serializable
data class DocumentPreferences(
    val autoDownloadEnabled: Boolean = false,
    val autoDownloadOnWifi: Boolean = true,
    val autoDownloadMaxSize: Int = 10,
    val downloadPath: String? = null,
    val inlinePreviewEnabled: Boolean = true,
    val previewPdfEnabled: Boolean = true,
    val previewImagesEnabled: Boolean = true,
    val previewVideosEnabled: Boolean = true,
    val storageQuota: Int = 5000,
    val autoDeleteOldFiles: Boolean = false,
    val fileRetentionDays: Int = 90,
    val compressImagesOnUpload: Boolean = false,
    val imageCompressionQuality: Int = 85,
    val allowedFileTypes: List<String> = emptyList(),
    val scanFilesForMalware: Boolean = true,
    val allowExternalLinks: Boolean = true,
    val extras: Map<String, JsonElement> = emptyMap(),
)

/** Application/appearance preferences — port of ApplicationPreferences (PreferenceModels.swift). */
@Serializable
data class ApplicationPreferences(
    val theme: AppThemeMode = AppThemeMode.AUTO,
    val accentColor: String = "blue",
    val interfaceLanguage: String = "en",
    val fontSize: FontSize = FontSize.MEDIUM,
    val fontFamily: String = "inter",
    val lineHeight: LineHeight = LineHeight.NORMAL,
    val compactMode: Boolean = false,
    val sidebarPosition: SidebarPosition = SidebarPosition.LEFT,
    val showAvatars: Boolean = true,
    val animationsEnabled: Boolean = true,
    val reducedMotion: Boolean = false,
    val highContrastMode: Boolean = false,
    val screenReaderOptimized: Boolean = false,
    val keyboardShortcutsEnabled: Boolean = true,
    val tutorialsCompleted: List<String> = emptyList(),
    val betaFeaturesEnabled: Boolean = false,
    val telemetryEnabled: Boolean = true,
    val extras: Map<String, JsonElement> = emptyMap(),
)

/** Aggregate user preferences wrapper — port of UserPreferences (PreferenceModels.swift). */
@Serializable
data class UserPreferences(
    val privacy: PrivacyPreferences = PrivacyPreferences(),
    val audio: AudioPreferences = AudioPreferences(),
    val message: MessagePreferences = MessagePreferences(),
    val notification: UserNotificationPreferences = UserNotificationPreferences(),
    val video: VideoPreferences = VideoPreferences(),
    val document: DocumentPreferences = DocumentPreferences(),
    val application: ApplicationPreferences = ApplicationPreferences(),
)
