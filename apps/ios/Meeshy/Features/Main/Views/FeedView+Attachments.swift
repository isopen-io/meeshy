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

                        let thumb = await feedGenerateVideoThumbnail(url: compressedURL)

                        await MainActor.run {
                            pendingMediaFiles[attachmentId] = compressedURL
                            if let thumb { pendingThumbnails[attachmentId] = thumb }
                            pendingAttachments.append(attachment)
                        }
                    }
                } else {
                    if let imageData = try? await item.loadTransferable(type: Data.self),
                       let uiImage = UIImage(data: imageData) {
                        let result = await MediaCompressor.shared.compressImage(uiImage)
                        let fileName = "photo_\(UUID().uuidString).\(result.fileExtension)"
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
                            thumbnailColor: "4ECDC4"
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

    // MARK: - Camera Capture
    func handleFeedCameraCapture(_ image: UIImage) {
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
                thumbnailColor: "4ECDC4"
            )
            await MainActor.run {
                pendingMediaFiles[attachmentId] = tempURL
                pendingThumbnails[attachmentId] = image
                pendingAttachments.append(attachment)
                HapticFeedback.success()
            }
        }
    }

    func handleFeedCameraVideo(_ url: URL) {
        Task {
            let compressedURL: URL
            do {
                compressedURL = try await MediaCompressor.shared.compressVideo(url)
                try? FileManager.default.removeItem(at: url)
            } catch {
                compressedURL = url
            }

            let fileSize = feedGetFileSize(compressedURL)
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

            let thumb = await feedGenerateVideoThumbnail(url: compressedURL)
            await MainActor.run {
                pendingMediaFiles[attachmentId] = compressedURL
                if let thumb { pendingThumbnails[attachmentId] = thumb }
                pendingAttachments.append(attachment)
                HapticFeedback.success()
            }
        }
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
                Task { await viewModel.createPost(content: text) }
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

                await viewModel.createPost(
                    content: text,
                    mediaIds: uploadedIds.isEmpty ? nil : uploadedIds
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
                }
            } catch {
                await MainActor.run {
                    feedCleanupAttachments()
                    uploadProgress = nil
                    isUploading = false
                    for (_, url) in mediaFiles { try? FileManager.default.removeItem(at: url) }
                    if let audioURL { try? FileManager.default.removeItem(at: audioURL) }
                    HapticFeedback.error()
                }
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
                    ForEach(pendingAttachments) { attachment in
                        feedAttachmentTile(attachment)
                    }
                    if isLoadingMedia {
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
                            .fill(MeeshyColors.coral)
                            .shadow(color: MeeshyColors.coral.opacity(0.4), radius: 4, y: 2)
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
    let onDismiss: () -> Void

    @ObservedObject private var theme = ThemeManager.shared
    @ObservedObject private var authManager = AuthManager.shared
    @State private var composerText = ""
    @FocusState private var isFocused: Bool
    @State private var editingAttachmentId: String?

    @State private var pendingAttachments: [MessageAttachment] = []
    @State private var pendingMediaFiles: [String: URL] = [:]
    @State private var pendingThumbnails: [String: UIImage] = [:]
    @State private var pendingAudioURL: URL?
    @State private var showPhotoPicker = false
    @State private var selectedPhotoItems: [PhotosPickerItem] = []
    @State private var showCamera = false
    @State private var showFilePicker = false
    @State private var showLocationPicker = false
    @State private var isUploading = false
    @State private var uploadProgress: UploadQueueProgress?
    @State private var isLoadingMedia = false

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
                        Text("Annuler")
                            .font(.system(size: 15, weight: .medium))
                            .foregroundColor(theme.textSecondary)
                    }

                    Spacer()

                    Text("Nouveau post")
                        .font(.system(size: 16, weight: .bold))
                        .foregroundColor(theme.textPrimary)

                    Spacer()

                    Button {
                        publishPost()
                    } label: {
                        if isUploading {
                            ProgressView()
                                .tint(MeeshyColors.teal)
                                .scaleEffect(0.8)
                        } else {
                            Text("Publier")
                                .font(.system(size: 15, weight: .bold))
                                .foregroundColor(hasContent ? MeeshyColors.teal : theme.textMuted)
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
                        mode: .custom(40),
                        accentColor: "FF6B6B",
                        secondaryColor: "4ECDC4"
                    )
                    VStack(alignment: .leading, spacing: 2) {
                        Text(getUserDisplayName(authManager.currentUser, fallback: "Moi"))
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundColor(theme.textPrimary)
                        Text("Public")
                            .font(.system(size: 12))
                            .foregroundColor(theme.textMuted)
                    }
                    Spacer()
                }
                .padding(.horizontal, 16)
                .padding(.top, 12)

                // Text editor
                ZStack(alignment: .topLeading) {
                    if composerText.isEmpty {
                        Text("Qu'avez-vous en t\u{00EA}te ?")
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

                // Pending attachments
                if !pendingAttachments.isEmpty || isLoadingMedia {
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
                HStack(spacing: 24) {
                    Button { showPhotoPicker = true; HapticFeedback.light() } label: {
                        Image(systemName: "photo.fill")
                            .font(.system(size: 20))
                            .foregroundColor(Color(hex: "4ECDC4"))
                    }
                    Button { showCamera = true; HapticFeedback.light() } label: {
                        Image(systemName: "camera.fill")
                            .font(.system(size: 20))
                            .foregroundColor(Color(hex: "FF6B6B"))
                    }
                    Button {} label: {
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
                            .foregroundColor(Color(hex: "2ECC71"))
                    }
                    Spacer()
                }
                .padding(16)
                .background(theme.backgroundSecondary)
            }
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
            ImageEditView(image: item.image) { editedImage in
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
        .onChange(of: selectedPhotoItems) { _, items in
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
                ForEach(pendingAttachments) { attachment in
                    sheetAttachmentTile(attachment)
                }
                if isLoadingMedia {
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
                                .fill(MeeshyColors.coral)
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

    // MARK: - Handlers (Adapted from FeedView+Attachments)
    private func handlePhotoSelection(_ items: [PhotosPickerItem]) {
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
                        let rawURL = FileManager.default.temporaryDirectory.appendingPathComponent("video_raw_\(UUID().uuidString).mp4")
                        try? movieData.write(to: rawURL)
                        let compressedURL: URL
                        do {
                            compressedURL = try await MediaCompressor.shared.compressVideo(rawURL)
                            try? FileManager.default.removeItem(at: rawURL)
                        } catch { compressedURL = rawURL }
                        let fileSize = (try? FileManager.default.attributesOfItem(atPath: compressedURL.path)[.size] as? Int) ?? movieData.count
                        let attachmentId = UUID().uuidString
                        let attachment = MessageAttachment(id: attachmentId, fileName: compressedURL.lastPathComponent, originalName: compressedURL.lastPathComponent, mimeType: "video/mp4", fileSize: fileSize, fileUrl: compressedURL.absoluteString, thumbnailColor: "FF6B6B")
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
                        let result = await MediaCompressor.shared.compressImage(uiImage)
                        let fileName = "photo_\(UUID().uuidString).\(result.fileExtension)"
                        let tempURL = FileManager.default.temporaryDirectory.appendingPathComponent(fileName)
                        try? result.data.write(to: tempURL)
                        let attachmentId = UUID().uuidString
                        let attachment = MessageAttachment(id: attachmentId, fileName: fileName, originalName: fileName, mimeType: result.mimeType, fileSize: result.data.count, fileUrl: tempURL.absoluteString, width: Int(uiImage.size.width), height: Int(uiImage.size.height), thumbnailColor: "4ECDC4")
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

    private func handleCameraCapture(_ image: UIImage) {
        Task {
            let result = await MediaCompressor.shared.compressImage(image)
            let fileName = "camera_\(UUID().uuidString).\(result.fileExtension)"
            let tempURL = FileManager.default.temporaryDirectory.appendingPathComponent(fileName)
            try? result.data.write(to: tempURL)
            let attachmentId = UUID().uuidString
            let attachment = MessageAttachment(id: attachmentId, fileName: fileName, originalName: fileName, mimeType: result.mimeType, fileSize: result.data.count, fileUrl: tempURL.absoluteString, width: Int(image.size.width), height: Int(image.size.height), thumbnailColor: "4ECDC4")
            await MainActor.run {
                pendingMediaFiles[attachmentId] = tempURL
                pendingThumbnails[attachmentId] = image
                pendingAttachments.append(attachment)
                HapticFeedback.success()
            }
        }
    }

    private func handleCameraVideo(_ url: URL) {
        Task {
            let compressedURL: URL
            do {
                compressedURL = try await MediaCompressor.shared.compressVideo(url)
                try? FileManager.default.removeItem(at: url)
            } catch { compressedURL = url }
            let fileSize = (try? FileManager.default.attributesOfItem(atPath: compressedURL.path)[.size] as? Int) ?? 0
            let attachmentId = UUID().uuidString
            let attachment = MessageAttachment(id: attachmentId, fileName: compressedURL.lastPathComponent, originalName: compressedURL.lastPathComponent, mimeType: "video/mp4", fileSize: fileSize, fileUrl: compressedURL.absoluteString, thumbnailColor: "FF6B6B")
            let thumb = await generateVideoThumbnail(url: compressedURL)
            await MainActor.run {
                pendingMediaFiles[attachmentId] = compressedURL
                if let thumb { pendingThumbnails[attachmentId] = thumb }
                pendingAttachments.append(attachment)
                HapticFeedback.success()
            }
        }
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

        let attachments = pendingAttachments
        let mediaFiles = pendingMediaFiles
        let hasFiles = !mediaFiles.isEmpty

        if !hasFiles || attachments.isEmpty {
            onDismiss()
            HapticFeedback.success()
            if !text.isEmpty {
                Task { await viewModel.createPost(content: text) }
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
                        let result = try await uploader.uploadFile(fileURL: fileURL, mimeType: attachment.mimeType, token: token)
                        uploadedIds.append(result.id)
                        try? FileManager.default.removeItem(at: fileURL)
                    }
                }
                progressCancellable?.cancel()

                await viewModel.createPost(content: text, mediaIds: uploadedIds.isEmpty ? nil : uploadedIds)

                await MainActor.run {
                    isUploading = false
                    uploadProgress = nil
                    onDismiss()
                    HapticFeedback.success()
                }
            } catch {
                await MainActor.run {
                    isUploading = false
                    uploadProgress = nil
                    for (_, url) in mediaFiles { try? FileManager.default.removeItem(at: url) }
                    HapticFeedback.error()
                }
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
        let ext = url.pathExtension.lowercased()
        switch ext {
        case "jpg", "jpeg": return "image/jpeg"
        case "png": return "image/png"
        case "gif": return "image/gif"
        case "mp4", "m4v": return "video/mp4"
        case "mov": return "video/quicktime"
        case "mp3": return "audio/mpeg"
        case "m4a": return "audio/mp4"
        case "pdf": return "application/pdf"
        default: return "application/octet-stream"
        }
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
