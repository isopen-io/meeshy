// MARK: - Extracted from ConversationView.swift
import SwiftUI
import PhotosUI
import AVFoundation
import MeeshySDK

// MARK: - Recording, Sending & Attachment Handlers
extension ConversationView {

    // MARK: - Recording Functions
    func startRecording() {
        audioRecorder.startRecording()
        HapticFeedback.medium()
    }

    func stopAndPreviewRecording() {
        guard audioRecorder.duration > 0.5 else {
            audioRecorder.cancelRecording()
            return
        }
        let durationMs = Int(audioRecorder.duration * 1000)
        let url = audioRecorder.stopRecording()
        pendingAudioURL = url
        let audioAttachment = MessageAttachment.audio(durationMs: durationMs, color: accentColor)
        pendingAttachments.append(audioAttachment)
        HapticFeedback.light()
    }

    func stopAndSendRecording() {
        guard audioRecorder.duration > 0.5 else {
            audioRecorder.cancelRecording()
            return
        }
        let durationMs = Int(audioRecorder.duration * 1000)
        let url = audioRecorder.stopRecording()
        pendingAudioURL = url
        let audioAttachment = MessageAttachment.audio(durationMs: durationMs, color: accentColor)
        pendingAttachments.append(audioAttachment)
        sendMessageWithAttachments()
    }

    func sendMessageWithAttachments() {
        let text = messageText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty || !pendingAttachments.isEmpty else { return }

        let replyId = pendingReplyReference?.messageId.isEmpty == false ? pendingReplyReference?.messageId : nil
        let content = text

        // Capture state before clearing
        let attachments = pendingAttachments
        let audioURL = pendingAudioURL
        let mediaFiles = pendingMediaFiles

        // Clear UI state immediately
        pendingAttachments.removeAll()
        pendingAudioURL = nil
        pendingMediaFiles.removeAll()
        pendingThumbnails.removeAll()
        messageText = ""
        pendingReplyReference = nil
        viewModel.stopTypingEmission()
        HapticFeedback.light()

        // If we have files to upload (audio, images, videos), do TUS upload
        let hasFiles = audioURL != nil || !mediaFiles.isEmpty
        if hasFiles && !attachments.isEmpty {
            Task {
                do {
                    let serverOrigin = MeeshyConfig.shared.serverOrigin
                    guard let baseURL = URL(string: serverOrigin),
                          let token = APIClient.shared.authToken else {
                        return
                    }
                    let uploader = TusUploadManager(baseURL: baseURL)
                    var uploadedIds: [String] = []

                    // Upload audio if present
                    if let audioURL {
                        let result = try await uploader.uploadFile(
                            fileURL: audioURL, mimeType: "audio/mp4", token: token
                        )
                        uploadedIds.append(result.id)
                        try? FileManager.default.removeItem(at: audioURL)
                    }

                    // Upload images/videos/files
                    for attachment in attachments where attachment.type != .audio {
                        if let fileURL = mediaFiles[attachment.id] {
                            let result = try await uploader.uploadFile(
                                fileURL: fileURL, mimeType: attachment.mimeType, token: token
                            )
                            uploadedIds.append(result.id)
                            try? FileManager.default.removeItem(at: fileURL)
                        }
                    }

                    // Send message with all attachment IDs
                    if !uploadedIds.isEmpty || !content.isEmpty {
                        await viewModel.sendMessage(
                            content: content,
                            replyToId: replyId,
                            attachmentIds: uploadedIds.isEmpty ? nil : uploadedIds
                        )
                    }
                } catch {
                    let conversationId = conversation?.id ?? "temp"
                    let newMsg = Message(
                        conversationId: conversationId,
                        content: content.isEmpty ? "Media" : content,
                        createdAt: Date(),
                        attachments: attachments,
                        deliveryStatus: .failed,
                        isMe: true
                    )
                    viewModel.messages.append(newMsg)
                    // Clean up temp files on failure too
                    for (_, url) in mediaFiles { try? FileManager.default.removeItem(at: url) }
                    if let audioURL { try? FileManager.default.removeItem(at: audioURL) }
                }
            }
            return
        }

        // Text-only send
        Task {
            await viewModel.sendMessage(content: content, replyToId: replyId)
        }
    }

    func formatRecordingTime(_ time: TimeInterval) -> String {
        let minutes = Int(time) / 60
        let seconds = Int(time) % 60
        return String(format: "%d:%02d", minutes, seconds)
    }

