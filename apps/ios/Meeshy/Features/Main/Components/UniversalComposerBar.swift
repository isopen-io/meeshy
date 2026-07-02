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
    @State private var dragOffsetY: CGFloat = 0
    @State var clipboardContent: ClipboardContent? = nil

    // Ephemeral picker
    @State var showEphemeralPicker = false
    // Permanent effects inline picker (for comments)
    @State var showPermanentEffectsPicker = false

    // Text analysis (sentiment + language detection from MessageComposer)
    @StateObject private var textAnalyzer = TextAnalyzer()
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
        return max(keyboard, contentFloor)
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
    private var resolvedHideEphemeral: Bool {
        if let mode { return !mode.showEphemeral }
        return hideEphemeral
    }
    private var resolvedHideEffects: Bool {
        if let mode { return !mode.showEffectsSheet }
        return hideEffects
    }
    private var resolvedShowPermanentEffects: Bool {
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

    private var currentLangOption: LanguageOption {
        availableLanguages.first(where: { $0.code == currentLanguage }) ?? availableLanguages[0]
    }

    // MARK: - Body

    var body: some View {
        Group {
            if isMinimized {
                minimizedFloatingButton
                    .transition(.scale(scale: 0.6).combined(with: .opacity))
            } else {
                expandedComposer
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                    .offset(y: dragOffsetY)
                    .gesture(
                        DragGesture()
                            .onChanged { value in
                                if value.translation.height > 0 {
                                    dragOffsetY = value.translation.height * 0.5
                                }
                            }
                            .onEnded { value in
                                if value.translation.height > 80 {
                                    // Swipe down: dismiss whichever input surface
                                    // is up — the keyboard or the attachment
                                    // carousel — and optionally minimize.
                                    isFocused = false
                                    if showAttachOptions {
                                        withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) {
                                            showAttachOptions = false
                                        }
                                    }
                                    if startMinimized {
                                        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                                            isMinimized = true
                                            dragOffsetY = 0
                                        }
                                        onCollapse?()
                                    } else {
                                        withAnimation(.spring(response: 0.25, dampingFraction: 0.8)) {
                                            dragOffsetY = 0
                                        }
                                    }
                                } else {
                                    withAnimation(.spring(response: 0.25, dampingFraction: 0.8)) {
                                        dragOffsetY = 0
                                    }
                                }
                            }
                    )
            }
        }
        .animation(.spring(response: 0.35, dampingFraction: 0.8), value: isMinimized)
        .onAppear {
            isMinimized = startMinimized
        }
        .onDisappear {
            recordingTimer?.invalidate()
            recordingTimer = nil
        }
    }

    // MARK: - Minimized Floating Button

    private var minimizedFloatingButton: some View {
        HStack(spacing: 12) {
            // Mic button
            if resolvedShowVoice {
                Button {
                    HapticFeedback.medium()
                    expandAndStartRecording()
                } label: {
                    VStack(spacing: 3) {
                        ZStack {
                            Circle()
                                .fill(.ultraThinMaterial)
                                .frame(width: 44, height: 44)
                                .overlay(
                                    Circle().stroke(
                                        LinearGradient(
                                            colors: [MeeshyColors.error.opacity(0.5), MeeshyColors.errorDark.opacity(0.3)],
                                            startPoint: .topLeading, endPoint: .bottomTrailing
                                        ), lineWidth: 1
                                    )
                                )
                                .shadow(color: MeeshyColors.error.opacity(0.2), radius: 6, y: 2)

                            Image(systemName: "mic.fill")
                                .font(.body.weight(.medium))
                                .foregroundStyle(
                                    LinearGradient(
                                        colors: [MeeshyColors.error, MeeshyColors.errorDark],
                                        startPoint: .topLeading, endPoint: .bottomTrailing
                                    )
                                )
                        }
                        Text(String(localized: "composer.minimized.voice", defaultValue: "Vocal", bundle: .main))
                            .font(.caption2).fontWeight(.semibold)
                            .foregroundColor(style == .dark ? .white.opacity(0.5) : theme.textMuted)
                    }
                }
            }

            // Write button
            Button {
                HapticFeedback.medium()
                expandComposer()
            } label: {
                VStack(spacing: 3) {
                    ZStack {
                        Circle()
                            .fill(
                                LinearGradient(
                                    colors: [Color(hex: accentColor), Color(hex: secondaryColor)],
                                    startPoint: .topLeading, endPoint: .bottomTrailing
                                )
                            )
                            .frame(width: 50, height: 50)
                            .shadow(color: Color(hex: accentColor).opacity(0.4), radius: 8, y: 3)

                        Image(systemName: "square.and.pencil")
                            .font(.title3.weight(.semibold))
                            .foregroundColor(.white)
                    }
                    Text(String(localized: "composer.minimized.write", defaultValue: "\u{00C9}crire", bundle: .main))
                        .font(.caption2).fontWeight(.semibold)
                        .foregroundColor(style == .dark ? .white.opacity(0.5) : theme.textMuted)
                }
            }
        }
        .padding(.trailing, 16)
        .padding(.bottom, 12)
        .frame(maxWidth: .infinity, alignment: .trailing)
    }

    // MARK: - Expanded Composer

    private var expandedComposer: some View {
        VStack(spacing: 0) {
            // Edit banner
            if let banner = editBanner { banner }
            // Reply banner
            if let banner = replyBanner { banner }

            // Custom attachments (real thumbnails from parent) or default chips
            if let custom = customAttachmentsPreview {
                custom
                    .transition(.scale.combined(with: .opacity))
            } else if !allAttachments.isEmpty {
                attachmentsPreview
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }

            // Clipboard content preview (for pasted text > 2000 chars)
            if let clip = clipboardContent {
                clipboardContentPreview(clip)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }

            // Main composer
            VStack(spacing: 0) {
                // Swipe handle indicator
                if startMinimized {
                    swipeHandle
                }

                // Ephemeral duration picker (slides up from toolbar)
                if showEphemeralPicker {
                    ephemeralDurationPicker
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }

                // Permanent effects inline picker (for comments)
                if showPermanentEffectsPicker {
                    permanentEffectsInlinePicker
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }

                // Top toolbar (ephemeral, sentiment, language, char counter)
                // Hidden during recording for a clean, iMessage-like full-width bar
                if !effectiveIsRecording {
                    topToolbar
                        .padding(.horizontal, 8)
                        .padding(.top, 6)
                        .padding(.bottom, 2)
                        .transition(.opacity.combined(with: .move(edge: .top)))
                }

                // Composer row — either the recording bar (full-width pill, iMessage-style)
                // or the regular layout: [ (+) attach ]  [ text field ]  [ mic / send ]
                if effectiveIsRecording {
                    recordingBar
                        .padding(.horizontal, 12)
                        .padding(.vertical, 10)
                        .transition(
                            reduceMotion
                                ? .opacity
                                : .asymmetric(
                                    insertion: .opacity.combined(with: .scale(scale: 0.96)),
                                    removal: .opacity
                                )
                        )
                } else {
                    HStack(alignment: .bottom, spacing: 12) {
                        // Left: (+) attach / keyboard toggle button
                        if resolvedShowAttachment {
                            attachButton
                        }

                        // Center: text field. While the carousel is up, an
                        // overlay intercepts taps to bring the keyboard back
                        // (the field isn't focused then). When the keyboard is
                        // already up there is no overlay, so the TextField keeps
                        // its native tap-to-place-cursor behaviour.
                        textInputField
                            .overlay {
                                if showAttachOptions {
                                    Color.clear
                                        .contentShape(Rectangle())
                                        .onTapGesture { focusTextField() }
                                }
                            }

                        // Right: send (when content) or hidden (idle)
                        actionButton
                    }
                    .animation(.spring(response: 0.3, dampingFraction: 0.7), value: hasContent)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
                    .transition(.opacity)
                }

                // Attachment carousel — slides up in the keyboard's place when
                // the (+) toggle is active. Sized to the last known keyboard
                // height so swapping keyboard <-> carousel keeps the input row
                // perfectly still.
                if showAttachOptions && !effectiveIsRecording {
                    attachmentCarouselPanel
                        .frame(height: attachmentPanelHeight)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }
            .background(composerBackground)
        }
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: showEphemeralPicker)
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: showPermanentEffectsPicker)
        .animation(.spring(response: 0.3, dampingFraction: 0.85), value: showAttachOptions)
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: allAttachments.count)
        .animation(
            reduceMotion
                ? .easeInOut(duration: 0.2)
                : .spring(response: 0.35, dampingFraction: 0.8),
            value: effectiveIsRecording
        )
        .adaptiveOnChange(of: attachments.count) { _, _ in notifyContentChange() }
        .adaptiveOnChange(of: effectiveIsRecording) { _, _ in notifyContentChange() }
        .onAppear {
            currentLanguage = selectedLanguage
            // Load initial draft if available
            if let id = storyId, let draft = getDraft?(id) {
                text = draft.text
                attachments = draft.attachments
            }
        }
        .adaptiveOnChange(of: selectedLanguage) { _, newValue in
            currentLanguage = newValue
        }
        .adaptiveOnChange(of: storyId) { oldId, newId in
            if let oldId {
                if isRecording { forceStopRecording() }
                onSaveDraft?(oldId, text, attachments)
            }
            if let newId, let draft = getDraft?(newId) {
                text = draft.text
                attachments = draft.attachments
            } else {
                text = ""
                attachments = []
            }
            showAttachOptions = false
            isFocused = false
            textAnalyzer.reset()
            notifyContentChange()
        }
        .adaptiveOnChange(of: focusTrigger.wrappedValue) { _, shouldFocus in
            if shouldFocus {
                isFocused = true
                focusTrigger.wrappedValue = false
            }
        }
        .adaptiveOnChange(of: isFocused) { _, focused in
            withAnimation(.spring(response: 0.35, dampingFraction: 0.55)) {
                focusBounce = focused
            }
            if focused {
                onAnyInteraction?()
            }
            if focused && showAttachOptions {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    showAttachOptions = false
                }
            }
            onFocusChange?(focused)
        }
        // Détection de langue en temps réel (Prisme Linguistique).
        //
        // `TextAnalyzer.performAnalysis` mute `language` ET `languageConfidence`
        // dans le **même** `DispatchQueue.main.async` — observer la confiance
        // seule suffit (elle change toujours en même temps que la langue).
        // Évite un double-fire de `applyDetectedLanguage` par cycle de
        // détection.
        //
        // Adoption au seuil 86 % (`ComposerLanguageResolver.confidenceFloor`).
        // Tant qu'aucune langue n'a atteint 86 %, le pill et la langue
        // envoyée restent sur le défaut « fr ». À 10 mots, le détecteur se
        // verrouille — la dernière langue à ≥ 86 % (ou « fr » si rien) est
        // définitive pour ce message.
        //
        // Override manuel (menu) : prioritaire, propagé immédiatement
        // (force=true) quelle que soit la confiance.
        .adaptiveOnChange(of: textAnalyzer.languageConfidence) { _, _ in
            applyDetectedLanguage()
        }
        .adaptiveOnChange(of: textAnalyzer.languageOverride?.code) { _, _ in
            applyDetectedLanguage(force: true)
        }
        .adaptiveOnChange(of: text) { _, newValue in
            onAnyInteraction?()
            notifyContentChange()
            textAnalyzer.analyze(text: newValue)
            // Texte vidé : on retombe sur le défaut (« fr ») pour que la
            // prochaine frappe parte d'un état propre. **Sauf** si la
            // langue a été choisie à la main (override) — dans ce cas on
            // respecte le choix utilisateur même quand le champ se vide,
            // sinon le pill afficherait EN (override) mais on enverrait FR.
            if newValue.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
               textAnalyzer.languageOverride == nil {
                let defaultLanguage = DefaultComposerLanguage.resolve()
                if currentLanguage != defaultLanguage {
                    currentLanguage = defaultLanguage
                    onLanguageChange?(defaultLanguage)
                }
            }
            onTextChange?(newValue)
            // Sync to external binding
            if let binding = textBinding, binding.wrappedValue != newValue {
                binding.wrappedValue = newValue
            }
            // Ripple wave on each keystroke
            if isFocused {
                typeWave = true
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
                    typeWave = false
                }
            }
            // Close attach options when typing starts
            if !newValue.isEmpty && showAttachOptions {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    showAttachOptions = false
                }
            }
            // Clipboard content: auto-create when pasting 2000+ chars
            handleClipboardCheck(newValue)
        }
        .adaptiveOnChange(of: textBinding?.wrappedValue) { _, newValue in
            guard let newValue, newValue != text else { return }
            text = newValue
        }
        .sheet(isPresented: $textAnalyzer.showLanguagePicker) {
            LanguagePickerSheet(
                style: isDark ? .dark : .light,
                onSelect: { lang in
                    let detected = DetectedLanguage.find(code: lang.id) ??
                        DetectedLanguage(id: lang.id, code: lang.id, flag: lang.flag, name: lang.name)
                    textAnalyzer.lockToLanguage(detected)
                    currentLanguage = detected.code
                    onLanguageChange?(detected.code)
                },
                onDismiss: { textAnalyzer.showLanguagePicker = false }
            )
        }
        .adaptiveOnChange(of: injectedEmoji.wrappedValue) { _, emoji in
            if !emoji.isEmpty {
                text += emoji
                DispatchQueue.main.async {
                    injectedEmoji.wrappedValue = ""
                }
            }
        }
    }

    // ========================================================================
    // MARK: - Top Toolbar
    // ========================================================================

    private var topToolbar: some View {
        HStack(spacing: 6) {
            // Ephemeral mode toggle (hidden for comments)
            if !resolvedHideEphemeral {
                ephemeralToggleButton
            }

            // Blur mode toggle
            if !hideBlur {
                blurToggleButton
            }

            // View-once mode toggle (opt-in — notification preview composer)
            if showViewOnce {
                viewOnceToggleButton
            }

            // Effects picker toggle (full sheet — messages only)
            if !resolvedHideEffects {
                effectsToggleButton
            }

            // Permanent effects inline toggle (comments only)
            if resolvedShowPermanentEffects {
                permanentEffectsToggleButton
            }

            // Sentiment indicator
            Button {
                onAnyInteraction?()
                HapticFeedback.light()
            } label: {
                Text(textAnalyzer.sentiment.emoji)
                    .font(.callout)
                    .frame(width: 30, height: 30)
                    .contentShape(Circle())
            }
            .animation(.spring(response: 0.3, dampingFraction: 0.5), value: textAnalyzer.sentiment)
            .accessibilityLabel(String(localized: "a11y.composer.sentiment", defaultValue: "Tonalité du message", bundle: .main))
            .accessibilityValue(textAnalyzer.sentiment.emoji)

            // Language selector
            languageSelectorPill

            Spacer()

            // Character counter
            if let maxLen = maxLength {
                let count = text.count
                if count > Int(Double(maxLen) * 0.8) {
                    Text("\(count)/\(maxLen)")
                        .font(.system(.caption2, design: .monospaced)).fontWeight(.semibold)
                        .foregroundColor(count >= maxLen ? MeeshyColors.error : mutedColor)
                        .transition(.opacity)
                }
            }
        }
    }

    // ========================================================================
    // MARK: - Language Selector Pill
    // ========================================================================

    private var languageSelectorPill: some View {
        Menu {
            ForEach(availableLanguages) { lang in
                Button {
                    currentLanguage = lang.code
                    onLanguageChange?(lang.code)
                    if let detected = DetectedLanguage.find(code: lang.code) {
                        textAnalyzer.lockToLanguage(detected)
                    }
                } label: {
                    HStack {
                        Text("\(lang.flag) \(lang.name)")
                        if lang.code == currentLanguage {
                            Image(systemName: "checkmark")
                        }
                    }
                }
            }
        } label: {
            HStack(spacing: 3) {
                Text(currentLangOption.flag)
                    .font(.caption)
                Text(currentLangOption.code.uppercased())
                    .font(.caption2).fontWeight(.semibold)
                Image(systemName: "chevron.down")
                    .font(.caption2.weight(.bold))
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(
                Capsule()
                    .fill(
                        style == .dark
                            ? Color.white.opacity(0.15)
                            : Color(hex: accentColor).opacity(0.15)
                    )
            )
            .foregroundColor(
                style == .dark
                    ? .white.opacity(0.9)
                    : Color(hex: accentColor)
            )
        }
        .accessibilityLabel(String(localized: "a11y.composer.language", defaultValue: "Langue du message", bundle: .main))
        .accessibilityValue(currentLangOption.name)
        .accessibilityHint(String(localized: "a11y.composer.language.hint", defaultValue: "Choisir la langue d'envoi du message", bundle: .main))
    }

    // ========================================================================
    // MARK: - Toolbar Icon Button
    // ========================================================================

    private func toolbarButton(icon: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.subheadline.weight(.medium))
                .foregroundColor(mutedColor)
                .frame(width: 30, height: 30)
                .contentShape(Circle())
        }
        .disabled(isRecording)
        .opacity(isRecording ? 0.4 : 1)
    }

    // ========================================================================
    // MARK: - Action Button: Mic / Send
    // ========================================================================

    /// Always renders `sendButton` so the user sees the affordance even before
    /// typing — composer bars that hide the send button until content lands
    /// leave the right-side HStack slot empty and feel visually unfinished
    /// (bug 2026-05-28: « on ne voit pas le bouton envoyer »). When idle the
    /// button stays in-place but is faded and non-tappable; it lights up the
    /// moment `hasContent || effectiveIsRecording` flips.
    @ViewBuilder
    var actionButton: some View {
        let isReady = (effectiveIsRecording || hasContent) && !externalIsSending
        sendButton
            .opacity(isReady ? 1.0 : 0.4)
            .allowsHitTesting(isReady)
            .animation(.spring(response: 0.3, dampingFraction: 0.6), value: hasContent)
            .animation(.spring(response: 0.25, dampingFraction: 0.5), value: sendBounce)
    }

    // See UniversalComposerBar+Recording.swift for textInputField

    // ========================================================================
    // MARK: - Send Button
    // ========================================================================

    var sendButton: some View {
        let editColors = [MeeshyColors.warning, MeeshyColors.warning.opacity(0.75)]
        let sendColors = [MeeshyColors.indigo500, MeeshyColors.indigo400]
        let colors = isEditMode ? editColors : sendColors
        let icon = isEditMode ? "checkmark" : "paperplane.fill"

        return Button {
            withAnimation(.spring(response: 0.25, dampingFraction: 0.5)) {
                sendBounce = true
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
                sendBounce = false
                handleSend()
            }
        } label: {
            ZStack {
                Circle()
                    .fill(
                        LinearGradient(
                            colors: colors,
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: 44, height: 44)
                    .shadow(color: colors[0].opacity(0.4), radius: sendBounce ? 12 : 8, x: 0, y: 4)

                Image(systemName: icon)
                    .font(.callout.weight(.semibold))
                    .foregroundColor(.white)
                    .rotationEffect(isEditMode ? .zero : .degrees(sendBounce ? 55 : 45))
                    .offset(
                        x: isEditMode ? 0 : (sendBounce ? 2 : -1),
                        y: isEditMode ? 0 : (sendBounce ? -2 : 1)
                    )
            }
            .scaleEffect(sendBounce ? 1.2 : 1)
        }
        .frame(width: 44, height: 44)
        .accessibilityLabel(isEditMode
            ? String(localized: "composer.send.editLabel", defaultValue: "Enregistrer les modifications", bundle: .main)
            : String(localized: "composer.send.label", defaultValue: "Envoyer le message", bundle: .main))
        .accessibilityHint(isEditMode
            ? ""
            : String(localized: "composer.send.hint", defaultValue: "Envoie le texte saisi", bundle: .main))
        .accessibilityIdentifier(MeeshyA11yID.composerSend)
    }

    // ========================================================================
    // MARK: - Background
    // ========================================================================

    private var composerBackground: some View {
        Color.clear
    }

    // ========================================================================
    // MARK: - Send Logic
    // ========================================================================

    func handleSend() {
        onAnyInteraction?()

        // Custom send (edit mode, recording, or parent-managed send)
        if let onCustomSend {
            onCustomSend()
            HapticFeedback.light()
            return
        }

        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty || !allAttachments.isEmpty else { return }

        // Rich callback (full parity with web MessageComposer)
        if let onSendMessage = onSendMessage {
            onSendMessage(trimmed, allAttachments, currentLanguage)
        }

        // Simple callback (backward compatible)
        if let onSend = onSend, !trimmed.isEmpty {
            onSend(trimmed)
        }

        // Clear state + remove draft for this story
        text = ""
        attachments.removeAll()
        isFocused = false
        textAnalyzer.reset()
        if let id = storyId {
            onSaveDraft?(id, "", [])
        }
        HapticFeedback.light()
    }

    // ========================================================================
    // MARK: - Helpers
    // ========================================================================

    var mutedColor: Color {
        style == .dark ? .white.opacity(0.5) : theme.textMuted
    }

    /// Notify parent that composer has content requiring timer pause (text, attachments, or recording).
    func notifyContentChange() {
        onHasContentChange?(hasText || !attachments.isEmpty || effectiveIsRecording)
    }

    // ========================================================================
    // MARK: - Language detection
    // ========================================================================

    /// Propagate the detected language (or an explicit user override) to
    /// `currentLanguage` and notify the parent. Called in real-time as
    /// `TextAnalyzer.language` updates — restores the « detection visible
    /// before the 18-word lock » behaviour that was previously gated on
    /// `isLanguageLocked` alone.
    ///
    /// - Parameter force: skip the confidence floor (used when the analyzer
    ///   transitions to locked or the user picks a language explicitly).
    func applyDetectedLanguage(force: Bool = false) {
        let resolution = ComposerLanguageResolver.resolve(
            current: currentLanguage,
            override: textAnalyzer.languageOverride?.code,
            detected: textAnalyzer.language?.code,
            confidence: textAnalyzer.languageConfidence,
            force: force
        )
        guard let next = resolution else { return }
        currentLanguage = next
        onLanguageChange?(next)
    }

    // ========================================================================
    // MARK: - Minimize / Expand Logic
    // ========================================================================

    private func expandComposer() {
        withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
            isMinimized = false
        }
        // Show keyboard after a short delay. The attachment carousel and the
        // keyboard are now mutually exclusive surfaces, so expanding goes
        // straight to the keyboard — the user opens the carousel via (+).
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
            isFocused = true
        }
        onExpand?()
    }

    // MARK: - Focus the text field (bring the keyboard back)

    /// Brings the system keyboard back, dismissing the attachment carousel if it
    /// was open. Wired to a tap on the text field so the user can always summon
    /// the keyboard by tapping where they type — even mid-carousel.
    func focusTextField() {
        if showAttachOptions {
            withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) {
                showAttachOptions = false
            }
        }
        if !isFocused {
            isFocused = true
        }
    }

    // ========================================================================
    // MARK: - Swipe Handle
    // ========================================================================

    private var swipeHandle: some View {
        HStack {
            Spacer()
            RoundedRectangle(cornerRadius: 2)
                .fill(style == .dark ? Color.white.opacity(0.2) : Color.black.opacity(0.12))
                .frame(width: 36, height: 4)
            Spacer()
        }
        .padding(.top, 8)
        .padding(.bottom, 2)
    }

    // ========================================================================
    // MARK: - Ephemeral Toggle Button
    // ========================================================================

    @ViewBuilder
    private var ephemeralToggleButton: some View {
        let isActive = ephemeralDuration.wrappedValue != nil

        Button {
            onAnyInteraction?()
            HapticFeedback.light()
            if isActive {
                ephemeralDuration.wrappedValue = nil
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    showEphemeralPicker = false
                }
            } else {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    showEphemeralPicker.toggle()
                }
            }
        } label: {
            HStack(spacing: 4) {
                Image(systemName: isActive ? "flame.fill" : "timer.circle")
                    .font(.caption.weight(.semibold))
                    .foregroundColor(isActive ? MeeshyColors.error : mutedColor)

                if let duration = ephemeralDuration.wrappedValue {
                    Text(duration.label)
                        .font(.caption2).fontWeight(.bold)
                        .foregroundColor(MeeshyColors.error)
                }
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(
                Capsule()
                    .fill(isActive
                          ? MeeshyColors.error.opacity(0.15)
                          : Color.clear)
                    .overlay(
                        Capsule()
                            .stroke(isActive
                                    ? MeeshyColors.error.opacity(0.3)
                                    : Color.clear,
                                    lineWidth: 0.5)
                    )
            )
        }
        .accessibilityLabel(isActive
                            ? String(localized: "composer.ephemeral.active", defaultValue: "Mode ephemere actif: \(ephemeralDuration.wrappedValue?.displayLabel ?? "")", bundle: .main)
                            : String(localized: "composer.ephemeral.activate", defaultValue: "Activer le mode ephemere", bundle: .main))
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: isActive)
    }

    // ========================================================================
    // MARK: - Ephemeral Duration Picker
    // ========================================================================

    private var ephemeralDurationPicker: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                Button {
                    HapticFeedback.light()
                    ephemeralDuration.wrappedValue = nil
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                        showEphemeralPicker = false
                    }
                } label: {
                    Text(String(localized: "composer.ephemeral.off", defaultValue: "Off", bundle: .main))
                        .font(.caption).fontWeight(.semibold)
                        .foregroundColor(ephemeralDuration.wrappedValue == nil ? .white : mutedColor)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 6)
                        .background(
                            Capsule()
                                .fill(ephemeralDuration.wrappedValue == nil
                                      ? Color(hex: accentColor)
                                      : style == .dark ? Color.white.opacity(0.08) : Color.black.opacity(0.04))
                        )
                }

                ForEach(EphemeralDuration.allCases) { duration in
                    Button {
                        HapticFeedback.light()
                        ephemeralDuration.wrappedValue = duration
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                            showEphemeralPicker = false
                        }
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: "flame.fill")
                                .font(.caption2)
                            Text(duration.label)
                                .font(.caption).fontWeight(.semibold)
                        }
                        .foregroundColor(ephemeralDuration.wrappedValue == duration ? .white : MeeshyColors.error)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 6)
                        .background(
                            Capsule()
                                .fill(ephemeralDuration.wrappedValue == duration
                                      ? MeeshyColors.error
                                      : MeeshyColors.error.opacity(0.1))
                                .overlay(
                                    Capsule()
                                        .stroke(MeeshyColors.error.opacity(0.3), lineWidth: 0.5)
                                )
                        )
                    }
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
        }
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(style == .dark ? Color.black.opacity(0.3) : isDark ? Color.black.opacity(0.3) : Color.white.opacity(0.9))
                .overlay(
                    RoundedRectangle(cornerRadius: 16)
                        .stroke(MeeshyColors.error.opacity(0.2), lineWidth: 0.5)
                )
        )
        .padding(.horizontal, 8)
    }

    // ========================================================================
    // MARK: - Blur Toggle Button
    // ========================================================================

    @ViewBuilder
    private var blurToggleButton: some View {
        let isActive = isBlurEnabled.wrappedValue

        Button {
            onAnyInteraction?()
            HapticFeedback.light()
            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                isBlurEnabled.wrappedValue.toggle()
            }
        } label: {
            HStack(spacing: 4) {
                Image(systemName: isActive ? "eye.slash.fill" : "eye.slash")
                    .font(.caption.weight(.semibold))
                    .foregroundColor(isActive ? MeeshyColors.indigo600 : mutedColor)

                if isActive {
                    Text(String(localized: "composer.blur.label", defaultValue: "Flou", bundle: .main))
                        .font(.caption2).fontWeight(.bold)
                        .foregroundColor(MeeshyColors.indigo600)
                }
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(
                Capsule()
                    .fill(isActive
                          ? MeeshyColors.indigo600.opacity(0.15)
                          : Color.clear)
                    .overlay(
                        Capsule()
                            .stroke(isActive
                                    ? MeeshyColors.indigo600.opacity(0.3)
                                    : Color.clear,
                                    lineWidth: 0.5)
                    )
            )
        }
        .accessibilityLabel(isActive
                            ? String(localized: "composer.blur.active", defaultValue: "Mode flou actif", bundle: .main)
                            : String(localized: "composer.blur.activate", defaultValue: "Activer le mode flou", bundle: .main))
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: isActive)
    }

    // ========================================================================
    // MARK: - View-Once Toggle Button
    // ========================================================================

    @ViewBuilder
    private var viewOnceToggleButton: some View {
        let isActive = isViewOnceEnabled.wrappedValue

        Button {
            onAnyInteraction?()
            HapticFeedback.light()
            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                isViewOnceEnabled.wrappedValue.toggle()
            }
        } label: {
            HStack(spacing: 4) {
                Image(systemName: isActive ? "1.circle.fill" : "1.circle")
                    .font(.caption.weight(.semibold))
                    .foregroundColor(isActive ? MeeshyColors.indigo600 : mutedColor)

                if isActive {
                    Text(String(localized: "composer.viewonce.label", defaultValue: "Vue unique", bundle: .main))
                        .font(.caption2).fontWeight(.bold)
                        .foregroundColor(MeeshyColors.indigo600)
                }
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(
                Capsule()
                    .fill(isActive
                          ? MeeshyColors.indigo600.opacity(0.15)
                          : Color.clear)
                    .overlay(
                        Capsule()
                            .stroke(isActive
                                    ? MeeshyColors.indigo600.opacity(0.3)
                                    : Color.clear,
                                    lineWidth: 0.5)
                    )
            )
        }
        .accessibilityLabel(isActive
                            ? String(localized: "composer.viewonce.active", defaultValue: "Mode vue unique actif", bundle: .main)
                            : String(localized: "composer.viewonce.activate", defaultValue: "Activer le mode vue unique", bundle: .main))
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: isActive)
    }
}

