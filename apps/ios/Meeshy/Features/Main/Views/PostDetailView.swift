import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

struct PostDetailView: View {
    let postId: String
    var initialPost: FeedPost?
    var showComments: Bool = false

    @StateObject private var viewModel = PostDetailViewModel()
    private var theme: ThemeManager { ThemeManager.shared }
    @EnvironmentObject private var statusViewModel: StatusViewModel
    @EnvironmentObject private var storyViewModel: StoryViewModel
    @EnvironmentObject private var router: Router
    @State private var showTranslationSheet = false
    @State private var selectedProfileUser: ProfileSheetUser?
    @State private var likeScale: CGFloat = 1.0
    @State private var secondaryLangCode: String? = nil
    @State private var activeDisplayLangCode: String? = nil
    @State private var fullscreenMediaId: String? = nil
    @State private var showFullscreenGallery = false
    @State private var composerLanguage: String = DefaultComposerLanguage.resolve()
    @State private var commentBlurEnabled: Bool = false
    @State private var commentEffects: MessageEffects = .none
    @State private var composerFocusTrigger: Bool = false
    @State private var isTextExpanded = false

    // Post reaction state — socket-driven, hoisted to this view (single-post context).
    // PostDetailView joins the post:{postId} room on appear and leaves on disappear,
    // enabling real-time reaction updates from other users.
    @State private var postLikedIds: Set<String> = []
    @State private var postLikeDelta: [String: Int] = [:]
    @State private var postHeartInFlightIds: Set<String> = []

    private var detailIsLiked: Bool { postLikedIds.contains(postId) }
    private var detailLikeCount: Int {
        guard let post = displayPost else { return 0 }
        return max(0, post.likes + (postLikeDelta[postId] ?? 0))
    }

    // MARK: - Post Heart Toggle (socket-driven, post detail)

    @MainActor
    private func toggleDetailPostHeart() {
        Task {
            guard !postHeartInFlightIds.contains(postId) else { return }
            postHeartInFlightIds.insert(postId)
            defer {
                Task { @MainActor in
                    postHeartInFlightIds.remove(postId)
                }
            }
            let wasLiked = postLikedIds.contains(postId)
            // Optimistic update
            if wasLiked {
                postLikedIds.remove(postId)
                postLikeDelta[postId, default: 0] -= 1
            } else {
                postLikedIds.insert(postId)
                postLikeDelta[postId, default: 0] += 1
            }
            do {
                if wasLiked {
                    _ = try await SocialSocketManager.shared.removePostReaction(
                        postId: postId, emoji: StoryViewerView.heartEmoji
                    )
                } else {
                    _ = try await SocialSocketManager.shared.addPostReaction(
                        postId: postId, emoji: StoryViewerView.heartEmoji
                    )
                }
            } catch {
                // Rollback optimistic update on failure
                if wasLiked {
                    postLikedIds.insert(postId)
                    postLikeDelta[postId, default: 0] += 1
                } else {
                    postLikedIds.remove(postId)
                    postLikeDelta[postId, default: 0] -= 1
                }
            }
        }
    }

    private var displayPost: FeedPost? { viewModel.post ?? initialPost }

    private var accentColor: String {
        displayPost?.authorColor ?? "6366F1"
    }

    // MARK: - Prisme Linguistique

    private var currentDisplayLangCode: String {
        guard let post = displayPost else { return "fr" }
        return activeDisplayLangCode ?? post.translations?.keys.first(where: { lang in
            AuthManager.shared.currentUser?.preferredContentLanguages.contains(where: { $0.caseInsensitiveCompare(lang) == .orderedSame }) ?? false
        })?.lowercased() ?? post.originalLanguage?.lowercased() ?? "fr"
    }

    private var effectiveContent: String {
        guard let post = displayPost else { return "" }
        let code = currentDisplayLangCode
        if code == post.originalLanguage?.lowercased() { return post.content }
        if let translation = post.translations?[code] ?? post.translations?.first(where: { $0.key.lowercased() == code })?.value {
            return translation.text
        }
        return post.displayContent
    }

    private var textTruncation: (text: String, isTruncated: Bool) {
        let words = effectiveContent.split(separator: " ", omittingEmptySubsequences: true)
        if words.count <= 60 { return (effectiveContent, false) }
        let truncated = words.prefix(60).joined(separator: " ")
        return (truncated, true)
    }

    private var secondaryContent: String? {
        guard let post = displayPost, let code = secondaryLangCode else { return nil }
        if code == post.originalLanguage?.lowercased() { return post.content }
        return post.translations?.first(where: { $0.key.lowercased() == code })?.value.text
    }

    private func buildAvailableFlags() -> [String] {
        guard let post = displayPost, let origLang = post.originalLanguage?.lowercased() else { return [] }
        let activeLang = currentDisplayLangCode
        let user = AuthManager.shared.currentUser
        var all: [String] = [origLang]
        var seen: Set<String> = [origLang]
        for lang in user?.preferredContentLanguages ?? [] {
            let l = lang.lowercased()
            if !seen.contains(l), post.translations?.keys.contains(where: { $0.lowercased() == l }) == true {
                all.append(l); seen.insert(l)
            }
        }
        return all.filter { $0 != activeLang }
    }

