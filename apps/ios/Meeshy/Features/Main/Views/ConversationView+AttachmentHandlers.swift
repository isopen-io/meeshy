// MARK: - Extracted from ConversationView.swift
import SwiftUI
import PhotosUI
import AVFoundation
import CoreLocation
import Combine
import MeeshySDK
import os

// MARK: - Recording, Sending & Attachment Handlers
extension ConversationView {

    // MARK: - Recording Functions
    func startRecording() {
        audioRecorder.startRecording()
        HapticFeedback.medium()
    }

    /// Stop the recorder and drop the audio into the composer's attachment
    /// tray — editable before sending (tap the tray chip to trim/preview).
    /// Nothing is sent. A recording shorter than 0.5 s is discarded instead.
    /// Returns `true` when an attachment was placed.
    @discardableResult
    func stopRecordingToAttachment() -> Bool {
        guard audioRecorder.duration > 0.5 else {
            audioRecorder.cancelRecording()
            return false
        }
        let durationMs = Int(audioRecorder.duration * 1000)
        let url = audioRecorder.stopRecording()
        let audioAttachment = MessageAttachment.audio(durationMs: durationMs, color: accentColor)
        composerState.pendingMediaFiles[audioAttachment.id] = url
        composerState.pendingAttachments.append(audioAttachment)
        return true
    }

    /// Stop the recorder and send the voice message immediately (raw).
    func stopAndSendRecording() {
        guard stopRecordingToAttachment() else { return }
        sendMessageWithAttachments()
    }

