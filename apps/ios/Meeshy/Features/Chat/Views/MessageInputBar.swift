//
//  MessageInputBar.swift
//  Meeshy
//
//  Modern message input bar with:
//  - Expandable attachments zone (horizontal grid, vertical when expanded)
//  - Reply preview
//  - Language detection & sentiment analysis indicators
//  - Voice recording with inline waveform (becomes attachment when done)
//  - Attachment menu overlay
//  iOS 16+
//
//  HIERARCHY (bottom to top):
//  1. Input zone (text field + buttons)
//  2. Analysis indicators (sentiment + language)
//  3. Reply preview (if replying)
//  4. Attachments zone (expandable with drag handle)
//

import SwiftUI
import AVFoundation
import PhotosUI
import UniformTypeIdentifiers

// MARK: - Attachment Item Model

struct InputAttachment: Identifiable, Equatable {
    let id: String
    let type: AttachmentType
    let thumbnail: Image?
    let fileName: String?
    let duration: TimeInterval? // For audio/video
    let localURL: URL?

    enum AttachmentType: String {
        case image, video, audio, document, location, contact

        var icon: String {
            switch self {
            case .image: return "photo.fill"
            case .video: return "video.fill"
            case .audio: return "waveform"
            case .document: return "doc.fill"
            case .location: return "location.fill"
            case .contact: return "person.crop.circle.fill"
            }
        }

        var color: Color {
            switch self {
            case .image: return .blue
            case .video: return .purple
            case .audio: return .orange
            case .document: return .gray
            case .location: return .red
            case .contact: return .green
            }
        }
    }

    static func == (lhs: InputAttachment, rhs: InputAttachment) -> Bool {
        lhs.id == rhs.id
    }
}

// MARK: - Message Input Bar

struct MessageInputBar: View {
    // MARK: - Properties

    @Binding var text: String
    let isSending: Bool
    let onSend: ([InputAttachment], String?, SentimentCategory?) -> Void
    let onAttachmentTap: () -> Void
    let onTyping: () -> Void

    // Reply support
    var replyingTo: Message? = nil
    var onCancelReply: (() -> Void)? = nil

    // Attachments
    @State private var attachments: [InputAttachment] = []
    @State private var isAttachmentsExpanded = false
    @State private var attachmentsDragOffset: CGFloat = 0
    @State private var showAttachmentMenu = false

    // UI State
    @State private var textEditorHeight: CGFloat = 36
    @FocusState private var isFocused: Bool

    // Voice Recording State
    @State private var isRecording = false
    @State private var isLongPressRecording = false // true = long press mode (show slide to cancel)
    @State private var recordingDuration: TimeInterval = 0
    @State private var recordingTimer: Timer?
    @State private var waveformSamples: [CGFloat] = []
    @State private var recordedAudioURL: URL?
    @State private var audioRecorder: AVAudioRecorder?
    @State private var levelTimer: Timer?

    // Audio Playback (for preview)
    @State private var isPlayingAudio = false
    @State private var playingAudioId: String?
    @State private var audioPlayer: AVAudioPlayer?
    @State private var playbackTimer: Timer?

    // Slide to cancel tracking
    @State private var dragOffset: CGFloat = 0
    @State private var showEffectsPanel = false
    @State private var selectedVoiceEffect: VoiceEffect = .none

    // Image & Document Pickers
    @State private var showImagePicker = false
    @State private var selectedPhotos: [PhotosPickerItem] = []
    @State private var showDocumentPicker = false

    // Camera State
    @State private var showCameraView = false

    // Unified Media Editor State (simplified flow for camera captures)
    @State private var showUnifiedEditor = false
    @State private var pendingCaptureInfo: CaptureInfo? = nil

    // Image Editor State (for editing existing attachments from gallery)
    @State private var showImageEditor = false
    @State private var pendingImages: [UIImage] = []
    @State private var pendingImageURLs: [URL] = [] // Keep track of temp URLs for images
    @State private var editingAttachmentIndex: Int? = nil // Index of attachment being edited (nil = new attachment)

    // Video Editor State (legacy: kept for editing existing video attachments)
    @State private var showVideoEditor = false
    @State private var pendingVideoURL: URL? = nil

    // Audio Editor State
    @State private var showAudioEditor = false
    @State private var pendingAudioURL: URL? = nil
    @State private var pendingAudioEffect: AudioEffectType = .normal

    // Language Detection State
    @State private var detectedLanguage: LanguageDetectionResult?
    @State private var userSelectedLanguage: String?
    @State private var languageDetectionTask: Task<Void, Never>?
    @State private var showLanguagePicker = false

    // Sentiment Analysis State
    @State private var sentimentResult: SentimentResult?
    @State private var isAnalyzing = false

    // Character Count State (for long text warning)
    @State private var characterCountState: CharacterCountState = CharacterCountState(text: "")

    // Constants
    private let minHeight: CGFloat = 36
    private let maxHeight: CGFloat = 120
    private let analysisDebounce: UInt64 = 800_000_000
    private let attachmentsCollapsedHeight: CGFloat = 80
    private let attachmentsExpandedHeight: CGFloat = 200

    // Computed Properties
    private var effectiveLanguageCode: String? {
        userSelectedLanguage ?? detectedLanguage?.primaryLanguage
    }

    private var effectiveLanguageFlag: String {
        if let userLang = userSelectedLanguage {
            return LanguageDetectionResult.flagEmoji(forLanguageCode: userLang)
        }
        return detectedLanguage?.primaryLanguageFlag ?? "🌐"
    }

