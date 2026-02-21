// MARK: - Extracted from ConversationView.swift
import SwiftUI
import PhotosUI
import AVFoundation
import MeeshySDK

// MARK: - Composer, Attachments & Recording
extension ConversationView {

    // MARK: - Themed Composer
    var themedComposer: some View {
        VStack(spacing: 8) {
            // Edit mode banner
            if editingMessageId != nil {
                composerEditBanner
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }

            // Reply preview banner
            if let reply = pendingReplyReference, editingMessageId == nil {
                composerReplyBanner(reply)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }

            // Pending attachments preview
            if !pendingAttachments.isEmpty || isLoadingMedia {
                HStack(spacing: 0) {
                    pendingAttachmentsPreview
                    if isLoadingMedia {
                        ProgressView()
                            .tint(.white)
                            .padding(.horizontal, 12)
                    }
                }
                .transition(.scale.combined(with: .opacity))
            }

            HStack(alignment: .bottom, spacing: 12) {
                // Plus/Mic button (hidden only when recording)
                if !audioRecorder.isRecording {
                    ThemedComposerButton(
                        icon: showAttachOptions ? "mic.fill" : "plus",
                        colors: showAttachOptions ? ["FF6B6B", "E74C3C"] : [accentColor, secondaryColor],
                        isActive: showAttachOptions
                    ) {
                        if showAttachOptions {
                            // Start recording when mic is clicked
                            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                                showAttachOptions = false
                                startRecording()
                            }
                        } else {
                            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                                showAttachOptions = true
                            }
                        }
                    }
                }

                // Input field with mic/stop button inside
                HStack(spacing: 0) {
                    if audioRecorder.isRecording {
                        // Stop button inside input (replaces mic)
                        Button {
                            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                                stopAndPreviewRecording()
                            }
                        } label: {
                            ZStack {
                                Circle()
                                    .fill(
                                        LinearGradient(
                                            colors: [Color(hex: "FF6B6B"), Color(hex: "E74C3C")],
                                            startPoint: .topLeading,
                                            endPoint: .bottomTrailing
                                        )
                                    )
                                    .frame(width: 32, height: 32)

                                Image(systemName: "stop.fill")
                                    .font(.system(size: 12, weight: .bold))
                                    .foregroundColor(.white)
                            }
                            .frame(width: 44, height: 44)
                        }

                        // Recording interface
                        voiceRecordingView
                    } else if !showAttachOptions {
                        // Smart Context Zone / Mic button
                        let hasText = !messageText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                        let textLen = messageText.count

                        if hasText {
                            SmartContextZone(
                                analyzer: textAnalyzer,
                                accentColor: accentColor,
                                isCompact: false,
                                showFlag: textLen > 20
                            )
                            .transition(.scale.combined(with: .opacity))
                        } else {
                            // Mic button - starts recording immediately
                            Button {
                                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                                    startRecording()
                                }
                            } label: {
                                Image(systemName: "mic.fill")
                                    .font(.system(size: 18, weight: .medium))
                                    .foregroundStyle(
                                        LinearGradient(
                                            colors: [Color(hex: accentColor), Color(hex: secondaryColor)],
                                            startPoint: .topLeading,
                                            endPoint: .bottomTrailing
                                        )
                                    )
                                    .frame(width: 44, height: 44)
                            }
                            .transition(.scale.combined(with: .opacity))
                        }

                        // Text input
                        ZStack(alignment: .leading) {
                            if messageText.isEmpty {
                                Text("Message...")
                                    .foregroundColor(theme.textMuted)
                            }

                            TextField("", text: $messageText, axis: .vertical)
                                .focused($isTyping)
                                .foregroundColor(theme.textPrimary)
                                .lineLimit(1...5)
                        }
                        .padding(.trailing, 12)
                        .padding(.vertical, 12)
                    } else {
                        // When attach options shown, just show text input (mic is now the left button)
                        ZStack(alignment: .leading) {
                            if messageText.isEmpty {
                                Text("Message...")
                                    .foregroundColor(theme.textMuted)
                            }

                            TextField("", text: $messageText, axis: .vertical)
                                .focused($isTyping)
                                .foregroundColor(theme.textPrimary)
                                .lineLimit(1...5)
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 12)
                    }
                }
                .frame(minHeight: 44)
                .background(
                    RoundedRectangle(cornerRadius: 22)
                        .fill(theme.surfaceGradient(tint: audioRecorder.isRecording ? "FF6B6B" : accentColor))
                        .overlay(
                            RoundedRectangle(cornerRadius: 22)
                                .stroke(
                                    (isTyping || audioRecorder.isRecording) ?
                                    LinearGradient(colors: [Color(hex: audioRecorder.isRecording ? "FF6B6B" : accentColor), Color(hex: audioRecorder.isRecording ? "E74C3C" : secondaryColor)], startPoint: .leading, endPoint: .trailing) :
                                    theme.border(tint: accentColor, intensity: 0.3),
                                    lineWidth: (isTyping || audioRecorder.isRecording) ? 2 : 1
                                )
                        )
                )
                .scaleEffect(typingBounce ? 1.02 : 1.0)

                // Send button - show when recording, has pending attachments, or has text
                if audioRecorder.isRecording || !pendingAttachments.isEmpty || !messageText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    ThemedComposerButton(
                        icon: editingMessageId != nil ? "checkmark" : "paperplane.fill",
                        colors: editingMessageId != nil ? ["F8B500", "E67E22"] : ["FF6B6B", "4ECDC4"],
                        isActive: true,
                        rotateIcon: editingMessageId == nil
                    ) {
                        if editingMessageId != nil {
                            submitEdit()
                        } else if audioRecorder.isRecording {
                            stopAndSendRecording()
                        } else {
                            sendMessageWithAttachments()
                        }
                    }
                    .transition(.scale.combined(with: .opacity))
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: messageText.isEmpty)
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: audioRecorder.isRecording)
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: pendingAttachments.count)
        .photosPicker(isPresented: $showPhotoPicker, selection: $selectedPhotoItems, maxSelectionCount: 10, matching: .any(of: [.images, .videos]))
        .fileImporter(isPresented: $showFilePicker, allowedContentTypes: [.item], allowsMultipleSelection: true) { result in
            handleFileImport(result)
        }
        .fullScreenCover(isPresented: $showCamera) {
            CameraPickerView { image in
                handleCameraCapture(image)
            }
            .ignoresSafeArea()
        }
        .onChange(of: selectedPhotoItems) { items in
            handlePhotoSelection(items)
        }
        .onChange(of: messageText) { newText in
            textAnalyzer.analyze(text: newText)
            viewModel.onTextChanged(newText)
        }
        .onChange(of: isTyping) { focused in
            // Bounce animation on focus
            withAnimation(.spring(response: 0.35, dampingFraction: 0.55)) {
                typingBounce = focused
            }
            // Close attach menu when composer gets focus
            if focused && showAttachOptions {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    showAttachOptions = false
                }
            }
        }
        .sheet(isPresented: $textAnalyzer.showLanguagePicker) {
            LanguagePickerSheet(analyzer: textAnalyzer)
        }
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

            // Attachment thumbnail in composer reply banner
            if let thumbUrl = reply.attachmentThumbnailUrl, !thumbUrl.isEmpty {
                CachedAsyncImage(url: thumbUrl) {
                    Color(hex: reply.authorColor).opacity(0.3)
                }
                .aspectRatio(contentMode: .fill)
                .frame(width: 32, height: 32)
                .clipShape(RoundedRectangle(cornerRadius: 6))
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
        ZStack(alignment: .topTrailing) {
            VStack(spacing: 4) {
                ZStack {
                    if let thumb = pendingThumbnails[attachment.id] {
                        // Real thumbnail preview
                        Image(uiImage: thumb)
                            .resizable()
                            .aspectRatio(contentMode: .fill)
                            .frame(width: 56, height: 56)
                            .clipShape(RoundedRectangle(cornerRadius: 10))

                        // Video play badge
                        if attachment.type == .video {
                            Image(systemName: "play.circle.fill")
                                .font(.system(size: 20))
                                .foregroundStyle(.white, .black.opacity(0.4))
                        }
                    } else {
                        // Fallback: colored icon
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

                // Info text
                Text(labelForAttachment(attachment))
                    .font(.system(size: 10, weight: .medium))
                    .foregroundColor(theme.textSecondary)
                    .lineLimit(1)
                    .frame(width: 60)
            }

            // Delete button
            Button {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    let id = attachment.id
                    pendingAttachments.removeAll { $0.id == id }
                    if let url = pendingMediaFiles.removeValue(forKey: id) {
                        try? FileManager.default.removeItem(at: url)
                    }
                    pendingThumbnails.removeValue(forKey: id)
                }
            } label: {
                Image(systemName: "xmark.circle.fill")
                    .font(.system(size: 18))
                    .foregroundColor(Color(hex: "FF6B6B"))
                    .background(Circle().fill(theme.backgroundPrimary).frame(width: 14, height: 14))
            }
            .offset(x: 6, y: -6)
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

    // MARK: - Voice Recording View
    var voiceRecordingView: some View {
        HStack(spacing: 12) {
            // Recording indicator with animated pulse
            ZStack {
                Circle()
                    .fill(Color(hex: "FF6B6B").opacity(0.3))
                    .frame(width: 20, height: 20)
                    .scaleEffect(audioRecorder.duration.truncatingRemainder(dividingBy: 1) < 0.5 ? 1.5 : 1.0)
                    .opacity(audioRecorder.duration.truncatingRemainder(dividingBy: 1) < 0.5 ? 0 : 0.5)
                    .animation(.easeInOut(duration: 0.5).repeatForever(autoreverses: true), value: audioRecorder.isRecording)

                Circle()
                    .fill(Color(hex: "FF6B6B"))
                    .frame(width: 12, height: 12)
                    .opacity(audioRecorder.duration.truncatingRemainder(dividingBy: 1) < 0.5 ? 1 : 0.3)
                    .animation(.easeInOut(duration: 0.5).repeatForever(autoreverses: true), value: audioRecorder.isRecording)
            }

            // Real waveform bars from microphone levels
            HStack(spacing: 3) {
                ForEach(0..<15, id: \.self) { i in
                    AudioLevelBar(
                        level: i < audioRecorder.audioLevels.count ? audioRecorder.audioLevels[i] : 0,
                        isRecording: audioRecorder.isRecording
                    )
                }
            }

            Spacer()

            // Timer with subtle scale
            Text(formatRecordingTime(audioRecorder.duration))
                .font(.system(size: 15, weight: .semibold, design: .monospaced))
                .foregroundColor(theme.textPrimary)
                .padding(.trailing, 8)
                .contentTransition(.numericText())
                .animation(.spring(response: 0.3), value: audioRecorder.duration)
        }
        .padding(.leading, 16)
        .padding(.vertical, 12)
    }

    // See ConversationView+AttachmentHandlers.swift for: startRecording, stopAndPreviewRecording, stopAndSendRecording, sendMessageWithAttachments, formatRecordingTime, handlePhotoSelection, generateVideoThumbnail, handleFileImport, mimeTypeForURL, getFileSize, addCurrentLocation, handleCameraCapture, sendMessage
}
