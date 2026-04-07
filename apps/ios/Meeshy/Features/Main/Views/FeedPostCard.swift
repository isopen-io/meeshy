import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Extracted from FeedView.swift

// MARK: - Feed Post Card
struct FeedPostCard: View {
    let post: FeedPost
    var isCommentsExpanded: Bool = false
    var onToggleComments: (() -> Void)? = nil
    var onLike: ((String) -> Void)? = nil
    var onRepost: ((String) -> Void)? = nil
    var onQuote: ((String) -> Void)? = nil
    var onShare: ((String) -> Void)? = nil
    var onBookmark: ((String) -> Void)? = nil
    var onSendComment: ((String, String, String?) -> Void)? = nil // (postId, content, parentId?)
    var onLikeComment: ((String, String) -> Void)? = nil // (postId, commentId)
    var onSelectLanguage: ((String, String) -> Void)? = nil // (postId, language)
    var onTapPost: ((FeedPost) -> Void)? = nil
    var onTapRepost: ((String) -> Void)? = nil
    var onDelete: ((String) -> Void)? = nil
    var onReport: ((String) -> Void)? = nil
    var onPin: ((String) -> Void)? = nil

    // Mood data passed from parent to avoid @EnvironmentObject in leaf view
    var authorMoodEmoji: String? = nil
    var onAuthorMoodTap: ((CGPoint) -> Void)? = nil
    var moodLookup: ((String) -> (emoji: String?, tapHandler: ((CGPoint) -> Void)?))? = nil

    // Lecture directe sans @ObservedObject — leaf view rendue dans un ForEach,
    // évite que chaque changement de thème force un re-render de toutes les cards.
    private var theme: ThemeManager { ThemeManager.shared }
    @State private var showCommentsSheet = false
    @State private var showTranslationSheet = false
    @State private var showRepostOptions = false
    @State private var selectedProfileUser: ProfileSheetUser?
    @State private var secondaryLangCode: String? = nil
    @State private var activeDisplayLangCode: String? = nil
    @State var fullscreenMediaId: String? = nil
    @State var showFullscreenGallery = false
    @State private var isTextExpanded = false

    var accentColor: String { post.authorColor }
    private var topComments: [FeedComment] { Array(post.comments.sorted { $0.likes > $1.likes }.prefix(3)) }

    private var truncatedContent: (text: String, isTruncated: Bool) {
        let words = effectiveContent.split(separator: " ", omittingEmptySubsequences: true)
        if words.count <= 20 { return (effectiveContent, false) }
        let truncated = words.prefix(20).joined(separator: " ")
        return (truncated, true)
    }

    // MARK: - Prisme Linguistique

    private var currentDisplayLangCode: String {
        activeDisplayLangCode ?? post.translations?.keys.first(where: { lang in
            AuthManager.shared.currentUser?.preferredContentLanguages.contains(where: { $0.caseInsensitiveCompare(lang) == .orderedSame }) ?? false
        })?.lowercased() ?? post.originalLanguage?.lowercased() ?? "fr"
    }

    private var effectiveContent: String {
        let code = currentDisplayLangCode
        if code == post.originalLanguage?.lowercased() { return post.content }
        if let translation = post.translations?[code] ?? post.translations?.first(where: { $0.key.lowercased() == code })?.value {
            return translation.text
        }
        return post.displayContent
    }

    private var secondaryContent: String? {
        guard let code = secondaryLangCode else { return nil }
        if code == post.originalLanguage?.lowercased() { return post.content }
        return post.translations?.first(where: { $0.key.lowercased() == code })?.value.text
    }

    private func buildAvailableFlags() -> [String] {
        guard let origLang = post.originalLanguage?.lowercased() else { return [] }
        let activeLang = currentDisplayLangCode
        let user = AuthManager.shared.currentUser
        var all: [String] = [origLang]
        var seen: Set<String> = [origLang]

        let langs = user?.preferredContentLanguages ?? []
        for lang in langs {
            let l = lang.lowercased()
            if !seen.contains(l), post.translations?.keys.contains(where: { $0.lowercased() == l }) == true {
                all.append(l); seen.insert(l)
            }
        }
        return all.filter { $0 != activeLang }
    }

