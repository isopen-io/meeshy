// MARK: - Extracted from ConversationView.swift
import SwiftUI
import PhotosUI
import AVFoundation
import MeeshySDK
import MeeshyUI

// MARK: - Composer, Attachments & Recording
extension ConversationView {

    // MARK: - Themed Composer (powered by UniversalComposerBar)
    var themedComposer: some View {
        UniversalComposerBar(
            style: .light,
            mode: .message,
            accentColor: accentColor,
            secondaryColor: secondaryColor,
            onFocusChange: { focused in
                isTyping = focused
                if focused {
                    withAnimation { showOptions = false }
                }
            },
            onLocationRequest: { showLocationPicker = true },
            textBinding: $messageText,
            editBanner: editingMessageId != nil
                ? AnyView(composerEditBanner)
                : nil,
            replyBanner: pendingReplyReference != nil && editingMessageId == nil
                ? AnyView(composerReplyBanner(pendingReplyReference!))
                : nil,
            customAttachmentsPreview: (!pendingAttachments.isEmpty || isLoadingMedia)
                ? AnyView(pendingAttachmentsRow)
                : nil,
            isEditMode: editingMessageId != nil,
            onCustomSend: {
                if editingMessageId != nil {
                    submitEdit()
                } else if audioRecorder.isRecording {
                    stopAndSendRecording()
                } else {
                    sendMessageWithAttachments()
                }
            },
            onTextChange: { viewModel.onTextChanged($0) },
            onStartRecording: { startRecording() },
            onStopRecording: { stopAndPreviewRecording() },
            externalIsRecording: audioRecorder.isRecording,
            externalRecordingDuration: audioRecorder.duration,
            externalAudioLevels: audioRecorder.audioLevels,
            externalHasContent: !pendingAttachments.isEmpty || audioRecorder.isRecording,
            onPhotoLibrary: { showPhotoPicker = true },
            onCamera: { showCamera = true },
            onFilePicker: { showFilePicker = true }
        )
        .photosPicker(isPresented: $showPhotoPicker, selection: $selectedPhotoItems, maxSelectionCount: 10, matching: .any(of: [.images, .videos]))
        .fileImporter(isPresented: $showFilePicker, allowedContentTypes: [.item], allowsMultipleSelection: true) { result in
            handleFileImport(result)
        }
        .fullScreenCover(isPresented: $showCamera) {
            CameraView { result in
                switch result {
                case .photo(let image):
                    imageToPreview = image
                case .video(let url):
                    videoToPreview = url
                }
            }
            .ignoresSafeArea()
        }
        .fullScreenCover(isPresented: Binding(
            get: { imageToPreview != nil },
            set: { if !$0 { imageToPreview = nil } }
        )) {
            if let image = imageToPreview {
                ImageEditView(image: image) { editedImage in
                    handleCameraCapture(editedImage)
                }
            }
        }
        .fullScreenCover(isPresented: Binding(
            get: { videoToPreview != nil },
            set: { if !$0 { videoToPreview = nil } }
        )) {
            if let url = videoToPreview {
                VideoPreviewView(url: url) {
                    handleCameraVideo(url)
                }
            }
        }
        .sheet(isPresented: $showLocationPicker) {
            LocationPickerView(accentColor: accentColor) { coordinate, address in
                handleLocationSelection(coordinate: coordinate, address: address)
            }
        }
        .onChange(of: selectedPhotoItems) { items in
            handlePhotoSelection(items)
        }
        .fullScreenCover(isPresented: Binding(
            get: { previewingPendingImage != nil },
            set: { if !$0 { previewingPendingImage = nil } }
        )) {
            if let image = previewingPendingImage {
                PendingImagePreview(image: image) {
                    previewingPendingImage = nil
                }
            }
        }
    }

