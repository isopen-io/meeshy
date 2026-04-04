import SwiftUI
import PhotosUI
import CoreLocation
import Combine
import MeeshySDK
import MeeshyUI


// MARK: - Feed View
struct FeedView: View {
    @ObservedObject private var theme = ThemeManager.shared
    @EnvironmentObject private var router: Router
    @EnvironmentObject private var statusViewModel: StatusViewModel
    @StateObject var viewModel = FeedViewModel()
    @State private var searchText = ""
    @State var showComposer = false
    @FocusState var isComposerFocused: Bool
    @State private var composerBounce: Bool = false
    @State var composerText = ""
    @State private var expandedComments: Set<String> = []
    @State var postVisibility: String = "PUBLIC"
    @State private var showAudioComposer = false
    @State private var headerScrollOffset: CGFloat = 0

    // Impression tracking
    @State private var pendingImpressionIds = Set<String>()
    @State private var recordedImpressionIds = Set<String>()
    @State private var impressionTimer: Timer?

    // Attachment states
    @State var pendingAttachments: [MessageAttachment] = []
    @State var pendingMediaFiles: [String: URL] = [:]
    @State var pendingThumbnails: [String: UIImage] = [:]
    @State var pendingAudioURL: URL?
    @State var showPhotoPicker = false
    @State var selectedPhotoItems: [PhotosPickerItem] = []
    @State var showCamera = false
    @State var showFilePicker = false
    @State var showLocationPicker = false
    @State var isUploading = false
    @State var uploadProgress: UploadQueueProgress?
    @State var isLoadingMedia = false
    @StateObject var audioRecorder = AudioRecorderManager()
    @State private var pendingAttachmentType: String?
    @State var showEmojiPicker = false
    @State private var quoteTargetPost: FeedPost?

    var composerHasContent: Bool {
        !composerText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !pendingAttachments.isEmpty
    }

    private var posts: [FeedPost] { viewModel.posts }

    private var newPostsBannerText: String {
        let count = viewModel.newPostsCount
        let label = count > 1
            ? String(localized: "nouveaux posts", defaultValue: "nouveaux posts")
            : String(localized: "nouveau post", defaultValue: "nouveau post")
        return "\(count) \(label)"
    }

    var body: some View {
        ZStack {
            // Themed background
            theme.backgroundGradient.ignoresSafeArea()

            // Ambient orbs
            ForEach(0..<theme.ambientOrbs.count, id: \.self) { i in
                let orb = theme.ambientOrbs[i]
                Circle()
                    .fill(Color(hex: orb.color).opacity(orb.opacity))
                    .frame(width: orb.size, height: orb.size)
                    .blur(radius: orb.size / 3)
                    .offset(x: orb.offset.x, y: orb.offset.y)
            }

            feedScrollView

            VStack(spacing: 0) {
                CollapsibleHeader(
                    title: "Feeds",
                    scrollOffset: headerScrollOffset,
                    showBackButton: false,
                    titleColor: theme.textPrimary,
                    backArrowColor: MeeshyColors.indigo500,
                    backgroundColor: theme.backgroundPrimary
                )
                Spacer()
            }

            // Full-screen composer overlay
            if showComposer {
                composerOverlay
            }
        }
    }