    private func handleFlagTap(_ code: String) {
        let isOriginal = code == post.originalLanguage?.lowercased()
        let hasContent = isOriginal || post.translations?.keys.contains(where: { $0.lowercased() == code }) == true

        if !hasContent {
            onSelectLanguage?(post.id, code)
            HapticFeedback.light()
            return
        }

        if isOriginal {
            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                activeDisplayLangCode = code
                secondaryLangCode = nil
            }
        } else {
            let isShowing = secondaryLangCode == code
            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                secondaryLangCode = isShowing ? nil : code
            }
        }
        HapticFeedback.light()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Main content
            VStack(alignment: .leading, spacing: 12) {
                // Tappable content area (author, text, media, repost)
                VStack(alignment: .leading, spacing: 12) {
                    // Author header
                    authorHeader

                    // Post content (expandable in-place — Prisme Linguistique)
                    let truncation = truncatedContent
                    if isTextExpanded {
                        (Text(effectiveContent)
                            .font(.system(size: 15))
                            .foregroundColor(theme.textPrimary)
                        + Text(" ")
                        + Text("voir moins").font(.system(size: 15, weight: .medium))
                            .foregroundColor(theme.textMuted))
                        .lineLimit(nil)
                        .onTapGesture {
                            withAnimation(.easeInOut(duration: 0.25)) {
                                isTextExpanded = false
                            }
                        }
                    } else {
                        (Text(truncation.text)
                            .font(.system(size: 15))
                            .foregroundColor(theme.textPrimary)
                        + (truncation.isTruncated
                            ? Text("... ").font(.system(size: 15)).foregroundColor(theme.textPrimary)
                              + Text("voir plus").font(.system(size: 15, weight: .medium))
                                .foregroundColor(theme.textMuted)
                            : Text("")
                        ))
                        .lineLimit(nil)
                        .onTapGesture {
                            if truncation.isTruncated {
                                withAnimation(.easeInOut(duration: 0.25)) {
                                    isTextExpanded = true
                                }
                            } else {
                                onTapPost?(post)
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
                                    .font(.system(size: 13))
                                    .foregroundColor(theme.textPrimary.opacity(0.8))
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                            .padding(.vertical, 8)
                            .padding(.horizontal, 10)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(langColor.opacity(0.08))
                            .clipShape(RoundedRectangle(cornerRadius: 10))
                        }
                        .transition(.opacity.combined(with: .move(edge: .top)))
                    }

                    // Media preview
                    if post.hasMedia {
                        mediaPreview
                    }
                }
                .contentShape(Rectangle())
                .onTapGesture {
                    onTapPost?(post)
                }

                // Reposted content (outside parent tap target so its own Button works)
                if let repost = post.repost {
                    repostView(repost)
                }

                // Actions bar (not inside the tap target)
                actionsBar
            }
            .padding(16)

            // Comments preview (compact)
            if !post.comments.isEmpty {
                commentsPreview
            }
        }
        .background(
            RoundedRectangle(cornerRadius: 20)
                .fill(theme.surfaceGradient(tint: accentColor))
                .overlay(
                    RoundedRectangle(cornerRadius: 20)
                        .stroke(theme.border(tint: accentColor, intensity: 0.25), lineWidth: 1)
                )
        )
        .padding(.horizontal, 16)
        .sheet(isPresented: $showCommentsSheet) {
            CommentsSheetView(post: post, accentColor: accentColor, onSendComment: onSendComment, onLikeComment: onLikeComment)
        }
        .sheet(isPresented: $showTranslationSheet) {
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
                    } else {
                        onSelectLanguage?(post.id, language)
                    }
                }
            )
        }
        .sheet(item: $selectedProfileUser) { user in
            let mood = moodLookup?(user.userId ?? "")
            UserProfileSheet(
                user: user,
                moodEmoji: mood?.emoji,
                onMoodTap: mood?.tapHandler
            )
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
        }
        .fullScreenCover(isPresented: $showFullscreenGallery) {
            let attachments = post.media
                .filter { $0.type == .image || $0.type == .video }
                .map { $0.toMessageAttachment() }
            ConversationMediaGalleryView(
                allAttachments: attachments,
                startAttachmentId: fullscreenMediaId ?? attachments.first?.id ?? "",
                accentColor: accentColor
            )
        }
        .withStatusBubble()
    }

    // MARK: - Author Header
    private var authorHeader: some View {
        HStack(spacing: 12) {
            // Avatar
            MeeshyAvatar(
                name: post.author,
                context: .postAuthor,
                accentColor: accentColor,
                avatarURL: post.authorAvatarURL,
                moodEmoji: authorMoodEmoji,
                onViewProfile: { selectedProfileUser = .from(feedPost: post) },
                onMoodTap: onAuthorMoodTap,
                contextMenuItems: [
                    AvatarContextMenuItem(label: "Voir le profil", icon: "person.fill") {
                        selectedProfileUser = .from(feedPost: post)
                    }
                ]
            )

            VStack(alignment: .leading, spacing: 2) {
                // Author name with repost indicator
                HStack(spacing: 6) {
                    Text(post.author)
                        .font(.system(size: 15, weight: .bold))
                        .foregroundColor(theme.textPrimary)

                    // Repost indicator inline
                    if post.repostAuthor != nil {
                        HStack(spacing: 3) {
                            Image(systemName: "arrow.2.squarepath")
                                .font(.system(size: 10))
                                .accessibilityHidden(true)
                            Text("a republié")
                                .font(.system(size: 11))
                        }
                        .foregroundColor(theme.textMuted)
                    }
                }

                HStack(spacing: 4) {
                    Text(timeAgo(from: post.timestamp))
                        .font(.system(size: 12))
                        .foregroundColor(theme.accentText(accentColor))

                    let flags = buildAvailableFlags()
                    if !flags.isEmpty || (post.translations != nil && !post.translations!.isEmpty) {
                        Text("·")
                            .font(.system(size: 12))
                            .foregroundColor(theme.textMuted)

                        ForEach(flags, id: \.self) { code in
                            let display = LanguageDisplay.from(code: code)
                            let isActive = code == secondaryLangCode
                            VStack(spacing: 1) {
                                Text(display?.flag ?? code.uppercased())
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

            Menu {
                Button {
                    UIPasteboard.general.string = post.content
                    HapticFeedback.success()
                } label: {
                    Label("Copier le texte", systemImage: "doc.on.doc")
                }
                Button {
                    onShare?(post.id)
                    HapticFeedback.light()
                } label: {
                    Label("Partager", systemImage: "square.and.arrow.up")
                }
                Button {
                    onBookmark?(post.id)
                    HapticFeedback.light()
                } label: {
                    Label("Enregistrer", systemImage: "bookmark")
                }
                if onPin != nil {
                    Button {
                        onPin?(post.id)
                        HapticFeedback.light()
                    } label: {
                        Label("Epingler", systemImage: "pin")
                    }
                }
                if onDelete != nil {
                    Divider()
                    Button(role: .destructive) {
                        onDelete?(post.id)
                        HapticFeedback.medium()
                    } label: {
                        Label("Supprimer", systemImage: "trash")
                    }
                }
                if onReport != nil {
                    Divider()
                    Button(role: .destructive) {
                        onReport?(post.id)
                        HapticFeedback.medium()
                    } label: {
                        Label("Signaler", systemImage: "exclamationmark.triangle")
                    }
                }
            } label: {
                Image(systemName: "ellipsis")
                    .font(.system(size: 16))
                    .foregroundColor(theme.textMuted)
                    .padding(8)
            }
            .accessibilityLabel("Plus d'options")
            .accessibilityHint("Ouvre le menu des actions")
        }
    }

    // MARK: - Repost View
    private func repostView(_ repost: RepostContent) -> some View {
        Button {
            HapticFeedback.light()
            onTapRepost?(repost.id)
        } label: {
            VStack(alignment: .leading, spacing: 10) {
                // Original author
                HStack(spacing: 8) {
                    MeeshyAvatar(
                        name: repost.author,
                        context: .postComment,
                        accentColor: repost.authorColor,
                        avatarURL: repost.authorAvatarURL
                    )

                    Text(repost.author)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(theme.accentText(repost.authorColor))

                    Text("·")
                        .foregroundColor(theme.textMuted)

                    Text(timeAgo(from: repost.timestamp))
                        .font(.system(size: 11))
                        .foregroundColor(theme.textMuted)
                }

                // Original content
                Text(repost.content)
                    .font(.system(size: 14))
                    .foregroundColor(theme.textSecondary)
                    .lineLimit(4)

                // Original stats
                HStack(spacing: 12) {
                    HStack(spacing: 4) {
                        Image(systemName: "heart.fill")
                            .font(.system(size: 10))
                            .accessibilityHidden(true)
                        Text("\(repost.likes)")
                            .font(.system(size: 11, weight: .medium))
                    }
                    .foregroundColor(theme.accentText(repost.authorColor).opacity(0.7))
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel("\(repost.likes) j'aime")
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(
                RoundedRectangle(cornerRadius: 14)
                    .fill(theme.mode.isDark ? Color.white.opacity(0.05) : Color.black.opacity(0.03))
                    .overlay(
                        RoundedRectangle(cornerRadius: 14)
                            .stroke(theme.accentText(repost.authorColor).opacity(0.2), lineWidth: 1)
                    )
            )
        }
        .buttonStyle(PlainButtonStyle())
        .accessibilityLabel("Publication originale de \(repost.author)")
        .accessibilityHint("Ouvre la publication originale")
    }

    // MARK: - Media Preview
    // See FeedPostCard+Media.swift

    // MARK: - Actions Bar
    @State private var likeAnimating = false

    private var actionsBar: some View {
        HStack(spacing: 0) {
            // Like with heart burst animation
            Button {
                withAnimation(.spring(response: 0.25, dampingFraction: 0.5)) {
                    likeAnimating = true
                }
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                    likeAnimating = false
                }
                onLike?(post.id)
                HapticFeedback.light()
            } label: {
                HStack(spacing: 6) {
                    ZStack {
                        // Burst ring behind heart
                        if post.isLiked {
                            Circle()
                                .stroke(MeeshyColors.error.opacity(likeAnimating ? 0.6 : 0), lineWidth: likeAnimating ? 2 : 0)
                                .frame(width: likeAnimating ? 32 : 18, height: likeAnimating ? 32 : 18)
                                .animation(.easeOut(duration: 0.4), value: likeAnimating)
                        }

                        let heartColor: Color = post.isLiked ? MeeshyColors.error : (post.likes > 0 ? Color(hex: accentColor) : theme.textSecondary)
                        Image(systemName: post.isLiked || post.likes > 0 ? "heart.fill" : "heart")
                            .font(.system(size: 18))
                            .foregroundColor(heartColor)
                            .scaleEffect(likeAnimating ? 1.3 : (post.isLiked ? 1.1 : 1.0))
                            .rotationEffect(.degrees(likeAnimating ? -15 : 0))
                    }

                    Text("\(post.likes)")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(post.isLiked ? MeeshyColors.error : (post.likes > 0 ? Color(hex: accentColor) : theme.textSecondary))
                        .contentTransition(.numericText())
                }
            }
            .animation(.spring(response: 0.3, dampingFraction: 0.5), value: post.isLiked)
            .accessibilityLabel("\(post.likes) j'aime")

            Spacer()

            // Comment
            Button {
                showCommentsSheet = true
                HapticFeedback.light()
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: "bubble.right")
                        .font(.system(size: 17))

                    if post.commentCount > 0 {
                        Text("\(post.commentCount)")
                            .font(.system(size: 13, weight: .medium))
                    }
                }
                .foregroundColor(showCommentsSheet ? theme.accentText(accentColor) : theme.textSecondary)
            }
            .accessibilityLabel("\(post.commentCount) commentaires")
            .accessibilityHint("Ouvre les commentaires")

            Spacer()

            // Repost
            Button {
                showRepostOptions = true
                HapticFeedback.light()
            } label: {
                Image(systemName: "arrow.2.squarepath")
                    .font(.system(size: 17))
                    .foregroundColor(theme.textSecondary)
            }
            .accessibilityLabel("Repartager")
            .confirmationDialog("Repartager", isPresented: $showRepostOptions) {
                Button("Repartager") { onRepost?(post.id) }
                Button("Citer") { onQuote?(post.id) }
                Button("Annuler", role: .cancel) {}
            }

            Spacer()

            // Bookmark
            Button {
                onBookmark?(post.id)
                HapticFeedback.light()
            } label: {
                Image(systemName: "bookmark")
                    .font(.system(size: 17))
                    .foregroundColor(theme.textSecondary)
            }
            .accessibilityLabel("Enregistrer")

            Spacer()

            // Share
            Button {
                onShare?(post.id)
                HapticFeedback.light()
            } label: {
                Image(systemName: "square.and.arrow.up")
                    .font(.system(size: 17))
                    .foregroundColor(theme.textSecondary)
            }
            .accessibilityLabel("Partager")
        }
        .padding(.top, 4)
    }

    // MARK: - Comments Preview (Top 3 Comments)
    private var commentsPreview: some View {
        Button {
            showCommentsSheet = true
            HapticFeedback.light()
        } label: {
            VStack(alignment: .leading, spacing: 0) {
                // Divider
                Rectangle()
                    .fill(theme.inputBorder.opacity(0.5))
                    .frame(height: 1)
                    .padding(.horizontal, 16)

                VStack(alignment: .leading, spacing: 12) {
                    ForEach(Array(topComments.enumerated()), id: \.element.id) { index, comment in
                        topCommentRow(comment: comment, isLast: index == topComments.count - 1)
                    }

                    // "See all comments" link
                    HStack(spacing: 8) {
                        // Stacked avatars of remaining commenters
                        if post.comments.count > 3 {
                            HStack(spacing: -6) {
                                ForEach(Array(post.comments.dropFirst(3).prefix(3).enumerated()), id: \.element.id) { index, comment in
                                    MeeshyAvatar(
                                        name: comment.author,
                                        context: .postReaction,
                                        accentColor: comment.authorColor,
                                        avatarURL: comment.authorAvatarURL
                                    )
                                        .overlay(
                                            Circle()
                                                .stroke(theme.backgroundPrimary, lineWidth: 1.5)
                                        )
                                        .zIndex(Double(3 - index))
                                }
                            }
                        }

                        Text("Voir les \(post.comments.count) commentaires")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundColor(theme.accentText(accentColor))

                        Spacer()

                        Image(systemName: "chevron.right")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(theme.textMuted)
                            .accessibilityHidden(true)
                    }
                    .padding(.top, 4)
                }
                .padding(14)
            }
        }
        .buttonStyle(PlainButtonStyle())
        .accessibilityLabel("Voir les \(post.comments.count) commentaires")
        .accessibilityHint("Ouvre la liste des commentaires")
    }

    // MARK: - Top Comment Row
    private func topCommentRow(comment: FeedComment, isLast: Bool) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top, spacing: 10) {
                // Avatar
                let commentMood = moodLookup?(comment.authorId)
                MeeshyAvatar(
                    name: comment.author,
                    context: .postComment,
                    accentColor: comment.authorColor,
                    avatarURL: comment.authorAvatarURL,
                    moodEmoji: commentMood?.emoji,
                    onViewProfile: { selectedProfileUser = .from(feedComment: comment) },
                    onMoodTap: commentMood?.tapHandler,
                    contextMenuItems: [
                        AvatarContextMenuItem(label: "Voir le profil", icon: "person.fill") {
                            selectedProfileUser = .from(feedComment: comment)
                        }
                    ]
                )

                VStack(alignment: .leading, spacing: 4) {
                    // Author name + language flags
                    HStack(spacing: 4) {
                        Text(comment.author)
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundColor(theme.accentText(comment.authorColor))

                        if let origLang = comment.originalLanguage, comment.translatedContent != nil {
                            Text("·").font(.system(size: 10)).foregroundColor(theme.textMuted)

                            let origDisplay = LanguageDisplay.from(code: origLang)
                            Text(origDisplay?.flag ?? "?")
                                .font(.system(size: 9))

                            let userLangs = AuthManager.shared.currentUser?.preferredContentLanguages ?? []
                            let targetLang = userLangs.first?.lowercased() ?? "fr"
                            let targetDisplay = LanguageDisplay.from(code: targetLang)
                            Text(targetDisplay?.flag ?? "?")
                                .font(.system(size: 9))

                            Image(systemName: "translate")
                                .font(.system(size: 8, weight: .medium))
                                .foregroundColor(MeeshyColors.indigo400)
                        }
                    }

                    // Content (Prisme Linguistique)
                    Text(comment.displayContent)
                        .font(.system(size: 14))
                        .foregroundColor(theme.textPrimary)
                        .lineLimit(2)

                    // Stats row: likes and replies
                    HStack(spacing: 16) {
                        // Likes
                        HStack(spacing: 4) {
                            Image(systemName: "heart.fill")
                                .font(.system(size: 11))
                                .foregroundColor(MeeshyColors.error)
                            Text("\(comment.likes)")
                                .font(.system(size: 11, weight: .medium))
                                .foregroundColor(theme.textMuted)
                        }

                        // Replies
                        if comment.replies > 0 {
                            HStack(spacing: 4) {
                                Image(systemName: "arrowshape.turn.up.left.fill")
                                    .font(.system(size: 10))
                                    .foregroundColor(theme.accentText(accentColor).opacity(0.7))
                                Text("\(comment.replies) réponses")
                                    .font(.system(size: 11, weight: .medium))
                                    .foregroundColor(theme.textMuted)
                            }
                        }

                        Spacer()

                        // Timestamp
                        Text(timeAgo(from: comment.timestamp))
                            .font(.system(size: 10))
                            .foregroundColor(theme.textMuted)
                    }
                    .padding(.top, 2)
                }
            }

            // Separator (except for last item)
            if !isLast {
                Rectangle()
                    .fill(theme.inputBorder.opacity(0.3))
                    .frame(height: 1)
                    .padding(.leading, 42)
                    .padding(.top, 10)
            }
        }
    }

    func timeAgo(from date: Date) -> String {
        let seconds = Int(Date().timeIntervalSince(date))
        if seconds < 60 { return "À l'instant" }
        if seconds < 3600 { return "\(seconds / 60)m" }
        if seconds < 86400 { return "\(seconds / 3600)h" }
        return "\(seconds / 86400)j"
    }
}

// MARK: - Equatable (enables .equatable() in ForEach to prevent unnecessary re-renders)
extension FeedPostCard: Equatable {
    nonisolated static func == (lhs: FeedPostCard, rhs: FeedPostCard) -> Bool {
        lhs.post.id == rhs.post.id
            && lhs.post.likes == rhs.post.likes
            && lhs.post.isLiked == rhs.post.isLiked
            && lhs.post.commentCount == rhs.post.commentCount
            && lhs.post.translatedContent == rhs.post.translatedContent
            && lhs.isCommentsExpanded == rhs.isCommentsExpanded
            && lhs.authorMoodEmoji == rhs.authorMoodEmoji
    }
}
