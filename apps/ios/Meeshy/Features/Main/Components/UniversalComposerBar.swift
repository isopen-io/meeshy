import SwiftUI
import MeeshyUI
import AVFoundation
import Combine
import MeeshySDK

// See ComposerModels.swift for: ComposerAttachmentType, ComposerAttachment,
// LanguageOption, KeyboardObserver, ComposerWaveformBar

// See UniversalComposerBar+Recording.swift for recording views & logic
// See UniversalComposerBar+Attachments.swift for attachment views & logic

// ============================================================================
// MARK: - UniversalComposerBar
// ============================================================================

/// Universal composer bar — reusable anywhere a message can be sent.
/// Mirrors the web MessageComposer: language selector, [+] attach, emoji,
/// voice recording, location, attachments preview, character counter, send.
/// Supports dark (translucent, for story viewer) and light (themed) styles.
struct UniversalComposerBar: View {

    // MARK: - Style

    enum Style { case dark, light }
    var style: Style = .dark

    // MARK: - Mode (adapts behavior per usage context)

    /// The mode determines placeholder, max length, available actions, etc.
    /// When set, it overrides manual `placeholder`, `maxLength`, `showVoice`, etc.
    var mode: ComposerMode? = nil

    /// When true, the composer starts as a minimized floating button.
    /// Tapping it expands to full bar + keyboard + (+) menu.
    /// Swipe-down collapses it back.
    var startMinimized: Bool = false

    /// Called when the composer expands from minimized state
    var onExpand: (() -> Void)? = nil

    /// Called when the composer collapses back to minimized state
    var onCollapse: (() -> Void)? = nil

    /// Called when clipboard content exceeds 2000 chars (creates a clipboard_content attachment)
    var onClipboardContent: ((ClipboardContent) -> Void)? = nil

    /// Émis quand l'utilisateur dépose ou colle du contenu dans la bande du
    /// composer. Chaque `.file` pointe un fichier DÉJÀ copié dans notre
    /// conteneur : l'hôte en devient propriétaire (il le déplace ou le
    /// supprime). Un `.text` est destiné au champ de saisie de l'hôte.
    var onIngest: (([ComposerIngest]) -> Void)? = nil

    // MARK: - Configuration

    var placeholder: String = "Message..."
    var accentColor: String = MeeshyColors.indigo400Hex
    var secondaryColor: String = MeeshyColors.indigo600Hex
    var maxLength: Int? = nil
    var showVoice: Bool = true
    var showLocation: Bool = true
    var showAttachment: Bool = true
    var showLanguageSelector: Bool = false
    var showEmoji: Bool = true

    /// Hard override that hides the attachment ladder (file / photo / camera /
    /// location) regardless of `mode`. Used by the notification preview
    /// composer, which must allow text / voice / effects / blur / ephemeral /
    /// view-once but NOT file/photo attachments.
    var forceHideAttachment: Bool = false

    /// Opt-in override that enables the attachment carousel even when `mode`
    /// would otherwise hide it (e.g. comments). The host MUST wire the attachment
    /// callbacks (`onPhotoLibrary`, `onFilePicker`, …) for the carousel to offer
    /// anything. `forceHideAttachment` still wins if both are set.
    var forceShowAttachment: Bool = false

    /// Opt-in override that enables voice recording even when `mode` would hide
    /// it (e.g. comments).
    var forceShowVoice: Bool = false

    // MARK: - Language

    var selectedLanguage: String = "fr"
    var availableLanguages: [LanguageOption] = LanguageOption.defaults
    var onLanguageChange: ((String) -> Void)? = nil

    // MARK: - Callbacks (simple — backward compatible)

    var onSend: ((String) -> Void)? = nil
    var onFocusChange: ((Bool) -> Void)? = nil

    // MARK: - Callbacks (rich — full MessageComposer parity)