    // MARK: - Attachment Handlers
    func handlePhotoSelection(_ items: [PhotosPickerItem]) {
        guard !items.isEmpty else { return }
        let itemsCopy = items
        selectedPhotoItems.removeAll()
        isLoadingMedia = true
        HapticFeedback.light()

        Task {
            for item in itemsCopy {
                let isVideo = item.supportedContentTypes.contains { $0.conforms(to: .movie) }

                if isVideo {
                    if let movieData = try? await item.loadTransferable(type: Data.self) {
                        let fileName = "video_\(UUID().uuidString).mp4"
                        let tempURL = FileManager.default.temporaryDirectory.appendingPathComponent(fileName)
                        try? movieData.write(to: tempURL)

                        let fileSize = movieData.count
                        let attachmentId = UUID().uuidString
                        let attachment = MessageAttachment(
                            id: attachmentId,
                            fileName: fileName,
                            originalName: fileName,
                            mimeType: "video/mp4",
                            fileSize: fileSize,
                            fileUrl: tempURL.absoluteString,
                            thumbnailColor: "FF6B6B"
                        )

                        // Generate thumbnail from first frame
                        let thumb = await generateVideoThumbnail(url: tempURL)

                        await MainActor.run {
                            pendingMediaFiles[attachmentId] = tempURL
                            if let thumb { pendingThumbnails[attachmentId] = thumb }
                            pendingAttachments.append(attachment)
                        }
                    }
                } else {
                    if let imageData = try? await item.loadTransferable(type: Data.self),
                       let uiImage = UIImage(data: imageData) {
                        let fileName = "photo_\(UUID().uuidString).jpg"
                        let tempURL = FileManager.default.temporaryDirectory.appendingPathComponent(fileName)

                        // Compress to JPEG (0.8 quality)
                        let compressed = uiImage.jpegData(compressionQuality: 0.8) ?? imageData
                        try? compressed.write(to: tempURL)

                        let fileSize = compressed.count
                        let attachmentId = UUID().uuidString
                        let attachment = MessageAttachment(
                            id: attachmentId,
                            fileName: fileName,
                            originalName: fileName,
                            mimeType: "image/jpeg",
                            fileSize: fileSize,
                            fileUrl: tempURL.absoluteString,
                            width: Int(uiImage.size.width),
                            height: Int(uiImage.size.height),
                            thumbnailColor: accentColor
                        )

                        await MainActor.run {
                            pendingMediaFiles[attachmentId] = tempURL
                            pendingThumbnails[attachmentId] = uiImage
                            pendingAttachments.append(attachment)
                        }
                    }
                }
            }
            await MainActor.run { isLoadingMedia = false }
        }
    }

    func generateVideoThumbnail(url: URL) async -> UIImage? {
        let asset = AVAsset(url: url)
        let generator = AVAssetImageGenerator(asset: asset)
        generator.appliesPreferredTrackTransform = true
        generator.maximumSize = CGSize(width: 200, height: 200)
        do {
            let cgImage = try generator.copyCGImage(at: .zero, actualTime: nil)
            return UIImage(cgImage: cgImage)
        } catch {
            return nil
        }
    }

    func handleFileImport(_ result: Result<[URL], Error>) {
        switch result {
        case .success(let urls):
            for url in urls {
                guard url.startAccessingSecurityScopedResource() else { continue }
                defer { url.stopAccessingSecurityScopedResource() }

                let fileName = url.lastPathComponent
                let fileSize = getFileSize(url)
                let mimeType = mimeTypeForURL(url)

                // Copy to temp directory (security-scoped resource expires)
                let tempURL = FileManager.default.temporaryDirectory.appendingPathComponent("file_\(UUID().uuidString)_\(fileName)")
                try? FileManager.default.copyItem(at: url, to: tempURL)

                let attachmentId = UUID().uuidString
                let attachment = MessageAttachment(
                    id: attachmentId,
                    fileName: fileName,
                    originalName: fileName,
                    mimeType: mimeType,
                    fileSize: fileSize,
                    fileUrl: tempURL.absoluteString,
                    thumbnailColor: "45B7D1"
                )
                pendingMediaFiles[attachmentId] = tempURL
                pendingAttachments.append(attachment)
            }
            HapticFeedback.light()
        case .failure:
            actionAlert = "Erreur lors de l'import"
        }
    }

    func mimeTypeForURL(_ url: URL) -> String {
        let ext = url.pathExtension.lowercased()
        switch ext {
        case "jpg", "jpeg": return "image/jpeg"
        case "png": return "image/png"
        case "gif": return "image/gif"
        case "webp": return "image/webp"
        case "heic": return "image/heic"
        case "mp4", "m4v": return "video/mp4"
        case "mov": return "video/quicktime"
        case "mp3": return "audio/mpeg"
        case "m4a": return "audio/mp4"
        case "wav": return "audio/wav"
        case "pdf": return "application/pdf"
        case "doc", "docx": return "application/msword"
        case "zip": return "application/zip"
        default: return "application/octet-stream"
        }
    }

    func getFileSize(_ url: URL) -> Int {
        guard let attributes = try? FileManager.default.attributesOfItem(atPath: url.path),
              let size = attributes[.size] as? Int else {
            return 0
        }
        return size
    }

    func addCurrentLocation() {
        isLoadingLocation = true
        locationManager.requestLocation { location in
            isLoadingLocation = false
            if let location = location {
                let attachment = MessageAttachment.location(
                    latitude: location.coordinate.latitude,
                    longitude: location.coordinate.longitude,
                    color: "2ECC71"
                )
                withAnimation {
                    pendingAttachments.append(attachment)
                }
                HapticFeedback.light()
            } else {
                actionAlert = "Impossible d'obtenir la position"
            }
        }
    }

    func handleCameraCapture(_ image: UIImage) {
        let fileName = "camera_\(UUID().uuidString).jpg"
        let tempURL = FileManager.default.temporaryDirectory.appendingPathComponent(fileName)
        guard let compressed = image.jpegData(compressionQuality: 0.8) else { return }
        try? compressed.write(to: tempURL)
        let attachmentId = UUID().uuidString
        let attachment = MessageAttachment(
            id: attachmentId,
            fileName: fileName,
            originalName: fileName,
            mimeType: "image/jpeg",
            fileSize: compressed.count,
            fileUrl: tempURL.absoluteString,
            width: Int(image.size.width),
            height: Int(image.size.height),
            thumbnailColor: accentColor
        )
        pendingMediaFiles[attachmentId] = tempURL
        pendingThumbnails[attachmentId] = image
        pendingAttachments.append(attachment)
        HapticFeedback.success()
    }

    func sendMessage() {
        guard !messageText.trimmingCharacters(in: .whitespaces).isEmpty else { return }
        let text = messageText
        messageText = ""
        viewModel.stopTypingEmission()
        HapticFeedback.light()
        Task {
            await viewModel.sendMessage(content: text)
        }
    }
}
