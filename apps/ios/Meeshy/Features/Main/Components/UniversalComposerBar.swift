import SwiftUI
import AVFoundation
import CoreLocation
import Combine

// ============================================================================
// MARK: - Models
// ============================================================================

enum ComposerAttachmentType: String, Equatable {
    case image, file, voice, location, video
}

struct ComposerAttachment: Identifiable, Equatable {
    let id: String
    let type: ComposerAttachmentType
    let name: String
    var url: URL?
    var size: Int?
    var duration: TimeInterval?
    var latitude: Double?
    var longitude: Double?
    var thumbnailColor: String = "808080"

    static func == (lhs: Self, rhs: Self) -> Bool { lhs.id == rhs.id }

    // Convenience factories
    static func voice(duration: TimeInterval) -> ComposerAttachment {
        ComposerAttachment(
            id: "voice-\(Int(Date().timeIntervalSince1970 * 1000))",
            type: .voice,
            name: "Message vocal (\(Self.formatDur(duration)))",
            duration: duration,
            thumbnailColor: "FF6B6B"
        )
    }

    static func location(lat: Double, lng: Double) -> ComposerAttachment {
        ComposerAttachment(
            id: "location-\(Int(Date().timeIntervalSince1970 * 1000))",
            type: .location,
            name: "Position actuelle",
            latitude: lat,
            longitude: lng,
            thumbnailColor: "2ECC71"
        )
    }

    static func image(url: URL? = nil, name: String = "Photo", color: String = "9B59B6") -> ComposerAttachment {
        ComposerAttachment(
            id: "image-\(Int(Date().timeIntervalSince1970 * 1000))-\(Int.random(in: 0...9999))",
            type: .image,
            name: name,
            url: url,
            thumbnailColor: color
        )
    }

    static func file(url: URL? = nil, name: String = "Fichier", size: Int? = nil, color: String = "45B7D1") -> ComposerAttachment {
        ComposerAttachment(
            id: "file-\(Int(Date().timeIntervalSince1970 * 1000))-\(Int.random(in: 0...9999))",
            type: .file,
            name: name,
            url: url,
            size: size,
            thumbnailColor: color
        )
    }

    private static func formatDur(_ seconds: TimeInterval) -> String {
        let mins = Int(seconds) / 60
        let secs = Int(seconds) % 60
        return String(format: "%d:%02d", mins, secs)
    }
}

struct LanguageOption: Identifiable {
    var id: String { code }
    let code: String
    let name: String
    let flag: String

    static let defaults: [LanguageOption] = [
        LanguageOption(code: "fr", name: "Français", flag: "🇫🇷"),
        LanguageOption(code: "en", name: "English", flag: "🇬🇧"),
        LanguageOption(code: "es", name: "Español", flag: "🇪🇸"),
        LanguageOption(code: "de", name: "Deutsch", flag: "🇩🇪"),
        LanguageOption(code: "it", name: "Italiano", flag: "🇮🇹"),
        LanguageOption(code: "pt", name: "Português", flag: "🇧🇷"),
        LanguageOption(code: "ja", name: "日本語", flag: "🇯🇵"),
        LanguageOption(code: "zh", name: "中文", flag: "🇨🇳"),
        LanguageOption(code: "ko", name: "한국어", flag: "🇰🇷"),
        LanguageOption(code: "ar", name: "العربية", flag: "🇸🇦"),
    ]
}

// ============================================================================
// MARK: - Keyboard Observer
// ============================================================================

class KeyboardObserver: ObservableObject {
    @Published var height: CGFloat = 0
    @Published var isVisible = false

    /// Last non-zero keyboard height — useful for sizing emoji panel
    var lastKnownHeight: CGFloat = 280

    private var cancellables = Set<AnyCancellable>()