    func sendMessageWithAttachments() {
        guard !composerState.isUploading else { return }
        let text = messageText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty || !composerState.pendingAttachments.isEmpty else { return }

        let pendingRef = composerState.pendingReplyReference
        let isStory = pendingRef?.isStoryReply == true
        let refId = pendingRef?.messageId.isEmpty == false ? pendingRef?.messageId : nil
        let replyId = isStory ? nil : refId
        let storyReplyId = isStory ? refId : nil
        let storyRef = isStory ? pendingRef : nil

        let attachments = composerState.pendingAttachments
        let mediaFiles = composerState.pendingMediaFiles
        let lang = composerState.selectedLanguage

        let plan = MultiAttachmentSendPlanner.plan(
            attachments: attachments,
            text: text,
            hasReply: refId != nil
        )

        if attachments.isEmpty {
            // Text-only send: clear UI immediately
            composerState.pendingAttachments.removeAll()
            composerState.pendingMediaFiles.removeAll()
            composerState.pendingThumbnails.removeAll()
            messageText = ""
            ReplyContextCleaner(conversationId: viewModel.conversationId)
                .clear(pendingReplyReference: &composerState.pendingReplyReference)
            viewModel.stopTypingEmission()
            HapticFeedback.light()
            Task { await viewModel.sendMessage(content: text, replyToId: replyId, storyReplyToId: storyReplyId, storyReplyReference: storyRef, originalLanguage: lang) }
            return
        }

        // File upload flow: keep attachments visible, show progress
        messageText = ""
        ReplyContextCleaner(conversationId: viewModel.conversationId)
            .clear(pendingReplyReference: &composerState.pendingReplyReference)
        viewModel.stopTypingEmission()
        composerState.isUploading = true
        HapticFeedback.light()

        // --- Precompute sendable media groups: each paired with a stable tempId ---
        // Both the optimistic phase and the upload phase iterate this SAME list
        // so that tempIds never desync (Issue 1: empty-locals groups must be
        // excluded from BOTH phases, not just the optimistic insert).
        struct MediaGroupSend {
            let group: MultiAttachmentSendPlanner.PlannedMessage
            let tempId: String
            let locals: [MeeshyMessageAttachment]   // non-empty; already cache-seeded
        }

        let currentUserId = AuthManager.shared.currentUser?.id ?? ""
        let senderName = AuthManager.shared.currentUser?.displayName
        let senderColor = DynamicColorGenerator.colorForName(senderName ?? "?")
        let thumbnails = composerState.pendingThumbnails

        // Build the list once. Side effects (image cache seeding) happen here.
        let mediaGroupSends: [MediaGroupSend] = plan.filter { $0.kind != .text }.compactMap { group in
            let locals: [MeeshyMessageAttachment] = group.attachments.compactMap { att in
                guard let fileURL = mediaFiles[att.id] else { return nil }
                let isImage = att.mimeType.hasPrefix("image/")
                if isImage, let data = try? Data(contentsOf: fileURL), let image = UIImage(data: data) {
                    // Seed in-memory NSCache + on-disk image cache so the
                    // optimistic bubble keeps the picture across navigation
                    // until the server `message:new` reconciliation lands.
                    DiskCacheStore.cacheImageForPreview(image, key: fileURL.absoluteString)
                    let persistKey = fileURL.absoluteString
                    Task { await CacheCoordinator.shared.images.save(data, for: persistKey) }
                }
                // A video/audio file:// URL cannot be decoded as a still — seed
                // a ThumbHash from the generated thumbnail so the bubble shows a
                // recognisable preview instantly. Images render from the cache.
                let optimisticThumbHash = isImage ? nil : thumbnails[att.id]?.toThumbHash()
                return MeeshyMessageAttachment(
                    id: att.id,
                    mimeType: att.mimeType.isEmpty ? "application/octet-stream" : att.mimeType,
                    fileUrl: fileURL.absoluteString,
                    width: att.width,
                    height: att.height,
                    thumbnailUrl: isImage ? fileURL.absoluteString : nil,
                    thumbHash: optimisticThumbHash,
                    duration: att.duration,
                    uploadedBy: currentUserId,
                    thumbnailColor: senderColor
                )
            }
            guard !locals.isEmpty else { return nil }
            // Phase 4 §6.2 — `cid_<uuid v4 lowercase>` so the gateway accepts
            // the value as `clientMessageId` (the legacy `temp_<UUID>` prefix
            // fails the strict wire regex).
            return MediaGroupSend(group: group, tempId: ClientMessageId.generate(), locals: locals)
        }

        // --- Optimistic media insert: one bubble per sendable group ---
        // Persist via GRDB (insertOptimisticMediaMessage) so the row survives
        // the next MessageStore observation refresh. A direct
        // `viewModel.messages.append` would only live in memory and be wiped
        // the moment any other GRDB write fires `messagesDidChange`.
        for send in mediaGroupSends {
            let msgType: Message.MessageType = send.group.kind == .audio
                ? .audio
                : (send.locals.first?.mimeType.hasPrefix("video/") == true ? .video : .image)
            viewModel.insertOptimisticMediaMessage(
                tempId: send.tempId,
                content: "",
                attachments: send.locals,
                messageType: msgType,
                replyToId: send.group.carriesReply ? replyId : nil,
                storyReplyToId: send.group.carriesReply ? storyReplyId : nil,
                replyReference: send.group.carriesReply ? storyRef : nil,
                originalLanguage: lang
            )
        }

        composerState.pendingAttachments.removeAll()
        composerState.pendingThumbnails.removeAll()
        // --- End optimistic media insert ---

        Task {
            defer {
                Task { @MainActor in
                    composerState.pendingMediaFiles.removeAll()
                    composerState.uploadProgress = nil
                    composerState.isUploading = false
                }
            }
            let serverOrigin = MeeshyConfig.shared.serverOrigin
            guard let baseURL = URL(string: serverOrigin),
                  let token = APIClient.shared.authToken else {
                await MainActor.run {
                    composerState.isUploading = false
                    FeedbackToastManager.shared.showError("Échec de l'envoi de la pièce jointe")
                }
                return
            }
            let uploader = TusUploadManager(baseURL: baseURL)
            var progressCancellable: AnyCancellable?
            progressCancellable = uploader.progressPublisher
                .receive(on: DispatchQueue.main)
                .sink { [progressCancellable] progress in
                    _ = progressCancellable
                    composerState.uploadProgress = progress
                }

            var anySuccess = false

            // Upload media groups — same iteration order as the optimistic phase,
            // using the precomputed tempId for each (Issue 1 fix: no tempIdx desync).
            for send in mediaGroupSends {
                // A3 — Audio offline write-ahead: short-circuit to OfflineQueue
                // when the device is offline, instead of attempting a TUS upload
                // that will fail immediately.
                if send.group.kind == .audio, NetworkMonitor.shared.isOffline {
                    let urls = send.group.attachments.compactMap { mediaFiles[$0.id] }
                    if !urls.isEmpty {
                        do {
                            _ = try await OfflineQueue.shared.enqueueAudios(
                                sourceAudioURLs: urls,
                                conversationId: viewModel.conversationId,
                                content: nil,
                                clientMessageId: send.tempId,
                                originalLanguage: lang,
                                replyToId: send.group.carriesReply ? replyId : nil
                            )
                            anySuccess = true
                            Logger.messages.info("Audio group queued offline for \(send.tempId)")
                        } catch {
                            Logger.messages.error("Audio offline enqueue failed: \(error.localizedDescription)")
                            await MainActor.run {
                                FeedbackToastManager.shared.showError("Échec de la mise en file du message vocal")
                            }
                        }
                        continue   // skip the online TUS path for this group
                    }
                }

                do {
                    var uploadedIds: [String] = []
                    var localAttachments: [MeeshyMessageAttachment] = []
                    for att in send.group.attachments {
                        guard let fileURL = mediaFiles[att.id] else { continue }
                        let fileData = try? Data(contentsOf: fileURL)
                        let thumbHash = thumbnails[att.id]?.toThumbHash()
                        let mime = send.group.kind == .audio ? "audio/mp4" : att.mimeType
                        let result = try await uploader.uploadFile(
                            fileURL: fileURL, mimeType: mime, token: token, thumbHash: thumbHash
                        )
                        uploadedIds.append(result.id)
                        if let fileData {
                            // Seed under the exact key the renderer resolves to
                            // so the optimistic→confirmed transition (file:// →
                            // server URL) reads a hot cache and never
                            // re-downloads our own upload. See RC3.3.
                            let renderKey = MeeshyConfig.resolveMediaURL(result.fileUrl)?.absoluteString ?? result.fileUrl
                            let effectiveType: MeeshyMessageAttachment.AttachmentType = send.group.kind == .audio ? .audio : att.type
                            switch effectiveType {
                            case .audio:
                                await CacheCoordinator.shared.audio.store(fileData, for: renderKey)
                                await CacheCoordinator.shared.audio.store(fileData, for: fileURL.absoluteString)
                            case .image:
                                await CacheCoordinator.shared.images.store(fileData, for: renderKey)
                                if let image = UIImage(data: fileData) {
                                    DiskCacheStore.cacheImageForPreview(image, key: renderKey)
                                }
                            default:
                                await CacheCoordinator.shared.video.store(fileData, for: renderKey)
                            }
                            // Seed server-returned thumbnail so the confirmed
                            // bubble renders from cache (no network flash on
                            // optimistic→server URL reconciliation). Only for
                            // non-audio groups which carry a thumbnailUrl.
                            if effectiveType != .audio,
                               let thumbUrl = result.thumbnailUrl,
                               let thumbImage = thumbnails[att.id],
                               let thumbData = thumbImage.jpegData(compressionQuality: 0.8) {
                                let thumbKey = MeeshyConfig.resolveMediaURL(thumbUrl)?.absoluteString ?? thumbUrl
                                await CacheCoordinator.shared.thumbnails.store(thumbData, for: thumbKey)
                                DiskCacheStore.cacheImageForPreview(thumbImage, key: thumbKey)
                            }
                        }
                        localAttachments.append(result.toMessageAttachment(uploadedBy: currentUserId))
                    }
                    let ok = await viewModel.sendMessage(
                        content: "",
                        replyToId: send.group.carriesReply ? replyId : nil,
                        storyReplyToId: send.group.carriesReply ? storyReplyId : nil,
                        storyReplyReference: send.group.carriesReply ? storyRef : nil,
                        attachmentIds: uploadedIds.isEmpty ? nil : uploadedIds,
                        localAttachments: localAttachments.isEmpty ? nil : localAttachments,
                        originalLanguage: lang,
                        existingTempId: send.tempId
                    )
                    anySuccess = anySuccess || ok
                } catch {
                    Logger.messages.error("Group upload failed (\(String(describing: send.group.kind))): \(error.localizedDescription)")
                }
            }

            // Send text group last (preserves original planner ordering intent).
            if let textGroup = plan.first(where: { $0.kind == .text }) {
                let ok = await viewModel.sendMessage(
                    content: textGroup.text ?? "",
                    replyToId: textGroup.carriesReply ? replyId : nil,
                    storyReplyToId: textGroup.carriesReply ? storyReplyId : nil,
                    storyReplyReference: textGroup.carriesReply ? storyRef : nil,
                    originalLanguage: lang
                )
                anySuccess = anySuccess || ok
            }

            progressCancellable?.cancel()

            // Clean up local files. Audio: defer disk deletion — the optimistic
            // GRDB row carries the file:// URL until the socket echo flips it to
            // https (~100-500ms); the play tap reads from disk in that window.
            let audioURLs = plan.filter { $0.kind == .audio }.flatMap { $0.attachments }.compactMap { mediaFiles[$0.id] }
            let visualURLs = plan.filter { $0.kind == .visual }.flatMap { $0.attachments }.compactMap { mediaFiles[$0.id] }
            await MainActor.run {
                for url in visualURLs { try? FileManager.default.removeItem(at: url) }
                if !audioURLs.isEmpty {
                    Task {
                        try? await Task.sleep(nanoseconds: 10_000_000_000)
                        for url in audioURLs { try? FileManager.default.removeItem(at: url) }
                    }
                }
                if anySuccess {
                    HapticFeedback.success()
                } else {
                    HapticFeedback.error()
                    FeedbackToastManager.shared.showError("Échec de l'envoi de la pièce jointe")
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
        composerState.selectedPhotoItems.removeAll()
        HapticFeedback.light()
        for item in items {
            let prep = AttachmentPreparationService.shared.preparePhotosPickerItem(
                item,
                context: .message,
                accentColor: accentColor
            )
            trackPreparation(prep)
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
        // Single source of truth lives in `MimeTypeResolver` (MeeshySDK).
        // See its `forwardTable` for the full extension → mime mapping.
        MimeTypeResolver.mimeType(forURL: url)
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
        let prep = AttachmentPreparationService.shared.prepareVideo(
            sourceURL: url,
            deleteSourceAfterCompression: true,
            context: .message,
            accentColor: "FF6B6B"
        )
        trackPreparation(prep)
    }

    func handleCameraCapture(_ image: UIImage) {
        let prep = AttachmentPreparationService.shared.prepareImage(
            image,
            context: .message,
            accentColor: accentColor
        )
        trackPreparation(prep)
    }

    /// Wire a `PreparingAttachment` into the composer:
    /// 1. Append the in-flight handle so the tray shows a loading tile.
    /// 2. Observe the handle and, when it reaches `.ready`, promote the
    ///    result into the legacy pending dicts the send pipeline already
    ///    knows how to consume. `.failed` simply drops the tile + toasts.
    func trackPreparation(_ prep: PreparingAttachment) {
        composerState.preparingAttachments.append(prep)
        observePreparation(prep)
    }

    private func observePreparation(_ prep: PreparingAttachment) {
        Task { @MainActor [prep] in
            let result = await prep.awaitCompletion()
            switch result {
            case .success(let prepared):
                composerState.pendingMediaFiles[prepared.attachment.id] = prepared.fileURL
                if let thumb = prep.thumbnail {
                    composerState.pendingThumbnails[prepared.attachment.id] = thumb
                }
                composerState.pendingAttachments.append(prepared.attachment)
                HapticFeedback.success()
            case .failure(.preparationFailed(let message)):
                HapticFeedback.error()
                FeedbackToastManager.shared.showError(message)
            }
            composerState.preparingAttachments.removeAll { $0.id == prep.id }
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