    private var hasText: Bool {
        !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private var hasAttachments: Bool {
        !attachments.isEmpty
    }

    private var canSend: Bool {
        hasText || hasAttachments
    }

    // MARK: - Body

    var body: some View {
        VStack(spacing: 0) {
            // 4. Attachments Zone (top - expandable)
            if hasAttachments {
                attachmentsZone
            }

            // 3. Reply Preview
            if let reply = replyingTo {
                replyPreview(reply)
            }

            // 2. Analysis Indicators (floating pill style)
            if hasText {
                analysisIndicatorBar
                    .background(
                        Capsule()
                            .fill(.ultraThinMaterial)
                            .shadow(color: Color.black.opacity(0.1), radius: 4, x: 0, y: 2)
                    )
                    .padding(.horizontal, 12)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }

            // 1. Main Input Zone (floating)
            mainInputZone
                .background(
                    RoundedRectangle(cornerRadius: 24)
                        .fill(.ultraThinMaterial)
                        .shadow(color: Color.black.opacity(0.1), radius: 8, x: 0, y: -2)
                )
                .padding(.horizontal, 8)
                .padding(.bottom, 4)
        }
        .background(Color.clear) // Transparent background - elements float
        .animation(.easeInOut(duration: 0.2), value: hasText)
        .animation(.easeInOut(duration: 0.2), value: hasAttachments)
        .animation(.easeInOut(duration: 0.2), value: isAttachmentsExpanded)
        .animation(.easeInOut(duration: 0.2), value: showAttachmentMenu)
        .sheet(isPresented: $showLanguagePicker) {
            languagePickerSheet
        }
        .photosPicker(
            isPresented: $showImagePicker,
            selection: $selectedPhotos,
            maxSelectionCount: 10,
            matching: .any(of: [.images, .videos]),
            photoLibrary: .shared()
        )
        .onChange(of: selectedPhotos) { _, newItems in
            Task {
                await processSelectedPhotos(newItems)
                selectedPhotos = []
            }
        }
        .sheet(isPresented: $showDocumentPicker) {
            DocumentPickerView { urls in
                processSelectedDocuments(urls)
            }
        }
        .overlay(alignment: .bottom) {
            // Attachment Menu Overlay (above input)
            if showAttachmentMenu {
                attachmentMenuOverlay
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .fullScreenCover(isPresented: $showCameraView) {
            CameraView(
                onCapture: { image, filter, audioEffect in
                    // Create CaptureInfo for unified editor
                    pendingCaptureInfo = CaptureInfo(
                        media: .photo(image),
                        selectedFilter: filter,
                        selectedAudioEffect: audioEffect
                    )
                },
                onVideoCapture: { videoURL, filter, audioEffect in
                    // Create CaptureInfo for unified editor
                    pendingCaptureInfo = CaptureInfo(
                        media: .video(videoURL),
                        selectedFilter: filter,
                        selectedAudioEffect: audioEffect
                    )
                }
            )
        }
        // Handle showing unified editor after camera closes
        .onChange(of: showCameraView) { _, isShowing in
            if !isShowing && pendingCaptureInfo != nil {
                // Camera just closed with pending capture, show unified editor
                Task { @MainActor in
                    try? await Task.sleep(nanoseconds: 300_000_000)
                    showUnifiedEditor = true
                }
            }
        }
        .fullScreenCover(isPresented: $showImageEditor) {
            ImageEditorView(
                images: pendingImages,
                onConfirm: { editedImages in
                    // Guard against empty array
                    guard !editedImages.isEmpty else {
                        pendingImages = []
                        pendingImageURLs = []
                        editingAttachmentIndex = nil
                        showImageEditor = false
                        return
                    }

                    if let index = editingAttachmentIndex, index < attachments.count, let firstImage = editedImages.first {
                        // Editing existing attachment - replace it
                        replaceAttachmentWithEditedImage(at: index, image: firstImage)
                    } else {
                        // Adding new attachments
                        addEditedImagesAsAttachments(editedImages)
                    }
                    pendingImages = []
                    pendingImageURLs = []
                    editingAttachmentIndex = nil
                    showImageEditor = false
                },
                onCancel: {
                    // Clean up temp files (only if adding new, not editing existing)
                    if editingAttachmentIndex == nil {
                        for url in pendingImageURLs {
                            try? FileManager.default.removeItem(at: url)
                        }
                    }
                    pendingImages = []
                    pendingImageURLs = []
                    editingAttachmentIndex = nil
                    showImageEditor = false
                },
                onRetake: editingAttachmentIndex == nil ? {
                    // Only allow retake for new captures (not editing existing attachments)
                    pendingImages = []
                    pendingImageURLs = []
                    showImageEditor = false
                    // Reopen camera after editor closes
                    Task { @MainActor in
                        try? await Task.sleep(nanoseconds: 300_000_000)
                        showCameraView = true
                    }
                } : nil
            )
        }
        .fullScreenCover(isPresented: $showVideoEditor) {
            if let videoURL = pendingVideoURL {
                VideoEditorView(
                    videoURL: videoURL,
                    onConfirm: { finalURL, isMuted in
                        if let index = editingAttachmentIndex, index < attachments.count {
                            // Editing existing video attachment
                            replaceAttachmentWithEditedVideo(at: index, url: finalURL, isMuted: isMuted)
                        } else {
                            // Adding new video
                            addEditedVideoAsAttachment(url: finalURL, isMuted: isMuted)
                        }
                        pendingVideoURL = nil
                        editingAttachmentIndex = nil
                        showVideoEditor = false
                    },
                    onCancel: {
                        pendingVideoURL = nil
                        editingAttachmentIndex = nil
                        showVideoEditor = false
                    }
                )
            }
        }
        .fullScreenCover(isPresented: $showAudioEditor) {
            if let audioURL = pendingAudioURL {
                // Use AudioEditorView with full features (silence padding, translation, advanced effect editor)
                AudioEditorView(
                    audioURL: audioURL,
                    initialEffect: pendingAudioEffect,
                    onConfirm: { finalURL, effect in
                        if let index = editingAttachmentIndex, index < attachments.count {
                            // Editing existing audio attachment
                            replaceAttachmentWithEditedAudio(at: index, url: finalURL, effect: effect)
                        } else {
                            // Adding new audio
                            addEditedAudioAsAttachment(url: finalURL, effect: effect)
                        }
                        pendingAudioURL = nil
                        pendingAudioEffect = .normal
                        editingAttachmentIndex = nil
                        showAudioEditor = false
                    },
                    onCancel: {
                        pendingAudioURL = nil
                        pendingAudioEffect = .normal
                        editingAttachmentIndex = nil
                        showAudioEditor = false
                    }
                )
            }
        }
        // MARK: - Unified Media Editor (new simplified flow for camera captures)
        .fullScreenCover(isPresented: $showUnifiedEditor) {
            if let captureInfo = pendingCaptureInfo {
                UnifiedMediaEditorView(
                    captureInfo: captureInfo,
                    onConfirm: { editedMedia in
                        // Add to attachments based on media type
                        switch editedMedia {
                        case .photo(let image):
                            addEditedImagesAsAttachments([image])
                        case .video(let url):
                            addEditedVideoAsAttachment(url: url, isMuted: false)
                        }
                        pendingCaptureInfo = nil
                        showUnifiedEditor = false
                    },
                    onCancel: {
                        // Clean up if video
                        if case .video(let url) = captureInfo.media {
                            try? FileManager.default.removeItem(at: url)
                        }
                        pendingCaptureInfo = nil
                        showUnifiedEditor = false
                    },
                    onRetake: {
                        // Clean up current capture
                        if case .video(let url) = captureInfo.media {
                            try? FileManager.default.removeItem(at: url)
                        }
                        pendingCaptureInfo = nil
                        showUnifiedEditor = false
                        // Reopen camera after delay
                        Task { @MainActor in
                            try? await Task.sleep(nanoseconds: 300_000_000)
                            showCameraView = true
                        }
                    }
                )
            }
        }
    }

    // MARK: - Attachments Zone

    private var attachmentsZone: some View {
        VStack(spacing: 0) {
            // Drag Handle (only show if more than 3 attachments)
            if attachments.count > 3 {
                dragHandle
            }

            // Attachments Content
            if isAttachmentsExpanded {
                // EXPANDED MODE: Vertical scrollable grid
                ScrollView(.vertical, showsIndicators: true) {
                    LazyVGrid(columns: [
                        GridItem(.adaptive(minimum: 80, maximum: 100), spacing: 8)
                    ], spacing: 8) {
                        ForEach(attachments) { attachment in
                            attachmentThumbnail(attachment)
                        }
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                }
                .frame(height: attachmentsExpandedHeight)
                .scrollDisabled(false) // Enable vertical scroll
            } else {
                // COLLAPSED MODE: Horizontal scroll ONLY - NO vertical movement
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(attachments) { attachment in
                            attachmentThumbnail(attachment)
                        }
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                }
                .frame(height: attachmentsCollapsedHeight)
                .scrollDisabled(false) // Enable horizontal scroll
                // Block all vertical gestures in collapsed mode
                .gesture(DragGesture(minimumDistance: 0, coordinateSpace: .local)
                    .onChanged { _ in }
                    .onEnded { _ in },
                    including: .gesture // Only affect gestures, not taps
                )
            }
        }
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(.ultraThinMaterial)
                .shadow(color: Color.black.opacity(0.1), radius: 6, x: 0, y: 2)
        )
        .padding(.horizontal, 8)
        .animation(.spring(response: 0.3, dampingFraction: 0.7), value: isAttachmentsExpanded)
    }

    // MARK: - Drag Handle

    private var dragHandle: some View {
        HStack {
            Spacer()

            VStack(spacing: 4) {
                // Handle bar
                Capsule()
                    .fill(Color(.systemGray3))
                    .frame(width: 40, height: 5)

                // Label
                HStack(spacing: 4) {
                    Image(systemName: isAttachmentsExpanded ? "chevron.down" : "chevron.up")
                        .font(.system(size: 8, weight: .bold))
                    Text(isAttachmentsExpanded ? "Réduire" : "\(attachments.count) pièces jointes")
                        .font(.system(size: 10, weight: .medium))
                }
                .foregroundColor(.secondary)
            }

            Spacer()
        }
        .padding(.vertical, 6)
        .contentShape(Rectangle())
        .onTapGesture {
            withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                isAttachmentsExpanded.toggle()
            }
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
        }
    }

    // MARK: - Attachment Thumbnail

    private func attachmentThumbnail(_ attachment: InputAttachment) -> some View {
        ZStack(alignment: .topTrailing) {
            // Thumbnail Content
            Group {
                switch attachment.type {
                case .image:
                    if let thumbnail = attachment.thumbnail {
                        thumbnail
                            .resizable()
                            .aspectRatio(contentMode: .fill)
                    } else {
                        Color(.systemGray5)
                            .overlay(
                                Image(systemName: "photo")
                                    .foregroundColor(.gray)
                            )
                    }

                case .video:
                    if let thumbnail = attachment.thumbnail {
                        thumbnail
                            .resizable()
                            .aspectRatio(contentMode: .fill)
                            .overlay(
                                Image(systemName: "play.circle.fill")
                                    .font(.system(size: 24))
                                    .foregroundColor(.white)
                                    .shadow(radius: 2)
                            )
                    } else {
                        Color(.systemGray5)
                            .overlay(
                                Image(systemName: "video.fill")
                                    .foregroundColor(.purple)
                            )
                    }

                case .audio:
                    audioAttachmentView(attachment)

                case .document:
                    documentAttachmentView(attachment)

                case .location:
                    Color(.systemGray5)
                        .overlay(
                            VStack(spacing: 4) {
                                Image(systemName: "location.fill")
                                    .font(.system(size: 20))
                                    .foregroundColor(.red)
                                Text("Position")
                                    .font(.system(size: 9))
                                    .foregroundColor(.secondary)
                            }
                        )

                case .contact:
                    Color(.systemGray5)
                        .overlay(
                            VStack(spacing: 4) {
                                Image(systemName: "person.crop.circle.fill")
                                    .font(.system(size: 20))
                                    .foregroundColor(.green)
                                Text("Contact")
                                    .font(.system(size: 9))
                                    .foregroundColor(.secondary)
                            }
                        )
                }
            }
            // Audio attachments get wider frame (2x width)
            .frame(
                width: attachment.type == .audio ? 150 : 70,
                height: 70
            )
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            .contentShape(Rectangle())
            .onTapGesture {
                previewAttachment(attachment)
            }

            // Remove Button
            Button {
                removeAttachment(attachment)
            } label: {
                Image(systemName: "xmark.circle.fill")
                    .font(.system(size: 18))
                    .foregroundStyle(.white, .red)
                    .shadow(radius: 1)
            }
            .offset(x: 6, y: -6)
        }
    }

    /// Preview/edit an attachment when tapped
    private func previewAttachment(_ attachment: InputAttachment) {
        switch attachment.type {
        case .image:
            // Load image from localURL and show editor
            if let localURL = attachment.localURL,
               let data = try? Data(contentsOf: localURL),
               let image = UIImage(data: data) {
                // Store the attachment index to replace it after editing
                if let index = attachments.firstIndex(where: { $0.id == attachment.id }) {
                    editingAttachmentIndex = index
                    pendingImages = [image]
                    showImageEditor = true
                }
            }

        case .video:
            // Show video editor
            if let localURL = attachment.localURL {
                pendingVideoURL = localURL
                editingAttachmentIndex = attachments.firstIndex(where: { $0.id == attachment.id })
                showVideoEditor = true
            }

        case .audio:
            // Show audio editor
            if let localURL = attachment.localURL {
                pendingAudioURL = localURL
                pendingAudioEffect = .normal // Could store effect in attachment metadata
                editingAttachmentIndex = attachments.firstIndex(where: { $0.id == attachment.id })
                showAudioEditor = true
            }

        default:
            // Other types don't have preview/edit
            break
        }
    }

    // MARK: - Audio Attachment View

    // Fixed waveform heights for consistent display
    private let staticWaveformHeights: [CGFloat] = [12, 18, 8, 22, 14, 20, 10, 24, 16, 12, 18, 14]

    private func audioAttachmentView(_ attachment: InputAttachment) -> some View {
        let isPlaying = playingAudioId == attachment.id

        return HStack(spacing: 6) {
            // Play/Stop Button on the LEFT
            Button {
                toggleAudioPlayback(attachment)
            } label: {
                ZStack {
                    Circle()
                        .fill(isPlaying ? Color.red : Color.orange)
                        .frame(width: 28, height: 28)

                    if isPlaying {
                        // Animated playing indicator
                        Image(systemName: "stop.fill")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundColor(.white)
                    } else {
                        Image(systemName: "play.fill")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundColor(.white)
                            .offset(x: 1) // Visual centering for play icon
                    }
                }
            }
            .animation(.easeInOut(duration: 0.2), value: isPlaying)

            // Waveform + Duration
            VStack(alignment: .leading, spacing: 2) {
                // Waveform with playing animation
                HStack(spacing: 1) {
                    ForEach(0..<16, id: \.self) { i in
                        RoundedRectangle(cornerRadius: 1)
                            .fill(isPlaying ? Color.red.opacity(0.8) : Color.orange.opacity(0.7))
                            .frame(
                                width: 2,
                                height: isPlaying
                                    ? staticWaveformHeights[i % staticWaveformHeights.count] * CGFloat.random(in: 0.5...1.2)
                                    : staticWaveformHeights[i % staticWaveformHeights.count] * 0.7
                            )
                            .animation(
                                isPlaying
                                    ? .easeInOut(duration: 0.15).repeatForever(autoreverses: true).delay(Double(i) * 0.02)
                                    : .default,
                                value: isPlaying
                            )
                    }
                }
                .frame(height: 20)

                // Duration
                if let duration = attachment.duration {
                    HStack(spacing: 4) {
                        if isPlaying {
                            // Recording/playing indicator dot
                            Circle()
                                .fill(Color.red)
                                .frame(width: 6, height: 6)
                        }
                        Text(formatDuration(duration))
                            .font(.system(size: 9, weight: .medium, design: .monospaced))
                            .foregroundColor(isPlaying ? .red : .secondary)
                    }
                }
            }
        }
        .padding(.horizontal, 6)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(.systemGray5))
    }