    init() {
        NotificationCenter.default.publisher(for: UIResponder.keyboardWillChangeFrameNotification)
            .sink { [weak self] notification in
                guard let self = self,
                      let endFrame = notification.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect,
                      let duration = notification.userInfo?[UIResponder.keyboardAnimationDurationUserInfoKey] as? Double
                else { return }

                let screenHeight = UIScreen.main.bounds.height
                let newHeight = max(screenHeight - endFrame.origin.y, 0)

                if newHeight > 0 {
                    self.lastKnownHeight = newHeight
                }

                withAnimation(.easeInOut(duration: max(duration, 0.15))) {
                    self.height = newHeight
                    self.isVisible = newHeight > 0
                }
            }
            .store(in: &cancellables)
    }
}

// ============================================================================
// MARK: - Location Helper
// ============================================================================

private class ComposerLocationHelper: NSObject, ObservableObject, CLLocationManagerDelegate {
    private let manager = CLLocationManager()
    var onLocationReceived: ((Double, Double) -> Void)?

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBest
    }

    func requestLocation() {
        let status = manager.authorizationStatus
        if status == .notDetermined {
            manager.requestWhenInUseAuthorization()
        }
        manager.requestLocation()
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        if let loc = locations.first {
            onLocationReceived?(loc.coordinate.latitude, loc.coordinate.longitude)
        }
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        print("ComposerLocationHelper error:", error.localizedDescription)
    }
}

// ============================================================================
// MARK: - Waveform Bar Animation
// ============================================================================

private struct ComposerWaveformBar: View {
    let index: Int
    let isRecording: Bool
    let accentColor: String

    @State private var height: CGFloat = 4

    var body: some View {
        RoundedRectangle(cornerRadius: 2)
            .fill(
                LinearGradient(
                    colors: [Color(hex: accentColor).opacity(0.8), Color(hex: accentColor).opacity(0.4)],
                    startPoint: .top,
                    endPoint: .bottom
                )
            )
            .frame(width: 3, height: height)
            .onAppear { animate() }
            .onChange(of: isRecording) { rec in
                if rec { animate() } else { height = 4 }
            }
    }