    var onSendMessage: ((String, [ComposerAttachment], String) -> Void)? = nil
    var onVoiceRecord: ((URL, TimeInterval) -> Void)? = nil
    var onLocationRequest: (() -> Void)? = nil

    // MARK: - External text binding (edit mode)

    var textBinding: Binding<String>? = nil

    // MARK: - Banners & custom content

    var editBanner: AnyView? = nil
    var replyBanner: AnyView? = nil
    var customAttachmentsPreview: AnyView? = nil

    // MARK: - Edit mode

    var isEditMode: Bool = false
    var onCustomSend: (() -> Void)? = nil
    var onTextChange: ((String) -> Void)? = nil

    // MARK: - Recording delegation (parent manages real AVAudioRecorder)

    var onStartRecording: (() -> Void)? = nil
    /// Stop the recording and place the audio in the attachment tray (editable
    /// before sending) — the `[stop]` control of the recording bar.
    var onStopRecordingToAttachment: (() -> Void)? = nil
    /// Stop the recording and send the voice message immediately (raw) — the
    /// `[↑]` control of the recording bar.
    var onSendRecording: (() -> Void)? = nil
    var onCancelRecording: (() -> Void)? = nil
    var externalIsRecording: Bool? = nil
    var externalRecordingDuration: TimeInterval? = nil
    var externalAudioLevels: [CGFloat]? = nil

    // MARK: - External content flag

    var externalHasContent: Bool = false

    // MARK: - External send state (disables button while a send is in flight)

    /// When true, the send button is non-interactive. Réservé aux hosts dont le
    /// flux d'envoi est LOCAL et COURT (ex. ThreadView et son `isSending`
    /// éphémère). ⚠️ Ne JAMAIS passer `ConversationViewModel.isSending` : il
    /// couvre tout le cycle REST+fallback (~22s en réseau dégradé) et gèlerait
    /// le composer pendant qu'un message est sur l'horloge ⏳ — les envois de
    /// messages DISTINCTS doivent s'enchaîner (outbox FIFO), le dedup double-tap
    /// vit dans le ViewModel (`duplicateSendDebounce`).
    var externalIsSending: Bool = false

    // MARK: - Attachment ladder callbacks

    var onPhotoLibrary: (() -> Void)? = nil
    var onCamera: (() -> Void)? = nil
    var onFilePicker: (() -> Void)? = nil

    /// Fired when the attachment carousel becomes visible. The keyboard, the
    /// attachment carousel and any host-owned emoji panel are mutually
    /// exclusive input surfaces — a host that shows an emoji panel below the
    /// bar should dismiss it here so the carousel and the emoji panel never
    /// stack on top of each other.
    var onShowAttachments: (() -> Void)? = nil

    /// Called when user taps emoji icon in ladder — parent should show EmojiFullPickerSheet
    var onRequestTextEmoji: (() -> Void)? = nil

    /// Called when the user taps a thumbnail in the inline recent-media strip
    /// (shown beneath the attachment carousel). When non-nil, the strip is
    /// rendered; the host ingests the resolved photo/video like a camera capture.
    var onRecentMediaSelected: ((RecentMediaPick) -> Void)? = nil

    /// Called when the user picks "Éditer" on a recent-media thumbnail (long
    /// press). The host opens its media editor with the resolved photo/video
    /// and stages the edited result. When nil the action is hidden.
    var onRecentMediaEdit: ((RecentMediaPick) -> Void)? = nil

    /// Called when the user opens the full photo library from the recent-media
    /// strip, carrying the asset identifiers already multi-selected there so
    /// the host can preselect them in its PhotosPicker (via
    /// `PhotosPickerItem(itemIdentifier:)` + `photoLibrary: .shared()`).
    /// Falls back to `onPhotoLibrary` when nil.
    var onPhotoLibraryPreselecting: (([String]) -> Void)? = nil

