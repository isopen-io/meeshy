import SwiftUI
import PhotosUI
import AVFoundation
import CoreLocation
import Combine
import MeeshySDK
import MeeshyUI

// MARK: - Feed Attachment Handlers
extension FeedView {

    // MARK: - Photo Selection
    func handleFeedPhotoSelection(_ items: [PhotosPickerItem]) {
        guard !items.isEmpty else { return }
        selectedPhotoItems.removeAll()
        HapticFeedback.light()
        for item in items {
            let prep = AttachmentPreparationService.shared.preparePhotosPickerItem(
                item,
                context: .feedPost,
                accentColor: ""
            )
            trackFeedPreparation(prep)
        }
    }

    // MARK: - Camera Capture
    func handleFeedCameraCapture(_ image: UIImage) {
        let prep = AttachmentPreparationService.shared.prepareImage(
            image,
            context: .feedPost,
            accentColor: "4ECDC4"
        )
        trackFeedPreparation(prep)
    }

    func handleFeedCameraVideo(_ url: URL) {
        let prep = AttachmentPreparationService.shared.prepareVideo(
            sourceURL: url,
            deleteSourceAfterCompression: true,
            context: .feedPost,
            accentColor: "FF6B6B"
        )
        trackFeedPreparation(prep)
    }

    /// Append an in-flight preparation to the loading row and promote its
    /// result into `pendingAttachments` / `pendingMediaFiles` /
    /// `pendingThumbnails` once it reaches `.ready`. Mirrors
    /// `ConversationView.trackPreparation` so the publish pipeline keeps
    /// reading the same three dictionaries.
    func trackFeedPreparation(_ prep: PreparingAttachment) {
        preparingAttachments.append(prep)
        Task { @MainActor [prep] in
            let result = await prep.awaitCompletion()
            switch result {
            case .success(let prepared):
                pendingMediaFiles[prepared.attachment.id] = prepared.fileURL
                if let thumb = prep.thumbnail {
                    pendingThumbnails[prepared.attachment.id] = thumb
                }
                pendingAttachments.append(prepared.attachment)
                HapticFeedback.success()
            case .failure(.preparationFailed(let message)):
                HapticFeedback.error()
                FeedbackToastManager.shared.showError(message)
            }
            preparingAttachments.removeAll { $0.id == prep.id }
        }
    }

    func cancelFeedPreparation(_ prep: PreparingAttachment) {
        preparingAttachments.removeAll { $0.id == prep.id }
    }