// MARK: - Effects Toggle Button (extension)
extension UniversalComposerBar {

    var effectsToggleButton: some View {
        let isActive = pendingEffects.wrappedValue.hasAnyEffect
        let effectCount = pendingEffects.wrappedValue.flags.rawValue.nonzeroBitCount

        return Button {
            onAnyInteraction?()
            HapticFeedback.light()
            onRequestEffectsPicker?()
        } label: {
            HStack(spacing: 4) {
                Image(systemName: isActive ? "wand.and.stars" : "wand.and.stars")
                    .font(.caption.weight(.semibold))
                    .foregroundColor(isActive ? Color(hex: accentColor) : mutedColor)

                if isActive {
                    Text("\(effectCount)")
                        .font(.caption2).fontWeight(.bold)
                        .foregroundColor(Color(hex: accentColor))
                }
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(
                Capsule()
                    .fill(isActive
                          ? Color(hex: accentColor).opacity(0.15)
                          : Color.clear)
                    .overlay(
                        Capsule()
                            .stroke(isActive
                                    ? Color(hex: accentColor).opacity(0.3)
                                    : Color.clear,
                                    lineWidth: 0.5)
                    )
            )
        }
        .accessibilityLabel(isActive
                            ? String(localized: "composer.effects.active", defaultValue: "\(effectCount) effet(s) actif(s)", bundle: .main)
                            : String(localized: "composer.effects.add", defaultValue: "Ajouter des effets au message", bundle: .main))
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: isActive)
    }