    private func animate() {
        guard isRecording else { return }
        let delay = Double(index) * 0.05
        withAnimation(
            .easeInOut(duration: Double.random(in: 0.3...0.6))
            .repeatForever(autoreverses: true)
            .delay(delay)
        ) {
            height = CGFloat.random(in: 6...24)
        }
    }
}

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

    // MARK: - Attachment ladder callbacks

    var onPhotoLibrary: (() -> Void)? = nil
    var onCamera: (() -> Void)? = nil
    var onFilePicker: (() -> Void)? = nil

    /// Called when user taps emoji icon in ladder — parent should show EmojiFullPickerSheet
    var onRequestTextEmoji: (() -> Void)? = nil

    /// Bind this to inject an emoji into the text field from outside (e.g. from parent's emoji picker)
    var injectedEmoji: Binding<String> = .constant("")

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

    /// Called when recording state changes (true = started, false = stopped)
    var onRecordingChange: ((Bool) -> Void)? = nil

    /// Called when composer content changes (text, attachments, or recording).
    /// True = has pending content that should block story timer.
    var onHasContentChange: ((Bool) -> Void)? = nil

    // MARK: - State

    @State private var text = ""
    @FocusState private var isFocused: Bool
    @State private var sendBounce = false
    @State private var focusBounce = false
    @State private var showAttachOptions = false
    @State private var attachButtonPressed = false
    @State private var currentLanguage: String = "fr"
    @State private var previousStoryId: String? = nil

    // Voice recording
    @State private var isRecording = false
    @State private var recordingDuration: TimeInterval = 0
    @State private var recordingTimer: Timer?

    // Attachments
    @State private var attachments: [ComposerAttachment] = []

    // Location
    @StateObject private var locationHelper = ComposerLocationHelper()

    // Text analysis (sentiment + language detection from MessageComposer)
    @StateObject private var textAnalyzer = TextAnalyzer()
    @State private var attachRotation: Double = 0
    @State private var typeWave: Bool = false

    @ObservedObject private var theme = ThemeManager.shared

    // MARK: - Computed

    private var hasText: Bool {
        !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private var hasContent: Bool {
        hasText || !allAttachments.isEmpty
    }

    private var allAttachments: [ComposerAttachment] {
        attachments + externalAttachments
    }

    private var textColor: Color {
        style == .dark ? .white : theme.textPrimary
    }

    private var placeholderColor: Color {
        style == .dark ? .white.opacity(0.4) : theme.textMuted
    }

    private var currentLangOption: LanguageOption {
        availableLanguages.first(where: { $0.code == currentLanguage }) ?? availableLanguages[0]
    }

    // MARK: - Body

    var body: some View {
        VStack(spacing: 0) {
            // Attachments preview (above the composer, like web MessageComposer)
            if !allAttachments.isEmpty {
                attachmentsPreview
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }

            // Main composer
            VStack(spacing: 0) {
                // Top toolbar (sentiment, language, recording indicator, char counter)
                topToolbar
                    .padding(.horizontal, 8)
                    .padding(.top, 6)
                    .padding(.bottom, 2)

                // Composer row — mirrors MessageComposer layout:
                // [ (+) attach ]  [ text field / waveform ]  [ mic / send ]
                HStack(alignment: .bottom, spacing: 12) {
                    // Left: (+) attach button with ladder overlay above it
                    Group {
                        if isRecording {
                            stopRecordingButton
                                .transition(.scale.combined(with: .opacity))
                        } else {
                            attachButton
                        }
                    }
                    .overlay(alignment: .bottom) {
                        if showAttachOptions && showAttachment && !isRecording {
                            attachmentLadder
                                .transition(.opacity.combined(with: .move(edge: .bottom)))
                        }
                    }

                    // Center: text field or recording waveform
                    if isRecording {
                        voiceRecordingView
                    } else {
                        textInputField
                    }

                    // Right: send (when content/recording) or mic (idle)
                    actionButton
                }
                .animation(.spring(response: 0.3, dampingFraction: 0.7), value: hasContent)
                .animation(.spring(response: 0.3, dampingFraction: 0.7), value: isRecording)
                .padding(.horizontal, 12)
                .padding(.vertical, 10)
            }
            .background(composerBackground)
        }
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: allAttachments.count)
        .onChange(of: attachments.count) { _ in notifyContentChange() }
        .onChange(of: isRecording) { _ in notifyContentChange() }
        .onAppear {
            currentLanguage = selectedLanguage
            previousStoryId = storyId
            // Load initial draft if available
            if let id = storyId, let draft = getDraft?(id) {
                text = draft.text
                attachments = draft.attachments
            }
            locationHelper.onLocationReceived = { lat, lng in
                onAnyInteraction?()
                let attachment = ComposerAttachment.location(lat: lat, lng: lng)
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    attachments.append(attachment)
                }
                onLocationRequest?()
            }
        }
        .onChange(of: selectedLanguage) { newValue in
            currentLanguage = newValue
        }
        .onChange(of: storyId) { newId in
            // Save draft for previous story (stop recording if in progress)
            if let prevId = previousStoryId {
                if isRecording {
                    forceStopRecording()
                }
                onSaveDraft?(prevId, text, attachments)
            }
            // Load draft for new story
            if let newId = newId, let draft = getDraft?(newId) {
                text = draft.text
                attachments = draft.attachments
            } else {
                text = ""
                attachments = []
            }
            // Reset transient UI state
            showAttachOptions = false
            isFocused = false
            textAnalyzer.reset()
            previousStoryId = newId
            notifyContentChange()
        }
        .onChange(of: isFocused) { focused in
            withAnimation(.spring(response: 0.35, dampingFraction: 0.55)) {
                focusBounce = focused
            }
            if focused {
                onAnyInteraction?()
            }
            // Close attach menu when typing
            if focused && showAttachOptions {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    showAttachOptions = false
                }
            }
            onFocusChange?(focused)
        }
        .onChange(of: text) { newValue in
            onAnyInteraction?()
            notifyContentChange()
            textAnalyzer.analyze(text: newValue)
            // Ripple wave on each keystroke
            if isFocused {
                typeWave = true
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
                    typeWave = false
                }
            }
        }
        .sheet(isPresented: $textAnalyzer.showLanguagePicker) {
            LanguagePickerSheet(analyzer: textAnalyzer)
        }
        .onChange(of: injectedEmoji.wrappedValue) { emoji in
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
    // MARK: - Recording Indicator
    // ========================================================================

    private var recordingIndicator: some View {
        HStack(spacing: 4) {
            Circle()
                .fill(Color(hex: "EF4444"))
                .frame(width: 6, height: 6)
                .opacity(recordingDuration.truncatingRemainder(dividingBy: 1) < 0.5 ? 1 : 0.3)
                .animation(.easeInOut(duration: 0.5).repeatForever(autoreverses: true), value: isRecording)

            Text(formatDuration(recordingDuration))
                .font(.system(size: 11, weight: .semibold, design: .monospaced))
                .foregroundColor(Color(hex: "EF4444"))
                .contentTransition(.numericText())
        }
    }

    // ========================================================================
    // MARK: - Attachments Preview
    // ========================================================================

    private var attachmentsPreview: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(allAttachments) { attachment in
                    attachmentChip(attachment)
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
        }
    }

    private func attachmentChip(_ attachment: ComposerAttachment) -> some View {
        HStack(spacing: 6) {
            // Type icon
            Image(systemName: iconForType(attachment.type))
                .font(.system(size: 12))
                .foregroundColor(Color(hex: attachment.thumbnailColor))

            Text(attachment.name)
                .font(.system(size: 12, weight: .medium))
                .lineLimit(1)
                .frame(maxWidth: 120)

            if let size = attachment.size {
                Text(formatFileSize(size))
                    .font(.system(size: 10))
                    .opacity(0.6)
            }

            // Remove button
            Button {
                HapticFeedback.light()
                withAnimation(.spring(response: 0.25, dampingFraction: 0.7)) {
                    attachments.removeAll { $0.id == attachment.id }
                }
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 9, weight: .bold))
                    .foregroundColor(mutedColor)
                    .frame(width: 18, height: 18)
                    .background(
                        Circle().fill(style == .dark ? Color.white.opacity(0.15) : theme.textMuted.opacity(0.15))
                    )
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(
            Capsule()
                .fill(style == .dark ? Color.white.opacity(0.12) : theme.inputBackground)
                .overlay(
                    Capsule()
                        .stroke(
                            style == .dark ? Color.white.opacity(0.15) : theme.textMuted.opacity(0.2),
                            lineWidth: 0.5
                        )
                )
        )
        .foregroundColor(style == .dark ? .white : theme.textPrimary)
    }

    // ========================================================================
    // MARK: - Attachment Ladder
    // ========================================================================

    private var attachmentLadder: some View {
        VStack(spacing: 8) {
            // Emoji picker
            attachLadderButton(icon: "face.smiling.fill", color: "FF9F43", delay: 0.0) {
                closeAttachMenu()
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
                    onRequestTextEmoji?()
                }
            }
            // File picker
            attachLadderButton(icon: "doc.fill", color: "45B7D1", delay: 0.04) {
                closeAttachMenu()
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { onFilePicker?() }
            }
            // Location
            attachLadderButton(icon: "location.fill", color: "2ECC71", delay: 0.08) {
                closeAttachMenu()
                HapticFeedback.light()
                locationHelper.requestLocation()
                onLocationRequest?()
            }
            // Camera
            attachLadderButton(icon: "camera.fill", color: "F8B500", delay: 0.12) {
                closeAttachMenu()
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { onCamera?() }
            }
            // Photo library
            attachLadderButton(icon: "photo.fill", color: "9B59B6", delay: 0.16) {
                closeAttachMenu()
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { onPhotoLibrary?() }
            }
            // Voice recording
            attachLadderButton(icon: "mic.fill", color: "E74C3C", delay: 0.20) {
                closeAttachMenu()
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { startRecording() }
            }
        }
        .padding(.bottom, 52)
    }

    private func attachLadderButton(icon: String, color: String, delay: Double, action: @escaping () -> Void) -> some View {
        Button(action: {
            onAnyInteraction?()
            HapticFeedback.light()
            action()
        }) {
            ZStack {
                Circle()
                    .fill(
                        LinearGradient(
                            colors: [Color(hex: color), Color(hex: color).opacity(0.7)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: 42, height: 42)
                    .shadow(color: Color(hex: color).opacity(0.45), radius: 8, y: 3)

                Image(systemName: icon)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(.white)
            }
        }
        .menuAnimation(showMenu: showAttachOptions, delay: delay)
    }

    /// Notify parent that composer has content requiring timer pause (text, attachments, or recording).
    private func notifyContentChange() {
        onHasContentChange?(hasText || !attachments.isEmpty || isRecording)
    }

    private func closeAttachMenu() {
        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
            showAttachOptions = false
        }
    }

    // ========================================================================
    // MARK: - Attach Button (copy-paste from MessageComposer)
    // ========================================================================

    private var attachButton: some View {
        Button(action: {
            onAnyInteraction?()
            let impact = UIImpactFeedbackGenerator(style: .light)
            impact.impactOccurred()
            if showAttachOptions {
                // xmark showing → close menu
                closeAttachMenu()
            } else {
                // (+) showing → open menu
                withAnimation(.spring(response: 0.3, dampingFraction: 0.6)) {
                    attachRotation += 90
                }
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    showAttachOptions = true
                }
            }
        }) {
            Image(systemName: showAttachOptions ? "xmark" : "plus")
                .font(.system(size: showAttachOptions ? 16 : 20, weight: .semibold))
                .foregroundColor(.white.opacity(0.7))
                .rotationEffect(.degrees(showAttachOptions ? 0 : attachRotation))
                .frame(width: 44, height: 44)
                .background(
                    Circle()
                        .fill(Color.white.opacity(0.1))
                        .overlay(
                            Circle()
                                .stroke(Color.white.opacity(0.2), lineWidth: 1)
                        )
                )
                .animation(.spring(response: 0.3, dampingFraction: 0.7), value: showAttachOptions)
        }
    }

    // ========================================================================
    // MARK: - Action Button: Mic / Send (copy-paste from MessageComposer)
    // ========================================================================

    @ViewBuilder
    private var actionButton: some View {
        if isRecording || hasContent {
            sendButton
                .transition(.scale.combined(with: .opacity))
                .animation(.spring(response: 0.3, dampingFraction: 0.6), value: hasContent)
                .animation(.spring(response: 0.25, dampingFraction: 0.5), value: sendBounce)
        }
    }

    // ========================================================================
    // MARK: - Text Field
    // ========================================================================

    private var textInputField: some View {
        HStack(spacing: 0) {
            // Mic button inside field (left) — hidden when focused
            if showVoice && !isFocused {
                Button {
                    onAnyInteraction?()
                    HapticFeedback.light()
                    startRecording()
                } label: {
                    Image(systemName: "mic.fill")
                        .font(.system(size: 16, weight: .medium))
                        .foregroundColor(.white.opacity(0.5))
                        .frame(width: 36, height: 36)
                }
                .padding(.leading, 4)
                .transition(.scale.combined(with: .opacity))
            }

            // Text input
            ZStack(alignment: .leading) {
                if text.isEmpty {
                    Text(placeholder)
                        .foregroundColor(.white.opacity(0.4))
                        .padding(.leading, (showVoice && !isFocused) ? 2 : 16)
                }

                TextField("", text: $text, axis: .vertical)
                    .focused($isFocused)
                    .foregroundColor(.white)
                    .padding(.leading, (showVoice && !isFocused) ? 2 : 16)
                    .padding(.trailing, 16)
                    .padding(.vertical, 12)
                    .lineLimit(1...5)
                    .font(.system(size: 16))
                    .onChange(of: text) { newValue in
                        if let maxLen = maxLength, newValue.count > maxLen {
                            text = String(newValue.prefix(maxLen))
                        }
                    }
            }
        }
        .animation(.spring(response: 0.3, dampingFraction: 0.7), value: isFocused)
        .frame(minHeight: 44)
        .background(
            RoundedRectangle(cornerRadius: 22)
                .fill(Color.white.opacity(0.08))
                .overlay(
                    RoundedRectangle(cornerRadius: 22)
                        .stroke(
                            focusBounce ?
                            LinearGradient(colors: [Color(hex: "08D9D6").opacity(0.5), Color(hex: "FF2E63").opacity(0.5)], startPoint: .leading, endPoint: .trailing) :
                                LinearGradient(colors: [Color.white.opacity(0.15), Color.white.opacity(0.1)], startPoint: .leading, endPoint: .trailing),
                            lineWidth: focusBounce ? 1.5 : 1
                        )
                )
                .shadow(color: focusBounce ? Color(hex: "08D9D6").opacity(0.2) : Color.clear, radius: 8, x: 0, y: 0)
        )
        .scaleEffect(x: typeWave ? 1.015 : 1.0, y: typeWave ? 0.97 : 1.0)
        .scaleEffect(focusBounce ? 1.02 : 1.0)
        .animation(.spring(response: 0.2, dampingFraction: 0.35), value: typeWave)
    }

    // ========================================================================
    // MARK: - Voice Recording View (replaces text field while recording)
    // ========================================================================

    private var voiceRecordingView: some View {
        HStack(spacing: 12) {
            // Animated waveform bars
            HStack(spacing: 3) {
                ForEach(0..<15, id: \.self) { i in
                    ComposerWaveformBar(index: i, isRecording: isRecording, accentColor: "FF6B6B")
                }
            }

            Spacer()

            // Timer
            Text(formatDuration(recordingDuration))
                .font(.system(size: 15, weight: .semibold, design: .monospaced))
                .foregroundColor(.white)
                .contentTransition(.numericText())
                .animation(.spring(response: 0.3), value: recordingDuration)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .frame(minHeight: 44)
        .background(
            RoundedRectangle(cornerRadius: 22)
                .fill(Color.white.opacity(0.08))
                .overlay(
                    RoundedRectangle(cornerRadius: 22)
                        .stroke(
                            LinearGradient(colors: [Color(hex: "FF2E63").opacity(0.5), Color(hex: "FF6B6B").opacity(0.5)], startPoint: .leading, endPoint: .trailing),
                            lineWidth: 1.5
                        )
                )
        )
        // Wave pulse synced to recording timer (~every 0.5s)
        .scaleEffect(
            x: recordingDuration.truncatingRemainder(dividingBy: 0.5) < 0.25 ? 1.012 : 1.0,
            y: recordingDuration.truncatingRemainder(dividingBy: 0.5) < 0.25 ? 0.975 : 1.0
        )
        .animation(.spring(response: 0.25, dampingFraction: 0.35), value: recordingDuration)
    }

    // ========================================================================
    // MARK: - Send Button
    // ========================================================================

    private var sendButton: some View {
        Button {
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
                            colors: [Color(hex: "FF2E63"), Color(hex: "FF6B6B")],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: 44, height: 44)
                    .shadow(color: Color(hex: "FF2E63").opacity(0.4), radius: sendBounce ? 12 : 8, x: 0, y: 4)

                Image(systemName: "paperplane.fill")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(.white)
                    .rotationEffect(.degrees(sendBounce ? 55 : 45))
                    .offset(x: sendBounce ? 2 : -1, y: sendBounce ? -2 : 1)
            }
            .scaleEffect(sendBounce ? 1.2 : 1)
        }
        .frame(width: 44, height: 44)
    }

    // ========================================================================
    // MARK: - Stop Recording Button
    // ========================================================================

    private var stopRecordingButton: some View {
        Button {
            HapticFeedback.light()
            stopRecording()
        } label: {
            ZStack {
                Circle()
                    .fill(
                        LinearGradient(
                            colors: [Color(hex: "FF2E63"), Color(hex: "FF6B6B")],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: 44, height: 44)
                    .shadow(color: Color(hex: "FF2E63").opacity(0.5), radius: 10, y: 3)

                Image(systemName: "stop.fill")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundColor(.white)
            }
            .scaleEffect(recordingDuration.truncatingRemainder(dividingBy: 1) < 0.5 ? 1.08 : 1.0)
            .animation(.easeInOut(duration: 0.5).repeatForever(autoreverses: true), value: isRecording)
        }
    }

    // ========================================================================
    // MARK: - Background
    // ========================================================================

    private var composerBackground: some View {
        Color.clear
    }

    // ========================================================================
    // MARK: - Recording Logic
    // ========================================================================

    private func startRecording() {
        onAnyInteraction?()
        isRecording = true
        recordingDuration = 0
        recordingTimer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { _ in
            recordingDuration += 0.1
        }
        onRecordingChange?(true)
        HapticFeedback.medium()
    }

    private func stopRecording() {
        onAnyInteraction?()
        guard recordingDuration > 0.5 else {
            // Too short — cancel
            isRecording = false
            recordingTimer?.invalidate()
            recordingTimer = nil
            recordingDuration = 0
            onRecordingChange?(false)
            return
        }

        let duration = recordingDuration

        isRecording = false
        recordingTimer?.invalidate()
        recordingTimer = nil

        // Add voice attachment
        let attachment = ComposerAttachment.voice(duration: duration)
        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
            attachments.append(attachment)
        }

        // Callback for parent to handle actual audio data
        if let url = FileManager.default.temporaryDirectory.appendingPathComponent("voice_\(Int(Date().timeIntervalSince1970)).m4a") as URL? {
            onVoiceRecord?(url, duration)
        }

        recordingDuration = 0
        onRecordingChange?(false)
        HapticFeedback.light()
    }

    /// Force-stop recording when switching stories — always saves the voice attachment regardless of duration
    private func forceStopRecording() {
        guard isRecording else { return }
        let duration = recordingDuration

        isRecording = false
        recordingTimer?.invalidate()
        recordingTimer = nil

        if duration > 0.3 {
            let attachment = ComposerAttachment.voice(duration: duration)
            attachments.append(attachment)
            if let url = FileManager.default.temporaryDirectory.appendingPathComponent("voice_\(Int(Date().timeIntervalSince1970)).m4a") as URL? {
                onVoiceRecord?(url, duration)
            }
        }

        recordingDuration = 0
        onRecordingChange?(false)
    }

    // ========================================================================
    // MARK: - Send Logic
    // ========================================================================

    private func handleSend() {
        onAnyInteraction?()
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

    private var mutedColor: Color {
        style == .dark ? .white.opacity(0.5) : theme.textMuted
    }

    private func iconForType(_ type: ComposerAttachmentType) -> String {
        switch type {
        case .voice: return "mic.fill"
        case .location: return "location.fill"
        case .image: return "photo.fill"
        case .file: return "doc.fill"
        case .video: return "video.fill"
        }
    }

    private func formatDuration(_ seconds: TimeInterval) -> String {
        let mins = Int(seconds) / 60
        let secs = Int(seconds) % 60
        return String(format: "%d:%02d", mins, secs)
    }

    private func formatFileSize(_ bytes: Int) -> String {
        if bytes < 1024 { return "\(bytes) B" }
        if bytes < 1024 * 1024 { return String(format: "%.1f KB", Double(bytes) / 1024) }
        return String(format: "%.1f MB", Double(bytes) / Double(1024 * 1024))
    }
}