    // MARK: - File Import
    func handleFeedFileImport(_ result: Result<[URL], Error>) {
        switch result {
        case .success(let urls):
            for url in urls {
                guard url.startAccessingSecurityScopedResource() else { continue }
                defer { url.stopAccessingSecurityScopedResource() }

                let fileName = url.lastPathComponent
                let fileSize = feedGetFileSize(url)
                let mimeType = feedMimeTypeForURL(url)

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
            break
        }
    }

    // MARK: - Location Selection
    func handleFeedLocationSelection(coordinate: CLLocationCoordinate2D, address: String?) {
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

    // MARK: - Publish Post with Attachments
    func publishPostWithAttachments() {
        let text = composerText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty || !pendingAttachments.isEmpty else { return }

        let attachments = pendingAttachments
        let audioURL = pendingAudioURL
        let mediaFiles = pendingMediaFiles
        let hasFiles = audioURL != nil || !mediaFiles.isEmpty

        if !hasFiles || attachments.isEmpty {
            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                showComposer = false
                isComposerFocused = false
                composerText = ""
            }
            feedCleanupAttachments()
            HapticFeedback.success()
            if !text.isEmpty {
                let lang = composerLanguage
                Task { await viewModel.createPost(content: text, visibility: postVisibility, originalLanguage: lang) }
            }
            return
        }

        // U1b — offline visual-media post → durable outbox (skip TUS). Audio
        // posts keep the existing path (audio offline durability = future). The
        // source URLs are captured before the UI reset (feedCleanupAttachments
        // only clears the state arrays, not the temp files on disk) so
        // enqueuePostMedia can relocate them; its Phase C deletes the sources.
        // Text-only offline posts are already durable via createPost above.
        if NetworkMonitor.shared.isOffline, audioURL == nil {
            let sources = attachments.compactMap { mediaFiles[$0.id] }
            let lang = composerLanguage
            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                showComposer = false
                isComposerFocused = false
                composerText = ""
            }
            feedCleanupAttachments()
            HapticFeedback.success()
            FeedbackToastManager.shared.showSuccess("Post en attente d'envoi")
            Task {
                await viewModel.createOfflineMediaPost(
                    localMediaURLs: sources,
                    content: text,
                    visibility: postVisibility,
                    originalLanguage: lang
                )
            }
            return
        }

        isUploading = true
        HapticFeedback.light()

        Task {
            do {
                let serverOrigin = MeeshyConfig.shared.serverOrigin
                guard let baseURL = URL(string: serverOrigin),
                      let token = APIClient.shared.authToken else {
                    await MainActor.run { isUploading = false }
                    return
                }

                let uploader = TusUploadManager(baseURL: baseURL)

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
                        fileURL: audioURL, mimeType: "audio/mp4", token: token, uploadContext: "post"
                    )
                    uploadedIds.append(result.id)
                    try? FileManager.default.removeItem(at: audioURL)
                }

                for attachment in attachments where attachment.type != .audio {
                    if let fileURL = mediaFiles[attachment.id] {
                        let thumbHash = pendingThumbnails[attachment.id]?.toThumbHash()
                        let result = try await uploader.uploadFile(
                            fileURL: fileURL, mimeType: attachment.mimeType, token: token, uploadContext: "post", thumbHash: thumbHash
                        )
                        uploadedIds.append(result.id)
                        try? FileManager.default.removeItem(at: fileURL)
                    }
                }

                progressCancellable?.cancel()

                await viewModel.createPost(
                    content: text,
                    mediaIds: uploadedIds.isEmpty ? nil : uploadedIds,
                    originalLanguage: composerLanguage
                )

                await MainActor.run {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                        showComposer = false
                        isComposerFocused = false
                        composerText = ""
                    }
                    feedCleanupAttachments()
                    uploadProgress = nil
                    isUploading = false
                    HapticFeedback.success()
                    FeedbackToastManager.shared.showSuccess("Post publie")
                }
            } catch {
                await MainActor.run {
                    feedCleanupAttachments()
                    uploadProgress = nil
                    isUploading = false
                    for (_, url) in mediaFiles { try? FileManager.default.removeItem(at: url) }
                    if let audioURL { try? FileManager.default.removeItem(at: audioURL) }
                    HapticFeedback.error()
                    FeedbackToastManager.shared.showError("Echec de la publication du post")
                }
            }
        }
    }

    // MARK: - Audio Post
    func publishAudioPost(audioURL: URL, mimeType: String, transcription: MobileTranscriptionPayload?, originalLanguage: String? = nil) async {
        guard let token = APIClient.shared.authToken,
              let baseURL = URL(string: MeeshyConfig.shared.serverOrigin) else { return }

        await MainActor.run { isUploading = true }

        do {
            let uploader = TusUploadManager(baseURL: baseURL)
            let result = try await uploader.uploadFile(fileURL: audioURL, mimeType: mimeType, token: token, uploadContext: "post")
            try? FileManager.default.removeItem(at: audioURL)

            await viewModel.createPost(
                mediaIds: [result.id],
                originalLanguage: originalLanguage ?? transcription?.language,
                mobileTranscription: transcription
            )

            await MainActor.run {
                isUploading = false
                HapticFeedback.success()
                FeedbackToastManager.shared.showSuccess("Post audio publie")
            }
        } catch {
            try? FileManager.default.removeItem(at: audioURL)
            await MainActor.run {
                isUploading = false
                HapticFeedback.error()
                FeedbackToastManager.shared.showError("Echec de la publication du post audio")
            }
        }
    }

    // MARK: - Cleanup
    private func feedCleanupAttachments() {
        pendingAttachments.removeAll()
        pendingAudioURL = nil
        pendingMediaFiles.removeAll()
        pendingThumbnails.removeAll()
    }

    // MARK: - Pending Attachments Row
    var feedPendingAttachmentsRow: some View {
        VStack(spacing: 0) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    ForEach(preparingAttachments) { prep in
                        AttachmentLoadingTile(prep: prep) {
                            cancelFeedPreparation(prep)
                        }
                    }
                    ForEach(pendingAttachments) { attachment in
                        feedAttachmentTile(attachment)
                    }
                    if isLoadingMedia && preparingAttachments.isEmpty {
                        ProgressView()
                            .tint(Color(hex: "4ECDC4"))
                            .padding(.horizontal, 12)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
            }
            .frame(height: 100)
        }
    }

    // MARK: - Attachment Tile
    private func feedAttachmentTile(_ attachment: MessageAttachment) -> some View {
        HStack(spacing: 0) {
            Button {
                HapticFeedback.light()
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    let id = attachment.id
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
                            .fill(MeeshyColors.error)
                            .shadow(color: MeeshyColors.error.opacity(0.4), radius: 4, y: 2)
                    )
            }
            .padding(.trailing, 8)

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
                        }
                    } else if attachment.type == .location {
                        ZStack {
                            RoundedRectangle(cornerRadius: 10)
                                .fill(
                                    LinearGradient(
                                        colors: [MeeshyColors.success, MeeshyColors.success.opacity(0.7)],
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

                        Image(systemName: feedIconForType(attachment.type))
                            .font(.system(size: 22))
                            .foregroundColor(.white)
                    }
                }
                .frame(width: 56, height: 56)

                Text(feedLabelForAttachment(attachment))
                    .font(.system(size: 10, weight: .medium))
                    .foregroundColor(ThemeManager.shared.textSecondary)
                    .lineLimit(1)
                    .frame(width: 60)
            }
        }
    }

    // MARK: - Helpers
    func feedGenerateVideoThumbnail(url: URL) async -> UIImage? {
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

    func feedGetFileSize(_ url: URL) -> Int {
        (try? FileManager.default.attributesOfItem(atPath: url.path)[.size] as? Int) ?? 0
    }

    func feedMimeTypeForURL(_ url: URL) -> String {
        // Single source of truth lives in `MimeTypeResolver` (MeeshySDK).
        // NB: the legacy table here had a latent bug where `docx` was mapped
        // to `application/msword` (the .doc mime), making Word docx files
        // indistinguishable from .doc in downstream AttachmentKind dispatch.
        // The resolver maps docx to its canonical
        // `application/vnd.openxmlformats-officedocument.wordprocessingml.document`.
        MimeTypeResolver.mimeType(forURL: url)
    }

    func feedIconForType(_ type: MessageAttachment.AttachmentType) -> String {
        switch type {
        case .image: return "photo.fill"
        case .video: return "video.fill"
        case .audio: return "waveform"
        case .file: return "doc.fill"
        case .location: return "location.fill"
        }
    }

    func feedLabelForAttachment(_ attachment: MessageAttachment) -> String {
        switch attachment.type {
        case .image: return "Photo"
        case .video: return "Vid\u{00E9}o"
        case .audio: return attachment.durationFormatted ?? "Audio"
        case .file: return attachment.originalName.isEmpty ? "Fichier" : attachment.originalName
        case .location: return "Position"
        }
    }
}

