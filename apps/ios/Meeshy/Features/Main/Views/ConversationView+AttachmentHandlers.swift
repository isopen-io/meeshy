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
        guard !isUploading else { return }
        let text = messageText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty || !pendingAttachments.isEmpty else { return }

        let replyId = pendingReplyReference?.messageId.isEmpty == false ? pendingReplyReference?.messageId : nil
        let content = text

        let attachments = pendingAttachments
        let audioURL = pendingAudioURL
        let mediaFiles = pendingMediaFiles

        let hasFiles = audioURL != nil || !mediaFiles.isEmpty
        if !hasFiles || attachments.isEmpty {
            // Text-only send: clear UI immediately
            pendingAttachments.removeAll()
            pendingAudioURL = nil
            pendingMediaFiles.removeAll()
            pendingThumbnails.removeAll()
            messageText = ""
            pendingReplyReference = nil
            viewModel.stopTypingEmission()
            HapticFeedback.light()
            Task { await viewModel.sendMessage(content: content, replyToId: replyId) }
            return
        }

        // File upload flow: keep attachments visible, show progress
        messageText = ""
        pendingReplyReference = nil
        viewModel.stopTypingEmission()
        isUploading = true
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
                    await MainActor.run { isUploading = false }
                    return
                }

                let uploader = TusUploadManager(baseURL: baseURL)

                // Subscribe to progress updates
                var progressCancellable: AnyCancellable?
                progressCancellable = uploader.progressPublisher
                    .receive(on: DispatchQueue.main)
                    .sink { [progressCancellable] progress in
                        _ = progressCancellable
                        uploadProgress = progress
                    }

                var uploadedIds: [String] = []

                if let audioURL {
                    let result = try await uploader.uploadFile(
                        fileURL: audioURL, mimeType: "audio/mp4", token: token
                    )
                    uploadedIds.append(result.id)
                    try? FileManager.default.removeItem(at: audioURL)
                }

                for attachment in attachments where attachment.type != .audio {
                    if let fileURL = mediaFiles[attachment.id] {
                        let result = try await uploader.uploadFile(
                            fileURL: fileURL, mimeType: attachment.mimeType, token: token
                        )
                        uploadedIds.append(result.id)
                        try? FileManager.default.removeItem(at: fileURL)
                    }
                }

                progressCancellable?.cancel()

                // Auto-determine messageType from first attachment
                let messageType: String? = attachments.first.map { att in
                    switch att.type {
                    case .image: return "image"
                    case .video: return "video"
                    case .audio: return "audio"
                    case .location: return "location"
                    case .file: return "file"
                    }
                }
                _ = messageType

                // Auto-send at 100%
                var sendSuccess = false
                if !uploadedIds.isEmpty || !content.isEmpty {
                    sendSuccess = await viewModel.sendMessage(
                        content: content,
                        replyToId: replyId,
                        attachmentIds: uploadedIds.isEmpty ? nil : uploadedIds
                    )
                }

                // Clear UI after upload+send
                await MainActor.run {
                    pendingAttachments.removeAll()
                    pendingAudioURL = nil
                    pendingMediaFiles.removeAll()
                    pendingThumbnails.removeAll()
                    uploadProgress = nil
                    isUploading = false
                    if sendSuccess {
                        HapticFeedback.success()
                    } else {
                        HapticFeedback.error()
                    }
                }
            } catch {
                await MainActor.run {
                    pendingAttachments.removeAll()
                    pendingAudioURL = nil
                    pendingMediaFiles.removeAll()
                    pendingThumbnails.removeAll()
                    uploadProgress = nil
                    isUploading = false
                    for (_, url) in mediaFiles { try? FileManager.default.removeItem(at: url) }
                    if let audioURL { try? FileManager.default.removeItem(at: audioURL) }
                    viewModel.error = "Echec de l'envoi du media: \(error.localizedDescription)"
                    HapticFeedback.error()
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
        selectedPhotoItems.removeAll()
        isLoadingMedia = true
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

                        let fileSize = (try? FileManager.default.attributesOfItem(atPath: compressedURL.path)[.size] as? Int) ?? movieData.count
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
                            pendingMediaFiles[attachmentId] = compressedURL
                            if let thumb { pendingThumbnails[attachmentId] = thumb }
                            pendingAttachments.append(attachment)
                        }
                    }
                } else {
                    if let imageData = try? await item.loadTransferable(type: Data.self),
                       let uiImage = UIImage(data: imageData) {
                        let result = await MediaCompressor.shared.compressImageData(imageData)
                        let fileName = "image_\(UUID().uuidString).\(result.fileExtension)"
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
        showLocationPicker = true
    }

    func handleLocationSelection(coordinate: CLLocationCoordinate2D, address: String?) {
        let attachment = MessageAttachment.location(
            latitude: coordinate.latitude,
            longitude: coordinate.longitude,
            color: "2ECC71"
        )
        withAnimation {
            pendingAttachments.append(attachment)
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
                pendingMediaFiles[attachmentId] = compressedURL
                if let thumb { pendingThumbnails[attachmentId] = thumb }
                pendingAttachments.append(attachment)
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
                pendingMediaFiles[attachmentId] = tempURL
                pendingThumbnails[attachmentId] = image
                pendingAttachments.append(attachment)
                HapticFeedback.success()
            }
        }
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
