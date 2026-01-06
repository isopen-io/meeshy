//
//  ConversationMediaView.swift
//  Meeshy
//
//  Modern media gallery for viewing all attachments in a conversation
//  Features:
//  - Tabbed view (Photos, Videos, Audio, Files, Links)
//  - Grid/List layouts
//  - Selection mode for batch actions
//  - Share, Save, Navigate to message
//  - Modern glassmorphism design
//
//  iOS 16+
//

import SwiftUI

// MARK: - Media Tab Type

enum MediaTabType: String, CaseIterable {
    case photos = "Photos"
    case videos = "Vidéos"
    case audio = "Audio"
    case files = "Fichiers"
    case links = "Liens"

    var icon: String {
        switch self {
        case .photos: return "photo.fill"
        case .videos: return "video.fill"
        case .audio: return "waveform"
        case .files: return "doc.fill"
        case .links: return "link"
        }
    }

    var emptyIcon: String {
        switch self {
        case .photos: return "photo.on.rectangle.angled"
        case .videos: return "video.slash"
        case .audio: return "waveform.slash"
        case .files: return "doc.text"
        case .links: return "link.circle"
        }
    }

    var emptyMessage: String {
        switch self {
        case .photos: return "Aucune photo"
        case .videos: return "Aucune vidéo"
        case .audio: return "Aucun audio"
        case .files: return "Aucun fichier"
        case .links: return "Aucun lien"
        }
    }
}

// MARK: - Conversation Media View

struct ConversationMediaView: View {
    let conversationId: String
    let conversationTitle: String

    /// Callback to navigate to a specific message
    var onNavigateToMessage: ((String) -> Void)?

    @StateObject private var viewModel: MediaGalleryViewModel
    @State private var selectedTab: MediaTabType = .photos
    @State private var isSelectionMode = false
    @State private var selectedItems: Set<String> = []
    @State private var showShareSheet = false
    @State private var shareItems: [Any] = []
    @State private var showMediaGallery = false
    @State private var selectedMediaIndex = 0

    @Environment(\.dismiss) private var dismiss

    init(conversationId: String, conversationTitle: String = "", onNavigateToMessage: ((String) -> Void)? = nil) {
        self.conversationId = conversationId
        self.conversationTitle = conversationTitle
        self.onNavigateToMessage = onNavigateToMessage
        self._viewModel = StateObject(wrappedValue: MediaGalleryViewModel(conversationId: conversationId))
    }

