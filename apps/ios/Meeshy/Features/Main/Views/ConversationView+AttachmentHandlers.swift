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
        composerState.pendingAudioURL = url
        let audioAttachment = MessageAttachment.audio(durationMs: durationMs, color: accentColor)
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
            ReplyContextCleaner(conversationId: viewModel.conversationId)
                .clear(pendingReplyReference: &composerState.pendingReplyReference)
            viewModel.stopTypingEmission()
            HapticFeedback.light()
            let lang = composerState.selectedLanguage
            Task { await viewModel.sendMessage(content: content, replyToId: replyId, storyReplyToId: storyReplyId, storyReplyReference: storyRef, originalLanguage: lang) }
            return
        }

        // File upload flow: keep attachments visible, show progress
        messageText = ""
        ReplyContextCleaner(conversationId: viewModel.conversationId)
            .clear(pendingReplyReference: &composerState.pendingReplyReference)
        viewModel.stopTypingEmission()
        composerState.isUploading = true
        HapticFeedback.light()

        // --- Optimistic media insert: show bubble immediately with local files ---
        // Persist via GRDB (insertOptimisticMediaMessage) so the row survives
        // the next MessageStore observation refresh. A direct
        // `viewModel.messages.append` would only live in memory and be wiped
        // the moment any other GRDB write fires `messagesDidChange` (e.g. a
        // status update or another conversation receiving a message).
        let currentUserId = AuthManager.shared.currentUser?.id ?? ""
        let senderName = AuthManager.shared.currentUser?.displayName
        let senderColor = DynamicColorGenerator.colorForName(senderName ?? "?")

        var previewAttachments: [MeeshyMessageAttachment] = []
        for att in attachments where att.type != .audio {
            if let fileURL = mediaFiles[att.id] {
                let isImage = att.mimeType.hasPrefix("image/")
                if isImage,
                   let data = try? Data(contentsOf: fileURL),
                   let image = UIImage(data: data) {
                    DiskCacheStore.cacheImageForPreview(image, key: fileURL.absoluteString)
                    // `cacheImageForPreview` only seeds the in-memory NSCache,
                    // which is evicted as soon as the user leaves the
                    // conversation. On return the optimistic bubble would then
                    // fall back to its coloured placeholder square (a magenta
                    // tile) until the server `message:new` reconciliation
                    // lands. Persisting the bytes to the on-disk image cache
                    // keeps the picture visible across navigation.
                    let persistKey = fileURL.absoluteString
                    Task { await CacheCoordinator.shared.images.save(data, for: persistKey) }
                }
                // A video's file:// URL points at an .mp4 — it cannot be
                // decoded as a still image. Seed a ThumbHash from the generated
                // thumbnail so the bubble shows a recognisable preview instantly
                // (ProgressiveCachedImage decodes ThumbHash with zero I/O).
                // Images render straight from the cache seeded just above.
                let optimisticThumbHash = isImage
                    ? nil
                    : composerState.pendingThumbnails[att.id]?.toThumbHash()
                previewAttachments.append(MeeshyMessageAttachment(
                    id: att.id,
                    mimeType: att.mimeType,
                    fileUrl: fileURL.absoluteString,
                    width: att.width,
                    height: att.height,
                    thumbnailUrl: isImage ? fileURL.absoluteString : nil,
                    thumbHash: optimisticThumbHash,
                    uploadedBy: currentUserId,
                    thumbnailColor: senderColor
                ))
            }
        }

        // Synthesize a local audio attachment so the bubble can render the
        // waveform/player against the file:// URL while the upload runs.
        // The server message:new reconciliation will overwrite this with the
        // canonical fileUrl once the upload completes.
        var localAudioPreview: MeeshyMessageAttachment?
        if let audioURL,
           let audioAttachment = attachments.first(where: { $0.type == .audio }) {
            localAudioPreview = MeeshyMessageAttachment(
                id: audioAttachment.id,
                mimeType: audioAttachment.mimeType.isEmpty ? "audio/mp4" : audioAttachment.mimeType,
                fileUrl: audioURL.absoluteString,
                duration: audioAttachment.duration,
                uploadedBy: currentUserId,
                thumbnailColor: senderColor
            )
        }

        let allLocalAttachments: [MeeshyMessageAttachment] = previewAttachments + (localAudioPreview.map { [$0] } ?? [])
        // Phase 4 §6.2 — must use the canonical `cid_<uuid v4 lowercase>`
        // format so the gateway accepts the value as `clientMessageId`. The
        // legacy `temp_<UUID>` prefix would fail the strict regex on the
        // wire and silently break every image / video / file attachment
        // send (the audio path goes through `sendWithAttachmentsAsync`
        // which generates its own cid).
        let tempId = ClientMessageId.generate()

        if !allLocalAttachments.isEmpty {
            let msgType: Message.MessageType = audioURL != nil ? .audio
                : (previewAttachments.first?.mimeType.hasPrefix("video/") == true ? .video : .image)

            viewModel.insertOptimisticMediaMessage(
                tempId: tempId,
                content: content,
                attachments: allLocalAttachments,
                messageType: msgType,
                replyToId: replyId,
                storyReplyToId: storyReplyId,
                replyReference: storyRef,
                originalLanguage: composerState.selectedLanguage
            )
        }

        composerState.pendingAttachments.removeAll()
        composerState.pendingThumbnails.removeAll()
        // --- End optimistic media insert ---

        Task {
            do {
                // Phase 4 §6.3 audio offline write-ahead. If the user is
                // offline AND the only attachment is audio, persist the
                // recording to `Documents/pending-audio/<cid>.m4a` and
                // queue an `OutboxRecord` referencing that path. The
                // dispatcher (`OutboxDispatcher.dispatchSendMessage` audio
                // branch) will TUS-upload the file and emit
                // `message:send-with-attachments` over the socket on the
                // next reconnect, so the gateway audio pipeline (Whisper
                // transcription + NLLB + TTS) runs as if the user had
                // sent online. Other attachment types fall through to the
                // online TUS upload path because they would lose their
                // local URL across an app restart.
                let isOffline = NetworkMonitor.shared.isOffline
                let onlyAudio = audioURL != nil
                    && attachments.allSatisfy { $0.type == .audio }
                if isOffline && onlyAudio, let audioURL {
                    do {
                        _ = try await OfflineQueue.shared.enqueueAudio(
                            sourceAudioURL: audioURL,
                            conversationId: viewModel.conversationId,
                            content: content.isEmpty ? nil : content,
                            clientMessageId: tempId,
                            originalLanguage: composerState.selectedLanguage,
                            replyToId: replyId,
                            forwardedFromId: nil,
                            forwardedFromConversationId: nil
                        )
                        await MainActor.run { composerState.isUploading = false }
                        Logger.messages.info("Audio queued offline for \(tempId)")
                        return
                    } catch {
                        Logger.messages.error("Audio offline enqueue failed: \(error.localizedDescription)")
                        await MainActor.run {
                            composerState.isUploading = false
                            viewModel.error = "Échec de la mise en file du message vocal"
                        }
                        ToastManager.shared.showError("Échec de la mise en file du message vocal")
                        return
                    }
                }

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
                        // Seed under the exact key the renderer resolves to so
                        // the optimistic→confirmed transition reads a hot cache
                        // and never re-downloads our own upload. See RC3.3.
                        let renderKey = MeeshyConfig.resolveMediaURL(result.fileUrl)?.absoluteString ?? result.fileUrl
                        await CacheCoordinator.shared.audio.store(audioData, for: renderKey)
                        // Also seed under the local `file://` key. Mirrors how
                        // images cache under their `file://` URL (line 102): a
                        // defence-in-depth so the optimistic GRDB row (which
                        // still carries the `file://` URL until reconciliation)
                        // resolves to a cached blob if the on-disk file is
                        // cleaned up before the URL flips to https.
                        await CacheCoordinator.shared.audio.store(audioData, for: audioURL.absoluteString)
                    }
                    let userId = AuthManager.shared.currentUser?.id ?? ""
                    localAttachments.append(result.toMessageAttachment(uploadedBy: userId))
                }

                let currentUserId = AuthManager.shared.currentUser?.id ?? ""
                for attachment in attachments where attachment.type != .audio {
                    if let fileURL = mediaFiles[attachment.id] {
                        let fileData = try? Data(contentsOf: fileURL)
                        let thumbHash = composerState.pendingThumbnails[attachment.id]?.toThumbHash()
                        let result = try await uploader.uploadFile(
                            fileURL: fileURL, mimeType: attachment.mimeType, token: token, thumbHash: thumbHash
                        )
                        uploadedIds.append(result.id)
                        if let fileData {
                            // Seed under the exact key the renderer resolves to
                            // so the optimistic→confirmed transition (file:// →
                            // server URL) reads a hot cache and never
                            // re-downloads our own upload. See RC3.3.
                            let renderKey = MeeshyConfig.resolveMediaURL(result.fileUrl)?.absoluteString ?? result.fileUrl
                            if attachment.mimeType.hasPrefix("image/") {
                                await CacheCoordinator.shared.images.store(fileData, for: renderKey)
                                // Pre-seed the in-memory UIImage cache under the
                                // SAME key so ProgressiveCachedImage reads it
                                // synchronously on the confirmed render — no
                                // decode, no shimmer.
                                if let image = UIImage(data: fileData) {
                                    DiskCacheStore.cacheImageForPreview(image, key: renderKey)
                                }
                            } else {
                                // Video / file: route to the video store — the
                                // same store checkCache(.video) and the badge
                                // downloader read — so a confirmed own video
                                // resolves as cached and never offers a
                                // re-download of media we just uploaded.
                                await CacheCoordinator.shared.video.store(fileData, for: renderKey)
                            }
                            if let thumbUrl = result.thumbnailUrl,
                               let thumbImage = composerState.pendingThumbnails[attachment.id],
                               let thumbData = thumbImage.jpegData(compressionQuality: 0.8) {
                                let thumbKey = MeeshyConfig.resolveMediaURL(thumbUrl)?.absoluteString ?? thumbUrl
                                await CacheCoordinator.shared.thumbnails.store(thumbData, for: thumbKey)
                                DiskCacheStore.cacheImageForPreview(thumbImage, key: thumbKey)
                            }
                        }
                        localAttachments.append(result.toMessageAttachment(uploadedBy: currentUserId))
                    }
                }

                progressCancellable?.cancel()

                var sendSuccess = false
                let lang = composerState.selectedLanguage

                // Audio, image, vidéo et fichier empruntent tous le même envoi
                // REST `viewModel.sendMessage`. Le pipeline audio gateway
                // (Whisper/NLLB/TTS) se déclenche aussi via REST. En cas
                // d'échec REST, `sendMessage` bascule automatiquement sur le
                // socket avec le même clientMessageId (dedup → pas de doublon).
                if !uploadedIds.isEmpty || !content.isEmpty {
                    sendSuccess = await viewModel.sendMessage(
                        content: content,
                        replyToId: replyId,
                        storyReplyToId: storyReplyId,
                        storyReplyReference: storyRef,
                        attachmentIds: uploadedIds.isEmpty ? nil : uploadedIds,
                        localAttachments: localAttachments.isEmpty ? nil : localAttachments,
                        originalLanguage: lang,
                        existingTempId: tempId
                    )
                }

                // Clear UI after upload+send and clean up local files
                await MainActor.run {
                    for (_, url) in mediaFiles { try? FileManager.default.removeItem(at: url) }
                    // Audio: defer disk deletion.
                    //
                    // The optimistic GRDB record's audio attachment carries the
                    // `file://` URL until the `message:new` socket echo flips it
                    // to the canonical `https://` URL (~100-500ms after REST
                    // returns). During that reconciliation window the bubble's
                    // play tap routes to `AudioPlayerView.playLocal` which
                    // reads from disk — deleting the file eagerly here made the
                    // player silently fail (the "I can't listen to my own audio
                    // immediately after sending" bug). The bytes are already
                    // cached under the canonical https key (seeded above), so
                    // once reconciled the play works via the cache without any
                    // disk read. A 10s delay covers worst-case socket latency
                    // with ample margin while keeping Documents/ small.
                    if let audioURL {
                        Task {
                            try? await Task.sleep(nanoseconds: 10_000_000_000)
                            try? FileManager.default.removeItem(at: audioURL)
                        }
                    }
                    composerState.pendingMediaFiles.removeAll()
                    composerState.pendingAudioURL = nil
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
                ToastManager.shared.showError(message)
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
