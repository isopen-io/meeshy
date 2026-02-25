import SwiftUI
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
    var accentColor: String = "08D9D6"
    var secondaryColor: String = "4ECDC4"
    var maxLength: Int? = nil
    var showVoice: Bool = true
    var showLocation: Bool = true
    var showAttachment: Bool = true
    var showLanguageSelector: Bool = false
    var showEmoji: Bool = true

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
    var onStopRecording: (() -> Void)? = nil
    var externalIsRecording: Bool? = nil
    var externalRecordingDuration: TimeInterval? = nil
    var externalAudioLevels: [CGFloat]? = nil

    // MARK: - External content flag

    var externalHasContent: Bool = false

    // MARK: - Attachment ladder callbacks

    var onPhotoLibrary: (() -> Void)? = nil
    var onCamera: (() -> Void)? = nil
    var onFilePicker: (() -> Void)? = nil

    /// Called when user taps emoji icon in ladder — parent should show EmojiFullPickerSheet
    var onRequestTextEmoji: (() -> Void)? = nil

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

    // Text analysis (sentiment + language detection from MessageComposer)
    @StateObject private var textAnalyzer = TextAnalyzer()
    @State var attachRotation: Double = 0
    @State var typeWave: Bool = false

    @ObservedObject var theme = ThemeManager.shared

    // MARK: - Mode-resolved properties

    var resolvedPlaceholder: String { mode?.placeholder ?? placeholder }
    var resolvedMaxLength: Int? { mode?.maxLength ?? maxLength }
    var resolvedShowVoice: Bool { mode?.showVoice ?? showVoice }
    var resolvedShowAttachment: Bool { mode?.showAttachment ?? showAttachment }
    private var resolvedShowLanguage: Bool { mode?.showLanguageSelector ?? showLanguageSelector }

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
                                    // Swipe down: collapse keyboard / minimize
                                    isFocused = false
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
                                            colors: [Color(hex: "FF6B6B").opacity(0.5), Color(hex: "FF2E63").opacity(0.3)],
                                            startPoint: .topLeading, endPoint: .bottomTrailing
                                        ), lineWidth: 1
                                    )
                                )
                                .shadow(color: Color(hex: "FF6B6B").opacity(0.2), radius: 6, y: 2)

                            Image(systemName: "mic.fill")
                                .font(.system(size: 18, weight: .medium))
                                .foregroundStyle(
                                    LinearGradient(
                                        colors: [Color(hex: "FF6B6B"), Color(hex: "FF2E63")],
                                        startPoint: .topLeading, endPoint: .bottomTrailing
                                    )
                                )
                        }
                        Text("Vocal")
                            .font(.system(size: 9, weight: .semibold))
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
                            .font(.system(size: 20, weight: .semibold))
                            .foregroundColor(.white)
                    }
                    Text("\u{00C9}crire")
                        .font(.system(size: 9, weight: .semibold))
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

                // Top toolbar (ephemeral, sentiment, language, recording indicator, char counter)
                topToolbar
                    .padding(.horizontal, 8)
                    .padding(.top, 6)
                    .padding(.bottom, 2)

                // Composer row — mirrors MessageComposer layout:
                // [ (+) attach ]  [ text field / waveform ]  [ mic / send ]
                HStack(alignment: .bottom, spacing: 12) {
                    // Left: (+) attach button with ladder overlay above it
                    Group {
                        if effectiveIsRecording {
                            stopRecordingButton
                                .transition(.scale.combined(with: .opacity))
                        } else if resolvedShowAttachment {
                            attachButton
                        }
                    }
                    .overlay(alignment: .bottom) {
                        if showAttachOptions && resolvedShowAttachment && !effectiveIsRecording {
                            attachmentLadder
                                .transition(.opacity.combined(with: .move(edge: .bottom)))
                        }
                    }

                    // Center: text field or recording waveform
                    if effectiveIsRecording {
                        voiceRecordingView
                    } else {
                        textInputField
                    }

                    // Right: send (when content/recording) or mic (idle)
                    actionButton
                }
                .animation(.spring(response: 0.3, dampingFraction: 0.7), value: hasContent)
                .animation(.spring(response: 0.3, dampingFraction: 0.7), value: effectiveIsRecording)
                .padding(.horizontal, 12)
                .padding(.vertical, 10)
            }
            .background(composerBackground)
        }
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: showEphemeralPicker)
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: allAttachments.count)
        .onChange(of: attachments.count) { _, _ in notifyContentChange() }
        .onChange(of: effectiveIsRecording) { _, _ in notifyContentChange() }
        .onAppear {
            currentLanguage = selectedLanguage
            // Load initial draft if available
            if let id = storyId, let draft = getDraft?(id) {
                text = draft.text
                attachments = draft.attachments
            }
        }
        .onChange(of: selectedLanguage) { _, newValue in
            currentLanguage = newValue
        }
        .onChange(of: storyId) { oldId, newId in
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
        .onChange(of: focusTrigger.wrappedValue) { _, shouldFocus in
            if shouldFocus {
                isFocused = true
                focusTrigger.wrappedValue = false
            }
        }
        .onChange(of: isFocused) { _, focused in
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
        .onChange(of: text) { _, newValue in
            onAnyInteraction?()
            notifyContentChange()
            textAnalyzer.analyze(text: newValue)
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
        .onChange(of: textBinding?.wrappedValue) { _, newValue in
            guard let newValue, newValue != text else { return }
            text = newValue
        }
        .sheet(isPresented: $textAnalyzer.showLanguagePicker) {
            LanguagePickerSheet(analyzer: textAnalyzer)
        }
        .onChange(of: injectedEmoji.wrappedValue) { _, emoji in
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
            // Ephemeral mode toggle
            if !hideEphemeral {
                ephemeralToggleButton
            }

            // Blur mode toggle
            if !hideBlur {
                blurToggleButton
            }

            // Sentiment indicator
            Button {
                onAnyInteraction?()
                HapticFeedback.light()
            } label: {
                Text(textAnalyzer.sentiment.emoji)
                    .font(.system(size: 16))
                    .frame(width: 30, height: 30)
                    .contentShape(Circle())
            }
            .animation(.spring(response: 0.3, dampingFraction: 0.5), value: textAnalyzer.sentiment)

            // Language selector
            languageSelectorPill

            Spacer()

            // Character counter
            if let maxLen = maxLength {
                let count = text.count
                if count > Int(Double(maxLen) * 0.8) {
                    Text("\(count)/\(maxLen)")
                        .font(.system(size: 10, weight: .semibold, design: .monospaced))
                        .foregroundColor(count >= maxLen ? Color(hex: "EF4444") : mutedColor)
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
                    .font(.system(size: 12))
                Text(currentLangOption.code.uppercased())
                    .font(.system(size: 11, weight: .semibold))
                Image(systemName: "chevron.down")
                    .font(.system(size: 8, weight: .bold))
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
    }

    // ========================================================================
    // MARK: - Toolbar Icon Button
    // ========================================================================

    private func toolbarButton(icon: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.system(size: 14, weight: .medium))
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

    @ViewBuilder
    var actionButton: some View {
        if effectiveIsRecording || hasContent {
            sendButton
                .transition(.scale.combined(with: .opacity))
                .animation(.spring(response: 0.3, dampingFraction: 0.6), value: hasContent)
                .animation(.spring(response: 0.25, dampingFraction: 0.5), value: sendBounce)
        }
    }

    // See UniversalComposerBar+Recording.swift for textInputField

    // ========================================================================
    // MARK: - Send Button
    // ========================================================================

    var sendButton: some View {
        let editColors = [Color(hex: "F8B500"), Color(hex: "E67E22")]
        let sendColors = [Color(hex: "FF2E63"), Color(hex: "FF6B6B")]
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
                    .font(.system(size: 16, weight: .semibold))
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
    }

    // ========================================================================
    // MARK: - Background
    // ========================================================================

    private var composerBackground: some View {
        let accent = Color(hex: accentColor)
        let isDark = theme.mode.isDark

        return ZStack {
            Color.clear

            accent
                .opacity(isFocused
                    ? (isDark ? 0.10 : 0.05)
                    : (isDark ? 0.03 : 0.01))

            VStack {
                Rectangle()
                    .fill(accent.opacity(isFocused ? (isDark ? 0.4 : 0.25) : (isDark ? 0.12 : 0.06)))
                    .frame(height: 0.5)
                Spacer()
            }
        }
        .animation(.easeInOut(duration: 0.25), value: isFocused)
    }

    // ========================================================================
    // MARK: - Send Logic
    // ========================================================================

    private func handleSend() {
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
    // MARK: - Minimize / Expand Logic
    // ========================================================================

    private func expandComposer() {
        withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
            isMinimized = false
        }
        // Show keyboard + open attach menu after a short delay
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
            isFocused = true
            if resolvedShowAttachment {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    showAttachOptions = true
                }
            }
        }
        onExpand?()
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
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(isActive ? Color(hex: "FF6B6B") : mutedColor)

                if let duration = ephemeralDuration.wrappedValue {
                    Text(duration.label)
                        .font(.system(size: 10, weight: .bold))
                        .foregroundColor(Color(hex: "FF6B6B"))
                }
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(
                Capsule()
                    .fill(isActive
                          ? Color(hex: "FF6B6B").opacity(0.15)
                          : Color.clear)
                    .overlay(
                        Capsule()
                            .stroke(isActive
                                    ? Color(hex: "FF6B6B").opacity(0.3)
                                    : Color.clear,
                                    lineWidth: 0.5)
                    )
            )
        }
        .accessibilityLabel(isActive
                            ? "Mode ephemere actif: \(ephemeralDuration.wrappedValue!.displayLabel)"
                            : "Activer le mode ephemere")
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
                    Text("Off")
                        .font(.system(size: 12, weight: .semibold))
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
                                .font(.system(size: 10))
                            Text(duration.label)
                                .font(.system(size: 12, weight: .semibold))
                        }
                        .foregroundColor(ephemeralDuration.wrappedValue == duration ? .white : Color(hex: "FF6B6B"))
                        .padding(.horizontal, 14)
                        .padding(.vertical, 6)
                        .background(
                            Capsule()
                                .fill(ephemeralDuration.wrappedValue == duration
                                      ? Color(hex: "FF6B6B")
                                      : Color(hex: "FF6B6B").opacity(0.1))
                                .overlay(
                                    Capsule()
                                        .stroke(Color(hex: "FF6B6B").opacity(0.3), lineWidth: 0.5)
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
                .fill(style == .dark ? Color.black.opacity(0.3) : theme.mode.isDark ? Color.black.opacity(0.3) : Color.white.opacity(0.9))
                .overlay(
                    RoundedRectangle(cornerRadius: 16)
                        .stroke(Color(hex: "FF6B6B").opacity(0.2), lineWidth: 0.5)
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
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(isActive ? Color(hex: "A855F7") : mutedColor)

                if isActive {
                    Text("Blur")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundColor(Color(hex: "A855F7"))
                }
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(
                Capsule()
                    .fill(isActive
                          ? Color(hex: "A855F7").opacity(0.15)
                          : Color.clear)
                    .overlay(
                        Capsule()
                            .stroke(isActive
                                    ? Color(hex: "A855F7").opacity(0.3)
                                    : Color.clear,
                                    lineWidth: 0.5)
                    )
            )
        }
        .accessibilityLabel(isActive
                            ? "Mode flou actif"
                            : "Activer le mode flou")
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: isActive)
    }
}