    var body: some View {
        VStack(spacing: 0) {
            // Custom tab bar
            tabBar

            // Content
            TabView(selection: $selectedTab) {
                photosTab
                    .tag(MediaTabType.photos)

                videosTab
                    .tag(MediaTabType.videos)

                audioTab
                    .tag(MediaTabType.audio)

                filesTab
                    .tag(MediaTabType.files)

                linksTab
                    .tag(MediaTabType.links)
            }
            .tabViewStyle(.page(indexDisplayMode: .never))

            // Selection toolbar
            if isSelectionMode && !selectedItems.isEmpty {
                selectionToolbar
            }
        }
        .navigationTitle("Médias et fichiers")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button(isSelectionMode ? "OK" : "Sélectionner") {
                    withAnimation {
                        isSelectionMode.toggle()
                        if !isSelectionMode {
                            selectedItems.removeAll()
                        }
                    }
                }
                .font(.system(size: 15, weight: .medium))
            }
        }
        .task {
            await viewModel.loadMedia()
        }
        .refreshable {
            await viewModel.refresh()
        }
        .sheet(isPresented: $showShareSheet) {
            ShareSheet(items: shareItems)
        }
        .fullScreenCover(isPresented: $showMediaGallery) {
            mediaGalleryFullScreen
        }
    }

    // MARK: - Tab Bar

    private var tabBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(MediaTabType.allCases, id: \.self) { tab in
                    tabButton(tab)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
        }
        .background(Color(.systemBackground))
        .overlay(
            Rectangle()
                .frame(height: 0.5)
                .foregroundColor(Color(.separator)),
            alignment: .bottom
        )
    }

    private func tabButton(_ tab: MediaTabType) -> some View {
        let count = countForTab(tab)
        let isSelected = selectedTab == tab

        return Button {
            withAnimation(.spring(response: 0.3)) {
                selectedTab = tab
            }
        } label: {
            HStack(spacing: 6) {
                Image(systemName: tab.icon)
                    .font(.system(size: 14, weight: .medium))

                Text(tab.rawValue)
                    .font(.system(size: 14, weight: .medium))

                if count > 0 {
                    Text("\(count)")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(isSelected ? .white : .secondary)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(
                            Capsule()
                                .fill(isSelected ? Color.white.opacity(0.3) : Color(.systemGray5))
                        )
                }
            }
            .foregroundColor(isSelected ? .white : .primary)
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .background(
                Capsule()
                    .fill(isSelected ? Color.meeshyPrimary : Color(.systemGray6))
            )
        }
        .buttonStyle(.plain)
    }

    private func countForTab(_ tab: MediaTabType) -> Int {
        switch tab {
        case .photos: return viewModel.photos.count
        case .videos: return viewModel.videos.count
        case .audio: return viewModel.audios.count
        case .files: return viewModel.documents.count
        case .links: return viewModel.links.count
        }
    }

    // MARK: - Photos Tab

    private var photosTab: some View {
        Group {
            if viewModel.isLoading && viewModel.photos.isEmpty {
                loadingView
            } else if viewModel.photos.isEmpty {
                emptyStateView(for: .photos)
            } else {
                mediaGrid(items: viewModel.photos, hasMore: viewModel.hasMorePhotos) {
                    await viewModel.loadMorePhotos()
                }
            }
        }
    }

    // MARK: - Videos Tab

    private var videosTab: some View {
        Group {
            if viewModel.isLoading && viewModel.videos.isEmpty {
                loadingView
            } else if viewModel.videos.isEmpty {
                emptyStateView(for: .videos)
            } else {
                mediaGrid(items: viewModel.videos, hasMore: viewModel.hasMoreVideos) {
                    await viewModel.loadMoreVideos()
                }
            }
        }
    }

    // MARK: - Audio Tab

    private var audioTab: some View {
        Group {
            if viewModel.isLoading && viewModel.audios.isEmpty {
                loadingView
            } else if viewModel.audios.isEmpty {
                emptyStateView(for: .audio)
            } else {
                audioList
            }
        }
    }

    private var audioList: some View {
        ScrollView {
            LazyVStack(spacing: 12) {
                ForEach(viewModel.audios) { item in
                    AudioMediaRow(
                        item: item,
                        isSelected: selectedItems.contains(item.id),
                        isSelectionMode: isSelectionMode,
                        onTap: {
                            if isSelectionMode {
                                toggleSelection(item.id)
                            }
                        },
                        onNavigateToMessage: {
                            navigateToMessage(item.messageId)
                        },
                        onShare: {
                            shareAttachment(item.attachment)
                        }
                    )
                }

                if viewModel.hasMoreAudios {
                    loadMoreButton {
                        await viewModel.loadMoreAudios()
                    }
                }
            }
            .padding()
        }
    }

    // MARK: - Files Tab

    private var filesTab: some View {
        Group {
            if viewModel.isLoading && viewModel.documents.isEmpty {
                loadingView
            } else if viewModel.documents.isEmpty {
                emptyStateView(for: .files)
            } else {
                filesList
            }
        }
    }

    private var filesList: some View {
        ScrollView {
            LazyVStack(spacing: 12) {
                ForEach(viewModel.documents) { item in
                    FileMediaRow(
                        item: item,
                        isSelected: selectedItems.contains(item.id),
                        isSelectionMode: isSelectionMode,
                        onTap: {
                            if isSelectionMode {
                                toggleSelection(item.id)
                            }
                        },
                        onNavigateToMessage: {
                            navigateToMessage(item.messageId)
                        },
                        onShare: {
                            shareAttachment(item.attachment)
                        },
                        onDownload: {
                            downloadAttachment(item.attachment)
                        }
                    )
                }

                if viewModel.hasMoreDocuments {
                    loadMoreButton {
                        await viewModel.loadMoreDocuments()
                    }
                }
            }
            .padding()
        }
    }

    // MARK: - Links Tab

    private var linksTab: some View {
        Group {
            if viewModel.isLoading && viewModel.links.isEmpty {
                loadingView
            } else if viewModel.links.isEmpty {
                emptyStateView(for: .links)
            } else {
                linksList
            }
        }
    }

    private var linksList: some View {
        ScrollView {
            LazyVStack(spacing: 12) {
                ForEach(viewModel.links) { item in
                    LinkMediaRow(
                        item: item,
                        onNavigateToMessage: {
                            navigateToMessage(item.messageId)
                        }
                    )
                }
            }
            .padding()
        }
    }

    // MARK: - Media Grid

    private func mediaGrid(items: [MediaItemWithContext], hasMore: Bool, loadMore: @escaping () async -> Void) -> some View {
        ScrollView {
            LazyVGrid(columns: [
                GridItem(.flexible(), spacing: 2),
                GridItem(.flexible(), spacing: 2),
                GridItem(.flexible(), spacing: 2)
            ], spacing: 2) {
                ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                    MediaGridCell(
                        item: item,
                        isSelected: selectedItems.contains(item.id),
                        isSelectionMode: isSelectionMode,
                        onTap: {
                            if isSelectionMode {
                                toggleSelection(item.id)
                            } else {
                                selectedMediaIndex = index
                                showMediaGallery = true
                            }
                        },
                        onLongPress: {
                            showContextMenu(for: item)
                        }
                    )
                }
            }

            if hasMore {
                loadMoreButton(action: loadMore)
            }
        }
    }

    // MARK: - Components

    private var loadingView: some View {
        VStack(spacing: 16) {
            ProgressView()
                .scaleEffect(1.2)

            Text("Chargement...")
                .font(.system(size: 14))
                .foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func emptyStateView(for tab: MediaTabType) -> some View {
        VStack(spacing: 16) {
            Image(systemName: tab.emptyIcon)
                .font(.system(size: 60))
                .foregroundColor(Color(.systemGray4))

            Text(tab.emptyMessage)
                .font(.system(size: 17, weight: .medium))
                .foregroundColor(.secondary)

            Text("Les médias partagés dans cette conversation apparaîtront ici")
                .font(.system(size: 14))
                .foregroundColor(Color(.systemGray))
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(.bottom, 60)
    }

    private func loadMoreButton(action: @escaping () async -> Void) -> some View {
        Button {
            Task { await action() }
        } label: {
            HStack(spacing: 8) {
                if viewModel.isLoadingMore {
                    ProgressView()
                        .scaleEffect(0.8)
                }
                Text(viewModel.isLoadingMore ? "Chargement..." : "Charger plus")
                    .font(.system(size: 14, weight: .medium))
            }
            .foregroundColor(.meeshyPrimary)
            .padding(.vertical, 12)
            .frame(maxWidth: .infinity)
        }
        .disabled(viewModel.isLoadingMore)
    }

    // MARK: - Selection Toolbar

    private var selectionToolbar: some View {
        HStack(spacing: 20) {
            Button {
                shareSelectedItems()
            } label: {
                VStack(spacing: 4) {
                    Image(systemName: "square.and.arrow.up")
                        .font(.system(size: 20))
                    Text("Partager")
                        .font(.system(size: 11))
                }
            }

            Button {
                downloadSelectedItems()
            } label: {
                VStack(spacing: 4) {
                    Image(systemName: "arrow.down.circle")
                        .font(.system(size: 20))
                    Text("Télécharger")
                        .font(.system(size: 11))
                }
            }

            Spacer()

            Text("\(selectedItems.count) sélectionné(s)")
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(.secondary)
        }
        .foregroundColor(.meeshyPrimary)
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
        .background(
            Rectangle()
                .fill(.ultraThinMaterial)
                .overlay(
                    Rectangle()
                        .frame(height: 0.5)
                        .foregroundColor(Color(.separator)),
                    alignment: .top
                )
        )
    }

    // MARK: - Media Gallery Full Screen

    @ViewBuilder
    private var mediaGalleryFullScreen: some View {
        let allMedia = (viewModel.photos + viewModel.videos).map { item in
            MediaItem(
                attachment: item.attachment,
                senderName: item.senderName,
                senderId: item.senderId
            )
        }

        if !allMedia.isEmpty {
            MediaGalleryView(
                items: allMedia,
                initialIndex: min(selectedMediaIndex, allMedia.count - 1)
            )
        }
    }

    // MARK: - Actions

    private func toggleSelection(_ id: String) {
        if selectedItems.contains(id) {
            selectedItems.remove(id)
        } else {
            selectedItems.insert(id)
        }
    }

    private func navigateToMessage(_ messageId: String) {
        dismiss()
        // Small delay to allow dismiss animation
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
            onNavigateToMessage?(messageId)
        }
    }

    private func shareAttachment(_ attachment: Attachment) {
        Task {
            if let url = await getLocalURL(for: attachment) {
                await MainActor.run {
                    shareItems = [url]
                    showShareSheet = true
                }
            }
        }
    }

    private func downloadAttachment(_ attachment: Attachment) {
        Task {
            if let url = await getLocalURL(for: attachment) {
                await MainActor.run {
                    let documentPicker = UIDocumentPickerViewController(forExporting: [url])
                    if let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
                       let rootVC = windowScene.windows.first?.rootViewController {
                        rootVC.present(documentPicker, animated: true)
                    }
                }
            }
        }
    }

    private func shareSelectedItems() {
        Task {
            var urls: [URL] = []

            for item in viewModel.photos + viewModel.videos + viewModel.audios + viewModel.documents {
                if selectedItems.contains(item.id) {
                    if let url = await getLocalURL(for: item.attachment) {
                        urls.append(url)
                    }
                }
            }

            if !urls.isEmpty {
                await MainActor.run {
                    shareItems = urls
                    showShareSheet = true
                }
            }
        }
    }

    private func downloadSelectedItems() {
        Task {
            for item in viewModel.photos + viewModel.videos + viewModel.audios + viewModel.documents {
                if selectedItems.contains(item.id) {
                    await downloadToPhotosOrFiles(item.attachment)
                }
            }

            await MainActor.run {
                selectedItems.removeAll()
                isSelectionMode = false

                let generator = UINotificationFeedbackGenerator()
                generator.notificationOccurred(.success)
            }
        }
    }

    private func downloadToPhotosOrFiles(_ attachment: Attachment) async {
        guard let url = await getLocalURL(for: attachment) else { return }

        await MainActor.run {
            if attachment.isImage {
                if let image = UIImage(contentsOfFile: url.path) {
                    UIImageWriteToSavedPhotosAlbum(image, nil, nil, nil)
                }
            } else if attachment.isVideo {
                UISaveVideoAtPathToSavedPhotosAlbum(url.path, nil, nil, nil)
            }
            // For other types, they're already cached locally
        }
    }

    private func getLocalURL(for attachment: Attachment) async -> URL? {
        let cacheType: CacheFileType
        switch attachment.resolvedType {
        case .image: cacheType = .image
        case .video: cacheType = .video
        case .audio: cacheType = .audio
        default: cacheType = .document
        }

        if let cached = await AttachmentFileCache.shared.getFile(for: attachment.url, type: cacheType) {
            return cached
        }

        return await AttachmentFileCache.shared.downloadAndCache(from: attachment.url, type: cacheType)
    }

    private func showContextMenu(for item: MediaItemWithContext) {
        // Context menu is handled by the cell itself
    }
}

// MARK: - Media Grid Cell

struct MediaGridCell: View {
    let item: MediaItemWithContext
    let isSelected: Bool
    let isSelectionMode: Bool
    let onTap: () -> Void
    let onLongPress: () -> Void

    var body: some View {
        GeometryReader { geometry in
            ZStack {
                // Thumbnail
                CachedAsyncImage(
                    url: URL(string: item.attachment.thumbnailUrl ?? item.attachment.url),
                    cacheType: .thumbnail
                ) { image in
                    image
                        .resizable()
                        .scaledToFill()
                } placeholder: {
                    Color(.systemGray5)
                        .overlay(
                            Image(systemName: item.attachment.isVideo ? "video.fill" : "photo.fill")
                                .foregroundColor(Color(.systemGray3))
                        )
                }
                .frame(width: geometry.size.width, height: geometry.size.width)
                .clipped()

                // Video indicator
                if item.attachment.isVideo {
                    VStack {
                        Spacer()
                        HStack {
                            Image(systemName: "play.fill")
                                .font(.system(size: 10))

                            if let duration = item.attachment.duration {
                                Text(formatDuration(duration))
                                    .font(.system(size: 10, weight: .medium))
                            }

                            Spacer()
                        }
                        .foregroundColor(.white)
                        .padding(6)
                        .background(
                            LinearGradient(
                                colors: [.black.opacity(0.6), .clear],
                                startPoint: .bottom,
                                endPoint: .top
                            )
                        )
                    }
                }

                // Selection overlay
                if isSelectionMode {
                    Color.black.opacity(isSelected ? 0.3 : 0)

                    VStack {
                        HStack {
                            Spacer()
                            ZStack {
                                Circle()
                                    .fill(isSelected ? Color.meeshyPrimary : Color.white.opacity(0.8))
                                    .frame(width: 24, height: 24)

                                if isSelected {
                                    Image(systemName: "checkmark")
                                        .font(.system(size: 12, weight: .bold))
                                        .foregroundColor(.white)
                                }
                            }
                            .padding(8)
                        }
                        Spacer()
                    }
                }
            }
        }
        .aspectRatio(1, contentMode: .fit)
        .contentShape(Rectangle())
        .onTapGesture(perform: onTap)
        .onLongPressGesture(perform: onLongPress)
        .contextMenu {
            Button {
                onTap()
            } label: {
                Label("Ouvrir", systemImage: "eye")
            }

            Button {
                // Navigate to message
            } label: {
                Label("Voir le message", systemImage: "message")
            }

            Button {
                // Share
            } label: {
                Label("Partager", systemImage: "square.and.arrow.up")
            }

            Button {
                // Download
            } label: {
                Label("Télécharger", systemImage: "arrow.down.circle")
            }
        }
    }

    private func formatDuration(_ seconds: TimeInterval) -> String {
        let minutes = Int(seconds) / 60
        let secs = Int(seconds) % 60
        return String(format: "%d:%02d", minutes, secs)
    }
}

// MARK: - Audio Media Row

struct AudioMediaRow: View {
    let item: MediaItemWithContext
    let isSelected: Bool
    let isSelectionMode: Bool
    let onTap: () -> Void
    let onNavigateToMessage: () -> Void
    let onShare: () -> Void

    @State private var showFullScreen = false

    var body: some View {
        HStack(spacing: 12) {
            // Selection checkbox
            if isSelectionMode {
                Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 22))
                    .foregroundColor(isSelected ? .meeshyPrimary : .secondary)
            }

            // Audio icon
            ZStack {
                Circle()
                    .fill(Color.meeshyPrimary.opacity(0.15))
                    .frame(width: 50, height: 50)

                Image(systemName: "waveform")
                    .font(.system(size: 20))
                    .foregroundColor(.meeshyPrimary)
            }

            // Info
            VStack(alignment: .leading, spacing: 4) {
                Text(item.attachment.fileName)
                    .font(.system(size: 14, weight: .medium))
                    .lineLimit(1)

                HStack(spacing: 8) {
                    if let duration = item.attachment.duration {
                        Text(formatDuration(duration))
                            .font(.system(size: 12))
                            .foregroundColor(.secondary)
                    }

                    Text(item.attachment.fileSizeFormatted)
                        .font(.system(size: 12))
                        .foregroundColor(.secondary)
                }

                if let senderName = item.senderName {
                    Text(senderName)
                        .font(.system(size: 11))
                        .foregroundColor(Color(.systemGray))
                }
            }

            Spacer()

            // Actions
            if !isSelectionMode {
                Menu {
                    Button(action: onNavigateToMessage) {
                        Label("Voir le message", systemImage: "message")
                    }

                    Button(action: onShare) {
                        Label("Partager", systemImage: "square.and.arrow.up")
                    }
                } label: {
                    Image(systemName: "ellipsis.circle")
                        .font(.system(size: 22))
                        .foregroundColor(.secondary)
                }
            }
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(Color(.systemGray6))
        )
        .contentShape(Rectangle())
        .onTapGesture(perform: onTap)
    }

    private func formatDuration(_ seconds: TimeInterval) -> String {
        let minutes = Int(seconds) / 60
        let secs = Int(seconds) % 60
        return String(format: "%d:%02d", minutes, secs)
    }
}