    /// Bind this to inject an emoji into the text field from outside (e.g. from parent's emoji picker)
    var injectedEmoji: Binding<String> = .constant("")

    // MARK: - Ephemeral mode

    /// Binding to the ephemeral duration (nil = off). Parent owns the state.
    var ephemeralDuration: Binding<EphemeralDuration?> = .constant(nil)

    /// When true, the ephemeral toggle is hidden (e.g. in edit mode)
    var hideEphemeral: Bool = false

    // MARK: - Blur mode

    /// Binding to blur state. When true, next message is sent blurred (tap to reveal).
    var isBlurEnabled: Binding<Bool> = .constant(false)

    /// When true, the blur toggle is hidden (e.g. in edit mode)
    var hideBlur: Bool = false

    // MARK: - View-once mode

    /// Binding to view-once state. When true, the next message is sent as a
    /// view-once message (revealed once, then burned). Parent owns the state.
    var isViewOnceEnabled: Binding<Bool> = .constant(false)

    /// When true, the view-once toggle is shown. Off by default so the standard
    /// conversation composer is unchanged; opted into by the notification
    /// preview composer.
    var showViewOnce: Bool = false

    // MARK: - Effects picker

    /// Binding to pending effects. Parent owns the state.
    var pendingEffects: Binding<MessageEffects> = .constant(.none)

    /// Called when user taps effects button — parent should show EffectsPickerView
    var onRequestEffectsPicker: (() -> Void)? = nil

    /// When true, the effects button is hidden (e.g. in edit mode)
    var hideEffects: Bool = false

    // MARK: - External attachment injection

    /// Parent can set this to add attachments from outside (e.g. photo picker result)
    var externalAttachments: [ComposerAttachment] = []

    // MARK: - Story-aware draft management

    /// Current story/context ID — when this changes, the composer saves/restores drafts
    var storyId: String? = nil

    /// Called to save draft when switching context (storyId, text, attachments)
    var onSaveDraft: ((String, String, [ComposerAttachment]) -> Void)? = nil

    /// Called to load a draft for a given storyId — return nil for empty draft
    var getDraft: ((String) -> (text: String, attachments: [ComposerAttachment])?)? = nil

    /// Called on ANY user interaction (tap, type, record, attach, etc.) — use to pause stories
    var onAnyInteraction: (() -> Void)? = nil

    /// When set to true externally, immediately focuses the text field.
    /// Caller must reset to false after triggering.
    var focusTrigger: Binding<Bool> = .constant(false)

    /// Called when recording state changes (true = started, false = stopped)
    var onRecordingChange: ((Bool) -> Void)? = nil

    /// Called when composer content changes (text, attachments, or recording).
    /// True = has pending content that should block story timer.
    var onHasContentChange: ((Bool) -> Void)? = nil

    // MARK: - State (internal for cross-file extension access)

    @State var text = ""
    @FocusState var isFocused: Bool
    @State var sendBounce = false
    @State var focusBounce = false
    @State var showAttachOptions = false
    /// Dernière sélection multiple reportée par `RecentMediaStrip`, pour que le
    /// raccourci photothèque de la poignée préselectionne les mêmes assets.
    /// Non-`private` : muté depuis `UniversalComposerBar+Attachments.swift`.
    @State var recentStripSelectionIds: [String] = []
    /// `true` pendant l'étirement qui précède la présentation de la photothèque
    /// complète — cf. `ComposerLibraryHandoff`. Non-`private` : muté depuis
    /// `UniversalComposerBar+Attachments.swift`.
    @State var isExpandingToLibrary = false
    @State private var attachButtonPressed = false
    @State var currentLanguage: String = "fr"
    // Voice recording
    @State var isRecording = false
    @State var recordingDuration: TimeInterval = 0
    @State var recordingTimer: Timer?

    // Attachments
    @State var attachments: [ComposerAttachment] = []