    // ========================================================================
    // MARK: - Permanent Effects Toggle Button (comments)
    // ========================================================================

    var permanentEffectsToggleButton: some View {
        let persistentFlags: [MessageEffectFlags] = [.glow, .pulse, .rainbow, .sparkle]
        let activeCount = persistentFlags.filter { pendingEffects.wrappedValue.flags.contains($0) }.count
        let isActive = activeCount > 0

        return Button {
            onAnyInteraction?()
            HapticFeedback.light()
            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                showPermanentEffectsPicker.toggle()
            }
        } label: {
            HStack(spacing: 4) {
                Image(systemName: isActive ? "wand.and.stars" : "wand.and.stars")
                    .font(.caption.weight(.semibold))
                    .foregroundColor(isActive ? Color(hex: accentColor) : mutedColor)

                if isActive {
                    Text("\(activeCount)")
                        .font(.caption2).fontWeight(.bold)
                        .foregroundColor(Color(hex: accentColor))
                }
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(
                Capsule()
                    .fill(isActive
                          ? Color(hex: accentColor).opacity(0.15)
                          : Color.clear)
                    .overlay(
                        Capsule()
                            .stroke(isActive
                                    ? Color(hex: accentColor).opacity(0.3)
                                    : Color.clear,
                                    lineWidth: 0.5)
                    )
            )
        }
        .accessibilityLabel(isActive
                            ? String(localized: "composer.effects.permanent.active", defaultValue: "\(activeCount) effet(s) permanent(s) actif(s)", bundle: .main)
                            : String(localized: "composer.effects.permanent.add", defaultValue: "Ajouter des effets permanents", bundle: .main))
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: isActive)
    }

    // ========================================================================
    // MARK: - Permanent Effects Inline Picker (comments)
    // ========================================================================

    var permanentEffectsInlinePicker: some View {
        let items: [(flag: MessageEffectFlags, icon: String, label: String)] = [
            (.glow, "sun.max", String(localized: "composer.effects.glow", defaultValue: "Lueur", bundle: .main)),
            (.pulse, "heart.fill", String(localized: "composer.effects.pulse", defaultValue: "Pulsation", bundle: .main)),
            (.rainbow, "rainbow", String(localized: "composer.effects.rainbow", defaultValue: "Arc-en-ciel", bundle: .main)),
            (.sparkle, "sparkle", String(localized: "composer.effects.sparkle", defaultValue: "Scintillant", bundle: .main)),
        ]

        return ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(items, id: \.label) { item in
                    let isSelected = pendingEffects.wrappedValue.flags.contains(item.flag)
                    Button {
                        HapticFeedback.light()
                        if isSelected {
                            pendingEffects.wrappedValue.flags.remove(item.flag)
                        } else {
                            pendingEffects.wrappedValue.flags.insert(item.flag)
                        }
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: item.icon)
                                .font(.caption2)
                            Text(item.label)
                                .font(.caption).fontWeight(.semibold)
                        }
                        .foregroundColor(isSelected ? .white : Color(hex: accentColor))
                        .padding(.horizontal, 14)
                        .padding(.vertical, 6)
                        .background(
                            Capsule()
                                .fill(isSelected
                                      ? Color(hex: accentColor)
                                      : Color(hex: accentColor).opacity(0.1))
                                .overlay(
                                    Capsule()
                                        .stroke(Color(hex: accentColor).opacity(0.3), lineWidth: 0.5)
                                )
                        )
                    }
                    .animation(.spring(response: 0.3, dampingFraction: 0.8), value: isSelected)
                    .accessibilityLabel(String(localized: "composer.effects.item.state", defaultValue: "\(item.label), \(isSelected ? String(localized: "common.active", defaultValue: "actif", bundle: .main) : String(localized: "common.inactive", defaultValue: "inactif", bundle: .main))", bundle: .main))
                    .accessibilityAddTraits(isSelected ? .isSelected : [])
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
        }
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(style == .dark ? Color.black.opacity(0.3) : isDark ? Color.black.opacity(0.3) : Color.white.opacity(0.9))
                .overlay(
                    RoundedRectangle(cornerRadius: 16)
                        .stroke(Color(hex: accentColor).opacity(0.2), lineWidth: 0.5)
                )
        )
        .padding(.horizontal, 8)
    }
}