// MARK: - File Media Row

struct FileMediaRow: View {
    let item: MediaItemWithContext
    let isSelected: Bool
    let isSelectionMode: Bool
    let onTap: () -> Void
    let onNavigateToMessage: () -> Void
    let onShare: () -> Void
    let onDownload: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            // Selection checkbox
            if isSelectionMode {
                Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 22))
                    .foregroundColor(isSelected ? .meeshyPrimary : .secondary)
            }

            // File icon
            ZStack {
                RoundedRectangle(cornerRadius: 10)
                    .fill(fileIconColor.opacity(0.15))
                    .frame(width: 50, height: 50)

                Image(systemName: item.attachment.icon)
                    .font(.system(size: 22))
                    .foregroundColor(fileIconColor)
            }

            // Info
            VStack(alignment: .leading, spacing: 4) {
                Text(item.attachment.fileName)
                    .font(.system(size: 14, weight: .medium))
                    .lineLimit(1)

                HStack(spacing: 8) {
                    Text(item.attachment.fileExtension.uppercased())
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(.white)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(
                            Capsule()
                                .fill(fileIconColor)
                        )

                    Text(item.attachment.fileSizeFormatted)
                        .font(.system(size: 12))
                        .foregroundColor(.secondary)
                }

                if let senderName = item.senderName {
                    Text("\(senderName) • \(item.sentAt.formatted(date: .abbreviated, time: .shortened))")
                        .font(.system(size: 11))
                        .foregroundColor(Color(.systemGray))
                }
            }

            Spacer()

            // Actions
            if !isSelectionMode {
                Menu {
                    Button(action: onNavigateToMessage) {
                        Label("Voir le message", systemImage: "message")
                    }

                    Button(action: onShare) {
                        Label("Partager", systemImage: "square.and.arrow.up")
                    }

                    Button(action: onDownload) {
                        Label("Télécharger", systemImage: "arrow.down.circle")
                    }
                } label: {
                    Image(systemName: "ellipsis.circle")
                        .font(.system(size: 22))
                        .foregroundColor(.secondary)
                }
            }
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(Color(.systemGray6))
        )
        .contentShape(Rectangle())
        .onTapGesture(perform: onTap)
    }

    private var fileIconColor: Color {
        switch item.attachment.fileExtension.lowercased() {
        case "pdf": return .red
        case "doc", "docx": return .blue
        case "xls", "xlsx": return .green
        case "ppt", "pptx": return .orange
        case "zip", "rar", "7z": return .purple
        default: return .gray
        }
    }
}