    // MARK: - Pending Attachments Row (custom preview for UCB)
    private var pendingAttachmentsRow: some View {
        VStack(spacing: 0) {
            HStack(spacing: 0) {
                pendingAttachmentsPreview
                if isLoadingMedia {
                    ProgressView()
                        .tint(Color(hex: accentColor))
                        .padding(.horizontal, 12)
                }
            }
            if isUploading, let progress = uploadProgress {
                UploadProgressBar(progress: progress, accentColor: accentColor)
                    .padding(.horizontal, 8)
                    .padding(.bottom, 4)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: isUploading)
    }

    // MARK: - Composer Reply Banner
    func composerReplyBanner(_ reply: ReplyReference) -> some View {
        HStack(spacing: 8) {
            RoundedRectangle(cornerRadius: 2)
                .fill(Color(hex: reply.isMe ? accentColor : reply.authorColor))
                .frame(width: 3, height: 36)

            VStack(alignment: .leading, spacing: 2) {
                Text(reply.isMe ? "Vous" : reply.authorName)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(Color(hex: reply.isMe ? accentColor : reply.authorColor))

                HStack(spacing: 4) {
                    if let attType = reply.attachmentType {
                        Image(systemName: composerReplyAttachmentIcon(attType))
                            .font(.system(size: 10, weight: .medium))
                            .foregroundColor(theme.textSecondary)
                    }
                    Text(reply.previewText)
                        .font(.system(size: 12))
                        .foregroundColor(theme.textSecondary)
                        .lineLimit(1)
                }
            }

            Spacer()

            // Rich attachment preview in composer reply banner
            if let attType = reply.attachmentType {
                composerReplyAttachmentPreview(type: attType, reply: reply)
            }

            Button {
                withAnimation(.spring(response: 0.25, dampingFraction: 0.8)) {
                    pendingReplyReference = nil
                }
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundColor(theme.textMuted)
                    .frame(width: 24, height: 24)
                    .background(Circle().fill(theme.mode.isDark ? Color.white.opacity(0.1) : Color.black.opacity(0.05)))
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(theme.surfaceGradient(tint: accentColor))
                .overlay(
                    RoundedRectangle(cornerRadius: 14)
                        .stroke(theme.border(tint: accentColor, intensity: 0.3), lineWidth: 1)
                )
        )
    }

    // MARK: - Edit Banner
    var composerEditBanner: some View {
        HStack(spacing: 8) {
            RoundedRectangle(cornerRadius: 2)
                .fill(Color(hex: "F8B500"))
                .frame(width: 3, height: 36)

            Image(systemName: "pencil")
                .font(.system(size: 14, weight: .semibold))
                .foregroundColor(Color(hex: "F8B500"))

            VStack(alignment: .leading, spacing: 2) {
                Text("Modifier le message")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(Color(hex: "F8B500"))

                Text(editingOriginalContent ?? "")
                    .font(.system(size: 12))
                    .foregroundColor(theme.textSecondary)
                    .lineLimit(1)
            }

            Spacer()

            Button {
                cancelEdit()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundColor(theme.textMuted)
                    .frame(width: 24, height: 24)
                    .background(Circle().fill(theme.mode.isDark ? Color.white.opacity(0.1) : Color.black.opacity(0.05)))
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(theme.surfaceGradient(tint: "F8B500"))
                .overlay(
                    RoundedRectangle(cornerRadius: 14)
                        .stroke(theme.border(tint: "F8B500", intensity: 0.3), lineWidth: 1)
                )
        )
    }

    func submitEdit() {
        guard let messageId = editingMessageId else { return }
        let newContent = messageText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !newContent.isEmpty else { return }

        // Don't send if content unchanged
        if newContent == editingOriginalContent {
            cancelEdit()
            return
        }

        let id = messageId
        cancelEdit()
        Task {
            await viewModel.editMessage(messageId: id, newContent: newContent)
        }
    }

    func cancelEdit() {
        withAnimation(.spring(response: 0.25, dampingFraction: 0.8)) {
            editingMessageId = nil
            editingOriginalContent = nil
            messageText = ""
        }
    }

    func composerReplyAttachmentIcon(_ type: String) -> String {
        switch type {
        case "image": return "photo"
        case "video": return "video"
        case "audio": return "waveform"
        case "file": return "doc"
        case "location": return "mappin"
        default: return "paperclip"
        }
    }

    // MARK: - Rich Attachment Preview for Reply Banner
    @ViewBuilder
    func composerReplyAttachmentPreview(type: String, reply: ReplyReference) -> some View {
        let accent = Color(hex: reply.isMe ? accentColor : reply.authorColor)

        switch type {
        case "image":
            if let thumbUrl = reply.attachmentThumbnailUrl, !thumbUrl.isEmpty {
                CachedAsyncImage(url: thumbUrl) {
                    accent.opacity(0.3)
                }
                .aspectRatio(contentMode: .fill)
                .frame(width: 40, height: 40)
                .clipShape(RoundedRectangle(cornerRadius: 8))
            }

        case "video":
            if let thumbUrl = reply.attachmentThumbnailUrl, !thumbUrl.isEmpty {
                ZStack {
                    CachedAsyncImage(url: thumbUrl) {
                        accent.opacity(0.3)
                    }
                    .aspectRatio(contentMode: .fill)
                    .frame(width: 40, height: 40)
                    .clipShape(RoundedRectangle(cornerRadius: 8))

                    Image(systemName: "play.circle.fill")
                        .font(.system(size: 18))
                        .foregroundStyle(.white, .black.opacity(0.4))
                }
            } else {
                replyAttachmentFallbackBadge(icon: "video.fill", color: accent)
            }

        case "audio":
            HStack(spacing: 4) {
                Image(systemName: "play.fill")
                    .font(.system(size: 8, weight: .bold))
                    .foregroundColor(accent.opacity(0.6))

                HStack(spacing: 1.5) {
                    ForEach(0..<8, id: \.self) { i in
                        let h: CGFloat = [0.4, 0.7, 0.5, 1.0, 0.6, 0.9, 0.3, 0.5][i]
                        RoundedRectangle(cornerRadius: 1)
                            .fill(accent.opacity(0.35))
                            .frame(width: 2, height: 4 + 16 * h)
                    }
                }
                .frame(height: 22)
            }
            .padding(.horizontal, 6)
            .padding(.vertical, 6)
            .background(
                RoundedRectangle(cornerRadius: 8)
                    .fill(accent.opacity(0.08))
                    .overlay(
                        RoundedRectangle(cornerRadius: 8)
                            .stroke(accent.opacity(0.15), lineWidth: 0.5)
                    )
            )

        case "location":
            ZStack {
                RoundedRectangle(cornerRadius: 8)
                    .fill(
                        LinearGradient(
                            colors: [Color(hex: "2ECC71").opacity(0.15), Color(hex: "27AE60").opacity(0.08)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: 40, height: 40)
                    .overlay(
                        RoundedRectangle(cornerRadius: 8)
                            .stroke(Color(hex: "2ECC71").opacity(0.2), lineWidth: 0.5)
                    )

                VStack(spacing: 1) {
                    Image(systemName: "mappin.circle.fill")
                        .font(.system(size: 18))
                        .foregroundStyle(Color(hex: "2ECC71"), Color(hex: "2ECC71").opacity(0.2))
                    Circle()
                        .fill(Color(hex: "2ECC71").opacity(0.3))
                        .frame(width: 6, height: 3)
                        .scaleEffect(x: 1.8, y: 1)
                }
            }

        case "file":
            replyAttachmentFallbackBadge(icon: "doc.fill", color: MeeshyColors.infoBlue)

        default:
            EmptyView()
        }
    }

    private func replyAttachmentFallbackBadge(icon: String, color: Color) -> some View {
        ZStack {
            RoundedRectangle(cornerRadius: 8)
                .fill(color.opacity(0.1))
                .frame(width: 40, height: 40)
                .overlay(
                    RoundedRectangle(cornerRadius: 8)
                        .stroke(color.opacity(0.2), lineWidth: 0.5)
                )
            Image(systemName: icon)
                .font(.system(size: 16))
                .foregroundColor(color.opacity(0.7))
        }
    }

    // MARK: - Pending Attachments Preview
    var pendingAttachmentsPreview: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 12) {
                ForEach(pendingAttachments) { attachment in
                    attachmentPreviewTile(attachment)
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
        }
        .frame(height: 100)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(theme.surfaceGradient(tint: accentColor))
                .overlay(
                    RoundedRectangle(cornerRadius: 16)
                        .stroke(theme.border(tint: accentColor, intensity: 0.3), lineWidth: 1)
                )
        )
    }

    // MARK: - Attachment Preview Tile
    func attachmentPreviewTile(_ attachment: MessageAttachment) -> some View {
        HStack(spacing: 0) {
            // Delete button — left side, prominent
            Button {
                HapticFeedback.light()
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    let id = attachment.id
                    if pendingAudioPlayer.isPlaying { pendingAudioPlayer.stop() }
                    pendingAttachments.removeAll { $0.id == id }
                    if let url = pendingMediaFiles.removeValue(forKey: id) {
                        try? FileManager.default.removeItem(at: url)
                    }
                    pendingThumbnails.removeValue(forKey: id)
                }
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(.white)
                    .frame(width: 28, height: 28)
                    .background(
                        Circle()
                            .fill(MeeshyColors.coral)
                            .shadow(color: MeeshyColors.coral.opacity(0.4), radius: 4, y: 2)
                    )
            }
            .padding(.trailing, 8)

            // Tappable preview area
            Button {
                HapticFeedback.light()
                handleAttachmentPreviewTap(attachment)
            } label: {
                VStack(spacing: 4) {
                    ZStack {
                        if let thumb = pendingThumbnails[attachment.id] {
                            Image(uiImage: thumb)
                                .resizable()
                                .aspectRatio(contentMode: .fill)
                                .frame(width: 56, height: 56)
                                .clipShape(RoundedRectangle(cornerRadius: 10))

                            if attachment.type == .video {
                                Image(systemName: "play.circle.fill")
                                    .font(.system(size: 20))
                                    .foregroundStyle(.white, .black.opacity(0.4))
                            } else if attachment.type == .image {
                                // Subtle edit hint
                                Image(systemName: "eye.fill")
                                    .font(.system(size: 10, weight: .bold))
                                    .foregroundColor(.white)
                                    .padding(4)
                                    .background(Circle().fill(.black.opacity(0.4)))
                                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing)
                                    .padding(3)
                            }
                        } else if attachment.type == .audio {
                            audioTileFallback(attachment)
                        } else if attachment.type == .location {
                            locationTileFallback()
                        } else {
                            RoundedRectangle(cornerRadius: 10)
                                .fill(
                                    LinearGradient(
                                        colors: [Color(hex: attachment.thumbnailColor), Color(hex: attachment.thumbnailColor).opacity(0.7)],
                                        startPoint: .topLeading,
                                        endPoint: .bottomTrailing
                                    )
                                )
                                .frame(width: 56, height: 56)

                            Image(systemName: iconForAttachmentType(attachment.type))
                                .font(.system(size: 22))
                                .foregroundColor(.white)
                        }
                    }
                    .frame(width: 56, height: 56)

                    Text(labelForAttachment(attachment))
                        .font(.system(size: 10, weight: .medium))
                        .foregroundColor(theme.textSecondary)
                        .lineLimit(1)
                        .frame(width: 60)
                }
            }
        }
    }

    // MARK: - Attachment Preview Tap Handler
    func handleAttachmentPreviewTap(_ attachment: MessageAttachment) {
        switch attachment.type {
        case .audio:
            if pendingAudioPlayer.isPlaying {
                pendingAudioPlayer.stop()
            } else if let url = pendingMediaFiles[attachment.id] ?? pendingAudioURL {
                pendingAudioPlayer.playLocalFile(url: url)
            }
        case .image:
            if let thumb = pendingThumbnails[attachment.id] {
                previewingPendingImage = thumb
            }
        case .video:
            if let thumb = pendingThumbnails[attachment.id] {
                previewingPendingImage = thumb
            }
        default:
            break
        }
    }

    // MARK: - Rich Tile Fallbacks

    private func audioTileFallback(_ attachment: MessageAttachment) -> some View {
        let color = Color(hex: attachment.thumbnailColor)
        let isPlaying = pendingAudioPlayer.isPlaying
        return ZStack {
            RoundedRectangle(cornerRadius: 10)
                .fill(
                    LinearGradient(
                        colors: [color, color.opacity(0.7)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .frame(width: 56, height: 56)

            VStack(spacing: 3) {
                HStack(spacing: 1.5) {
                    ForEach(0..<7, id: \.self) { i in
                        let h: CGFloat = [0.3, 0.8, 0.5, 1.0, 0.4, 0.9, 0.6][i]
                        RoundedRectangle(cornerRadius: 1)
                            .fill(Color.white.opacity(isPlaying ? 0.9 : 0.6))
                            .frame(width: 2, height: 4 + 14 * h)
                    }
                }
                .frame(height: 20)

                Image(systemName: isPlaying ? "pause.fill" : "play.fill")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundColor(.white.opacity(0.8))
            }
        }
    }

    private func locationTileFallback() -> some View {
        ZStack {
            RoundedRectangle(cornerRadius: 10)
                .fill(
                    LinearGradient(
                        colors: [Color(hex: "2ECC71"), Color(hex: "27AE60")],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .frame(width: 56, height: 56)

            VStack(spacing: 2) {
                Image(systemName: "mappin.circle.fill")
                    .font(.system(size: 22))
                    .foregroundStyle(.white, .white.opacity(0.3))
                Circle()
                    .fill(Color.white.opacity(0.3))
                    .frame(width: 8, height: 4)
                    .scaleEffect(x: 1.8, y: 1)
            }
        }
    }

    func iconForAttachmentType(_ type: MessageAttachment.AttachmentType) -> String {
        switch type {
        case .image: return "photo.fill"
        case .video: return "video.fill"
        case .audio: return "waveform"
        case .file: return "doc.fill"
        case .location: return "location.fill"
        }
    }

    func labelForAttachment(_ attachment: MessageAttachment) -> String {
        switch attachment.type {
        case .image: return "Photo"
        case .video: return "Vidéo"
        case .audio: return attachment.durationFormatted ?? "Audio"
        case .file: return attachment.originalName.isEmpty ? "Fichier" : attachment.originalName
        case .location: return "Position"
        }
    }

    // See ConversationView+AttachmentHandlers.swift for: startRecording, stopAndPreviewRecording, stopAndSendRecording, sendMessageWithAttachments, formatRecordingTime, handlePhotoSelection, generateVideoThumbnail, handleFileImport, mimeTypeForURL, getFileSize, addCurrentLocation, handleCameraCapture, sendMessage
}

// MARK: - Pending Image Preview (fullscreen)
struct PendingImagePreview: View {
    let image: UIImage
    let onDismiss: () -> Void

    @State private var scale: CGFloat = 1.0
    @State private var offset: CGSize = .zero

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            Image(uiImage: image)
                .resizable()
                .aspectRatio(contentMode: .fit)
                .scaleEffect(scale)
                .offset(offset)
                .gesture(
                    MagnifyGesture()
                        .onChanged { value in
                            scale = value.magnification
                        }
                        .onEnded { _ in
                            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                                if scale < 1 { scale = 1 }
                                if scale > 4 { scale = 4 }
                            }
                        }
                )
                .gesture(
                    DragGesture()
                        .onChanged { value in
                            offset = value.translation
                        }
                        .onEnded { value in
                            if abs(value.translation.height) > 150 {
                                onDismiss()
                            } else {
                                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                                    offset = .zero
                                }
                            }
                        }
                )

            VStack {
                HStack {
                    Spacer()
                    Button {
                        onDismiss()
                    } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 16, weight: .bold))
                            .foregroundColor(.white)
                            .frame(width: 36, height: 36)
                            .background(Circle().fill(.white.opacity(0.2)))
                    }
                    .padding(16)
                }
                Spacer()
            }
        }
    }
}
