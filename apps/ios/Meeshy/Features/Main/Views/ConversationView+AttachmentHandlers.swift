// MARK: - Extracted from ConversationView.swift
import SwiftUI
import PhotosUI
import AVFoundation
import CoreLocation
import Combine
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
        let url = audioRecorder.stopRecording()
        scrollState.audioToEdit = url
        HapticFeedback.light()
    }

    func stopAndSendRecording() {
        guard audioRecorder.duration > 0.5 else {
            audioRecorder.cancelRecording()
            return
        }
        let durationMs = Int(audioRecorder.duration * 1000)
        let url = audioRecorder.stopRecording()
        composerState.pendingAudioURL = url
        let audioAttachment = MessageAttachment.audio(durationMs: durationMs, color: accentColor)
        composerState.pendingAttachments.append(audioAttachment)
        sendMessageWithAttachments()
    }

    func sendMessageWithAttachments() {
        guard !composerState.isUploading else { return }
        let text = messageText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty || !composerState.pendingAttachments.isEmpty else { return }

        let replyId = composerState.pendingReplyReference?.messageId.isEmpty == false ? composerState.pendingReplyReference?.messageId : nil
        let content = text

        let attachments = composerState.pendingAttachments
        let audioURL = composerState.pendingAudioURL
        let mediaFiles = composerState.pendingMediaFiles

        let hasFiles = audioURL != nil || !mediaFiles.isEmpty
        if !hasFiles || attachments.isEmpty {
            // Text-only send: clear UI immediately
            composerState.pendingAttachments.removeAll()
            composerState.pendingAudioURL = nil
            composerState.pendingMediaFiles.removeAll()
            composerState.pendingThumbnails.removeAll()
            messageText = ""
            composerState.pendingReplyReference = nil
            viewModel.stopTypingEmission()
            HapticFeedback.light()
            let lang = composerState.selectedLanguage
            Task { await viewModel.sendMessage(content: content, replyToId: replyId, originalLanguage: lang) }
            return
        }

        // File upload flow: keep attachments visible, show progress
        messageText = ""
        composerState.pendingReplyReference = nil
        viewModel.stopTypingEmission()
        composerState.isUploading = true
        HapticFeedback.light()

        Task {
            do {
                // Reconnect socket if disconnected
                if !MessageSocketManager.shared.isConnected {
                    MessageSocketManager.shared.connect()
                    try await Task.sleep(nanoseconds: 1_000_000_000)
                }

                let serverOrigin = MeeshyConfig.shared.serverOrigin
                guard let baseURL = URL(string: serverOrigin),
                      let token = APIClient.shared.authToken else {
                    await MainActor.run { composerState.isUploading = false }
                    return
                }

                let uploader = TusUploadManager(baseURL: baseURL)

                // Subscribe to progress updates
                var progressCancellable: AnyCancellable?
                progressCancellable = uploader.progressPublisher
                    .receive(on: DispatchQueue.main)
                    .sink { [progressCancellable] progress in
                        _ = progressCancellable
                        composerState.uploadProgress = progress
                    }

                var uploadedIds: [String] = []
                var localAttachments: [MeeshyMessageAttachment] = []

                if let audioURL {
                    let audioData = try? Data(contentsOf: audioURL)
                    let result = try await uploader.uploadFile(
                        fileURL: audioURL, mimeType: "audio/mp4", token: token
                    )
                    uploadedIds.append(result.id)
                    if let audioData {
                        await CacheCoordinator.shared.audio.store(audioData, for: result.fileUrl)
                    }
                    let userId = AuthManager.shared.currentUser?.id ?? ""
                    localAttachments.append(result.toMessageAttachment(uploadedBy: userId))
                    try? FileManager.default.removeItem(at: audioURL)
                }

                let currentUserId = AuthManager.shared.currentUser?.id ?? ""
                for attachment in attachments where attachment.type != .audio {
                    if let fileURL = mediaFiles[attachment.id] {
                        let fileData = try? Data(contentsOf: fileURL)
                        let result = try await uploader.uploadFile(
                            fileURL: fileURL, mimeType: attachment.mimeType, token: token
                        )
                        uploadedIds.append(result.id)
                        if let fileData {
                            await CacheCoordinator.shared.images.store(fileData, for: result.fileUrl)
                            if let thumbUrl = result.thumbnailUrl,
                               let thumbId = composerState.pendingThumbnails[attachment.id],
                               let thumbData = thumbId.jpegData(compressionQuality: 0.8) {
                                await CacheCoordinator.shared.thumbnails.store(thumbData, for: thumbUrl)
                            }
                        }
                        localAttachments.append(result.toMessageAttachment(uploadedBy: currentUserId))
                        try? FileManager.default.removeItem(at: fileURL)
                    }
                }

                progressCancellable?.cancel()

                let hasAudio = audioURL != nil
                var sendSuccess = false
                let lang = composerState.selectedLanguage

                if hasAudio && !uploadedIds.isEmpty {
                    // Audio messages MUST use WebSocket to trigger the audio pipeline
                    // (transcription via Whisper, translation via NLLB, TTS via Chatterbox)
                    let messageId = await MessageSocketManager.shared.sendWithAttachmentsAsync(
                        conversationId: viewModel.conversationId,
                        content: content.isEmpty ? nil : content,
                        attachmentIds: uploadedIds,
                        replyToId: replyId,
                        originalLanguage: lang
                    )
                    if let messageId {
                        viewModel.insertOptimisticAudioMessage(
                            messageId: messageId,
                            content: content,
                            attachments: localAttachments,
                            replyToId: replyId
                        )
                        sendSuccess = true
                    }
                } else if !uploadedIds.isEmpty || !content.isEmpty {
                    // Non-audio attachments (images, videos, files) use REST
                    sendSuccess = await viewModel.sendMessage(
                        content: content,
                        replyToId: replyId,
                        attachmentIds: uploadedIds.isEmpty ? nil : uploadedIds,
                        localAttachments: localAttachments.isEmpty ? nil : localAttachments,
                        originalLanguage: lang
                    )
                }

                // Clear UI after upload+send
                await MainActor.run {
                    composerState.pendingAttachments.removeAll()
                    composerState.pendingAudioURL = nil
                    composerState.pendingMediaFiles.removeAll()
                    composerState.pendingThumbnails.removeAll()
                    composerState.uploadProgress = nil
                    composerState.isUploading = false
                    if sendSuccess {
                        HapticFeedback.success()
                    } else {
                        HapticFeedback.error()
                    }
                }
            } catch {
                await MainActor.run {
                    composerState.pendingAttachments.removeAll()
                    composerState.pendingAudioURL = nil
                    composerState.pendingMediaFiles.removeAll()
                    composerState.pendingThumbnails.removeAll()
                    composerState.uploadProgress = nil
                    composerState.isUploading = false
                    for (_, url) in mediaFiles { try? FileManager.default.removeItem(at: url) }
                    if let audioURL { try? FileManager.default.removeItem(at: audioURL) }
                    viewModel.error = "Echec de l'envoi du media: \(error.localizedDescription)"
                    HapticFeedback.error()
                    ToastManager.shared.showError("Echec de l'envoi de la piece jointe")
                }
            }
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
        composerState.selectedPhotoItems.removeAll()
        composerState.isLoadingMedia = true
        HapticFeedback.light()

        Task {
            for item in itemsCopy {
                let isVideo = item.supportedContentTypes.contains { $0.conforms(to: .movie) }

                if isVideo {
                    if let movieData = try? await item.loadTransferable(type: Data.self) {
                        let rawName = "video_raw_\(UUID().uuidString).mp4"
                        let rawURL = FileManager.default.temporaryDirectory.appendingPathComponent(rawName)
                        try? movieData.write(to: rawURL)

                        let compressedURL: URL
                        do {
                            compressedURL = try await MediaCompressor.shared.compressVideo(rawURL)
                            try? FileManager.default.removeItem(at: rawURL)
                        } catch {
                            compressedURL = rawURL
                        }

                        await MainActor.run {
                            handleCameraVideo(compressedURL)
                        }
                    }
                } else {
                    if let imageData = try? await item.loadTransferable(type: Data.self),
                       let uiImage = UIImage(data: imageData) {
                        await MainActor.run {
                            handleCameraCapture(uiImage)
                        }
                    }
                }
            }
            await MainActor.run { composerState.isLoadingMedia = false }
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
                composerState.pendingMediaFiles[attachmentId] = tempURL
                composerState.pendingAttachments.append(attachment)
            }
            HapticFeedback.light()
        case .failure:
            composerState.actionAlert = "Erreur lors de l'import"
        }
    }

    func mimeTypeForURL(_ url: URL) -> String {
        let ext = url.pathExtension.lowercased()
        switch ext {
        // Images
        case "jpg", "jpeg": return "image/jpeg"
        case "png": return "image/png"
        case "gif": return "image/gif"
        case "webp": return "image/webp"
        case "heic", "heif": return "image/heic"
        case "svg": return "image/svg+xml"
        case "bmp": return "image/bmp"
        case "tiff", "tif": return "image/tiff"
        // Video
        case "mp4", "m4v": return "video/mp4"
        case "mov": return "video/quicktime"
        case "avi": return "video/x-msvideo"
        case "mkv": return "video/x-matroska"
        case "webm": return "video/webm"
        // Audio
        case "mp3": return "audio/mpeg"
        case "m4a", "aac": return "audio/mp4"
        case "wav": return "audio/wav"
        case "ogg", "oga": return "audio/ogg"
        case "flac": return "audio/flac"
        case "wma": return "audio/x-ms-wma"
        // Documents
        case "pdf": return "application/pdf"
        case "doc": return "application/msword"
        case "docx": return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        case "xls": return "application/vnd.ms-excel"
        case "xlsx": return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        case "ppt": return "application/vnd.ms-powerpoint"
        case "pptx": return "application/vnd.openxmlformats-officedocument.presentationml.presentation"
        case "pages": return "application/x-iwork-pages-sffpages"
        case "numbers": return "application/x-iwork-numbers-sffnumbers"
        case "keynote": return "application/x-iwork-keynote-sffkey"
        // Text & Code
        case "txt": return "text/plain"
        case "csv": return "text/csv"
        case "json": return "application/json"
        case "xml": return "application/xml"
        case "html", "htm": return "text/html"
        case "css": return "text/css"
        case "js": return "application/javascript"
        case "ts": return "application/typescript"
        case "py": return "text/x-python"
        case "swift": return "text/x-swift"
        case "md", "markdown": return "text/markdown"
        case "rtf": return "application/rtf"
        case "log": return "text/plain"
        // Archives
        case "zip": return "application/zip"
        case "rar": return "application/x-rar-compressed"
        case "7z": return "application/x-7z-compressed"
        case "tar": return "application/x-tar"
        case "gz", "gzip": return "application/gzip"
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
        composerState.showLocationPicker = true
    }

    func handleLocationSelection(coordinate: CLLocationCoordinate2D, address: String?) {
        let attachment = MessageAttachment.location(
            latitude: coordinate.latitude,
            longitude: coordinate.longitude,
            color: "2ECC71"
        )
        withAnimation {
            composerState.pendingAttachments.append(attachment)
        }
        HapticFeedback.light()
    }

    func handleCameraVideo(_ url: URL) {
        Task {
            let compressedURL: URL
            do {
                compressedURL = try await MediaCompressor.shared.compressVideo(url)
                try? FileManager.default.removeItem(at: url)
            } catch {
                compressedURL = url
            }

            let fileSize = getFileSize(compressedURL)
            let attachmentId = UUID().uuidString
            let attachment = MessageAttachment(
                id: attachmentId,
                fileName: compressedURL.lastPathComponent,
                originalName: compressedURL.lastPathComponent,
                mimeType: "video/mp4",
                fileSize: fileSize,
                fileUrl: compressedURL.absoluteString,
                thumbnailColor: "FF6B6B"
            )

            let thumb = await generateVideoThumbnail(url: compressedURL)
            await MainActor.run {
                composerState.pendingMediaFiles[attachmentId] = compressedURL
                if let thumb { composerState.pendingThumbnails[attachmentId] = thumb }
                composerState.pendingAttachments.append(attachment)
                HapticFeedback.success()
            }
        }
    }

    func handleCameraCapture(_ image: UIImage) {
        Task {
            let result = await MediaCompressor.shared.compressImage(image)
            let fileName = "camera_\(UUID().uuidString).\(result.fileExtension)"
            let tempURL = FileManager.default.temporaryDirectory.appendingPathComponent(fileName)
            try? result.data.write(to: tempURL)
            let attachmentId = UUID().uuidString
            let attachment = MessageAttachment(
                id: attachmentId,
                fileName: fileName,
                originalName: fileName,
                mimeType: result.mimeType,
                fileSize: result.data.count,
                fileUrl: tempURL.absoluteString,
                width: Int(image.size.width),
                height: Int(image.size.height),
                thumbnailColor: accentColor
            )
            await MainActor.run {
                composerState.pendingMediaFiles[attachmentId] = tempURL
                composerState.pendingThumbnails[attachmentId] = image
                composerState.pendingAttachments.append(attachment)
                HapticFeedback.success()
            }
        }
    }

    func sendMessage() {
        guard !messageText.trimmingCharacters(in: .whitespaces).isEmpty else { return }
        let text = messageText
        let lang = composerState.selectedLanguage
        messageText = ""
        viewModel.stopTypingEmission()
        HapticFeedback.light()
        Task {
            await viewModel.sendMessage(content: text, originalLanguage: lang)
        }
    }
}