// MARK: - Link Media Row

struct LinkMediaRow: View {
    let item: LinkItemWithContext
    let onNavigateToMessage: () -> Void

    @State private var linkPreview: LinkPreview?

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Link preview if available
            if let preview = linkPreview {
                LinkPreviewView(preview: preview)
            } else {
                HStack(spacing: 12) {
                    ZStack {
                        RoundedRectangle(cornerRadius: 10)
                            .fill(Color.blue.opacity(0.15))
                            .frame(width: 50, height: 50)

                        Image(systemName: "link")
                            .font(.system(size: 20))
                            .foregroundColor(.blue)
                    }

                    VStack(alignment: .leading, spacing: 4) {
                        Text(item.url)
                            .font(.system(size: 14, weight: .medium))
                            .foregroundColor(.blue)
                            .lineLimit(2)

                        if let senderName = item.senderName {
                            Text("\(senderName) • \(item.sentAt.formatted(date: .abbreviated, time: .shortened))")
                                .font(.system(size: 11))
                                .foregroundColor(Color(.systemGray))
                        }
                    }

                    Spacer()
                }
                .padding(12)
            }
        }
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(Color(.systemGray6))
        )
        .contextMenu {
            Button {
                if let url = URL(string: item.url) {
                    UIApplication.shared.open(url)
                }
            } label: {
                Label("Ouvrir", systemImage: "safari")
            }

            Button {
                UIPasteboard.general.string = item.url
            } label: {
                Label("Copier le lien", systemImage: "doc.on.doc")
            }

            Button(action: onNavigateToMessage) {
                Label("Voir le message", systemImage: "message")
            }
        }
        .onTapGesture {
            if let url = URL(string: item.url) {
                UIApplication.shared.open(url)
            }
        }
    }
}

// MARK: - Preview

#Preview {
    NavigationStack {
        ConversationMediaView(
            conversationId: "test-conversation-id",
            conversationTitle: "Test Conversation"
        )
    }
}