    // MARK: - Composer Placeholder
    private var composerPlaceholder: some View {
        HStack(spacing: 12) {
            // Avatar
            ZStack {
                Circle()
                    .fill(
                        LinearGradient(
                            colors: [MeeshyColors.error, MeeshyColors.indigo300],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: 40, height: 40)

                Text("M")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundColor(.white)
            }

            // Text input placeholder
            Button(action: {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    showComposer = true
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                        isComposerFocused = true
                    }
                }
                HapticFeedback.light()
            }) {
                HStack {
                    Text(String(localized: "Partager quelque chose avec le monde...", defaultValue: "Partager quelque chose avec le monde..."))
                        .font(.system(size: 14))
                        .foregroundColor(theme.textMuted)
                    Spacer()
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .background(
                    RoundedRectangle(cornerRadius: 20)
                        .fill(theme.inputBackground)
                        .overlay(
                            RoundedRectangle(cornerRadius: 20)
                                .stroke(theme.inputBorder, lineWidth: 1)
                        )
                )
            }
            .buttonStyle(PlainButtonStyle())

            // Add content button (+)
            Menu {
                Button {
                    pendingAttachmentType = "photo"
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                        showComposer = true
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                            showPhotoPicker = true
                        }
                    }
                    HapticFeedback.light()
                } label: {
                    Label(
                        String(localized: "Photo ou video", defaultValue: "Photo ou vid\u{00E9}o"),
                        systemImage: "photo.fill"
                    )
                }

                Button {
                    pendingAttachmentType = "camera"
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                        showComposer = true
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                            showCamera = true
                        }
                    }
                    HapticFeedback.light()
                } label: {
                    Label(
                        String(localized: "Appareil photo", defaultValue: "Appareil photo"),
                        systemImage: "camera.fill"
                    )
                }

                Button {
                    showAudioComposer = true
                    HapticFeedback.light()
                } label: {
                    Label(
                        String(localized: "Enregistrement audio", defaultValue: "Enregistrement audio"),
                        systemImage: "mic.fill"
                    )
                }

                Button {
                    pendingAttachmentType = "file"
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                        showComposer = true
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                            showFilePicker = true
                        }
                    }
                    HapticFeedback.light()
                } label: {
                    Label(
                        String(localized: "Fichier", defaultValue: "Fichier"),
                        systemImage: "doc.fill"
                    )
                }

                Button {
                    pendingAttachmentType = "location"
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                        showComposer = true
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                            showLocationPicker = true
                        }
                    }
                    HapticFeedback.light()
                } label: {
                    Label(
                        String(localized: "Position", defaultValue: "Position"),
                        systemImage: "location.fill"
                    )
                }
            } label: {
                ZStack {
                    Circle()
                        .fill(
                            LinearGradient(
                                colors: [MeeshyColors.indigo300, MeeshyColors.info],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                        .frame(width: 40, height: 40)
                        .shadow(color: MeeshyColors.indigo300.opacity(0.4), radius: 8, y: 4)

                    Image(systemName: "plus")
                        .font(.system(size: 18, weight: .bold))
                        .foregroundColor(.white)
                }
            }
            .accessibilityLabel(String(localized: "Ajouter du contenu", defaultValue: "Ajouter du contenu"))
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 20)
                .fill(theme.surfaceGradient(tint: "4ECDC4"))
                .overlay(
                    RoundedRectangle(cornerRadius: 20)
                        .stroke(theme.border(tint: "4ECDC4", intensity: 0.25), lineWidth: 1)
                )
        )
        .padding(.horizontal, 16)
    }

    // MARK: - Feed Post Card
    @ViewBuilder
    private func feedPostCardView(for post: FeedPost) -> some View {
        let isOwnPost = post.authorId == AuthManager.shared.currentUser?.id
        FeedPostCard(
            post: post,
            isCommentsExpanded: expandedComments.contains(post.id),
            onToggleComments: {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    if expandedComments.contains(post.id) {
                        expandedComments.remove(post.id)
                    } else {
                        expandedComments.insert(post.id)
                    }
                }
                HapticFeedback.light()
            },
            onLike: { postId in
                Task { await viewModel.likePost(postId) }
            },
            onRepost: { postId in
                Task { await viewModel.repostPost(postId) }
            },
            onQuote: { postId in
                quoteTargetPost = viewModel.posts.first(where: { $0.id == postId })
            },
            onShare: { postId in
                Task { await viewModel.sharePost(postId) }
            },
            onBookmark: { postId in
                Task { await viewModel.bookmarkPost(postId) }
            },
            onSendComment: { postId, content, parentId in
                Task { await viewModel.sendComment(postId: postId, content: content, parentId: parentId) }
            },
            onLikeComment: { postId, commentId in
                Task { await viewModel.likeComment(postId: postId, commentId: commentId) }
            },
            onSelectLanguage: { postId, language in
                viewModel.setTranslationOverride(postId: postId, language: language)
            },
            onTapPost: { post in
                router.push(.postDetail(post.id, post))
                Task { try? await PostService.shared.viewPost(postId: post.id, duration: nil) }
            },
            onTapRepost: { repostId in
                router.push(.postDetail(repostId))
            },
            onDelete: isOwnPost ? { postId in
                Task { await viewModel.deletePost(postId) }
            } : nil,
            onReport: !isOwnPost ? { postId in
                Task { await viewModel.reportPost(postId) }
            } : nil,
            onPin: isOwnPost ? { postId in
                Task { await viewModel.pinPost(postId) }
            } : nil,
            authorMoodEmoji: statusViewModel.statusForUser(userId: post.authorId)?.moodEmoji,
            onAuthorMoodTap: statusViewModel.moodTapHandler(for: post.authorId),
            moodLookup: { userId in
                (emoji: statusViewModel.statusForUser(userId: userId)?.moodEmoji,
                 tapHandler: statusViewModel.moodTapHandler(for: userId))
            }
        )
        .equatable()
    }

    // MARK: - Feed Scroll View
    private var feedScrollView: some View {
        ScrollViewReader { scrollProxy in
            ScrollView(showsIndicators: false) {
                LazyVStack(spacing: 16) {
                    // Scroll offset detector
                    GeometryReader { geo in
                        Color.clear.preference(
                            key: ScrollOffsetPreferenceKey.self,
                            value: geo.frame(in: .named("feedScroll")).minY
                        )
                    }
                    .frame(height: 0)
                    .id("feed-top")

                    Color.clear.frame(height: CollapsibleHeaderMetrics.expandedHeight)

                    // Composer placeholder
                    composerPlaceholder
                        .padding(.bottom, 8)

                    // Error state
                    if let error = viewModel.error {
                        VStack(spacing: 12) {
                            Image(systemName: "exclamationmark.triangle")
                                .font(.largeTitle)
                                .foregroundStyle(.secondary)
                                .accessibilityHidden(true)
                            Text(String(localized: "Impossible de charger le fil", defaultValue: "Impossible de charger le fil"))
                                .font(.headline)
                            Text(error)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            Button(String(localized: "Reessayer", defaultValue: "Reessayer")) {
                                Task { await viewModel.loadFeed() }
                            }
                            .buttonStyle(.bordered)
                        }
                        .accessibilityElement(children: .combine)
                        .padding()
                    }

                    // Empty state when no posts and no error
                    if viewModel.hasLoaded && viewModel.posts.isEmpty && !viewModel.isLoading && viewModel.error == nil {
                        ContentUnavailableView {
                            Label(
                                String(localized: "Aucune publication", defaultValue: "Aucune publication"),
                                systemImage: "text.bubble"
                            )
                        } description: {
                            Text(String(localized: "Les publications de vos contacts apparaitront ici", defaultValue: "Les publications de vos contacts apparaitront ici"))
                        }
                    }

                    // Posts with infinite scroll
                    ForEach(posts) { post in
                        feedPostCardView(for: post)
                            .onAppear {
                                Task { await viewModel.loadMoreIfNeeded(currentPost: post) }
                                trackImpression(postId: post.id)
                            }
                    }

                    // Loading more indicator
                    if viewModel.isLoadingMore {
                        ProgressView()
                            .tint(MeeshyColors.indigo300)
                            .padding()
                    }
                }
                .padding(.top, 12)
                .padding(.bottom, 100)
            }
            .coordinateSpace(name: "feedScroll")
            .onPreferenceChange(ScrollOffsetPreferenceKey.self) { offset in
                headerScrollOffset = offset
            }
            .refreshable {
                await viewModel.refresh()
            }
            .overlay(alignment: .top) {
                // "New posts" banner
                if viewModel.newPostsCount > 0 {
                    Button {
                        withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
                            scrollProxy.scrollTo("feed-top", anchor: .top)
                        }
                        viewModel.acknowledgeNewPosts()
                        HapticFeedback.light()
                    } label: {
                        HStack(spacing: 8) {
                            Image(systemName: "arrow.up")
                                .font(.system(size: 12, weight: .bold))

                            Text(newPostsBannerText)
                                .font(.system(size: 14, weight: .semibold))
                        }
                        .foregroundColor(.white)
                        .padding(.horizontal, 20)
                        .padding(.vertical, 10)
                        .background(
                            Capsule()
                                .fill(
                                    LinearGradient(
                                        colors: [MeeshyColors.indigo300, MeeshyColors.info],
                                        startPoint: .leading,
                                        endPoint: .trailing
                                    )
                                )
                                .shadow(color: MeeshyColors.indigo300.opacity(0.5), radius: 12, y: 4)
                        )
                    }
                    .buttonStyle(PlainButtonStyle())
                    .padding(.top, 120)
                    .transition(.move(edge: .top).combined(with: .opacity))
                    .animation(.spring(response: 0.4, dampingFraction: 0.75), value: viewModel.newPostsCount)
                }
            }
        }
        .task {
            if viewModel.posts.isEmpty {
                await viewModel.loadFeed()
            }
            viewModel.subscribeToSocketEvents()
        }
        .onDisappear {
            viewModel.unsubscribeFromSocketEvents()
        }
        .sheet(isPresented: $showAudioComposer) {
            AudioPostComposerView { audioURL, mimeType, transcription in
                showAudioComposer = false
                Task {
                    await publishAudioPost(audioURL: audioURL, mimeType: mimeType, transcription: transcription)
                }
            }
        }
    }

    // MARK: - Composer Overlay
    private var composerOverlay: some View {
        ZStack {
            // Backdrop
            Color.black.opacity(0.6)
                .ignoresSafeArea()
                .onTapGesture {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                        showComposer = false
                        isComposerFocused = false
                    }
                }

            // Composer card
            VStack(spacing: 0) {
                // Header
                HStack {
                    Button {
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                            showComposer = false
                            isComposerFocused = false
                            composerText = ""
                        }
                    } label: {
                        Text(String(localized: "Annuler", defaultValue: "Annuler"))
                            .font(.system(size: 15, weight: .medium))
                            .foregroundColor(theme.textSecondary)
                    }

                    Spacer()

                    Text(String(localized: "Nouveau post", defaultValue: "Nouveau post"))
                        .font(.system(size: 16, weight: .bold))
                        .foregroundColor(theme.textPrimary)

                    Spacer()

                    Button {
                        publishPostWithAttachments()
                    } label: {
                        if isUploading {
                            ProgressView()
                                .tint(MeeshyColors.indigo300)
                                .scaleEffect(0.8)
                        } else {
                            Text(String(localized: "Publier", defaultValue: "Publier"))
                                .font(.system(size: 15, weight: .bold))
                                .foregroundColor(composerHasContent ? MeeshyColors.indigo300 : theme.textMuted)
                        }
                    }
                    .disabled(!composerHasContent || isUploading)
                }
                .padding(16)
                .background(theme.backgroundSecondary)

                Divider().background(theme.inputBorder)

                // User row
                HStack(spacing: 12) {
                    ZStack {
                        Circle()
                            .fill(
                                LinearGradient(
                                    colors: [MeeshyColors.error, MeeshyColors.indigo300],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                )
                            )
                            .frame(width: 40, height: 40)

                        Text("M")
                            .font(.system(size: 16, weight: .bold))
                            .foregroundColor(.white)
                    }

                    VStack(alignment: .leading, spacing: 2) {
                        Text(String(localized: "Moi", defaultValue: "Moi"))
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundColor(theme.textPrimary)

                        Menu {
                            Button { postVisibility = "PUBLIC" } label: {
                                Label(String(localized: "Public", defaultValue: "Public"), systemImage: "globe")
                            }
                            Button { postVisibility = "FRIENDS" } label: {
                                Label(String(localized: "Amis", defaultValue: "Amis"), systemImage: "person.2")
                            }
                            Button { postVisibility = "PRIVATE" } label: {
                                Label(String(localized: "Prive", defaultValue: "Priv\u{00E9}"), systemImage: "lock")
                            }
                        } label: {
                            HStack(spacing: 4) {
                                Image(systemName: postVisibility == "PUBLIC" ? "globe" : postVisibility == "FRIENDS" ? "person.2" : "lock")
                                    .font(.system(size: 10))
                                Text(postVisibility == "PUBLIC" ? String(localized: "Public", defaultValue: "Public") : postVisibility == "FRIENDS" ? String(localized: "Amis", defaultValue: "Amis") : String(localized: "Prive", defaultValue: "Priv\u{00E9}"))
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
                        Text(String(localized: "Qu'avez-vous en tete ?", defaultValue: "Qu'avez-vous en t\u{00EA}te ?"))
                            .font(.system(size: 17))
                            .foregroundColor(theme.textMuted)
                            .padding(.horizontal, 16)
                            .padding(.top, 12)
                    }

                    TextEditor(text: $composerText)
                        .focused($isComposerFocused)
                        .scrollContentBackground(.hidden)
                        .foregroundColor(theme.textPrimary)
                        .font(.system(size: 17))
                        .frame(minHeight: 120)
                        .padding(.horizontal, 12)
                        .padding(.top, 4)
                }
                .scaleEffect(composerBounce ? 1.01 : 1.0)
                .onChange(of: isComposerFocused) { _, newValue in
                    withAnimation(.spring(response: 0.35, dampingFraction: 0.55)) {
                        composerBounce = newValue
                    }
                }

                // Pending attachments preview
                if !pendingAttachments.isEmpty || isLoadingMedia {
                    feedPendingAttachmentsRow
                }

                // Upload progress
                if isUploading, let progress = uploadProgress {
                    UploadProgressBar(progress: progress, accentColor: "4ECDC4")
                        .padding(.horizontal, 16)
                        .padding(.bottom, 4)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }

                Spacer(minLength: 0)

                // Toolbar
                HStack(spacing: 24) {
                    Button { showPhotoPicker = true; HapticFeedback.light() } label: {
                        Image(systemName: "photo.fill")
                            .font(.system(size: 20))
                            .foregroundColor(Color(hex: "4ECDC4"))
                    }
                    .accessibilityLabel(String(localized: "Ajouter une photo", defaultValue: "Ajouter une photo"))
                    Button { showCamera = true; HapticFeedback.light() } label: {
                        Image(systemName: "camera.fill")
                            .font(.system(size: 20))
                            .foregroundColor(Color(hex: "FF6B6B"))
                    }
                    .accessibilityLabel(String(localized: "Prendre une photo", defaultValue: "Prendre une photo"))
                    Button { showEmojiPicker = true; HapticFeedback.light() } label: {
                        Image(systemName: "face.smiling.fill")
                            .font(.system(size: 20))
                            .foregroundColor(Color(hex: "F8B500"))
                    }
                    .accessibilityLabel(String(localized: "Ajouter un emoji", defaultValue: "Ajouter un emoji"))
                    Button { showFilePicker = true; HapticFeedback.light() } label: {
                        Image(systemName: "doc.fill")
                            .font(.system(size: 20))
                            .foregroundColor(Color(hex: "9B59B6"))
                    }
                    .accessibilityLabel(String(localized: "Joindre un fichier", defaultValue: "Joindre un fichier"))
                    Button { showLocationPicker = true; HapticFeedback.light() } label: {
                        Image(systemName: "location.fill")
                            .font(.system(size: 20))
                            .foregroundColor(Color(hex: "2ECC71"))
                    }
                    .accessibilityLabel(String(localized: "Partager la position", defaultValue: "Partager la position"))
                    Button { showAudioComposer = true; HapticFeedback.light() } label: {
                        Image(systemName: "mic.fill")
                            .font(.system(size: 20))
                            .foregroundColor(Color(hex: "FF2E63"))
                    }
                    .accessibilityLabel(String(localized: "Enregistrer un audio", defaultValue: "Enregistrer un audio"))

                    Spacer()
                }
                .padding(16)
                .background(theme.backgroundSecondary)
            }
            .background(theme.backgroundPrimary)
            .clipShape(RoundedRectangle(cornerRadius: 24))
            .overlay(
                RoundedRectangle(cornerRadius: 24)
                    .stroke(theme.border(tint: "4ECDC4", intensity: 0.3), lineWidth: 1)
            )
            .padding(.horizontal, 16)
            .padding(.vertical, 80)
            .shadow(color: MeeshyColors.indigo300.opacity(0.2), radius: 30, y: 20)
        }
        .transition(.opacity.combined(with: .scale(scale: 0.95)))
        .zIndex(200)
        .photosPicker(isPresented: $showPhotoPicker, selection: $selectedPhotoItems, maxSelectionCount: 10, matching: .any(of: [.images, .videos]))
        .fileImporter(isPresented: $showFilePicker, allowedContentTypes: [.item], allowsMultipleSelection: true) { result in
            handleFeedFileImport(result)
        }
        .fullScreenCover(isPresented: $showCamera) {
            CameraView { result in
                switch result {
                case .photo(let image):
                    handleFeedCameraCapture(image)
                case .video(let url):
                    handleFeedCameraVideo(url)
                }
            }
            .ignoresSafeArea()
        }
        .sheet(isPresented: $showLocationPicker) {
            LocationPickerView(accentColor: "4ECDC4") { coordinate, address in
                handleFeedLocationSelection(coordinate: coordinate, address: address)
            }
        }
        .sheet(isPresented: $showEmojiPicker) {
            EmojiPickerSheet(quickReactions: ["😀", "❤️", "🔥", "👍", "😂", "🎉"]) { emoji in
                composerText += emoji
                showEmojiPicker = false
            }
            .presentationDetents([.medium, .large])
        }
        .onChange(of: selectedPhotoItems) { _, items in
            handleFeedPhotoSelection(items)
        }
        .fullScreenCover(item: $quoteTargetPost) { quoted in
            FeedComposerSheet(
                viewModel: viewModel,
                initialText: "",
                pendingAttachmentType: nil,
                quotePost: quoted,
                onDismiss: {
                    quoteTargetPost = nil
                }
            )
        }
    }
    // MARK: - Impression Tracking

    private func trackImpression(postId: String) {
        guard !recordedImpressionIds.contains(postId) else { return }
        pendingImpressionIds.insert(postId)
        scheduleImpressionFlush()
    }

    private func scheduleImpressionFlush() {
        impressionTimer?.invalidate()
        let ids = pendingImpressionIds
        impressionTimer = Timer.scheduledTimer(withTimeInterval: 3.0, repeats: false) { _ in
            let batch = Array(ids)
            Task { @MainActor in
                recordedImpressionIds.formUnion(batch)
                pendingImpressionIds.subtract(batch)
                try? await PostService.shared.recordImpressions(postIds: batch)
            }
        }
    }
}

// See FeedPostCard.swift, FeedPostCard+Media.swift
// See FeedCommentsSheet.swift (CommentsSheetView, CommentRowView, FeedCard)