// MARK: - Feed Composer Sheet (Fullscreen from ThemedFeedOverlay)
struct FeedComposerSheet: View {
    @ObservedObject var viewModel: FeedViewModel
    let initialText: String
    let pendingAttachmentType: String?
    var quotePost: FeedPost? = nil
    let onDismiss: () -> Void

    private var theme: ThemeManager { ThemeManager.shared }
    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }
    @ObservedObject private var authManager = AuthManager.shared
    @State private var composerText = ""
    @FocusState private var isFocused: Bool
    @State private var editingAttachmentId: String?
    @State private var videosToPreview: [URL] = []
    @State private var editingVideoURL: URL?

    @State private var pendingAttachments: [MessageAttachment] = []
    @State private var pendingMediaFiles: [String: URL] = [:]
    @State private var pendingThumbnails: [String: UIImage] = [:]
    @State private var pendingAudioURL: URL?
    @State private var preparingAttachments: [PreparingAttachment] = []
    @State private var showPhotoPicker = false
    @State private var selectedPhotoItems: [PhotosPickerItem] = []
    @State private var showCamera = false
    @State private var showFilePicker = false
    @State private var showLocationPicker = false
    @State private var isUploading = false
    @State private var uploadProgress: UploadQueueProgress?
    @State private var isLoadingMedia = false
    @State private var postVisibility: String = "PUBLIC"
    @State private var showEmojiPicker = false
    @State private var showAudioComposer = false
    @State private var composerLanguage: String = DefaultComposerLanguage.resolve()
    @State private var showLanguagePicker = false

    private var composerLanguageDisplayName: String {
        let name = Locale.current.localizedString(forLanguageCode: composerLanguage) ?? composerLanguage
        return name.prefix(1).uppercased() + name.dropFirst()
    }

    private var hasContent: Bool {
        !composerText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !pendingAttachments.isEmpty
    }

    var body: some View {
        ZStack {
            theme.backgroundPrimary.ignoresSafeArea()

            VStack(spacing: 0) {
                // Header
                HStack {
                    Button {
                        cleanupAndDismiss()
                    } label: {
                        Text(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .main))
                            .font(.system(size: 15, weight: .medium))
                            .foregroundColor(theme.textSecondary)
                    }

                    Spacer()

                    Text(String(localized: "feed.post.composer.title", defaultValue: "Nouveau post", bundle: .main))
                        .font(.system(size: 16, weight: .bold))
                        .foregroundColor(theme.textPrimary)

                    Spacer()

                    Button {
                        publishPost()
                    } label: {
                        if isUploading {
                            ProgressView()
                                .tint(MeeshyColors.indigo300)
                                .scaleEffect(0.8)
                        } else {
                            Text(String(localized: "feed.post.composer.publish", defaultValue: "Publier", bundle: .main))
                                .font(.system(size: 15, weight: .bold))
                                .foregroundColor(hasContent ? MeeshyColors.indigo300 : theme.textMuted)
                        }
                    }
                    .disabled(!hasContent || isUploading)
                }
                .padding(16)
                .background(theme.backgroundSecondary)

                Divider().background(theme.inputBorder)

                // User row
                HStack(spacing: 12) {
                    MeeshyAvatar(
                        name: getUserDisplayName(authManager.currentUser, fallback: "M"),
                        context: .feedComposer,
                        accentColor: "FF6B6B",
                        secondaryColor: "4ECDC4",
                        avatarURL: authManager.currentUser?.avatar
                    )
                    VStack(alignment: .leading, spacing: 2) {
                        Text(getUserDisplayName(authManager.currentUser, fallback: "Moi"))
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundColor(theme.textPrimary)

                        Menu {
                            Button { postVisibility = "PUBLIC" } label: {
                                Label(String(localized: "feed.post.visibility.public", defaultValue: "Public", bundle: .main), systemImage: "globe")
                            }
                            Button { postVisibility = "FRIENDS" } label: {
                                Label(String(localized: "feed.post.visibility.friends", defaultValue: "Amis", bundle: .main), systemImage: "person.2")
                            }
                            Button { postVisibility = "PRIVATE" } label: {
                                Label(String(localized: "feed.post.visibility.private", defaultValue: "Privé", bundle: .main), systemImage: "lock")
                            }
                        } label: {
                            HStack(spacing: 4) {
                                Image(systemName: postVisibility == "PUBLIC" ? "globe" : postVisibility == "FRIENDS" ? "person.2" : "lock")
                                    .font(.system(size: 10))
                                Text(postVisibility == "PUBLIC"
                                    ? String(localized: "feed.post.visibility.public", defaultValue: "Public", bundle: .main)
                                    : postVisibility == "FRIENDS"
                                        ? String(localized: "feed.post.visibility.friends", defaultValue: "Amis", bundle: .main)
                                        : String(localized: "feed.post.visibility.private", defaultValue: "Privé", bundle: .main))
                                    .font(.system(size: 12))
                            }
                            .foregroundColor(theme.textMuted)
                        }
                    }
                    Spacer()
                }
                .padding(.horizontal, 16)
                .padding(.top, 12)

                // Text editor
                ZStack(alignment: .topLeading) {
                    if composerText.isEmpty {
                        Text(String(localized: "feed.post.composer.placeholder", defaultValue: "Qu'avez-vous en tête ?", bundle: .main))
                            .font(.system(size: 17))
                            .foregroundColor(theme.textMuted)
                            .padding(.horizontal, 16)
                            .padding(.top, 12)
                    }
                    TextEditor(text: $composerText)
                        .focused($isFocused)
                        .scrollContentBackground(.hidden)
                        .foregroundColor(theme.textPrimary)
                        .font(.system(size: 17))
                        .frame(minHeight: 120)
                        .padding(.horizontal, 12)
                        .padding(.top, 4)
                }

                // Quoted post preview
                if let quoted = quotePost {
                    VStack(alignment: .leading, spacing: 8) {
                        HStack(spacing: 8) {
                            MeeshyAvatar(
                                name: quoted.author,
                                context: .postComment,
                                accentColor: quoted.authorColor,
                                avatarURL: quoted.authorAvatarURL
                            )
                            Text(quoted.author)
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundColor(theme.accentText(quoted.authorColor))
                            Text("·").foregroundColor(theme.textMuted)
                            Text(quoted.timestamp, style: .relative)
                                .font(.system(size: 11))
                                .foregroundColor(theme.textMuted)
                        }
                        Text(quoted.displayContent)
                            .font(.system(size: 14))
                            .foregroundColor(theme.textSecondary)
                            .lineLimit(4)
                    }
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(
                        RoundedRectangle(cornerRadius: 12)
                            .fill(theme.surfaceGradient(tint: quoted.authorColor))
                            .overlay(
                                RoundedRectangle(cornerRadius: 12)
                                    .stroke(theme.border(tint: quoted.authorColor, intensity: 0.2), lineWidth: 1)
                            )
                    )
                    .padding(.horizontal, 16)
                }

                // Pending attachments
                if !pendingAttachments.isEmpty || !preparingAttachments.isEmpty || isLoadingMedia {
                    sheetAttachmentsRow
                }

                // Upload progress
                if isUploading, let progress = uploadProgress {
                    UploadProgressBar(progress: progress, accentColor: "4ECDC4")
                        .padding(.horizontal, 16)
                        .padding(.bottom, 4)
                }

                Spacer(minLength: 0)

                // Toolbar
                HStack(spacing: 16) {
                    Button { showPhotoPicker = true; HapticFeedback.light() } label: {
                        Image(systemName: "photo.fill")
                            .font(.system(size: 20))
                            .foregroundColor(Color(hex: "4ECDC4"))
                    }
                    Button { showCamera = true; HapticFeedback.light() } label: {
                        Image(systemName: "camera.fill")
                            .font(.system(size: 20))
                            .foregroundColor(MeeshyColors.error)
                    }
                    Button { showEmojiPicker = true; HapticFeedback.light() } label: {
                        Image(systemName: "face.smiling.fill")
                            .font(.system(size: 20))
                            .foregroundColor(Color(hex: "F8B500"))
                    }
                    Button { showFilePicker = true; HapticFeedback.light() } label: {
                        Image(systemName: "doc.fill")
                            .font(.system(size: 20))
                            .foregroundColor(Color(hex: "9B59B6"))
                    }
                    Button { showLocationPicker = true; HapticFeedback.light() } label: {
                        Image(systemName: "location.fill")
                            .font(.system(size: 20))
                            .foregroundColor(MeeshyColors.success)
                    }
                    Button { showAudioComposer = true; HapticFeedback.light() } label: {
                        Image(systemName: "mic.fill")
                            .font(.system(size: 20))
                            .foregroundColor(Color(hex: "FF2E63"))
                    }

                    Spacer()

                    Button {
                        showLanguagePicker = true
                        HapticFeedback.light()
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: "globe")
                                .font(.system(size: 14))
                            Text(composerLanguageDisplayName)
                                .font(.system(size: 13, weight: .semibold))
                        }
                        .foregroundColor(MeeshyColors.indigo500)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(
                            Capsule()
                                .fill(MeeshyColors.indigo100.opacity(isDark ? 0.15 : 1))
                                .overlay(
                                    Capsule()
                                        .stroke(MeeshyColors.indigo300.opacity(0.3), lineWidth: 1)
                                )
                        )
                    }
                }
                .padding(16)
                .background(theme.backgroundSecondary)
            }
        }
        .sheet(isPresented: $showAudioComposer) {
            AudioPostComposerView { audioURL, mimeType, transcription in
                showAudioComposer = false
                Task {
                    await publishAudioFromSheet(audioURL: audioURL, mimeType: mimeType, transcription: transcription)
                }
            }
        }
        .sheet(isPresented: $showLanguagePicker) {
            AudioLanguagePickerView(
                selectedLocale: Binding(
                    get: { Locale(identifier: composerLanguage) },
                    set: { newLocale in
                        let langCode = newLocale.language.languageCode?.identifier ?? newLocale.identifier
                        composerLanguage = langCode
                    }
                )
            )
        }
        .photosPicker(isPresented: $showPhotoPicker, selection: $selectedPhotoItems, maxSelectionCount: 10, matching: .any(of: [.images, .videos]))
        .fileImporter(isPresented: $showFilePicker, allowedContentTypes: [.item], allowsMultipleSelection: true) { result in
            handleFileImport(result)
        }
        .fullScreenCover(isPresented: $showCamera) {
            CameraView { result in
                switch result {
                case .photo(let image):
                    handleCameraCapture(image)
                case .video(let url):
                    handleCameraVideo(url)
                }
            }
            .ignoresSafeArea()
        }
        .sheet(isPresented: $showLocationPicker) {
            LocationPickerView(accentColor: "4ECDC4") { coordinate, address in
                handleLocationSelection(coordinate: coordinate, address: address)
            }
        }
        .fullScreenCover(item: Binding<EditingAttachmentItem?>(
            get: {
                guard let id = editingAttachmentId, let image = pendingThumbnails[id] else { return nil }
                return EditingAttachmentItem(id: id, image: image)
            },
            set: { editingAttachmentId = $0?.id }
        )) { item in
            MeeshyImageEditorView(image: item.image, context: .post) { editedImage in
                pendingThumbnails[item.id] = editedImage
                Task {
                    let result = await MediaCompressor.shared.compressImage(editedImage)
                    let fileName = "edited_\(UUID().uuidString).\(result.fileExtension)"
                    let tempURL = FileManager.default.temporaryDirectory.appendingPathComponent(fileName)
                    try? result.data.write(to: tempURL)
                    await MainActor.run {
                        if let oldURL = pendingMediaFiles[item.id] {
                            try? FileManager.default.removeItem(at: oldURL)
                        }
                        pendingMediaFiles[item.id] = tempURL
                        if let idx = pendingAttachments.firstIndex(where: { $0.id == item.id }) {
                            pendingAttachments[idx] = MessageAttachment(
                                id: item.id,
                                fileName: fileName,
                                originalName: fileName,
                                mimeType: result.mimeType,
                                fileSize: result.data.count,
                                fileUrl: tempURL.absoluteString,
                                width: Int(editedImage.size.width),
                                height: Int(editedImage.size.height),
                                thumbnailColor: pendingAttachments[idx].thumbnailColor
                            )
                        }
                    }
                }
            }
            .ignoresSafeArea()
        }
        // PhotosPicker videos queue → VideoPreviewView
        .fullScreenCover(isPresented: Binding(
            get: { !videosToPreview.isEmpty },
            set: { if !$0 { videosToPreview.removeAll() } }
        )) {
            if let url = videosToPreview.first {
                MeeshyVideoEditorView(
                    url: url,
                    context: .post,
                    onComplete: { result in
                        handleCameraVideo(result.url)
                        videosToPreview.removeFirst()
                    },
                    onCancel: {
                        videosToPreview.removeFirst()
                    }
                )
            }
        }
        // Tap pending video → unified video editor
        .fullScreenCover(isPresented: Binding(
            get: { editingVideoURL != nil },
            set: { if !$0 { editingVideoURL = nil } }
        )) {
            if let url = editingVideoURL {
                MeeshyVideoEditorView(
                    url: url,
                    context: .post,
                    onComplete: { _ in editingVideoURL = nil },
                    onCancel: { editingVideoURL = nil }
                )
            }
        }
        .adaptiveOnChange(of: selectedPhotoItems) { _, items in
            handlePhotoSelection(items)
        }
        .onAppear {
            composerText = initialText
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                isFocused = true
                openInitialPicker()
            }
        }
    }

    // MARK: - Open Initial Picker
    private func openInitialPicker() {
        guard let type = pendingAttachmentType else { return }
        switch type {
        case "photo": showPhotoPicker = true
        case "camera": showCamera = true
        case "file": showFilePicker = true
        case "location": showLocationPicker = true
        default: break
        }
    }

    // MARK: - Attachments Row
    private var sheetAttachmentsRow: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 12) {
                ForEach(preparingAttachments) { prep in
                    AttachmentLoadingTile(prep: prep, size: 72) {
                        cancelSheetPreparation(prep)
                    }
                }
                ForEach(pendingAttachments) { attachment in
                    sheetAttachmentTile(attachment)
                }
                if isLoadingMedia && preparingAttachments.isEmpty {
                    ProgressView()
                        .tint(Color(hex: "4ECDC4"))
                        .padding(.horizontal, 12)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
        }
        .frame(height: 116)
    }

    private func sheetAttachmentTile(_ attachment: MessageAttachment) -> some View {
        VStack(spacing: 4) {
            ZStack {
                if let thumb = pendingThumbnails[attachment.id] {
                    Image(uiImage: thumb)
                        .resizable()
                        .aspectRatio(contentMode: .fill)
                        .frame(width: 72, height: 72)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                        .onTapGesture {
                            if attachment.type == .image {
                                editingAttachmentId = attachment.id
                            } else if attachment.type == .video {
                                if let url = pendingMediaFiles[attachment.id] {
                                    editingVideoURL = url
                                }
                            }
                        }

                    if attachment.type == .video {
                        Image(systemName: "play.circle.fill")
                            .font(.system(size: 22))
                            .foregroundStyle(.white, .black.opacity(0.4))
                    }
                } else if attachment.type == .location {
                    RoundedRectangle(cornerRadius: 10)
                        .fill(LinearGradient(colors: [Color(hex: "2ECC71"), Color(hex: "27AE60")], startPoint: .topLeading, endPoint: .bottomTrailing))
                        .frame(width: 72, height: 72)
                        .overlay(
                            Image(systemName: "mappin.circle.fill")
                                .font(.system(size: 26))
                                .foregroundStyle(.white, .white.opacity(0.3))
                        )
                } else {
                    RoundedRectangle(cornerRadius: 10)
                        .fill(LinearGradient(colors: [Color(hex: attachment.thumbnailColor), Color(hex: attachment.thumbnailColor).opacity(0.7)], startPoint: .topLeading, endPoint: .bottomTrailing))
                        .frame(width: 72, height: 72)
                        .overlay(
                            Image(systemName: sheetIconForType(attachment.type))
                                .font(.system(size: 26))
                                .foregroundColor(.white)
                        )
                }
            }
            .frame(width: 72, height: 72)
            .overlay(alignment: .topTrailing) {
                Button {
                    HapticFeedback.light()
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                        let id = attachment.id
                        pendingAttachments.removeAll { $0.id == id }
                        if let url = pendingMediaFiles.removeValue(forKey: id) {
                            try? FileManager.default.removeItem(at: url)
                        }
                        pendingThumbnails.removeValue(forKey: id)
                    }
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 9, weight: .bold))
                        .foregroundColor(.white)
                        .frame(width: 20, height: 20)
                        .background(
                            Circle()
                                .fill(MeeshyColors.error)
                                .shadow(color: .black.opacity(0.3), radius: 2, y: 1)
                        )
                }
                .offset(x: 6, y: -6)
            }

            Text(sheetLabelForAttachment(attachment))
                .font(.system(size: 10, weight: .medium))
                .foregroundColor(theme.textSecondary)
                .lineLimit(1)
                .frame(width: 72)
        }
    }

    // MARK: - Handlers (delegated to AttachmentPreparationService)
    private func handlePhotoSelection(_ items: [PhotosPickerItem]) {
        guard !items.isEmpty else { return }
        selectedPhotoItems.removeAll()
        HapticFeedback.light()
        for item in items {
            let isVideo = item.supportedContentTypes.contains { $0.conforms(to: .movie) }
            if isVideo {
                // Videos go through the editor first — compress + queue the
                // compressed URL for the previewer. The editor is the source
                // of truth for trimming/cover selection; once the user
                // confirms there, `handleCameraVideo` (below) wires the
                // preparation into the loading tray.
                Task {
                    if let movieData = try? await item.loadTransferable(type: Data.self) {
                        let rawURL = FileManager.default.temporaryDirectory.appendingPathComponent("video_raw_\(UUID().uuidString).mp4")
                        try? movieData.write(to: rawURL)
                        let compressedURL: URL
                        do {
                            compressedURL = try await MediaCompressor.shared.compressVideo(rawURL, context: .feedPost)
                            try? FileManager.default.removeItem(at: rawURL)
                        } catch { compressedURL = rawURL }
                        await MainActor.run { videosToPreview.append(compressedURL) }
                    }
                }
            } else {
                let prep = AttachmentPreparationService.shared.preparePhotosPickerItem(
                    item, context: .feedPost, accentColor: "4ECDC4"
                )
                trackSheetPreparation(prep)
            }
        }
    }

    private func handleCameraCapture(_ image: UIImage) {
        let prep = AttachmentPreparationService.shared.prepareImage(
            image, context: .feedPost, accentColor: "4ECDC4"
        )
        trackSheetPreparation(prep)
    }

    private func handleCameraVideo(_ url: URL) {
        let prep = AttachmentPreparationService.shared.prepareVideo(
            sourceURL: url,
            deleteSourceAfterCompression: true,
            context: .feedPost,
            accentColor: "FF6B6B"
        )
        trackSheetPreparation(prep)
    }

    private func trackSheetPreparation(_ prep: PreparingAttachment) {
        preparingAttachments.append(prep)
        Task { @MainActor [prep] in
            let result = await prep.awaitCompletion()
            switch result {
            case .success(let prepared):
                pendingMediaFiles[prepared.attachment.id] = prepared.fileURL
                if let thumb = prep.thumbnail {
                    pendingThumbnails[prepared.attachment.id] = thumb
                }
                pendingAttachments.append(prepared.attachment)
                HapticFeedback.success()
            case .failure(.preparationFailed(let message)):
                HapticFeedback.error()
                FeedbackToastManager.shared.showError(message)
            }
            preparingAttachments.removeAll { $0.id == prep.id }
        }
    }

    private func cancelSheetPreparation(_ prep: PreparingAttachment) {
        preparingAttachments.removeAll { $0.id == prep.id }
    }

    private func handleFileImport(_ result: Result<[URL], Error>) {
        guard case .success(let urls) = result else { return }
        for url in urls {
            guard url.startAccessingSecurityScopedResource() else { continue }
            defer { url.stopAccessingSecurityScopedResource() }
            let fileName = url.lastPathComponent
            let fileSize = (try? FileManager.default.attributesOfItem(atPath: url.path)[.size] as? Int) ?? 0
            let mimeType = mimeTypeForURL(url)
            let tempURL = FileManager.default.temporaryDirectory.appendingPathComponent("file_\(UUID().uuidString)_\(fileName)")
            try? FileManager.default.copyItem(at: url, to: tempURL)
            let attachmentId = UUID().uuidString
            let attachment = MessageAttachment(id: attachmentId, fileName: fileName, originalName: fileName, mimeType: mimeType, fileSize: fileSize, fileUrl: tempURL.absoluteString, thumbnailColor: "45B7D1")
            pendingMediaFiles[attachmentId] = tempURL
            pendingAttachments.append(attachment)
        }
        HapticFeedback.light()
    }

    private func handleLocationSelection(coordinate: CLLocationCoordinate2D, address: String?) {
        let attachment = MessageAttachment.location(latitude: coordinate.latitude, longitude: coordinate.longitude, color: "2ECC71")
        withAnimation { pendingAttachments.append(attachment) }
        HapticFeedback.light()
    }

    // MARK: - Publish
    private func publishPost() {
        let text = composerText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty || !pendingAttachments.isEmpty else { return }

        // Quote mode: repost with content instead of createPost
        if let quotePost {
            onDismiss()
            HapticFeedback.success()
            Task { await viewModel.repostPost(quotePost.id, content: text, isQuote: true) }
            return
        }

        let attachments = pendingAttachments
        let mediaFiles = pendingMediaFiles
        let hasFiles = !mediaFiles.isEmpty

        if !hasFiles || attachments.isEmpty {
            onDismiss()
            HapticFeedback.success()
            if !text.isEmpty {
                let lang = composerLanguage
                Task { await viewModel.createPost(content: text, visibility: postVisibility, originalLanguage: lang) }
            }
            return
        }

        // U1b — offline: route the media post through the durable outbox instead
        // of the TUS upload (which throws offline → the post would be lost). The
        // post appears optimistically (local-media preview); the OutboxFlusher
        // uploads + creates on reconnect, and the cmid echo reconciles it
        // (U1 ST2). Mirrors the message offline-media gate. Text-only offline
        // posts are already durable via createPost above (U1 ST3).
        if NetworkMonitor.shared.isOffline {
            let sources = attachments.compactMap { mediaFiles[$0.id] }
            let lang = composerLanguage
            onDismiss()
            HapticFeedback.success()
            FeedbackToastManager.shared.showSuccess("Post en attente d'envoi")
            Task {
                await viewModel.createOfflineMediaPost(
                    localMediaURLs: sources,
                    content: text,
                    visibility: postVisibility,
                    originalLanguage: lang
                )
            }
            return
        }

        isUploading = true
        HapticFeedback.light()

        Task {
            do {
                let serverOrigin = MeeshyConfig.shared.serverOrigin
                guard let baseURL = URL(string: serverOrigin),
                      let token = APIClient.shared.authToken else {
                    await MainActor.run { isUploading = false }
                    return
                }

                let uploader = TusUploadManager(baseURL: baseURL)
                var progressCancellable: AnyCancellable?
                progressCancellable = uploader.progressPublisher
                    .receive(on: DispatchQueue.main)
                    .sink { [progressCancellable] progress in
                        _ = progressCancellable
                        uploadProgress = progress
                    }

                var uploadedIds: [String] = []
                for attachment in attachments {
                    if let fileURL = mediaFiles[attachment.id] {
                        let thumbHash = pendingThumbnails[attachment.id]?.toThumbHash()
                        let result = try await uploader.uploadFile(fileURL: fileURL, mimeType: attachment.mimeType, token: token, uploadContext: "post", thumbHash: thumbHash)
                        uploadedIds.append(result.id)
                        try? FileManager.default.removeItem(at: fileURL)
                    }
                }
                progressCancellable?.cancel()

                await viewModel.createPost(content: text, visibility: postVisibility, mediaIds: uploadedIds.isEmpty ? nil : uploadedIds, originalLanguage: composerLanguage)

                await MainActor.run {
                    isUploading = false
                    uploadProgress = nil
                    onDismiss()
                    HapticFeedback.success()
                    FeedbackToastManager.shared.showSuccess("Post publie")
                }
            } catch {
                await MainActor.run {
                    isUploading = false
                    uploadProgress = nil
                    for (_, url) in mediaFiles { try? FileManager.default.removeItem(at: url) }
                    HapticFeedback.error()
                    FeedbackToastManager.shared.showError("Echec de la publication du post")
                }
            }
        }
    }

    private func publishAudioFromSheet(audioURL: URL, mimeType: String, transcription: MobileTranscriptionPayload?) async {
        guard let token = APIClient.shared.authToken,
              let baseURL = URL(string: MeeshyConfig.shared.serverOrigin) else { return }
        await MainActor.run { isUploading = true }
        do {
            let uploader = TusUploadManager(baseURL: baseURL)
            let result = try await uploader.uploadFile(fileURL: audioURL, mimeType: mimeType, token: token, uploadContext: "post")
            try? FileManager.default.removeItem(at: audioURL)
            await viewModel.createPost(
                mediaIds: [result.id],
                originalLanguage: transcription?.language ?? composerLanguage,
                mobileTranscription: transcription
            )
            await MainActor.run {
                isUploading = false
                onDismiss()
                HapticFeedback.success()
                FeedbackToastManager.shared.showSuccess("Post audio publie")
            }
        } catch {
            await MainActor.run {
                isUploading = false
                HapticFeedback.error()
                FeedbackToastManager.shared.showError("Echec de la publication")
            }
        }
    }

    private func cleanupAndDismiss() {
        for (_, url) in pendingMediaFiles { try? FileManager.default.removeItem(at: url) }
        onDismiss()
    }

    // MARK: - Helpers
    private func generateVideoThumbnail(url: URL) async -> UIImage? {
        let asset = AVAsset(url: url)
        let generator = AVAssetImageGenerator(asset: asset)
        generator.appliesPreferredTrackTransform = true
        generator.maximumSize = CGSize(width: 200, height: 200)
        return try? UIImage(cgImage: generator.copyCGImage(at: .zero, actualTime: nil))
    }

    private func mimeTypeForURL(_ url: URL) -> String {
        // Single source of truth lives in `MimeTypeResolver` (MeeshySDK).
        // Replaces a deliberately-narrow table that excluded several formats
        // (webp/heic/wav/audio/ogg/...) — the resolver covers all of them.
        MimeTypeResolver.mimeType(forURL: url)
    }

    private func sheetIconForType(_ type: MessageAttachment.AttachmentType) -> String {
        switch type {
        case .image: return "photo.fill"
        case .video: return "video.fill"
        case .audio: return "waveform"
        case .file: return "doc.fill"
        case .location: return "location.fill"
        }
    }

    private func sheetLabelForAttachment(_ attachment: MessageAttachment) -> String {
        switch attachment.type {
        case .image: return "Photo"
        case .video: return "Vid\u{00E9}o"
        case .audio: return attachment.durationFormatted ?? "Audio"
        case .file: return attachment.originalName.isEmpty ? "Fichier" : attachment.originalName
        case .location: return "Position"
        }
    }
}

private struct EditingAttachmentItem: Identifiable {
    let id: String
    let image: UIImage
}