    private func handleFlagTap(_ code: String) {
        guard let post = displayPost else { return }
        let isOriginal = code == post.originalLanguage?.lowercased()
        let hasContent = isOriginal || post.translations?.keys.contains(where: { $0.lowercased() == code }) == true
        if !hasContent { HapticFeedback.light(); return }
        if isOriginal {
            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                activeDisplayLangCode = code; secondaryLangCode = nil
            }
        } else {
            let isShowing = secondaryLangCode == code
            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                secondaryLangCode = isShowing ? nil : code
            }
        }
        HapticFeedback.light()
    }

    // Scrollable post-detail content (text, media, repost, actions, comments).
    // Extracted from `body` into its own @ViewBuilder unit so the Swift
    // type-checker stays within budget — inlining the threaded-comment
    // ForEach made `body` exceed the reasonable type-check time.
    @ViewBuilder
    private func postDetailContent(_ post: FeedPost) -> some View {
        // ZONE 1: Text
        textZone(post)

        // ZONE 2: Media
        if post.hasMedia {
            detailMediaSection(post.media)
                .padding(.horizontal, 16)
                .padding(.top, 8)
        }

        // Repost embed
        if let repost = post.repost {
            repostEmbed(repost)
        }

        // Actions bar
        actionsBar(post)

        // Separator + Comments (ZONE 3)
        Rectangle()
            .fill(theme.inputBorder.opacity(0.5))
            .frame(height: 1)
            .padding(.horizontal, 16)

        commentsHeader
            .id("commentsSection")

        // Comments (threaded)
        ForEach(viewModel.topLevelComments) { comment in
            ThreadedCommentSection(
                comment: comment,
                replies: viewModel.repliesFor(comment.id),
                isExpanded: viewModel.expandedThreads.contains(comment.id),
                isLoadingReplies: viewModel.loadingReplies.contains(comment.id),
                accentColor: accentColor,
                // PostDetailView relays comment likes straight to the server via
                // onLikeComment and does not maintain the optimistic like state
                // (likedIds / likeDelta / heartInFlightIds) that FeedCommentsSheet does.
                likedIds: [],
                likeDelta: [:],
                heartInFlightIds: [],
                onReply: { target in
                    viewModel.replyingTo = target
                },
                onToggleThread: {
                    Task { await viewModel.toggleThread(comment.id, postId: postId) }
                },
                onLikeComment: { commentId in
                    Task {
                        try? await PostService.shared.likeComment(postId: postId, commentId: commentId)
                    }
                },
                moodEmoji: statusViewModel.statusForUser(userId: comment.authorId)?.moodEmoji,
                storyState: storyViewModel.storyGroupForUser(userId: comment.authorId).map { $0.hasUnviewed ? .unread : .read } ?? .none,
                presenceState: PresenceManager.shared.presenceMap[comment.authorId]?.state ?? .offline,
                replyMoodResolver: { statusViewModel.statusForUser(userId: $0)?.moodEmoji },
                replyStoryResolver: { storyViewModel.storyGroupForUser(userId: $0).map { $0.hasUnviewed ? .unread : .read } ?? .none },
                replyPresenceResolver: { PresenceManager.shared.presenceMap[$0]?.state ?? .offline }
            )
            .padding(.horizontal, 16)
        }

        if viewModel.isLoadingComments {
            ProgressView()
                .padding()
        }

        if viewModel.hasMoreComments && !viewModel.isLoadingComments {
            Button {
                Task { await viewModel.loadMoreComments(postId) }
            } label: {
                Text("Charger plus")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(MeeshyColors.indigo500)
            }
            .padding()
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            navBar

            // Connection status banner (banner manages its own socket observation)
            ConnectionBanner()

            if let post = displayPost {
                ScrollViewReader { scrollProxy in
                ScrollView(showsIndicators: false) {
                    LazyVStack(spacing: 0) {
                        postDetailContent(post)
                    }
                    .padding(.bottom, 80)
                }
                .onAppear {
                    if showComments {
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                            withAnimation {
                                scrollProxy.scrollTo("commentsSection", anchor: .top)
                            }
                            composerFocusTrigger.toggle()
                        }
                    }
                }
                } // ScrollViewReader
            } else if viewModel.isLoading {
                Spacer()
                ProgressView()
                Spacer()
            }

            composer
        }
        .background(theme.backgroundGradient.ignoresSafeArea())
        .navigationBarHidden(true)
        .task {
            // Wire persistence layer on first appearance
            if viewModel.commentStore == nil {
                let deps = DependencyContainer.shared
                let commentStore = CommentStore(postId: postId, persistence: deps.feedPersistence)
                viewModel.setupPersistence(commentStore: commentStore, persistence: deps.feedPersistence)
                await commentStore.loadInitial()
            }

            if viewModel.post == nil {
                await viewModel.loadPost(postId)
            }
            // Seed liked state from initial/cached post (post.isLiked is derived from
            // APIPost.currentUserReactions / isLikedByMe by the SDK).
            if let post = displayPost, post.isLiked {
                postLikedIds.insert(postId)
            }
            await viewModel.loadComments(postId)
            viewModel.subscribeToSocket(postId)
            // Join the post room for real-time reaction events (single focused post).
            SocialSocketManager.shared.joinPostRoom(postId: postId)
            // Record view when post detail is opened
            try? await PostService.shared.viewPost(postId: postId, duration: nil)
        }
        .onDisappear {
            SocialSocketManager.shared.leavePostRoom(postId: postId)
        }
        .onChange(of: viewModel.post) { _, updatedPost in
            // Re-seed when post loads from network (stale → fresh). Preserve
            // optimistic state: only update if no in-flight toggle is active.
            guard let updatedPost, !postHeartInFlightIds.contains(postId) else { return }
            if updatedPost.isLiked {
                postLikedIds.insert(postId)
            } else {
                postLikedIds.remove(postId)
            }
        }
        .onReceive(SocialSocketManager.shared.postReactionAdded.receive(on: DispatchQueue.main)) { event in
            let heart = StoryViewerView.heartEmoji
            guard event.emoji == heart, event.postId == postId else { return }
            let currentUserId = AuthManager.shared.currentUser?.id
            if event.userId == currentUserId {
                postLikedIds.insert(postId)
            } else {
                postLikeDelta[postId, default: 0] += 1
            }
        }
        .onReceive(SocialSocketManager.shared.postReactionRemoved.receive(on: DispatchQueue.main)) { event in
            let heart = StoryViewerView.heartEmoji
            guard event.emoji == heart, event.postId == postId else { return }
            let currentUserId = AuthManager.shared.currentUser?.id
            if event.userId == currentUserId {
                postLikedIds.remove(postId)
            } else {
                postLikeDelta[postId, default: 0] -= 1
            }
        }
        .sheet(isPresented: $showTranslationSheet) {
            if let post = displayPost {
                PostTranslationSheet(
                    post: post,
                    onSelectLanguage: { language in
                        let langLower = language.lowercased()
                        let isOriginal = langLower == post.originalLanguage?.lowercased()
                        let hasTranslation = isOriginal || post.translations?.keys.contains(where: { $0.lowercased() == langLower }) == true
                        if hasTranslation {
                            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                                activeDisplayLangCode = langLower
                                secondaryLangCode = nil
                            }
                        }
                    }
                )
            }
        }
        .sheet(item: $selectedProfileUser) { user in
            UserProfileSheet(
                user: user,
                moodEmoji: statusViewModel.statusForUser(userId: user.userId ?? "")?.moodEmoji,
                onMoodTap: statusViewModel.moodTapHandler(for: user.userId ?? "")
            )
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
        }
        .fullScreenCover(isPresented: $showFullscreenGallery) {
            if let post = displayPost {
                let attachments = post.media
                    .filter { $0.type == .image || $0.type == .video }
                    .map { $0.toMessageAttachment() }
                ConversationMediaGalleryView(
                    allAttachments: attachments,
                    startAttachmentId: fullscreenMediaId ?? attachments.first?.id ?? "",
                    accentColor: accentColor
                )
            }
        }
    }

    // MARK: - Nav Bar (minimal: < and ...)

    private var navBar: some View {
        HStack {
            Button {
                HapticFeedback.light()
                router.pop()
            } label: {
                Image(systemName: "chevron.left")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(theme.textPrimary)
                    .frame(width: 36, height: 36)
                    .background(Circle().fill(theme.inputBackground))
            }

            Spacer()

            Menu {
                Button {
                    HapticFeedback.light()
                } label: {
                    Label("Copier le lien", systemImage: "link")
                }
                Button(role: .destructive) {
                    HapticFeedback.light()
                } label: {
                    Label("Signaler", systemImage: "exclamationmark.triangle")
                }
            } label: {
                Image(systemName: "ellipsis")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(theme.textPrimary)
                    .frame(width: 36, height: 36)
                    .background(Circle().fill(theme.inputBackground))
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
    }

    // MARK: - Text Zone

    @ViewBuilder
    private func textZone(_ post: FeedPost) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            // Author header
            HStack(spacing: 12) {
                MeeshyAvatar(
                    name: post.author,
                    context: .postAuthor,
                    accentColor: post.authorColor,
                    avatarURL: post.authorAvatarURL,
                    moodEmoji: statusViewModel.statusForUser(userId: post.authorId)?.moodEmoji,
                    onViewProfile: { selectedProfileUser = .from(feedPost: post) },
                    onMoodTap: statusViewModel.moodTapHandler(for: post.authorId),
                    contextMenuItems: [
                        AvatarContextMenuItem(label: "Voir le profil", icon: "person.fill") {
                            selectedProfileUser = .from(feedPost: post)
                        }
                    ]
                )

                VStack(alignment: .leading, spacing: 2) {
                    Text(post.author)
                        .font(.system(size: 15, weight: .bold))
                        .foregroundColor(theme.textPrimary)
                        .onTapGesture {
                            selectedProfileUser = .from(feedPost: post)
                        }

                    HStack(spacing: 4) {
                        Text(post.timestamp, style: .relative)
                            .font(.system(size: 12))
                            .foregroundColor(theme.textMuted)

                        let flags = buildAvailableFlags()
                        if !flags.isEmpty || (post.translations != nil && !post.translations!.isEmpty) {
                            Text("·").font(.system(size: 12)).foregroundColor(theme.textMuted)

                            ForEach(flags, id: \.self) { code in
                                let display = LanguageDisplay.from(code: code)
                                let isActive = code == secondaryLangCode
                                VStack(spacing: 1) {
                                    Text(display?.flag ?? "?")
                                        .font(.system(size: isActive ? 12 : 10))
                                        .scaleEffect(isActive ? 1.05 : 1.0)
                                    if isActive {
                                        RoundedRectangle(cornerRadius: 1)
                                            .fill(Color(hex: display?.color ?? LanguageDisplay.defaultColor))
                                            .frame(width: 10, height: 1.5)
                                    }
                                }
                                .animation(.easeInOut(duration: 0.2), value: isActive)
                                .onTapGesture { handleFlagTap(code) }
                            }

                            if post.translations != nil, !post.translations!.isEmpty {
                                Image(systemName: "translate")
                                    .font(.system(size: 10, weight: .medium))
                                    .foregroundColor(MeeshyColors.indigo400)
                                    .onTapGesture {
                                        HapticFeedback.light()
                                        showTranslationSheet = true
                                    }
                            }
                        }
                    }
                }

                Spacer()
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)

            // Content with truncation
            let truncation = textTruncation
            Group {
                if truncation.isTruncated && !isTextExpanded {
                    Text(truncation.text + "... ")
                        .font(.system(size: 16))
                        .foregroundColor(theme.textPrimary)
                    + Text("voir plus")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(Color(hex: accentColor))
                } else if truncation.isTruncated && isTextExpanded {
                    Text(effectiveContent + " ")
                        .font(.system(size: 16))
                        .foregroundColor(theme.textPrimary)
                    + Text("voir moins")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(Color(hex: accentColor))
                } else {
                    Text(effectiveContent)
                        .font(.system(size: 16))
                        .foregroundColor(theme.textPrimary)
                }
            }
            .fixedSize(horizontal: false, vertical: true)
            .textSelection(.enabled)
            .padding(.horizontal, 16)
            .onTapGesture {
                if truncation.isTruncated {
                    withAnimation(.easeInOut(duration: 0.25)) {
                        isTextExpanded.toggle()
                    }
                    if isTextExpanded {
                        Task { try? await PostService.shared.viewPost(postId: postId, duration: nil) }
                    }
                }
            }

            // Inline secondary translation panel
            if let content = secondaryContent, let code = secondaryLangCode {
                let langColor = Color(hex: LanguageDisplay.colorHex(for: code))
                let display = LanguageDisplay.from(code: code)
                VStack(spacing: 0) {
                    HStack(spacing: 6) {
                        Rectangle().fill(langColor.opacity(0.4)).frame(height: 1)
                        Circle().fill(langColor).frame(width: 4, height: 4)
                        Rectangle().fill(langColor.opacity(0.4)).frame(height: 1)
                    }
                    VStack(alignment: .leading, spacing: 4) {
                        if let display {
                            HStack(spacing: 4) {
                                Text(display.flag).font(.system(size: 11))
                                Text(display.name)
                                    .font(.system(size: 10, weight: .semibold))
                                    .foregroundColor(langColor)
                            }
                        }
                        Text(content)
                            .font(.system(size: 14))
                            .foregroundColor(theme.textPrimary.opacity(0.8))
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .padding(.vertical, 8)
                    .padding(.horizontal, 10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(langColor.opacity(0.08))
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                }
                .padding(.horizontal, 16)
                .padding(.top, 6)
                .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
    }

    // MARK: - Repost Embed

    @State private var repostSecondaryLangCode: String? = nil
    @State private var repostActiveDisplayLangCode: String? = nil

    @ViewBuilder
    private func repostEmbed(_ repost: RepostContent) -> some View {
        let isStoryRepost = (repost.type ?? "").uppercased() == "STORY"

        VStack(alignment: .leading, spacing: 0) {
            // Author header — always tappable to navigate
            Button {
                HapticFeedback.light()
                router.push(.postDetail(repost.id))
            } label: {
                HStack(spacing: 8) {
                    MeeshyAvatar(
                        name: repost.author,
                        context: .postComment,
                        accentColor: repost.authorColor,
                        avatarURL: repost.authorAvatarURL
                    )
                    VStack(alignment: .leading, spacing: 2) {
                        Text(repost.author)
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundColor(theme.accentText(repost.authorColor))
                        HStack(spacing: 4) {
                            Text(repost.timestamp, style: .relative)
                                .font(.system(size: 11))
                                .foregroundColor(theme.textMuted)
                            // Language flags for repost translations
                            if let translations = repost.translations, !translations.isEmpty {
                                repostLanguageFlags(repost)
                            }
                        }
                    }
                    Spacer()
                }
            }
            .buttonStyle(PlainButtonStyle())
            .padding(.horizontal, 12)
            .padding(.top, 10)
            .padding(.bottom, 6)

            // Text content with translation support
            if !repost.content.isEmpty {
                let repostDisplayContent = repostEffectiveContent(repost)
                Text(repostDisplayContent)
                    .font(.system(size: 14))
                    .foregroundColor(theme.textPrimary)
                    .lineLimit(6)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.horizontal, 12)
                    .padding(.bottom, 6)

                // Inline secondary translation for repost
                if let code = repostSecondaryLangCode,
                   let secondaryText = repostSecondaryContent(repost, code: code) {
                    let langColor = Color(hex: LanguageDisplay.colorHex(for: code))
                    let display = LanguageDisplay.from(code: code)
                    VStack(spacing: 0) {
                        HStack(spacing: 6) {
                            Rectangle().fill(langColor.opacity(0.4)).frame(height: 1)
                            Circle().fill(langColor).frame(width: 3, height: 3)
                            Rectangle().fill(langColor.opacity(0.4)).frame(height: 1)
                        }
                        VStack(alignment: .leading, spacing: 3) {
                            if let display {
                                HStack(spacing: 3) {
                                    Text(display.flag).font(.system(size: 10))
                                    Text(display.name)
                                        .font(.system(size: 9, weight: .semibold))
                                        .foregroundColor(langColor)
                                }
                            }
                            Text(secondaryText)
                                .font(.system(size: 13))
                                .foregroundColor(theme.textPrimary.opacity(0.8))
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        .padding(.vertical, 6)
                        .padding(.horizontal, 8)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(langColor.opacity(0.08))
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                    }
                    .padding(.horizontal, 12)
                    .padding(.bottom, 6)
                    .transition(.opacity.combined(with: .move(edge: .top)))
                }
            }

            // Story-type repost — render the canvas
            if isStoryRepost {
                StoryReaderRepresentable(
                    repost: repost,
                    preferredContentLanguages: AuthManager.shared.currentUser?.preferredContentLanguages,
                    mute: true
                )
                .aspectRatio(9.0 / 16.0, contentMode: .fit)
                .frame(maxWidth: .infinity)
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .padding(.horizontal, 12)
                .padding(.bottom, 8)
            } else if !repost.media.isEmpty {
                // Standard media attachments
                detailMediaSection(repost.media)
                    .padding(.horizontal, 12)
                    .padding(.bottom, 8)
            }

            // Audio URL (legacy story audio)
            if let audioUrl = repost.audioUrl, !audioUrl.isEmpty, !isStoryRepost {
                AudioPlayerView(
                    attachment: MeeshyMessageAttachment(
                        id: "repost-audio-\(repost.id)",
                        fileName: "audio.mp3",
                        originalName: "audio.mp3",
                        mimeType: "audio/mpeg",
                        fileSize: 0,
                        fileUrl: audioUrl,
                        thumbnailColor: repost.authorColor
                    ),
                    context: .feedPost,
                    accentColor: repost.authorColor,
                    transcription: nil
                )
                .clipShape(RoundedRectangle(cornerRadius: 10))
                .padding(.horizontal, 12)
                .padding(.bottom, 8)
            }

            // Stats row
            HStack(spacing: 12) {
                if repost.likes > 0 {
                    HStack(spacing: 4) {
                        Image(systemName: "heart.fill")
                            .font(.system(size: 10))
                        Text("\(repost.likes)")
                            .font(.system(size: 11, weight: .medium))
                    }
                    .foregroundColor(theme.accentText(repost.authorColor).opacity(0.7))
                }
                Spacer()
            }
            .padding(.horizontal, 12)
            .padding(.bottom, 8)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(theme.surfaceGradient(tint: repost.authorColor))
                .overlay(
                    RoundedRectangle(cornerRadius: 14)
                        .stroke(theme.border(tint: repost.authorColor, intensity: 0.2), lineWidth: 1)
                )
        )
        .padding(.horizontal, 16)
        .padding(.top, 8)
    }

    // MARK: - Repost Language Support

    private func repostEffectiveContent(_ repost: RepostContent) -> String {
        let code = repostActiveDisplayLangCode ?? AuthManager.shared.currentUser?.preferredContentLanguages.first(where: { lang in
            repost.translations?.keys.contains(where: { $0.caseInsensitiveCompare(lang) == .orderedSame }) ?? false
        })?.lowercased() ?? repost.originalLanguage?.lowercased() ?? "fr"
        if code == repost.originalLanguage?.lowercased() { return repost.content }
        if let translation = repost.translations?[code] ?? repost.translations?.first(where: { $0.key.lowercased() == code })?.value {
            return translation.text
        }
        return repost.content
    }

    private func repostSecondaryContent(_ repost: RepostContent, code: String) -> String? {
        if code == repost.originalLanguage?.lowercased() { return repost.content }
        return repost.translations?.first(where: { $0.key.lowercased() == code })?.value.text
    }

    @ViewBuilder
    private func repostLanguageFlags(_ repost: RepostContent) -> some View {
        let origLang = repost.originalLanguage?.lowercased() ?? ""
        let activeLang = repostActiveDisplayLangCode ?? origLang
        let user = AuthManager.shared.currentUser
        let flags: [String] = {
            var all: [String] = origLang.isEmpty ? [] : [origLang]
            var seen = Set(all)
            for lang in user?.preferredContentLanguages ?? [] {
                let l = lang.lowercased()
                if !seen.contains(l), repost.translations?.keys.contains(where: { $0.lowercased() == l }) == true {
                    all.append(l); seen.insert(l)
                }
            }
            return all.filter { $0 != activeLang }
        }()

        if !flags.isEmpty {
            Text("·").font(.system(size: 10)).foregroundColor(theme.textMuted)
            ForEach(flags, id: \.self) { code in
                let display = LanguageDisplay.from(code: code)
                let isActive = code == repostSecondaryLangCode
                VStack(spacing: 1) {
                    Text(display?.flag ?? "?")
                        .font(.system(size: isActive ? 11 : 9))
                        .scaleEffect(isActive ? 1.05 : 1.0)
                    if isActive {
                        RoundedRectangle(cornerRadius: 1)
                            .fill(Color(hex: display?.color ?? LanguageDisplay.defaultColor))
                            .frame(width: 8, height: 1.5)
                    }
                }
                .animation(.easeInOut(duration: 0.2), value: isActive)
                .onTapGesture {
                    let isOriginal = code == origLang
                    if isOriginal {
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                            repostActiveDisplayLangCode = code
                            repostSecondaryLangCode = nil
                        }
                    } else {
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                            repostSecondaryLangCode = repostSecondaryLangCode == code ? nil : code
                        }
                    }
                    HapticFeedback.light()
                }
            }
            Image(systemName: "translate")
                .font(.system(size: 9, weight: .medium))
                .foregroundColor(MeeshyColors.indigo400)
        }
    }

    // MARK: - Actions Bar

    @ViewBuilder
    private func actionsBar(_ post: FeedPost) -> some View {
        HStack(spacing: 0) {
            // Heart button — socket-driven (joins post room on appear, leaves on disappear)
            Button {
                guard !postHeartInFlightIds.contains(postId) else { return }
                toggleDetailPostHeart()
                HapticFeedback.light()
                withAnimation(.spring(response: 0.3, dampingFraction: 0.5)) {
                    likeScale = 1.3
                }
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.6)) {
                        likeScale = 1.0
                    }
                }
            } label: {
                HStack(spacing: 5) {
                    let heartColor: Color = detailIsLiked ? MeeshyColors.error : (detailLikeCount > 0 ? Color(hex: accentColor) : theme.textSecondary)
                    Image(systemName: detailIsLiked || detailLikeCount > 0 ? "heart.fill" : "heart")
                        .font(.system(size: 18))
                        .foregroundColor(heartColor)
                        .scaleEffect(likeScale)
                        .opacity(postHeartInFlightIds.contains(postId) ? 0.5 : 1.0)
                    Text("\(detailLikeCount)")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(detailIsLiked ? MeeshyColors.error : (detailLikeCount > 0 ? Color(hex: accentColor) : theme.textMuted))
                        .contentTransition(.numericText())
                }
            }
            .disabled(postHeartInFlightIds.contains(postId))

            Spacer()

            HStack(spacing: 5) {
                Image(systemName: "bubble.right")
                    .font(.system(size: 17))
                    .foregroundColor(Color(hex: accentColor))
                Text("\(post.commentCount)")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(theme.textMuted)
            }

            Spacer()

            Button {
                Task { await viewModel.bookmarkPost() }
                HapticFeedback.light()
            } label: {
                Image(systemName: "bookmark")
                    .font(.system(size: 17))
                    .foregroundColor(theme.textSecondary)
            }

            Spacer()

            Button {
                HapticFeedback.light()
            } label: {
                Image(systemName: "square.and.arrow.up")
                    .font(.system(size: 17))
                    .foregroundColor(theme.textSecondary)
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 10)
    }

    // MARK: - Media Views

    @ViewBuilder
    private func detailMediaSection(_ mediaList: [FeedMedia]) -> some View {
        let visualMedia = mediaList.filter { $0.type == .image || $0.type == .video }
        let audioMedia = mediaList.filter { $0.type == .audio }
        let docMedia = mediaList.filter { $0.type == .document }
        let locMedia = mediaList.filter { $0.type == .location }

        VStack(spacing: 8) {
            // Single media
            if mediaList.count == 1, let media = mediaList.first {
                detailSingleMedia(media)
            } else {
                // Visual grid
                if !visualMedia.isEmpty {
                    detailVisualGrid(visualMedia)
                }
                // Audio players
                ForEach(audioMedia) { media in
                    detailSingleMedia(media)
                }
                // Documents
                ForEach(docMedia) { media in
                    detailSingleMedia(media)
                }
                // Locations
                ForEach(locMedia) { media in
                    detailSingleMedia(media)
                }
            }
        }
    }

    @ViewBuilder
    private func detailSingleMedia(_ media: FeedMedia) -> some View {
        switch media.type {
        case .image:
            let aspectRatio: CGFloat? = {
                guard let w = media.width, let h = media.height, w > 0, h > 0 else { return nil }
                return CGFloat(w) / CGFloat(h)
            }()
            ProgressiveCachedImage(
                thumbHash: media.thumbHash,
                thumbnailUrl: media.thumbnailUrl,
                fullUrl: media.url
            ) {
                Color(hex: media.thumbnailColor).shimmer()
            }
            .aspectRatio(aspectRatio, contentMode: .fit)
            .frame(maxWidth: .infinity, maxHeight: 400)
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .onTapGesture { openMediaFullscreen(media) }

        case .video:
            InlineVideoPlayerView(
                attachment: media.toMessageAttachment(),
                accentColor: accentColor,
                onExpandFullscreen: { openMediaFullscreen(media) }
            )
            .frame(maxWidth: .infinity)
            .clipShape(RoundedRectangle(cornerRadius: 12))

        case .audio:
            AudioPlayerView(
                attachment: media.toMessageAttachment(),
                context: .feedPost,
                accentColor: media.thumbnailColor,
                transcription: media.transcription
            )
            .clipShape(RoundedRectangle(cornerRadius: 12))

        case .document:
            HStack(spacing: 14) {
                ZStack {
                    RoundedRectangle(cornerRadius: 10)
                        .fill(Color(hex: media.thumbnailColor).opacity(0.2))
                        .frame(width: 48, height: 56)
                    Image(systemName: "doc.fill")
                        .font(.system(size: 24))
                        .foregroundColor(Color(hex: media.thumbnailColor))
                }
                VStack(alignment: .leading, spacing: 4) {
                    Text(media.fileName ?? "Document")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(theme.textPrimary)
                        .lineLimit(1)
                    HStack(spacing: 8) {
                        if let size = media.fileSize {
                            Text(size).font(.system(size: 12)).foregroundColor(theme.textMuted)
                        }
                        if let pages = media.pageCount {
                            Text("\u{2022}").foregroundColor(theme.textMuted)
                            Text("\(pages) pages").font(.system(size: 12)).foregroundColor(theme.textMuted)
                        }
                    }
                }
                Spacer()
                Image(systemName: "arrow.down.circle.fill")
                    .font(.system(size: 28))
                    .foregroundColor(Color(hex: media.thumbnailColor))
            }
            .padding(14)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(theme.mode.isDark ? Color.white.opacity(0.05) : Color.black.opacity(0.03))
                    .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color(hex: media.thumbnailColor).opacity(0.3), lineWidth: 1))
            )

        case .location:
            HStack(spacing: 14) {
                ZStack {
                    RoundedRectangle(cornerRadius: 10)
                        .fill(Color(hex: media.thumbnailColor).opacity(0.2))
                        .frame(width: 64, height: 64)
                    Image(systemName: "mappin.circle.fill")
                        .font(.system(size: 28))
                        .foregroundColor(Color(hex: media.thumbnailColor))
                }
                VStack(alignment: .leading, spacing: 4) {
                    Text(media.locationName ?? "Location")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(theme.textPrimary)
                    if let lat = media.latitude, let lon = media.longitude {
                        Text(String(format: "%.4f, %.4f", lat, lon))
                            .font(.system(size: 11))
                            .foregroundColor(theme.textMuted)
                    }
                }
                Spacer()
            }
            .padding(14)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(theme.mode.isDark ? Color.white.opacity(0.05) : Color.black.opacity(0.03))
                    .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color(hex: media.thumbnailColor).opacity(0.3), lineWidth: 1))
            )
        }
    }

    @ViewBuilder
    private func detailVisualGrid(_ visualMedia: [FeedMedia]) -> some View {
        let spacing: CGFloat = 3
        let count = visualMedia.count

        if count == 2 {
            HStack(spacing: spacing) {
                detailGridCell(visualMedia[0])
                detailGridCell(visualMedia[1])
            }
            .frame(height: 200)
            .clipShape(RoundedRectangle(cornerRadius: 14))
        } else if count == 3 {
            HStack(spacing: spacing) {
                detailGridCell(visualMedia[0])
                    .aspectRatio(0.75, contentMode: .fill)
                VStack(spacing: spacing) {
                    detailGridCell(visualMedia[1])
                    detailGridCell(visualMedia[2])
                }
            }
            .frame(height: 240)
            .clipShape(RoundedRectangle(cornerRadius: 14))
        } else {
            VStack(spacing: spacing) {
                HStack(spacing: spacing) {
                    detailGridCell(visualMedia[0])
                    if count > 1 { detailGridCell(visualMedia[1]) }
                }
                if count > 2 {
                    HStack(spacing: spacing) {
                        detailGridCell(visualMedia[2])
                        if count > 3 {
                            ZStack {
                                detailGridCell(visualMedia[3])
                                if count > 4 {
                                    Color.black.opacity(0.5)
                                    Text("+\(count - 4)")
                                        .font(.system(size: 20, weight: .bold))
                                        .foregroundColor(.white)
                                }
                            }
                            .contentShape(Rectangle())
                            .onTapGesture { openMediaFullscreen(visualMedia[3]) }
                        }
                    }
                }
            }
            .frame(height: 240)
            .clipShape(RoundedRectangle(cornerRadius: 14))
        }
    }

    private func detailGridCell(_ media: FeedMedia) -> some View {
        return ZStack {
            ProgressiveCachedImage(
                thumbHash: media.thumbHash,
                thumbnailUrl: media.thumbnailUrl,
                fullUrl: media.url
            ) {
                Color(hex: media.thumbnailColor).shimmer()
            }
            .aspectRatio(contentMode: .fill)
            .frame(minWidth: 0, maxWidth: .infinity, minHeight: 0, maxHeight: .infinity)
            .clipped()

            if media.type == .video {
                ZStack {
                    Circle().fill(.ultraThinMaterial).frame(width: 36, height: 36)
                    Circle().fill(Color(hex: accentColor).opacity(0.85)).frame(width: 30, height: 30)
                    Image(systemName: "play.fill")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(.white)
                        .offset(x: 1)
                }
                .shadow(color: .black.opacity(0.3), radius: 6, y: 3)
            }
        }
        .contentShape(Rectangle())
        .onTapGesture { openMediaFullscreen(media) }
    }

    private func openMediaFullscreen(_ media: FeedMedia) {
        guard media.type == .image || media.type == .video else { return }
        fullscreenMediaId = media.id
        showFullscreenGallery = true
        HapticFeedback.light()
    }

    // MARK: - Comments Header

    private var commentsHeader: some View {
        HStack(spacing: 8) {
            Text("Commentaires")
                .font(.system(size: 14, weight: .bold))
                .foregroundColor(theme.textPrimary)

            if let post = displayPost, post.commentCount > 0 {
                Text("\(post.commentCount)")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(.white)
                    .padding(.horizontal, 7)
                    .padding(.vertical, 2)
                    .background(Capsule().fill(Color(hex: accentColor)))
            }

            Spacer()
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
    }

    // MARK: - Composer

    private var replyBannerView: AnyView? {
        guard let reply = viewModel.replyingTo else { return nil }
        return AnyView(
            HStack(spacing: 8) {
                RoundedRectangle(cornerRadius: 2)
                    .fill(Color(hex: reply.authorColor))
                    .frame(width: 3, height: 36)

                VStack(alignment: .leading, spacing: 2) {
                    Text(reply.author)
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(Color(hex: reply.authorColor))

                    Text(reply.displayContent)
                        .font(.system(size: 12))
                        .foregroundColor(theme.textSecondary)
                        .lineLimit(1)
                }

                Spacer()

                Button {
                    withAnimation(.spring(response: 0.25, dampingFraction: 0.8)) {
                        viewModel.clearReply()
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
        )
    }

    private var composer: some View {
        UniversalComposerBar(
            style: .light,
            mode: .comment,
            accentColor: accentColor,
            selectedLanguage: composerLanguage,
            onLanguageChange: { composerLanguage = $0 },
            onSend: { text in
                let effects = commentEffects
                let blur = commentBlurEnabled
                commentEffects = .none
                commentBlurEnabled = false
                Task {
                    let flags = effects.flags.rawValue | (blur ? MessageEffectFlags.blurred.rawValue : 0)
                    let effectFlags = flags > 0 ? Int(flags) : nil
                    if viewModel.replyingTo != nil {
                        await viewModel.sendReply(text, effectFlags: effectFlags)
                    } else {
                        await viewModel.sendComment(text, effectFlags: effectFlags)
                    }
                }
            },
            replyBanner: replyBannerView,
            isBlurEnabled: $commentBlurEnabled,
            pendingEffects: $commentEffects,
            focusTrigger: $composerFocusTrigger
        )
    }
}