    // MARK: - Document Attachment View

    private func documentAttachmentView(_ attachment: InputAttachment) -> some View {
        VStack(spacing: 4) {
            Image(systemName: "doc.fill")
                .font(.system(size: 24))
                .foregroundColor(.gray)

            if let fileName = attachment.fileName {
                Text(fileName)
                    .font(.system(size: 8))
                    .foregroundColor(.secondary)
                    .lineLimit(2)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 4)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(.systemGray5))
    }

    // MARK: - Reply Preview (aligned with ReplyPreviewView)

    /// Maximum characters for reply preview text
    private let replyPreviewMaxChars = 80

    private func replyPreview(_ message: Message) -> some View {
        HStack(spacing: 6) {
            // Vertical accent bar
            RoundedRectangle(cornerRadius: 1.5)
                .fill(Color.blue)
                .frame(width: 3, height: 28)

            // Content - single line with ellipsis
            VStack(alignment: .leading, spacing: 0) {
                // Name + message on same conceptual level
                HStack(spacing: 4) {
                    Text(message.sender?.displayName ?? message.sender?.username ?? "Utilisateur")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(.blue)
                        .lineLimit(1)

                    Text("·")
                        .foregroundColor(.secondary)

                    // Message content preview (truncated with ...)
                    if let attachment = message.attachments?.first {
                        HStack(spacing: 2) {
                            Image(systemName: attachmentIcon(for: attachment))
                                .font(.system(size: 10))
                            Text(attachmentTypeName(for: attachment))
                                .font(.system(size: 12))
                        }
                        .foregroundColor(.secondary)
                        .lineLimit(1)
                    } else {
                        Text(message.content)
                            .font(.system(size: 12))
                            .foregroundColor(.secondary)
                            .lineLimit(1)
                            .truncationMode(.tail)
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            // Close button
            Button {
                onCancelReply?()
            } label: {
                Image(systemName: "xmark.circle.fill")
                    .font(.system(size: 16))
                    .foregroundColor(.secondary.opacity(0.7))
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .frame(height: 40)
        .background(
            RoundedRectangle(cornerRadius: 8)
                .fill(Color(.systemGray6))
        )
        .padding(.horizontal, 8)
    }

    /// Truncate content if exceeds max characters
    private func truncatedContent(_ content: String) -> String {
        if content.count > replyPreviewMaxChars {
            return String(content.prefix(replyPreviewMaxChars)) + "..."
        }
        return content
    }

    /// Get icon for attachment type
    private func attachmentIcon(for attachment: MessageAttachment) -> String {
        if attachment.isImage { return "photo" }
        if attachment.isVideo { return "video" }
        if attachment.isAudio { return "waveform" }
        if attachment.isDocument { return "doc" }
        return "paperclip"
    }

    /// Get display name for attachment type
    private func attachmentTypeName(for attachment: MessageAttachment) -> String {
        if attachment.isImage { return "Photo" }
        if attachment.isVideo { return "Vidéo" }
        if attachment.isAudio { return "Audio" }
        if attachment.isDocument { return "Document" }
        return "Fichier"
    }

    // MARK: - Analysis Indicator Bar

    private var analysisIndicatorBar: some View {
        HStack(spacing: 10) {
            // Sentiment Indicator
            if let sentiment = sentimentResult {
                HStack(spacing: 4) {
                    Text(sentiment.category.emoji)
                        .font(.system(size: 14))
                    Text(sentiment.category.shortName)
                        .font(.system(size: 10, weight: .medium))
                        .foregroundColor(sentimentColor(sentiment.category))
                }
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(
                    Capsule()
                        .fill(sentimentColor(sentiment.category).opacity(0.1))
                )
            } else if isAnalyzing {
                HStack(spacing: 4) {
                    ProgressView()
                        .scaleEffect(0.5)
                    Text("...")
                        .font(.system(size: 10))
                        .foregroundColor(.secondary)
                }
            }

            // Language Indicator
            Button {
                UIImpactFeedbackGenerator(style: .light).impactOccurred()
                showLanguagePicker = true
            } label: {
                HStack(spacing: 3) {
                    Text(effectiveLanguageFlag)
                        .font(.system(size: 12))

                    if let langCode = effectiveLanguageCode {
                        Text(langCode.uppercased())
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundColor(.primary)
                    }

                    Image(systemName: "chevron.down")
                        .font(.system(size: 7, weight: .bold))
                        .foregroundColor(.secondary)
                }
                .padding(.horizontal, 6)
                .padding(.vertical, 3)
                .background(
                    Capsule()
                        .fill(.ultraThinMaterial)
                )
            }
            .buttonStyle(.plain)

            Spacer()

            // Character Counter (shows when approaching or exceeding threshold)
            if characterCountState.shouldShowCounter {
                characterCounterView
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 5)
    }

    // MARK: - Character Counter View

    private var characterCounterView: some View {
        HStack(spacing: 4) {
            // Warning icon when exceeding threshold
            if characterCountState.exceedsThreshold {
                Image(systemName: "doc.text.fill")
                    .font(.system(size: 10))
                    .foregroundColor(characterCountState.indicatorColor)
            }

            // Character count
            Text(characterCountState.formattedCount)
                .font(.system(size: 10, weight: .medium, design: .monospaced))
                .foregroundColor(characterCountState.indicatorColor)

            // Info text when over threshold
            if characterCountState.exceedsThreshold {
                Text("-> fichier")
                    .font(.system(size: 9, weight: .medium))
                    .foregroundColor(characterCountState.indicatorColor.opacity(0.8))
            }
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(
            Capsule()
                .fill(characterCountState.indicatorColor.opacity(0.15))
        )
        .overlay(
            Capsule()
                .stroke(characterCountState.indicatorColor.opacity(0.3), lineWidth: 1)
        )
        .animation(.easeInOut(duration: 0.2), value: characterCountState.exceedsThreshold)
    }

    // MARK: - Main Input Zone

    private var mainInputZone: some View {
        HStack(alignment: .bottom, spacing: 0) {
            // Plus Button
            plusButton
                .padding(.leading, 8)
                .padding(.bottom, 10)

            // Text Input or Recording View
            if isRecording {
                recordingView
                    .padding(.horizontal, 8)
                    .padding(.vertical, 6)
            } else {
                textInputArea
                    .padding(.horizontal, 4)
                    .padding(.vertical, 6)
            }

            // Right Button (Send or Voice)
            rightActionButton
                .padding(.trailing, 8)
                .padding(.bottom, 10)
        }
    }

    // MARK: - Plus Button

    private var plusButton: some View {
        Button {
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                showAttachmentMenu.toggle()
            }
        } label: {
            Image(systemName: showAttachmentMenu ? "xmark" : "plus")
                .font(.system(size: 20, weight: .medium))
                .foregroundColor(.meeshyPrimary)
                .frame(width: 34, height: 34)
                .background(
                    Circle()
                        .fill(Color.meeshyPrimary.opacity(0.1))
                )
                .rotationEffect(.degrees(showAttachmentMenu ? 45 : 0))
        }
        .buttonStyle(.plain)
    }

    // MARK: - Text Input Area

    private var textInputArea: some View {
        ZStack(alignment: .leading) {
            // Placeholder
            if text.isEmpty {
                Text("Message...")
                    .font(.system(size: 16))
                    .foregroundColor(Color(.placeholderText))
                    .padding(.leading, 12)
            }

            // Text Editor
            TextEditor(text: $text)
                .font(.system(size: 16))
                .foregroundColor(.primary)
                .scrollContentBackground(.hidden)
                .padding(.horizontal, 8)
                .padding(.vertical, 6)
                .frame(minHeight: minHeight, maxHeight: maxHeight)
                .fixedSize(horizontal: false, vertical: true)
                .focused($isFocused)
                .onChange(of: text) { _, newValue in
                    onTyping()
                    if userSelectedLanguage != nil && newValue.count < 3 {
                        userSelectedLanguage = nil
                    }
                    analyzeTextDebounced(newValue)
                    // Update character count state for long text warning
                    characterCountState = CharacterCountState(text: newValue)
                }
        }
        .background(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(Color(.systemGray6))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .stroke(isFocused ? Color.meeshyPrimary.opacity(0.4) : Color.clear, lineWidth: 1)
        )
    }

    // MARK: - Recording View (Inline)

    // Fixed waveform heights for live recording display
    private let liveWaveformBaseHeights: [CGFloat] = [8, 14, 10, 18, 12, 20, 8, 16, 14, 10, 18, 12, 8, 20, 14, 10, 16, 12, 18, 8]

    private var recordingView: some View {
        HStack(spacing: 8) {
            // Sound Effects Button (left of waveform)
            Button {
                UIImpactFeedbackGenerator(style: .light).impactOccurred()
                showEffectsPanel = true
            } label: {
                ZStack {
                    Circle()
                        .fill(selectedVoiceEffect == .none ? Color(.systemGray5) : Color.purple.opacity(0.2))
                        .frame(width: 32, height: 32)

                    Image(systemName: selectedVoiceEffect.icon)
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(selectedVoiceEffect == .none ? .secondary : .purple)
                }
            }

            // Content changes based on long press mode
            if isLongPressRecording {
                // LONG PRESS MODE: Slide to cancel indicator
                slideToCancel
            } else {
                // TAP MODE: Delete button + waveform
                tapModeRecordingContent
            }

            // Duration - fixed size to prevent wrapping
            Text(formatDuration(recordingDuration))
                .font(.system(size: 13, weight: .medium, design: .monospaced))
                .foregroundColor(.primary)
                .fixedSize()
                .lineLimit(1)

            // Recording indicator (pulsing red dot) on right
            Circle()
                .fill(Color.red)
                .frame(width: 12, height: 12)
                .opacity(recordingDuration.truncatingRemainder(dividingBy: 1.0) < 0.5 ? 1.0 : 0.4)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(Color.red.opacity(0.08))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .stroke(Color.red.opacity(0.3), lineWidth: 1)
        )
        .sheet(isPresented: $showEffectsPanel) {
            voiceEffectsSheet
        }
    }

    // MARK: - Tap Mode Recording Content

    private var tapModeRecordingContent: some View {
        HStack(spacing: 8) {
            // Delete button
            Button {
                cancelRecording()
            } label: {
                Image(systemName: "trash.circle.fill")
                    .font(.system(size: 28))
                    .foregroundStyle(.white, .red)
            }

            // Live Waveform - only show actual samples (no static bars on right)
            GeometryReader { geometry in
                let maxBars = Int(geometry.size.width / 5)
                let barCount = min(waveformSamples.count, maxBars)

                HStack(spacing: 2) {
                    ForEach(0..<barCount, id: \.self) { i in
                        let sampleHeight = waveformSamples[i]
                        RoundedRectangle(cornerRadius: 1.5)
                            .fill(Color.red.opacity(0.7))
                            .frame(width: 3, height: sampleHeight)
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
            }
            .frame(height: 30)
        }
    }

    // MARK: - Slide to Cancel (Long Press Mode)

    private var slideToCancel: some View {
        HStack(spacing: 8) {
            // Animated chevrons pointing left
            HStack(spacing: 2) {
                ForEach(0..<3, id: \.self) { i in
                    Image(systemName: "chevron.left")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundColor(.red.opacity(0.6))
                        .opacity(slideChevronOpacity(index: i))
                }
            }
            .animation(.easeInOut(duration: 0.8).repeatForever(autoreverses: true), value: recordingDuration)

            // "Glisser pour annuler" text
            Text("Glisser pour annuler")
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(.secondary)

            Spacer()

            // Mini waveform (shorter)
            HStack(spacing: 2) {
                ForEach(0..<8, id: \.self) { i in
                    let baseHeight = liveWaveformBaseHeights[i % liveWaveformBaseHeights.count]
                    let sampleHeight = i < waveformSamples.count ? waveformSamples[i] : baseHeight
                    RoundedRectangle(cornerRadius: 1)
                        .fill(Color.red.opacity(0.7))
                        .frame(width: 2, height: sampleHeight * 0.7)
                }
            }
            .frame(height: 20)
        }
        .frame(maxWidth: .infinity)
    }

    private func slideChevronOpacity(index: Int) -> Double {
        let phase = recordingDuration.truncatingRemainder(dividingBy: 1.0)
        let offset = Double(index) * 0.2
        return max(0.3, sin((phase + offset) * .pi))
    }

    // MARK: - Voice Effects Sheet

    private var voiceEffectsSheet: some View {
        NavigationView {
            List {
                ForEach(VoiceEffect.allCases, id: \.self) { effect in
                    Button {
                        selectedVoiceEffect = effect
                        UIImpactFeedbackGenerator(style: .light).impactOccurred()
                        showEffectsPanel = false
                    } label: {
                        HStack(spacing: 12) {
                            Image(systemName: effect.icon)
                                .font(.system(size: 20))
                                .foregroundColor(effect.color)
                                .frame(width: 36, height: 36)
                                .background(
                                    Circle()
                                        .fill(effect.color.opacity(0.15))
                                )

                            VStack(alignment: .leading, spacing: 2) {
                                Text(effect.name)
                                    .font(.system(size: 16, weight: .medium))
                                    .foregroundColor(.primary)

                                Text(effect.description)
                                    .font(.system(size: 12))
                                    .foregroundColor(.secondary)
                            }

                            Spacer()

                            if selectedVoiceEffect == effect {
                                Image(systemName: "checkmark.circle.fill")
                                    .font(.system(size: 22))
                                    .foregroundColor(.green)
                            }
                        }
                        .padding(.vertical, 4)
                    }
                    .buttonStyle(.plain)
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle("Effets vocaux")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Fermer") {
                        showEffectsPanel = false
                    }
                }
            }
        }
        .presentationDetents([.medium])
        .presentationDragIndicator(.visible)
    }

    // MARK: - Right Action Button

    private var rightActionButton: some View {
        Group {
            if canSend && !isRecording {
                // Send Button
                Button {
                    sendMessage()
                } label: {
                    Image(systemName: "arrow.up")
                        .font(.system(size: 16, weight: .bold))
                        .foregroundColor(.white)
                        .frame(width: 34, height: 34)
                        .background(
                            Circle()
                                .fill(
                                    LinearGradient(
                                        colors: [Color.meeshyPrimary, Color.meeshyPrimary.opacity(0.8)],
                                        startPoint: .topLeading,
                                        endPoint: .bottomTrailing
                                    )
                                )
                        )
                }
                .disabled(isSending)
                .buttonStyle(.plain)
                .transition(.scale.combined(with: .opacity))
            } else {
                // Voice Button
                voiceRecordButton
                    .transition(.scale.combined(with: .opacity))
            }
        }
        .animation(.spring(response: 0.3, dampingFraction: 0.7), value: canSend)
        .animation(.spring(response: 0.3, dampingFraction: 0.7), value: isRecording)
    }

    // MARK: - Voice Record Button

    private var voiceRecordButton: some View {
        ZStack {
            // Background
            Circle()
                .fill(isRecording ? Color.red : Color.meeshyPrimary.opacity(0.1))
                .frame(width: 34, height: 34)

            // Icon
            Image(systemName: isRecording ? "stop.fill" : "mic.fill")
                .font(.system(size: isRecording ? 14 : 16))
                .foregroundColor(isRecording ? .white : .meeshyPrimary)
        }
        // Long press gesture: hold to record with slide-to-cancel
        .gesture(
            LongPressGesture(minimumDuration: 0.3)
                .onEnded { _ in
                    startRecording(longPressMode: true)
                }
                .sequenced(before: DragGesture(minimumDistance: 0))
                .onEnded { value in
                    switch value {
                    case .second(true, let drag):
                        if let drag = drag, drag.translation.width < -80 {
                            cancelRecording()
                        } else {
                            stopRecordingAndAddAttachment()
                        }
                    default:
                        break
                    }
                }
        )
        // Tap gesture: tap to start/stop recording
        .onTapGesture {
            if isRecording {
                // Stop recording
                stopRecordingAndAddAttachment()
            } else {
                // Start recording in tap mode (with stop button)
                startRecording(longPressMode: false)
            }
        }
    }

    // MARK: - Attachment Menu Overlay

    private var attachmentMenuOverlay: some View {
        VStack {
            Spacer()

            HStack(spacing: 12) {
                AttachmentMenuOption(icon: "camera.fill", title: "Photo", color: .green) {
                    closeMenuAndExecute {
                        showCameraView = true
                    }
                }
                AttachmentMenuOption(icon: "photo.on.rectangle", title: "Galerie", color: .blue) {
                    closeMenuAndExecute {
                        showImagePicker = true
                    }
                }
                AttachmentMenuOption(icon: "doc.fill", title: "Fichier", color: .orange) {
                    closeMenuAndExecute {
                        showDocumentPicker = true
                    }
                }
                AttachmentMenuOption(icon: "location.fill", title: "Position", color: .red) {
                    closeMenuAndExecute { /* Location */ }
                }
                AttachmentMenuOption(icon: "person.crop.circle.fill", title: "Contact", color: .purple) {
                    closeMenuAndExecute { /* Contact */ }
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(.ultraThinMaterial)
                    .shadow(color: .black.opacity(0.15), radius: 12, x: 0, y: -4)
            )
            .padding(.horizontal, 8)
            .padding(.bottom, 70)
        }
        .contentShape(Rectangle())
        .onTapGesture {
            withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                showAttachmentMenu = false
            }
        }
    }

    // MARK: - Language Picker Sheet

    private var languagePickerSheet: some View {
        NavigationView {
            List {
                // Detected Language Section
                if let detected = detectedLanguage, detected.isReliable {
                    Section {
                        languageRow(
                            code: detected.primaryLanguage ?? "und",
                            flag: detected.primaryLanguageFlag,
                            name: detected.primaryLanguageDisplayName ?? "Inconnue",
                            isSelected: userSelectedLanguage == nil
                        )
                    } header: {
                        Text("Langue détectée")
                    }

                    // Proposed alternatives
                    if !detected.alternatives.isEmpty {
                        Section {
                            ForEach(detected.alternatives, id: \.languageCode) { alt in
                                languageRow(
                                    code: alt.languageCode,
                                    flag: alt.flag,
                                    name: alt.displayName ?? alt.languageCode,
                                    isSelected: userSelectedLanguage == alt.languageCode
                                )
                            }
                        } header: {
                            Text("Langues proposées")
                        }
                    }
                }

                // Supported Languages Section
                Section {
                    ForEach(supportedLanguages, id: \.code) { lang in
                        languageRow(
                            code: lang.code,
                            flag: LanguageDetectionResult.flagEmoji(forLanguageCode: lang.code),
                            name: lang.name,
                            isSelected: userSelectedLanguage == lang.code
                        )
                    }
                } header: {
                    Text("Autres langues supportées")
                }

                // Reset to auto-detect
                if userSelectedLanguage != nil {
                    Section {
                        Button {
                            userSelectedLanguage = nil
                            showLanguagePicker = false
                        } label: {
                            HStack(spacing: 8) {
                                Image(systemName: "sparkles")
                                    .font(.system(size: 16))
                                Text("Détection automatique")
                            }
                            .foregroundColor(.blue)
                        }
                    }
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle("Langue du message")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("OK") {
                        showLanguagePicker = false
                    }
                    .fontWeight(.semibold)
                }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }

    @ViewBuilder
    private func languageRow(
        code: String,
        flag: String,
        name: String,
        isSelected: Bool
    ) -> some View {
        Button {
            userSelectedLanguage = code
            showLanguagePicker = false
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
        } label: {
            HStack(spacing: 12) {
                Text(flag)
                    .font(.system(size: 24))

                Text(name)
                    .font(.system(size: 16))
                    .foregroundColor(.primary)

                Spacer()

                if isSelected {
                    Image(systemName: "checkmark")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(.blue)
                }
            }
            .padding(.vertical, 4)
        }
        .buttonStyle(.plain)
    }

    private var supportedLanguages: [(code: String, name: String)] {
        [
            ("fr", "Français"),
            ("en", "English"),
            ("es", "Español"),
            ("de", "Deutsch"),
            ("it", "Italiano"),
            ("pt", "Português"),
            ("nl", "Nederlands"),
            ("ru", "Русский"),
            ("ar", "العربية"),
            ("zh", "中文"),
            ("ja", "日本語"),
            ("ko", "한국어")
        ]
    }

    // MARK: - Helper Methods

    private func sendMessage() {
        guard !isSending else { return }

        let languageCode = effectiveLanguageCode
        let sentiment = sentimentResult?.category
        let currentAttachments = attachments

        UIImpactFeedbackGenerator(style: .light).impactOccurred()

        onSend(currentAttachments, languageCode, sentiment)
        text = ""
        attachments.removeAll()
        clearAnalysis()
        // Reset character count state
        characterCountState = CharacterCountState(text: "")
    }

    private func removeAttachment(_ attachment: InputAttachment) {
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        withAnimation(.easeInOut(duration: 0.2)) {
            attachments.removeAll { $0.id == attachment.id }
        }
    }

    private func toggleAudioPlayback(_ attachment: InputAttachment) {
        if playingAudioId == attachment.id {
            // Stop current playback
            stopAudioPlayback()
        } else {
            // Stop any existing playback first
            stopAudioPlayback()

            // Start new playback
            guard let audioURL = attachment.localURL else {
                languageLogger.info("No audio URL for attachment: \(attachment.id)")
                return
            }

            do {
                // Configure audio session for playback
                let audioSession = AVAudioSession.sharedInstance()
                try audioSession.setCategory(.playback, mode: .default)
                try audioSession.setActive(true)

                // Initialize and play
                audioPlayer = try AVAudioPlayer(contentsOf: audioURL)
                audioPlayer?.prepareToPlay()
                audioPlayer?.play()

                playingAudioId = attachment.id
                isPlayingAudio = true

                // Monitor playback completion
                playbackTimer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [self] _ in
                    if audioPlayer?.isPlaying == false {
                        stopAudioPlayback()
                    }
                }

                languageLogger.info("Playing audio: \(audioURL.lastPathComponent)")

            } catch {
                languageLogger.error("Failed to play audio: \(error.localizedDescription)")
                playingAudioId = nil
                isPlayingAudio = false
            }
        }
    }

    private func stopAudioPlayback() {
        audioPlayer?.stop()
        audioPlayer = nil
        playbackTimer?.invalidate()
        playbackTimer = nil
        playingAudioId = nil
        isPlayingAudio = false
    }

    private func closeMenuAndExecute(_ action: @escaping () -> Void) {
        withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
            showAttachmentMenu = false
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
            action()
        }
    }

    // MARK: - Camera Attachment Helpers

    private func addImageAttachment(_ image: UIImage) {
        // Directly add image as attachment (skip editor)
        // Used when adding image without editor flow
        let fileName = "photo_\(UUID().uuidString).jpg"
        let tempURL = FileManager.default.temporaryDirectory.appendingPathComponent(fileName)

        if let data = image.jpegData(compressionQuality: 0.85) {
            try? data.write(to: tempURL)
        }

        let thumbnail = createThumbnailSync(from: image)

        let attachment = InputAttachment(
            id: UUID().uuidString,
            type: .image,
            thumbnail: thumbnail,
            fileName: fileName,
            duration: nil,
            localURL: tempURL
        )

        withAnimation(.easeInOut(duration: 0.2)) {
            attachments.append(attachment)
        }

        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        languageLogger.info("Added image attachment: \(fileName)")
    }

    /// Add edited images as attachments after ImageEditorView confirms
    private func addEditedImagesAsAttachments(_ images: [UIImage]) {
        for image in images {
            // Save to temp file
            let fileName = "photo_\(UUID().uuidString).jpg"
            let tempURL = FileManager.default.temporaryDirectory.appendingPathComponent(fileName)

            if let data = image.jpegData(compressionQuality: 0.85) {
                try? data.write(to: tempURL)
            }

            // Create thumbnail
            let thumbnail = createThumbnailSync(from: image)

            let attachment = InputAttachment(
                id: UUID().uuidString,
                type: .image,
                thumbnail: thumbnail,
                fileName: fileName,
                duration: nil,
                localURL: tempURL
            )

            withAnimation(.easeInOut(duration: 0.2)) {
                attachments.append(attachment)
            }

            languageLogger.info("Added image attachment: \(fileName)")
        }

        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
    }

    /// Synchronous thumbnail creation for UI responsiveness
    private func createThumbnailSync(from image: UIImage) -> Image {
        let maxSize: CGFloat = 300
        let scale = min(maxSize / image.size.width, maxSize / image.size.height, 1.0)

        if scale < 1.0 {
            let newSize = CGSize(width: image.size.width * scale, height: image.size.height * scale)
            let renderer = UIGraphicsImageRenderer(size: newSize)
            let thumbnail = renderer.image { _ in
                image.draw(in: CGRect(origin: .zero, size: newSize))
            }
            return Image(uiImage: thumbnail)
        }

        return Image(uiImage: image)
    }

    /// Replace an existing attachment with an edited image
    private func replaceAttachmentWithEditedImage(at index: Int, image: UIImage) {
        guard index < attachments.count else { return }

        let oldAttachment = attachments[index]

        // Delete old temp file
        if let oldURL = oldAttachment.localURL {
            try? FileManager.default.removeItem(at: oldURL)
        }

        // Save new edited image to temp file
        let fileName = "photo_\(UUID().uuidString).jpg"
        let tempURL = FileManager.default.temporaryDirectory.appendingPathComponent(fileName)

        if let data = image.jpegData(compressionQuality: 0.85) {
            try? data.write(to: tempURL)
        }

        // Create thumbnail
        let thumbnail = createThumbnailSync(from: image)

        // Create new attachment with same ID
        let newAttachment = InputAttachment(
            id: oldAttachment.id, // Keep same ID
            type: .image,
            thumbnail: thumbnail,
            fileName: fileName,
            duration: nil,
            localURL: tempURL
        )

        withAnimation(.easeInOut(duration: 0.2)) {
            attachments[index] = newAttachment
        }

        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        languageLogger.info("Replaced image attachment at index \(index)")
    }

    /// Add edited video as attachment after VideoEditorView confirms
    private func addEditedVideoAsAttachment(url: URL, isMuted: Bool) {
        Task {
            var thumbnail: Image? = nil
            var duration: TimeInterval? = nil

            if let image = try? await VideoCompressor.generateThumbnail(url, at: .zero) {
                thumbnail = Image(uiImage: image)
            }

            if let metadata = try? await VideoCompressor.extractMetadata(url) {
                duration = metadata.duration
            }

            await MainActor.run {
                let fileName = "video_\(UUID().uuidString).mp4"
                let attachment = InputAttachment(
                    id: UUID().uuidString,
                    type: .video,
                    thumbnail: thumbnail,
                    fileName: fileName,
                    duration: duration,
                    localURL: url
                )

                withAnimation(.easeInOut(duration: 0.2)) {
                    attachments.append(attachment)
                }

                UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                languageLogger.info("Added video attachment: \(fileName), muted: \(isMuted)")
            }
        }
    }

    /// Replace an existing video attachment with an edited version
    private func replaceAttachmentWithEditedVideo(at index: Int, url: URL, isMuted: Bool) {
        guard index < attachments.count else { return }

        let oldAttachment = attachments[index]

        Task {
            var thumbnail: Image? = nil
            var duration: TimeInterval? = nil

            if let image = try? await VideoCompressor.generateThumbnail(url, at: .zero) {
                thumbnail = Image(uiImage: image)
            }

            if let metadata = try? await VideoCompressor.extractMetadata(url) {
                duration = metadata.duration
            }

            await MainActor.run {
                // Delete old temp file if different
                if let oldURL = oldAttachment.localURL, oldURL != url {
                    try? FileManager.default.removeItem(at: oldURL)
                }

                let fileName = "video_\(UUID().uuidString).mp4"
                let newAttachment = InputAttachment(
                    id: oldAttachment.id,
                    type: .video,
                    thumbnail: thumbnail,
                    fileName: fileName,
                    duration: duration,
                    localURL: url
                )

                withAnimation(.easeInOut(duration: 0.2)) {
                    attachments[index] = newAttachment
                }

                UIImpactFeedbackGenerator(style: .light).impactOccurred()
                languageLogger.info("Replaced video attachment at index \(index)")
            }
        }
    }

    /// Add edited audio as attachment after ModernAudioEditorView confirms
    private func addEditedAudioAsAttachment(url: URL, effect: AudioEffectType) {
        Task {
            var duration: TimeInterval? = nil

            do {
                let player = try AVAudioPlayer(contentsOf: url)
                duration = player.duration
            } catch {
                languageLogger.warn("Could not get audio duration: \(error.localizedDescription)")
            }

            await MainActor.run {
                let fileName = "audio_\(UUID().uuidString).m4a"
                let attachment = InputAttachment(
                    id: UUID().uuidString,
                    type: .audio,
                    thumbnail: nil,
                    fileName: fileName,
                    duration: duration,
                    localURL: url
                )

                withAnimation(.easeInOut(duration: 0.2)) {
                    attachments.append(attachment)
                }

                UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                languageLogger.info("Added audio attachment: \(fileName), effect: \(effect.rawValue)")
            }
        }
    }

    /// Replace an existing audio attachment with an edited version
    private func replaceAttachmentWithEditedAudio(at index: Int, url: URL, effect: AudioEffectType) {
        guard index < attachments.count else { return }

        let oldAttachment = attachments[index]

        Task {
            var duration: TimeInterval? = nil

            do {
                let player = try AVAudioPlayer(contentsOf: url)
                duration = player.duration
            } catch {
                languageLogger.warn("Could not get audio duration: \(error.localizedDescription)")
            }

            await MainActor.run {
                // Delete old temp file if different
                if let oldURL = oldAttachment.localURL, oldURL != url {
                    try? FileManager.default.removeItem(at: oldURL)
                }

                let fileName = "audio_\(UUID().uuidString).m4a"
                let newAttachment = InputAttachment(
                    id: oldAttachment.id,
                    type: .audio,
                    thumbnail: nil,
                    fileName: fileName,
                    duration: duration,
                    localURL: url
                )

                withAnimation(.easeInOut(duration: 0.2)) {
                    attachments[index] = newAttachment
                }

                UIImpactFeedbackGenerator(style: .light).impactOccurred()
                languageLogger.info("Replaced audio attachment at index \(index), effect: \(effect.rawValue)")
            }
        }
    }

    private func sentimentColor(_ category: SentimentCategory) -> Color {
        switch category {
        case .veryPositive: return .green
        case .positive: return .teal
        case .neutral: return .gray
        case .negative: return .orange
        case .veryNegative: return .red
        case .unknown: return .gray
        }
    }

    /// Format duration for display - always includes milliseconds
    /// - >= 1 hour: HH:mm:ss.ms
    /// - < 1 hour: mm:ss.ms
    private func formatDuration(_ duration: TimeInterval) -> String {
        let totalSeconds = Int(duration)
        let hours = totalSeconds / 3600
        let minutes = (totalSeconds % 3600) / 60
        let seconds = totalSeconds % 60
        let milliseconds = Int((duration - Double(totalSeconds)) * 100)

        if hours >= 1 {
            // Show hours with ms: HH:mm:ss.ms
            return String(format: "%d:%02d:%02d.%02d", hours, minutes, seconds, milliseconds)
        } else {
            // Show with ms: mm:ss.ms
            return String(format: "%d:%02d.%02d", minutes, seconds, milliseconds)
        }
    }

    /// Format remaining time (total - current) with milliseconds
    private func formatRemainingDuration(current: TimeInterval, total: TimeInterval) -> String {
        let remaining = max(0, total - current)
        return "-" + formatDuration(remaining)
    }

    // MARK: - Voice Recording Methods

    private func startRecording(longPressMode: Bool = false) {
        // Request microphone permission and start recording
        Task { @MainActor in
            let hasPermission = await PermissionManager.shared.requestMicrophoneAccess()
            guard hasPermission else {
                languageLogger.info("Microphone permission denied")
                return
            }

            do {
                // Configure audio session for recording
                let audioSession = AVAudioSession.sharedInstance()
                try audioSession.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker, .allowBluetooth])
                try audioSession.setActive(true)

                // Create unique file URL for recording
                let fileName = "voice_\(UUID().uuidString).m4a"
                let url = FileManager.default.temporaryDirectory.appendingPathComponent(fileName)

                // Recording settings (AAC format, stereo, high quality, 128kbps)
                let settings: [String: Any] = [
                    AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
                    AVSampleRateKey: 44100,
                    AVNumberOfChannelsKey: 2,                           // Stereo recording
                    AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue,
                    AVEncoderBitRateKey: 128000                         // 128 kbps bitrate
                ]

                // Initialize and start recorder
                audioRecorder = try AVAudioRecorder(url: url, settings: settings)
                audioRecorder?.isMeteringEnabled = true
                audioRecorder?.record()

                recordedAudioURL = url
                isRecording = true
                isLongPressRecording = longPressMode
                recordingDuration = 0
                waveformSamples = []

                UINotificationFeedbackGenerator().notificationOccurred(.success)

                // Duration timer (updates every 0.1s)
                recordingTimer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [self] _ in
                    recordingDuration += 0.1
                }

                // Level timer for waveform (updates every 0.05s)
                levelTimer = Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true) { [self] _ in
                    audioRecorder?.updateMeters()

                    let averagePower = audioRecorder?.averagePower(forChannel: 0) ?? -160
                    // Convert dB to normalized value (0.0 to 1.0)
                    let normalizedValue = pow(10, averagePower / 20)
                    // Scale to waveform height (4 to 28)
                    let height = CGFloat(4 + normalizedValue * 24)

                    if waveformSamples.count >= 20 {
                        waveformSamples.removeFirst()
                    }
                    waveformSamples.append(max(4, min(28, height)))
                }

                languageLogger.info("Started voice recording - mode: \(longPressMode ? "long press" : "tap")")

            } catch {
                languageLogger.error("Failed to start recording: \(error.localizedDescription)")
                isRecording = false
            }
        }
    }

    private func stopRecordingAndAddAttachment() {
        guard isRecording else { return }

        // Stop the audio recorder
        audioRecorder?.stop()
        audioRecorder = nil

        // Stop all timers
        recordingTimer?.invalidate()
        recordingTimer = nil
        levelTimer?.invalidate()
        levelTimer = nil

        isRecording = false
        isLongPressRecording = false

        UIImpactFeedbackGenerator(style: .medium).impactOccurred()

        // Only open editor if recording is long enough and we have a valid URL
        if recordingDuration > 0.5, let audioURL = recordedAudioURL {
            // Verify file exists
            guard FileManager.default.fileExists(atPath: audioURL.path) else {
                languageLogger.error("Recorded audio file not found at: \(audioURL.path)")
                recordingDuration = 0
                waveformSamples = []
                recordedAudioURL = nil
                return
            }

            // Open audio editor for trimming and effects
            pendingAudioURL = audioURL
            pendingAudioEffect = selectedVoiceEffect == .none ? .normal : mapVoiceEffectToAudioEditorEffect(selectedVoiceEffect)
            editingAttachmentIndex = nil
            showAudioEditor = true

            languageLogger.info("Opening audio editor for: \(audioURL.lastPathComponent), duration: \(recordingDuration)s")
        } else {
            // Recording too short, delete the file
            if let audioURL = recordedAudioURL {
                try? FileManager.default.removeItem(at: audioURL)
            }
            languageLogger.info("Recording too short, discarded")
        }

        recordingDuration = 0
        waveformSamples = []
        recordedAudioURL = nil
    }

    /// Map MessageInputBar VoiceEffect to AudioEffectType
    private func mapVoiceEffectToAudioEditorEffect(_ effect: VoiceEffect) -> AudioEffectType {
        switch effect {
        case .none: return .normal
        case .echo: return .echo
        case .reverb: return .reverb
        case .robot: return .robot
        case .chipmunk: return .chipmunk
        case .deep: return .deep
        case .telephone: return .telephone
        case .stadium: return .stadium
        }
    }

    private func cancelRecording() {
        // Stop the audio recorder
        audioRecorder?.stop()
        audioRecorder = nil

        // Delete the recorded file
        if let audioURL = recordedAudioURL {
            try? FileManager.default.removeItem(at: audioURL)
        }

        // Stop all timers
        recordingTimer?.invalidate()
        recordingTimer = nil
        levelTimer?.invalidate()
        levelTimer = nil

        isRecording = false
        isLongPressRecording = false
        recordingDuration = 0
        waveformSamples = []
        recordedAudioURL = nil

        UINotificationFeedbackGenerator().notificationOccurred(.warning)
        languageLogger.info("Recording cancelled")
    }

    // MARK: - Photo Processing

    @MainActor
    private func processSelectedPhotos(_ items: [PhotosPickerItem]) async {
        guard !items.isEmpty else { return }

        var loadedImages: [UIImage] = []
        var videoItems: [PhotosPickerItem] = []

        // Separate images and videos, load images for editor
        for item in items {
            let isVideo = item.supportedContentTypes.contains(where: { $0.conforms(to: .movie) || $0.conforms(to: .video) })

            if isVideo {
                // Videos are processed directly without editor
                videoItems.append(item)
            } else {
                // Load image for editor
                if let data = try? await item.loadTransferable(type: Data.self),
                   let uiImage = UIImage(data: data) {
                    loadedImages.append(uiImage)
                }
            }
        }

        // Process videos directly (no editor for videos - they have VideoEditorView)
        for videoItem in videoItems {
            if let attachment = await processVideoItem(videoItem) {
                withAnimation(.easeInOut(duration: 0.2)) {
                    self.attachments.insert(attachment, at: 0)
                }
            }
        }

        // Show image editor if we have images
        if !loadedImages.isEmpty {
            pendingImages = loadedImages
            showImageEditor = true
        }

        if !videoItems.isEmpty {
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        }
    }

    /// Process a video item from PhotosPicker
    private func processVideoItem(_ item: PhotosPickerItem) async -> InputAttachment? {
        guard let movie = try? await item.loadTransferable(type: VideoTransferable.self) else {
            return nil
        }

        // Generate thumbnail and duration in parallel
        async let thumbnailTask = generateVideoThumbnail(url: movie.url)
        async let durationTask = getVideoDuration(url: movie.url)

        let (thumbnail, duration) = await (thumbnailTask, durationTask)

        let attachment = InputAttachment(
            id: UUID().uuidString,
            type: .video,
            thumbnail: thumbnail,
            fileName: movie.url.lastPathComponent,
            duration: duration,
            localURL: movie.url
        )

        await MainActor.run {
            languageLogger.info("Added video attachment: \(movie.url.lastPathComponent)")
        }

        return attachment
    }

    private func processPhotoItem(_ item: PhotosPickerItem) async -> InputAttachment? {
        // Determine if it's a video or image
        let isVideo = item.supportedContentTypes.contains(where: { $0.conforms(to: .movie) || $0.conforms(to: .video) })

        if isVideo {
            // Load video
            guard let movie = try? await item.loadTransferable(type: VideoTransferable.self) else {
                return nil
            }

            // Generate thumbnail and duration in parallel
            async let thumbnailTask = generateVideoThumbnail(url: movie.url)
            async let durationTask = getVideoDuration(url: movie.url)

            let (thumbnail, duration) = await (thumbnailTask, durationTask)

            let attachment = InputAttachment(
                id: UUID().uuidString,
                type: .video,
                thumbnail: thumbnail,
                fileName: movie.url.lastPathComponent,
                duration: duration,
                localURL: movie.url
            )

            await MainActor.run {
                languageLogger.info("Added video attachment: \(movie.url.lastPathComponent)")
            }

            return attachment
        } else {
            // Load image
            guard let data = try? await item.loadTransferable(type: Data.self),
                  let uiImage = UIImage(data: data) else {
                return nil
            }

            // Save to temp file (do file I/O off main thread)
            let fileName = "image_\(UUID().uuidString).jpg"
            let tempURL = FileManager.default.temporaryDirectory.appendingPathComponent(fileName)

            // Compress and save on background thread
            guard let jpegData = uiImage.jpegData(compressionQuality: 0.85) else {
                return nil
            }

            do {
                try jpegData.write(to: tempURL)
            } catch {
                return nil
            }

            // Create thumbnail (smaller image for preview)
            let thumbnailImage = await createThumbnail(from: uiImage)

            let attachment = InputAttachment(
                id: UUID().uuidString,
                type: .image,
                thumbnail: thumbnailImage,
                fileName: fileName,
                duration: nil,
                localURL: tempURL
            )

            await MainActor.run {
                languageLogger.info("Added image attachment: \(fileName)")
            }

            return attachment
        }
    }

    private func createThumbnail(from image: UIImage) async -> Image {
        // Create a smaller thumbnail for preview to improve performance
        let maxSize: CGFloat = 300
        let scale = min(maxSize / image.size.width, maxSize / image.size.height, 1.0)

        if scale < 1.0 {
            let newSize = CGSize(width: image.size.width * scale, height: image.size.height * scale)
            let renderer = UIGraphicsImageRenderer(size: newSize)
            let thumbnail = renderer.image { _ in
                image.draw(in: CGRect(origin: .zero, size: newSize))
            }
            return Image(uiImage: thumbnail)
        }

        return Image(uiImage: image)
    }

    private func generateVideoThumbnail(url: URL) async -> Image? {
        await withCheckedContinuation { continuation in
            DispatchQueue.global(qos: .userInitiated).async {
                let asset = AVAsset(url: url)
                let generator = AVAssetImageGenerator(asset: asset)
                generator.appliesPreferredTrackTransform = true
                generator.maximumSize = CGSize(width: 200, height: 200)

                do {
                    let cgImage = try generator.copyCGImage(at: .zero, actualTime: nil)
                    let uiImage = UIImage(cgImage: cgImage)
                    continuation.resume(returning: Image(uiImage: uiImage))
                } catch {
                    continuation.resume(returning: nil)
                }
            }
        }
    }

    private func getVideoDuration(url: URL) async -> TimeInterval? {
        await withCheckedContinuation { continuation in
            Task {
                let asset = AVAsset(url: url)
                do {
                    let duration = try await asset.load(.duration)
                    continuation.resume(returning: duration.seconds)
                } catch {
                    continuation.resume(returning: nil)
                }
            }
        }
    }

    // MARK: - Document Processing

    private func processSelectedDocuments(_ urls: [URL]) {
        for url in urls {
            // Start accessing security-scoped resource
            guard url.startAccessingSecurityScopedResource() else {
                languageLogger.error("Cannot access document: \(url.lastPathComponent)")
                continue
            }

            defer { url.stopAccessingSecurityScopedResource() }

            // Copy to temp directory
            let fileName = url.lastPathComponent
            let tempURL = FileManager.default.temporaryDirectory.appendingPathComponent(fileName)

            do {
                // Remove existing file if any
                try? FileManager.default.removeItem(at: tempURL)
                try FileManager.default.copyItem(at: url, to: tempURL)

                // Determine file type
                let fileExtension = url.pathExtension.lowercased()
                let isImage = ["jpg", "jpeg", "png", "gif", "heic", "webp", "bmp", "tiff"].contains(fileExtension)
                let isVideo = ["mp4", "mov", "m4v", "avi", "mkv", "webm"].contains(fileExtension)

                var attachmentType: InputAttachment.AttachmentType = .document
                var thumbnail: Image? = nil
                var duration: TimeInterval? = nil

                if isImage {
                    attachmentType = .image
                    if let uiImage = UIImage(contentsOfFile: tempURL.path) {
                        thumbnail = Image(uiImage: uiImage)
                    }
                } else if isVideo {
                    attachmentType = .video
                    // Generate thumbnail synchronously for now
                    let asset = AVAsset(url: tempURL)
                    let generator = AVAssetImageGenerator(asset: asset)
                    generator.appliesPreferredTrackTransform = true
                    generator.maximumSize = CGSize(width: 200, height: 200)
                    if let cgImage = try? generator.copyCGImage(at: .zero, actualTime: nil) {
                        thumbnail = Image(uiImage: UIImage(cgImage: cgImage))
                    }
                }

                let attachment = InputAttachment(
                    id: UUID().uuidString,
                    type: attachmentType,
                    thumbnail: thumbnail,
                    fileName: fileName,
                    duration: duration,
                    localURL: tempURL
                )

                withAnimation(.easeInOut(duration: 0.2)) {
                    // Insert at beginning (newest on left)
                    attachments.insert(attachment, at: 0)
                }

                languageLogger.info("Added document attachment: \(fileName)")

            } catch {
                languageLogger.error("Failed to copy document: \(error.localizedDescription)")
            }
        }

        if !urls.isEmpty {
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        }
    }

    // MARK: - Text Analysis

    private func analyzeTextDebounced(_ newText: String) {
        languageDetectionTask?.cancel()

        let trimmedText = newText.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmedText.count < 3 {
            withAnimation(.easeOut(duration: 0.2)) {
                detectedLanguage = nil
                sentimentResult = nil
                isAnalyzing = false
            }
            return
        }

        isAnalyzing = true

        languageDetectionTask = Task { @MainActor in
            do {
                try await Task.sleep(nanoseconds: analysisDebounce)
            } catch { isAnalyzing = false; return }

            guard !Task.isCancelled else { isAnalyzing = false; return }

            async let langResult = LanguageDetector.shared.detectWhileTyping(trimmedText)
            async let sentResult = SentimentAnalyzer.shared.analyzeText(trimmedText)

            let (lang, sent) = await (langResult, sentResult)

            guard !Task.isCancelled else { isAnalyzing = false; return }

            withAnimation(.easeInOut(duration: 0.2)) {
                detectedLanguage = lang
                sentimentResult = sent
                isAnalyzing = false
            }
        }
    }

    private func clearAnalysis() {
        languageDetectionTask?.cancel()
        languageDetectionTask = nil
        detectedLanguage = nil
        sentimentResult = nil
        userSelectedLanguage = nil
        isAnalyzing = false
    }
}

// MARK: - Attachment Menu Option

struct AttachmentMenuOption: View {
    let icon: String
    let title: String
    let color: Color
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 4) {
                Image(systemName: icon)
                    .font(.system(size: 20))
                    .foregroundColor(color)
                    .frame(width: 44, height: 44)
                    .background(
                        Circle()
                            .fill(color.opacity(0.12))
                    )

                Text(title)
                    .font(.system(size: 10, weight: .medium))
                    .foregroundColor(.primary)
            }
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Sentiment Category Extension

extension SentimentCategory {
    var shortName: String {
        switch self {
        case .veryPositive: return "Très +"
        case .positive: return "Positif"
        case .neutral: return "Neutre"
        case .negative: return "Négatif"
        case .veryNegative: return "Très -"
        case .unknown: return "?"
        }
    }
}

// MARK: - Legacy Support

struct AttachmentPickerView: View {
    @Environment(\.dismiss) private var dismiss
    let onSelect: (Attachment) -> Void

    var body: some View {
        NavigationView {
            ScrollView {
                LazyVGrid(columns: [
                    GridItem(.flexible()),
                    GridItem(.flexible()),
                    GridItem(.flexible())
                ], spacing: 16) {
                    AttachmentTypeButton(icon: "photo.on.rectangle", title: "Photos", color: .blue) { dismiss() }
                    AttachmentTypeButton(icon: "camera.fill", title: "Camera", color: .green) { dismiss() }
                    AttachmentTypeButton(icon: "doc.fill", title: "Documents", color: .orange) { dismiss() }
                    AttachmentTypeButton(icon: "location.fill", title: "Location", color: .red) { dismiss() }
                    AttachmentTypeButton(icon: "person.crop.circle.fill", title: "Contact", color: .purple) { dismiss() }
                    AttachmentTypeButton(icon: "chart.bar.fill", title: "Poll", color: .cyan) { dismiss() }
                }
                .padding()
            }
            .navigationTitle("Attachments")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
    }
}

struct AttachmentTypeButton: View {
    let icon: String
    let title: String
    let color: Color
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 12) {
                ZStack {
                    Circle()
                        .fill(color.opacity(0.15))
                        .frame(width: 70, height: 70)
                    Image(systemName: icon)
                        .font(.system(size: 30))
                        .foregroundColor(color)
                }
                Text(title)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(.primary)
            }
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Voice Effect Enum

enum VoiceEffect: String, CaseIterable {
    case none
    case echo
    case reverb
    case robot
    case chipmunk
    case deep
    case telephone
    case stadium

    var name: String {
        switch self {
        case .none: return "Normal"
        case .echo: return "Écho"
        case .reverb: return "Réverbération"
        case .robot: return "Robot"
        case .chipmunk: return "Chipmunk"
        case .deep: return "Voix grave"
        case .telephone: return "Téléphone"
        case .stadium: return "Stade"
        }
    }

    var description: String {
        switch self {
        case .none: return "Voix originale sans effet"
        case .echo: return "Ajoute un écho à votre voix"
        case .reverb: return "Effet de résonance spacieuse"
        case .robot: return "Voix robotique métallique"
        case .chipmunk: return "Voix aiguë et rapide"
        case .deep: return "Voix plus grave et profonde"
        case .telephone: return "Effet ligne téléphonique"
        case .stadium: return "Comme dans un grand stade"
        }
    }

    var icon: String {
        switch self {
        case .none: return "waveform"
        case .echo: return "wave.3.right"
        case .reverb: return "waveform.path.ecg"
        case .robot: return "cpu"
        case .chipmunk: return "hare.fill"
        case .deep: return "waveform.path"
        case .telephone: return "phone.fill"
        case .stadium: return "sportscourt.fill"
        }
    }

    var color: Color {
        switch self {
        case .none: return .gray
        case .echo: return .blue
        case .reverb: return .purple
        case .robot: return .orange
        case .chipmunk: return .pink
        case .deep: return .indigo
        case .telephone: return .green
        case .stadium: return .cyan
        }
    }
}

// MARK: - Video Transferable

struct VideoTransferable: Transferable {
    let url: URL

    static var transferRepresentation: some TransferRepresentation {
        FileRepresentation(contentType: .movie) { video in
            SentTransferredFile(video.url)
        } importing: { received in
            // Copy to temp directory
            let fileName = "video_\(UUID().uuidString).\(received.file.pathExtension)"
            let tempURL = FileManager.default.temporaryDirectory.appendingPathComponent(fileName)
            try FileManager.default.copyItem(at: received.file, to: tempURL)
            return VideoTransferable(url: tempURL)
        }
    }
}

// MARK: - Document Picker View

struct DocumentPickerView: UIViewControllerRepresentable {
    let onSelect: ([URL]) -> Void

    func makeUIViewController(context: Context) -> UIDocumentPickerViewController {
        let supportedTypes: [UTType] = [
            .pdf,
            .plainText,
            .rtf,
            .spreadsheet,
            .presentation,
            .image,
            .movie,
            .audio,
            .zip,
            .data,
            .item // Fallback for any file
        ]

        let picker = UIDocumentPickerViewController(forOpeningContentTypes: supportedTypes, asCopy: true)
        picker.allowsMultipleSelection = true
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ uiViewController: UIDocumentPickerViewController, context: Context) {}

    func makeCoordinator() -> Coordinator {
        Coordinator(onSelect: onSelect)
    }

    class Coordinator: NSObject, UIDocumentPickerDelegate {
        let onSelect: ([URL]) -> Void

        init(onSelect: @escaping ([URL]) -> Void) {
            self.onSelect = onSelect
        }

        func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
            onSelect(urls)
        }

        func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
            // User cancelled - do nothing
        }
    }
}

// MARK: - Preview

#Preview("Empty") {
    VStack {
        Spacer()
        MessageInputBar(
            text: .constant(""),
            isSending: false,
            onSend: { _, _, _ in },
            onAttachmentTap: {},
            onTyping: {}
        )
    }
}

#Preview("With Text") {
    VStack {
        Spacer()
        MessageInputBar(
            text: .constant("Bonjour !"),
            isSending: false,
            onSend: { _, _, _ in },
            onAttachmentTap: {},
            onTyping: {}
        )
    }
}