    // Minimized / expanded state
    @State var isMinimized: Bool = false
    @State var dragOffsetY: CGFloat = 0
    @State var clipboardContent: ClipboardContent? = nil

    // Ephemeral picker
    @State var showEphemeralPicker = false
    // Permanent effects inline picker (for comments)
    @State var showPermanentEffectsPicker = false

    // Text analysis (sentiment + language detection from MessageComposer)
    @StateObject var textAnalyzer = TextAnalyzer()
    @State var attachRotation: Double = 0
    @State var typeWave: Bool = false

    @Environment(\.colorScheme) var colorScheme
    var isDark: Bool { colorScheme == .dark }
    var theme: ThemeManager { ThemeManager.shared }

    @Environment(\.accessibilityReduceMotion) var reduceMotion

    /// Tracks the system keyboard so the attachment carousel can be sized to the
    /// exact space the keyboard last occupied (seamless keyboard <-> carousel swap).
    @StateObject private var keyboardObserver = KeyboardObserver()

    /// Height for the attachment carousel — matches the last known keyboard
    /// height so swapping keyboard <-> carousel keeps the input row still, but
    /// never shorter than the panel's own content (taller when the two-row
    /// recent-media grid is shown, so it can't clip).
    var attachmentPanelHeight: CGFloat {
        let keyboard = max(keyboardObserver.lastKnownHeight, 260)
        // iPad / macOS gets a taller floor so the roomy recent-media grid has
        // breathing room; iPhone (incl. landscape, also .regular width) keeps the
        // compact two-row floor since its screen is short.
        let recentFloor: CGFloat = DeviceLayout.isPad ? 460 : 324
        let contentFloor: CGFloat = onRecentMediaSelected != nil ? recentFloor : 150
        let resting = max(keyboard, contentFloor)
        guard isExpandingToLibrary else { return resting }
        return ComposerLibraryHandoff.expandedHeight(
            resting: resting,
            windowHeight: DeviceLayout.windowSize.height
        )
    }

    // MARK: - Recording constants

    /// Minimum duration below which the send button is disabled to prevent
    /// accidental taps that would produce an unusably short voice message.
    static let minimumSendableDuration: TimeInterval = 0.5

    // MARK: - Mode-resolved properties

    var resolvedPlaceholder: String { mode?.placeholder ?? placeholder }
    var resolvedMaxLength: Int? { mode?.maxLength ?? maxLength }
    var resolvedShowVoice: Bool { forceShowVoice || (mode?.showVoice ?? showVoice) }
    var resolvedShowAttachment: Bool {
        if forceHideAttachment { return false }
        return forceShowAttachment || (mode?.showAttachment ?? showAttachment)
    }
    private var resolvedShowLanguage: Bool { mode?.showLanguageSelector ?? showLanguageSelector }
    var resolvedHideEphemeral: Bool {
        if let mode { return !mode.showEphemeral }
        return hideEphemeral
    }
    var resolvedHideEffects: Bool {
        if let mode { return !mode.showEffectsSheet }
        return hideEffects
    }
    var resolvedShowPermanentEffects: Bool {
        mode?.showPermanentEffects ?? false
    }

    // MARK: - Computed

    var hasText: Bool {
        !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var hasContent: Bool {
        hasText || !allAttachments.isEmpty || externalHasContent
    }

    var allAttachments: [ComposerAttachment] {
        attachments + externalAttachments
    }

    var textColor: Color {
        style == .dark ? .white : theme.textPrimary
    }

    var placeholderColor: Color {
        style == .dark ? .white.opacity(0.4) : theme.textMuted
    }

    var effectiveIsRecording: Bool {
        externalIsRecording ?? isRecording
    }

    var effectiveDuration: TimeInterval {
        externalRecordingDuration ?? recordingDuration
    }

    var currentLangOption: LanguageOption {
        availableLanguages.first(where: { $0.code == currentLanguage }) ?? availableLanguages[0]
    }
}
