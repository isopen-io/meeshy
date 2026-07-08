import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

// MARK: - Extracted from FeedView.swift

// MARK: - Feed Post Card
struct FeedPostCard: View {
    let post: FeedPost
    var isCommentsExpanded: Bool = false
    /// Socket-driven liked state. When nil, falls back to post.isLiked (legacy path).
    var isLiked: Bool? = nil
    /// Display like count with optimistic delta already applied. When nil, falls back to post.likes.
    var displayLikeCount: Int? = nil
    /// True while a socket reaction request is in-flight — disables the button.
    var isHeartInFlight: Bool = false
    /// Optimistic bookmark state owned by the parent (FeedView/PostDetailView).
    /// Card has no persisted bookmark flag on FeedPost — parent tracks via Set.
    var isBookmarked: Bool = false
    var isBookmarkInFlight: Bool = false
    /// Display counters for repost / bookmark / share. Parent applies the
    /// optimistic delta (post.{repost,bookmark,share}Count + local flip)
    /// so the icon and number flip together on tap.
    var displayRepostCount: Int? = nil
    var displayBookmarkCount: Int? = nil
    var displayShareCount: Int? = nil
    /// Optimistic repost state owned by the parent.
    var isReposted: Bool = false
    var isRepostInFlight: Bool = false
    /// True while a share request is in-flight (mint short link).
    var isShareInFlight: Bool = false
    var onToggleComments: (() -> Void)? = nil
    var onLike: ((String) -> Void)? = nil
    var onRepost: ((String) -> Void)? = nil
    var onQuote: ((String) -> Void)? = nil
    var onShare: ((String) -> Void)? = nil
    var onBookmark: ((String) -> Void)? = nil
    var onSendComment: ((String, String, String?) -> Void)? = nil // (postId, content, parentId?)
    var onSelectLanguage: ((String, String) -> Void)? = nil // (postId, language)
    var onTapPost: ((FeedPost) -> Void)? = nil
    var onTapRepost: ((String) -> Void)? = nil
    /// Fired when the user taps "voir plus" to expand the truncated text. Lets a
    /// host (e.g. the profile posts list) count a post view on expansion. The
    /// inline expansion happens regardless; this is an additional side-effect.
    var onSeeMore: (() -> Void)? = nil
    var onDelete: ((String) -> Void)? = nil
    var onReport: ((String) -> Void)? = nil
    var onPin: ((String) -> Void)? = nil
    var onEdit: ((FeedPost) -> Void)? = nil

    // Mood data passed from parent to avoid @EnvironmentObject in leaf view
    var authorMoodEmoji: String? = nil
    var onAuthorMoodTap: ((CGPoint) -> Void)? = nil
    var moodLookup: ((String) -> (emoji: String?, tapHandler: ((CGPoint) -> Void)?))? = nil

    // Anneau story de l'auteur — fourni par le parent pour la même raison
    // (leaf .equatable(), zéro @EnvironmentObject). Le tap ouvre le viewer
    // singleGroup sur la première story non vue de l'auteur.
    var authorStoryRing: StoryRingState = .none
    var onViewAuthorStory: (() -> Void)? = nil

    /// Feed autoplay coordinator (RF2). Passed as a plain `let` — NOT observed —
    /// so election changes never invalidate this leaf card; the inner
    /// `ReelRepostEmbedContainer` observes it. `nil` keeps the static-poster
    /// fallback (e.g. profile lists with no feed-level autoplay).
    var reelAutoplay: ReelFeedAutoplayCoordinator? = nil

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

    /// True when the signed-in user authored this post — gates the private reach
    /// stats (impressions + views) shown only to the author.
    private var isAuthor: Bool {
        guard let me = AuthManager.shared.currentUser?.id else { return false }
        return me == post.authorId
    }

    /// Compact count (1.2k / 3.4M).
    static func compactCount(_ value: Int) -> String {
        if value >= 1_000_000 { return String(format: "%.1fM", Double(value) / 1_000_000) }
        if value >= 1_000 { return String(format: "%.1fk", Double(value) / 1_000) }
        return "\(value)"
    }

    /// Compact preview descriptor for the media carried by a reposted POST/STATUS
    /// (RF1). Holds the first media (rendered as a thumbnail) and the total count
    /// (drives a "+N" badge).
    struct RepostMediaPreview: Equatable {
        let primary: FeedMedia
        let count: Int
        static func == (lhs: RepostMediaPreview, rhs: RepostMediaPreview) -> Bool {
            lhs.primary.id == rhs.primary.id && lhs.count == rhs.count
        }
    }

    /// Resolver for the reposted POST/STATUS quote-block media preview. Returns
    /// `nil` when the repost carries no media — text-only reposts then keep their
    /// byte-identical layout (the preview block is skipped). Otherwise the first
    /// media + total count. Pure; unit-tested.
    static func repostMediaPreviewModel(for repost: RepostContent) -> RepostMediaPreview? {
        guard let primary = repost.media.first else { return nil }
        return RepostMediaPreview(primary: primary, count: repost.media.count)
    }

    /// Tap target for the reposted quote block (incl. its media preview): ALWAYS
    /// the original reposted post (`repost.id`), never the reposter's outer card
    /// (`post.id`). Routed through the enclosing repost Button. Pure; unit-tested.
    static func repostTapTargetId(for repost: RepostContent) -> String { repost.id }

    /// VoiceOver label for the tappable media preview. Distinguishes a video
    /// from an image (and falls back to a generic "media" wording for mixed or
    /// other types) and attributes it to the post author.
    private var mediaAccessibilityLabel: String {
        let isVideo = post.media.contains { $0.type == .video }
        if isVideo {
            return String(format: String(localized: "a11y.feed.post.media.video", defaultValue: "Vidéo partagée par %@", bundle: .main), post.author)
        }
        return String(format: String(localized: "a11y.feed.post.media.image", defaultValue: "Image partagée par %@", bundle: .main), post.author)
    }

    /// True when the post is a feed POST that reposts a STORY — the cell then
    /// renders the embedded story canvas via `StoryRepostEmbedCell` instead of
    /// the standard media preview + quote-style repost block. Phase C.3.
    private var isStoryRepost: Bool {
        let postType = (post.type ?? "").uppercased()
        let repostType = (post.repost?.type ?? "").uppercased()
        return postType == "POST" && repostType == "STORY"
    }

    /// True when the post is a feed POST that reposts a REEL — the cell then
    /// renders a rich reel preview (poster + reel badge + caption) via
    /// `ReelRepostEmbedCell` instead of the empty text-only quote block. A
    /// reel's content lives in `media`/caption, never in `content`.
    private var isReelRepost: Bool {
        let postType = (post.type ?? "").uppercased()
        return postType == "POST" && (post.repost?.isReel ?? false)
    }

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
        Self.availableFlags(
            originalLanguage: post.originalLanguage,
            translationKeys: post.translations.map { Array($0.keys) } ?? [],
            preferredLanguages: AuthManager.shared.currentUser?.preferredContentLanguages ?? [],
            activeLanguage: currentDisplayLangCode
        )
    }

    /// Drapeaux de langue disponibles : original d'abord, puis les langues
    /// préférées de l'utilisateur (dans l'ordre de préférence) qui ont une
    /// traduction, dédupliquées, en excluant la langue actuellement affichée.
    /// Toutes en lowercase. Pré-calcule l'ensemble lowercase des clés traduites
    /// (O(keys)) pour des tests d'appartenance O(1) au lieu d'un `contains(where:)`
    /// par langue préférée — l'ancien code était O(langs × keys) par rendu.
    static func availableFlags(
        originalLanguage: String?,
        translationKeys: [String],
        preferredLanguages: [String],
        activeLanguage: String
    ) -> [String] {
        guard let origLang = originalLanguage?.lowercased() else { return [] }
        let translated = Set(translationKeys.map { $0.lowercased() })
        var all: [String] = [origLang]
        var seen: Set<String> = [origLang]
        for lang in preferredLanguages {
            let l = lang.lowercased()
            if !seen.contains(l), translated.contains(l) {
                all.append(l)
                seen.insert(l)
            }
        }
        return all.filter { $0 != activeLanguage }
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

    /// Vidéo embeddable (YouTube) détectée dans le contenu affiché. Dérivée (non stockée) :
    /// le gate `.equatable()` (compare `post.content`) ne ré-évalue le body que si le contenu
    /// change, donc le NSDataDetector ne tourne pas à chaque re-render parent.
    private var embeddedVideo: EmbeddedVideo? {
        EmbeddableVideoResolver.resolve(in: effectiveContent)
    }

    /// Teinte des liens cliquables dans le corps du post.
    private var postLinkTint: Color { Color(hex: accentColor) }

    /// Destination trackée `/l/<token>` pour la façade vidéo, dérivée de la
    /// première URL du contenu via `post.trackedLinkMap`. `nil` → watchURL.
    private var embedTrackedURL: URL? {
        guard let raw = LinkPreviewFetcher.firstURL(in: effectiveContent),
              let token = post.trackedLinkMap[raw] else { return nil }
        return URL(string: "https://meeshy.me/l/\(token)")
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Main content
            VStack(alignment: .leading, spacing: 12) {
                // Tappable content area (author, text, media, repost)
                VStack(alignment: .leading, spacing: 12) {
                    // Author header
                    authorHeader

                    // Post content — tap text opens detail, "voir plus/moins" toggles expansion.
                    // Le corps passe par `MessageTextRenderer` pour rendre les URLs
                    // cliquables + trackées (`/l/<token>`) tout en gardant `onTapPost`
                    // sur le texte non-lien (priorité au lien = défaut SwiftUI).
                    let truncation = truncatedContent
                    if isTextExpanded {
                        MessageTextRenderer.render(effectiveContent, color: theme.textPrimary, accentColor: postLinkTint, trackedLinks: post.trackedLinkMap.isEmpty ? nil : post.trackedLinkMap)
                            .lineLimit(nil)
                            .tint(postLinkTint)
                            .accessibilityHint(String(localized: "a11y.feed.post.open.hint", defaultValue: "Touche deux fois pour ouvrir la publication", bundle: .main))
                            .accessibilityAction { onTapPost?(post) }

                        Text(String(localized: "feed.post.see_less", defaultValue: "voir moins", bundle: .main))
                            .font(.subheadline.weight(.medium))
                            .foregroundColor(theme.textMuted)
                            .onTapGesture {
                                withAnimation(.easeInOut(duration: 0.25)) {
                                    isTextExpanded = false
                                }
                            }
                            .accessibilityAddTraits(.isButton)
                            .accessibilityHint(String(localized: "a11y.feed.post.see_less.hint", defaultValue: "Réduit le texte", bundle: .main))
                    } else {
                        MessageTextRenderer.render(truncation.text + (truncation.isTruncated ? "..." : ""), color: theme.textPrimary, accentColor: postLinkTint, trackedLinks: post.trackedLinkMap.isEmpty ? nil : post.trackedLinkMap)
                            .lineLimit(nil)
                            .tint(postLinkTint)
                            .accessibilityHint(String(localized: "a11y.feed.post.open.hint", defaultValue: "Touche deux fois pour ouvrir la publication", bundle: .main))
                            .accessibilityAction { onTapPost?(post) }

                        if truncation.isTruncated {
                            Text(String(localized: "feed.post.see_more", defaultValue: "voir plus", bundle: .main))
                                .font(.subheadline.weight(.medium))
                                .foregroundColor(theme.textMuted)
                                // Cible de touche 44pt (HIG) sans gonfler le texte visuellement.
                                .frame(minHeight: 44)
                                .contentShape(Rectangle())
                                .textSelection(.disabled)
                                .highPriorityGesture(
                                    TapGesture()
                                        .onEnded {
                                            HapticFeedback.light()
                                            withAnimation(.easeInOut(duration: 0.25)) {
                                                isTextExpanded = true
                                            }
                                            onSeeMore?()
                                        }
                                )
                                .accessibilityIdentifier("feed.post.see_more")
                                .accessibilityAddTraits(.isButton)
                                .accessibilityHint(String(localized: "a11y.feed.post.see_more.hint", defaultValue: "Affiche le texte complet", bundle: .main))
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
                                        Text(display.flag).font(.caption)
                                        Text(display.name)
                                            .font(.caption2.weight(.semibold))
                                            .foregroundColor(langColor)
                                    }
                                }
                                Text(content)
                                    .font(.footnote)
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
                        .accessibilityElement(children: .combine)
                        .accessibilityLabel(String(format: String(localized: "a11y.feed.post.translation", defaultValue: "Traduction : %@", bundle: .main), content))
                    }

                }
                .contentShape(Rectangle())
                .onTapGesture {
                    onTapPost?(post)
                }

                // Embed vidéo (YouTube) détecté dans le contenu : player façade
                // (vignette → lecture inline), hors du geste d'ouverture du post.
                if let embeddedVideo {
                    VideoEmbedContainer(video: embeddedVideo, accent: Color(hex: accentColor), trackedURL: embedTrackedURL)
                        .padding(.top, 8)
                }

                // Repost-of-STORY: render the embedded story canvas (muted, autoplay).
                // For this branch the gateway has snapshotted the original story media
                // into the outer POST, but the canonical source is `post.repost` —
                // we reuse `StoryReaderRepresentable(repost:)` so the rendering matches
                // the in-viewer experience pixel-for-pixel.
                if isStoryRepost {
                    StoryRepostEmbedCell(
                        post: post,
                        preferredContentLanguages: AuthManager.shared.currentUser?.preferredContentLanguages
                    )
                } else if isReelRepost {
                    // Repost-of-REEL: a reel's content lives in media/caption, never
                    // in `content`, so the legacy quote block rendered blank (and the
                    // POST card drops the reel badge). Render a rich reel preview with
                    // inline muted autoplay (RF2) when a feed coordinator is provided;
                    // otherwise the static-poster cell.
                    if let reelAutoplay {
                        ReelRepostEmbedContainer(
                            coordinator: reelAutoplay,
                            post: post,
                            onTap: { post.repost.map { onTapRepost?($0.id) } }
                        )
                    } else {
                        ReelRepostEmbedCell(
                            post: post,
                            onTap: { post.repost.map { onTapRepost?($0.id) } }
                        )
                    }
                } else {
                    // Media preview (outside nav tap target — has its own fullscreen gesture)
                    if post.hasMedia {
                        mediaPreview
                            .accessibilityElement(children: .contain)
                            .accessibilityLabel(mediaAccessibilityLabel)
                            .accessibilityHint(String(localized: "a11y.feed.post.media.hint", defaultValue: "Ouvre le média en plein écran", bundle: .main))
                    }

                    // Reposted content (outside parent tap target so its own Button works)
                    if let repost = post.repost {
                        repostView(repost)
                    }
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
            CommentsSheetView(post: post, accentColor: accentColor, onSendComment: onSendComment)
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
            let isPostAuthor = user.userId == post.authorId
            UserProfileSheet(
                user: user,
                moodEmoji: mood?.emoji,
                onMoodTap: mood?.tapHandler,
                presenceProvider: { PresenceManager.shared.knownPresenceState(for: $0) },
                // L'état réel n'est connu que pour l'auteur du post (la card
                // est une leaf sans accès au StoryViewModel) ; les autres
                // profils gardent l'anneau décoratif legacy (nil).
                storyRingState: isPostAuthor ? authorStoryRing : nil,
                onViewStory: isPostAuthor ? onViewAuthorStory.map { handler in
                    { selectedProfileUser = nil; handler() }
                } : nil,
                postsContent: { uid in
                    AnyView(ProfileUserPostsList(userId: uid, onOpenPost: { tapped in
                        selectedProfileUser = nil
                        onTapPost?(tapped)
                    }, onOpenReel: { reel, reels in
                        ProfilePostsOpener.openReel(reel, in: reels) { selectedProfileUser = nil }
                    }))
                }
            )
            .presentationDetents([.large, .medium])
            .presentationDragIndicator(.visible)
        }
        .fullScreenCover(isPresented: $showFullscreenGallery) {
            let attachments = post.media
                .filter { $0.type == .image || $0.type == .video }
                .map { $0.toMessageAttachment() }
            let senderInfo = ConversationViewModel.MediaSenderInfo(
                senderName: post.author,
                senderAvatarURL: post.authorAvatarURL,
                senderColor: post.authorColor,
                sentAt: post.timestamp
            )
            let senderMap = Dictionary(uniqueKeysWithValues: attachments.map { ($0.id, senderInfo) })
            ConversationMediaGalleryView(
                allAttachments: attachments,
                startAttachmentId: fullscreenMediaId ?? attachments.first?.id ?? "",
                accentColor: accentColor,
                senderInfoMap: senderMap
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
                storyState: authorStoryRing,
                moodEmoji: authorMoodEmoji,
                onViewProfile: { selectedProfileUser = .from(feedPost: post) },
                onViewStory: onViewAuthorStory,
                onMoodTap: onAuthorMoodTap,
                contextMenuItems: [
                    AvatarContextMenuItem(label: String(localized: "feed.post.view_profile", defaultValue: "Voir le profil", bundle: .main), icon: "person.fill") {
                        selectedProfileUser = .from(feedPost: post)
                    }
                ]
            )
            .accessibilityLabel(String(format: String(localized: "a11y.feed.post.author_avatar", defaultValue: "Profil de %@", bundle: .main), post.author))
            .accessibilityHint(String(localized: "a11y.feed.post.author_avatar.hint", defaultValue: "Ouvre le profil de l'auteur", bundle: .main))

            VStack(alignment: .leading, spacing: 2) {
                // Author name with repost indicator
                HStack(spacing: 6) {
                    Text(post.author)
                        .font(.subheadline.weight(.bold))
                        .foregroundColor(theme.textPrimary)

                    // Repost indicator inline — compact source attribution right
                    // after the author pseudo ("a republié de @handle"), so the
                    // embedded story/quote cell no longer needs a verbose
                    // "Reposté de @handle" block.
                    if post.repostAuthor != nil {
                        HStack(spacing: 3) {
                            Image(systemName: "arrow.2.squarepath")
                                .font(.caption2)
                                .accessibilityHidden(true)
                            if let handle = post.repost?.authorUsername ?? post.repostAuthor {
                                Text(String(format: String(localized: "feed.post.reposted_from", defaultValue: "a republié de @%@", bundle: .main), handle))
                                    .font(.caption)
                                    .lineLimit(1)
                                    .truncationMode(.tail)
                            } else {
                                Text(String(localized: "feed.post.reposted", defaultValue: "a republié", bundle: .main))
                                    .font(.caption)
                            }
                        }
                        .foregroundColor(theme.textMuted)
                    }
                }

                HStack(spacing: 4) {
                    Text(timeAgo(from: post.timestamp))
                        .font(.caption)
                        .foregroundColor(theme.accentText(accentColor))

                    let flags = buildAvailableFlags()
                    if !flags.isEmpty || post.translations?.isEmpty == false {
                        Text("·")
                            .font(.caption)
                            .foregroundColor(theme.textMuted)

                        ForEach(flags, id: \.self) { code in
                            let display = LanguageDisplay.from(code: code)
                            let isActive = code == secondaryLangCode
                            VStack(spacing: 1) {
                                Text(display?.flag ?? code.uppercased())
                                    .font(isActive ? .caption : .caption2)
                                    .scaleEffect(isActive ? 1.05 : 1.0)
                                if isActive {
                                    RoundedRectangle(cornerRadius: 1)
                                        .fill(Color(hex: display?.color ?? LanguageDisplay.defaultColor))
                                        .frame(width: 10, height: 1.5)
                                }
                            }
                            .animation(.easeInOut(duration: 0.2), value: isActive)
                            .onTapGesture { handleFlagTap(code) }
                            .accessibilityLabel(String(localized: "feed.post.flag.a11y", defaultValue: "Afficher en \(display?.name ?? code)", bundle: .main))
                            .accessibilityAddTraits(.isButton)
                        }

                        if post.translations?.isEmpty == false {
                            Image(systemName: "translate")
                                .font(.caption2.weight(.medium))
                                .foregroundColor(MeeshyColors.indigo400)
                                .frame(minWidth: 32, minHeight: 32)
                                .contentShape(Rectangle())
                                .onTapGesture {
                                    HapticFeedback.light()
                                    showTranslationSheet = true
                                }
                                .accessibilityLabel(String(localized: "feed.post.translate.a11y", defaultValue: "Voir les traductions", bundle: .main))
                                .accessibilityAddTraits(.isButton)
                        }
                    }

                    // Reach stats (impressions · views) — visible ONLY to the
                    // post's author, after the meta row (private analytics).
                    if isAuthor {
                        Text("·").font(.caption).foregroundColor(theme.textMuted)
                        HStack(spacing: 3) {
                            Image(systemName: "chart.bar.fill").font(.caption2.weight(.semibold))
                            Text(Self.compactCount(post.impressionCount)).font(.caption2.weight(.medium))
                            Text("·").font(.caption2)
                            Image(systemName: "eye.fill").font(.caption2.weight(.semibold))
                            Text(Self.compactCount(post.postOpenCount)).font(.caption2.weight(.medium))
                        }
                        .foregroundColor(theme.textMuted)
                        .accessibilityElement(children: .ignore)
                        .accessibilityLabel(String(localized: "feed.reel.impressions", defaultValue: "Impressions", bundle: .main))
                        .accessibilityValue("\(post.impressionCount) · \(post.postOpenCount)")
                    }
                }
            }

            Spacer()

            Menu {
                Button {
                    UIPasteboard.general.string = post.content
                    HapticFeedback.success()
                } label: {
                    Label(String(localized: "feed.post.copy_text", defaultValue: "Copier le texte", bundle: .main), systemImage: "doc.on.doc")
                }
                Button {
                    onShare?(post.id)
                    HapticFeedback.light()
                } label: {
                    Label(String(localized: "feed.post.share", defaultValue: "Partager", bundle: .main), systemImage: "square.and.arrow.up")
                }
                Button {
                    onBookmark?(post.id)
                    HapticFeedback.light()
                } label: {
                    Label(String(localized: "feed.post.save", defaultValue: "Enregistrer", bundle: .main), systemImage: "bookmark")
                }
                if onPin != nil {
                    Button {
                        onPin?(post.id)
                        HapticFeedback.light()
                    } label: {
                        Label(String(localized: "feed.post.pin", defaultValue: "Epingler", bundle: .main), systemImage: "pin")
                    }
                }
                if onEdit != nil {
                    Button {
                        onEdit?(post)
                        HapticFeedback.light()
                    } label: {
                        Label(String(localized: "feed.post.edit", defaultValue: "Modifier", bundle: .main), systemImage: "pencil")
                    }
                }
                if onDelete != nil {
                    Divider()
                    Button(role: .destructive) {
                        onDelete?(post.id)
                        HapticFeedback.medium()
                    } label: {
                        Label(String(localized: "common.delete", defaultValue: "Supprimer", bundle: .main), systemImage: "trash")
                    }
                }
                if onReport != nil {
                    Divider()
                    Button(role: .destructive) {
                        onReport?(post.id)
                        HapticFeedback.medium()
                    } label: {
                        Label(String(localized: "feed.post.report", defaultValue: "Signaler", bundle: .main), systemImage: "exclamationmark.triangle")
                    }
                }
            } label: {
                Image(systemName: "ellipsis")
                    .font(MeeshyFont.relative(16))
                    .foregroundColor(theme.textMuted)
                    .padding(8)
            }
            .accessibilityLabel(String(localized: "feed.post.more_options", defaultValue: "Plus d'options", bundle: .main))
            .accessibilityHint(String(localized: "feed.post.more_options.hint", defaultValue: "Ouvre le menu des actions", bundle: .main))
        }
    }

    // MARK: - Repost View
    private func repostView(_ repost: RepostContent) -> some View {
        Button {
            HapticFeedback.light()
            onTapRepost?(Self.repostTapTargetId(for: repost))
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
                        .font(.footnote.weight(.semibold))
                        .foregroundColor(theme.accentText(repost.authorColor))

                    Text("·")
                        .foregroundColor(theme.textMuted)

                    Text(timeAgo(from: repost.timestamp))
                        .font(.caption)
                        .foregroundColor(theme.textMuted)
                }

                // Original content — préfixé du mood emoji pour un STATUS
                // reposté (sinon un mood republié n'afficherait qu'un corps vide).
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    if let mood = repost.moodEmoji, !mood.isEmpty {
                        Text(mood)
                            .font(.body)
                            .accessibilityHidden(true)
                    }
                    Text(repost.content)
                        .font(.footnote)
                        .foregroundColor(theme.textSecondary)
                        .lineLimit(4)
                }

                // Reposted media (RF1) — a reposted POST/STATUS carrying images or
                // video rendered text-only before this; show a compact thumbnail
                // preview reusing the own-media building blocks. No AVPlayer: the
                // surrounding Button routes the tap to the ORIGINAL reposted post.
                if let mediaModel = Self.repostMediaPreviewModel(for: repost) {
                    repostMediaPreview(mediaModel)
                }

                // Original stats
                HStack(spacing: 12) {
                    HStack(spacing: 4) {
                        Image(systemName: "heart.fill")
                            .font(.caption2)
                            .accessibilityHidden(true)
                        Text("\(repost.likes)")
                            .font(.caption.weight(.medium))
                    }
                    .foregroundColor(theme.accentText(repost.authorColor).opacity(0.7))
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel(String(localized: "feed.post.repost.likes_count", defaultValue: "\(repost.likes) j'aime", bundle: .main))
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
        .accessibilityLabel(String(localized: "feed.post.original.label", defaultValue: "Publication originale de \(repost.author)", bundle: .main))
        .accessibilityHint(String(localized: "feed.post.original.hint", defaultValue: "Ouvre la publication originale", bundle: .main))
    }

    // MARK: - Media Preview
    // See FeedPostCard+Media.swift

    // MARK: - Actions Bar
    @State private var likeAnimating = false

    /// Effective liked state: socket-driven override when available, else post.isLiked.
    private var effectiveIsLiked: Bool { isLiked ?? post.isLiked }
    /// Effective display count: socket-driven override when available, else post.likes.
    private var effectiveLikeCount: Int { max(0, displayLikeCount ?? post.likes) }

    private var actionsBar: some View {
        HStack(spacing: 0) {
            // Like with heart burst animation (socket-driven — see FeedView.postLikedIds)
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
                        if effectiveIsLiked {
                            Circle()
                                .stroke(MeeshyColors.error.opacity(likeAnimating ? 0.6 : 0), lineWidth: likeAnimating ? 2 : 0)
                                .frame(width: likeAnimating ? 32 : 18, height: likeAnimating ? 32 : 18)
                                .animation(.easeOut(duration: 0.4), value: likeAnimating)
                        }

                        let heartColor: Color = effectiveIsLiked ? MeeshyColors.error : (effectiveLikeCount > 0 ? Color(hex: accentColor) : theme.textSecondary)
                        Image(systemName: effectiveIsLiked || effectiveLikeCount > 0 ? "heart.fill" : "heart")
                            .font(MeeshyFont.relative(18))
                            .foregroundColor(heartColor)
                            .scaleEffect(likeAnimating ? 1.3 : (effectiveIsLiked ? 1.1 : 1.0))
                            .rotationEffect(.degrees(likeAnimating ? -15 : 0))
                            .opacity(isHeartInFlight ? 0.5 : 1.0)
                        // Accent BORDER on the glyph when the current user liked.
                        if effectiveIsLiked {
                            Image(systemName: "heart")
                                .font(MeeshyFont.relative(18))
                                .foregroundColor(Color(hex: accentColor))
                                .scaleEffect(likeAnimating ? 1.3 : 1.1)
                                .rotationEffect(.degrees(likeAnimating ? -15 : 0))
                        }
                    }

                    Text("\(effectiveLikeCount)")
                        .font(.footnote.weight(.medium))
                        .foregroundColor(effectiveIsLiked ? MeeshyColors.error : (effectiveLikeCount > 0 ? Color(hex: accentColor) : theme.textSecondary))
                        .contentTransition(.numericText())
                }
            }
            .disabled(isHeartInFlight)
            .animation(.easeOut(duration: 0.2), value: effectiveIsLiked)
            .accessibilityLabel(String(localized: "a11y.feed.post.like", defaultValue: "Aimer", bundle: .main))
            .accessibilityValue(String(format: String(localized: "a11y.feed.post.like.value", defaultValue: "%d j'aime", bundle: .main), effectiveLikeCount))
            .accessibilityAddTraits(effectiveIsLiked ? .isSelected : [])

            Spacer()

            // Comment
            Button {
                showCommentsSheet = true
                HapticFeedback.light()
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: "bubble.right")
                        .font(MeeshyFont.relative(17))

                    if post.commentCount > 0 {
                        Text("\(post.commentCount)")
                            .font(.footnote.weight(.medium))
                    }
                }
                .foregroundColor(showCommentsSheet ? theme.accentText(accentColor) : theme.textSecondary)
            }
            .accessibilityLabel(String(localized: "feed.post.comments_count", defaultValue: "\(post.commentCount) commentaires", bundle: .main))
            .accessibilityHint(String(localized: "feed.post.comments.hint", defaultValue: "Ouvre les commentaires", bundle: .main))

            Spacer()

            // Repost
            Button {
                showRepostOptions = true
                HapticFeedback.light()
            } label: {
                HStack(spacing: 6) {
                    ZStack {
                        Image(systemName: isReposted ? "arrow.2.squarepath.circle.fill" : "arrow.2.squarepath")
                            .font(MeeshyFont.relative(17))
                            .scaleEffect(isRepostInFlight ? 0.85 : 1.0)
                        // Accent BORDER on the glyph when the current user reposted.
                        if isReposted {
                            Image(systemName: "arrow.2.squarepath.circle")
                                .font(MeeshyFont.relative(17))
                                .foregroundColor(Color(hex: accentColor))
                        }
                    }
                    let count = displayRepostCount ?? post.repostCount
                    if count > 0 {
                        Text("\(count)")
                            .font(.footnote.weight(.medium))
                            .contentTransition(.numericText())
                    }
                }
                .foregroundColor(isReposted ? MeeshyColors.success : theme.textSecondary)
                .animation(.spring(response: 0.35, dampingFraction: 0.55), value: isReposted)
                .animation(.spring(response: 0.3, dampingFraction: 0.6), value: isRepostInFlight)
            }
            .disabled(isRepostInFlight)
            .accessibilityLabel(String(localized: "feed.post.repost", defaultValue: "Repartager", bundle: .main))
            .accessibilityValue(String(format: String(localized: "a11y.feed.post.repost.value", defaultValue: "%d repartages", bundle: .main), displayRepostCount ?? post.repostCount))
            .accessibilityHint(String(localized: "a11y.feed.post.repost.hint", defaultValue: "Repartage ou cite cette publication", bundle: .main))
            .accessibilityAddTraits(isReposted ? .isSelected : [])
            .alert(String(localized: "feed.post.repost", defaultValue: "Repartager", bundle: .main), isPresented: $showRepostOptions) {
                Button(String(localized: "feed.post.repost", defaultValue: "Repartager", bundle: .main)) { onRepost?(post.id) }
                Button(String(localized: "feed.post.quote", defaultValue: "Citer", bundle: .main)) { onQuote?(post.id) }
                Button(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .main), role: .cancel) {}
            }

            Spacer()

            // Bookmark
            Button {
                onBookmark?(post.id)
                HapticFeedback.light()
            } label: {
                HStack(spacing: 6) {
                    ZStack {
                        Image(systemName: isBookmarked ? "bookmark.fill" : "bookmark")
                            .font(MeeshyFont.relative(17))
                            .scaleEffect(isBookmarkInFlight ? 0.85 : 1.0)
                        // Accent BORDER on the glyph when the current user bookmarked.
                        if isBookmarked {
                            Image(systemName: "bookmark")
                                .font(MeeshyFont.relative(17))
                                .foregroundColor(Color(hex: accentColor))
                        }
                    }
                    let count = displayBookmarkCount ?? post.bookmarkCount
                    if count > 0 {
                        Text("\(count)")
                            .font(.footnote.weight(.medium))
                            .contentTransition(.numericText())
                    }
                }
                .foregroundColor(isBookmarked ? MeeshyColors.warning : theme.textSecondary)
                .animation(.spring(response: 0.35, dampingFraction: 0.55), value: isBookmarked)
                .animation(.spring(response: 0.3, dampingFraction: 0.6), value: isBookmarkInFlight)
            }
            .disabled(isBookmarkInFlight)
            .accessibilityLabel(String(localized: "feed.post.save", defaultValue: "Enregistrer", bundle: .main))
            .accessibilityValue(String(format: String(localized: "a11y.feed.post.save.value", defaultValue: "%d enregistrements", bundle: .main), displayBookmarkCount ?? post.bookmarkCount))
            .accessibilityHint(String(localized: "a11y.feed.post.save.hint", defaultValue: "Enregistre la publication dans vos favoris", bundle: .main))
            .accessibilityAddTraits(isBookmarked ? .isSelected : [])

            Spacer()

            // Share
            Button {
                onShare?(post.id)
                HapticFeedback.light()
            } label: {
                HStack(spacing: 6) {
                    ZStack {
                        Image(systemName: "square.and.arrow.up")
                            .font(MeeshyFont.relative(17))
                            .opacity(isShareInFlight ? 0 : 1)
                        if isShareInFlight {
                            ProgressView()
                                .scaleEffect(0.6)
                                .progressViewStyle(.circular)
                        }
                    }
                    let count = displayShareCount ?? post.shareCount
                    if count > 0 {
                        Text("\(count)")
                            .font(.footnote.weight(.medium))
                            .contentTransition(.numericText())
                    }
                }
                .foregroundColor(theme.textSecondary)
                .animation(.easeInOut(duration: 0.2), value: isShareInFlight)
            }
            .disabled(isShareInFlight)
            .accessibilityLabel(String(localized: "feed.post.share", defaultValue: "Partager", bundle: .main))
            .accessibilityValue(String(format: String(localized: "a11y.feed.post.share.value", defaultValue: "%d partages", bundle: .main), displayShareCount ?? post.shareCount))
            .accessibilityHint(String(localized: "a11y.feed.post.share.hint", defaultValue: "Partage cette publication via un lien", bundle: .main))
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

                        Text(String(localized: "feed.post.view_comments", defaultValue: "Voir les \(post.comments.count) commentaires", bundle: .main))
                            .font(.footnote.weight(.semibold))
                            .foregroundColor(theme.accentText(accentColor))

                        Spacer()

                        Image(systemName: "chevron.right")
                            .font(.caption.weight(.semibold))
                            .foregroundColor(theme.textMuted)
                            .accessibilityHidden(true)
                    }
                    .padding(.top, 4)
                }
                .padding(14)
            }
        }
        .buttonStyle(PlainButtonStyle())
        .accessibilityLabel(String(localized: "feed.post.view_comments", defaultValue: "Voir les \(post.comments.count) commentaires", bundle: .main))
        .accessibilityHint(String(localized: "feed.post.view_comments.hint", defaultValue: "Ouvre la liste des commentaires", bundle: .main))
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
                        AvatarContextMenuItem(label: String(localized: "feed.post.view_profile", defaultValue: "Voir le profil", bundle: .main), icon: "person.fill") {
                            selectedProfileUser = .from(feedComment: comment)
                        }
                    ]
                )

                VStack(alignment: .leading, spacing: 4) {
                    // Author name + language flags
                    HStack(spacing: 4) {
                        Text(comment.author)
                            .font(.footnote.weight(.semibold))
                            .foregroundColor(theme.accentText(comment.authorColor))

                        if let origLang = comment.originalLanguage, comment.translatedContent != nil {
                            Text("·").font(.caption2).foregroundColor(theme.textMuted)

                            let origDisplay = LanguageDisplay.from(code: origLang)
                            Text(origDisplay?.flag ?? "?")
                                .font(.caption2)

                            let userLangs = AuthManager.shared.currentUser?.preferredContentLanguages ?? []
                            let targetLang = userLangs.first?.lowercased() ?? "fr"
                            let targetDisplay = LanguageDisplay.from(code: targetLang)
                            Text(targetDisplay?.flag ?? "?")
                                .font(.caption2)

                            Image(systemName: "translate")
                                .font(.caption2.weight(.medium))
                                .foregroundColor(MeeshyColors.indigo400)
                        }
                    }

                    // Content (Prisme Linguistique) — masqué pour un commentaire
                    // média-seul (displayContent vide) : évite une ligne fantôme.
                    if !comment.displayContent.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        Text(comment.displayContent)
                            .font(.footnote)
                            .foregroundColor(theme.textPrimary)
                            .lineLimit(2)
                    }

                    // Média unique (image/vidéo/audio) — rendu inline dans l'aperçu
                    // du feed avec les MÊMES building blocks que la sheet. L'audio est
                    // ainsi lisible/arrêtable directement (le player porte son propre
                    // bouton, qui capte le tap sans ouvrir la sheet).
                    if let media = comment.media.first {
                        CommentMediaView(
                            media: media,
                            accentColor: accentColor,
                            authorName: comment.author,
                            authorAvatarURL: comment.authorAvatarURL,
                            authorColor: comment.authorColor,
                            sentAt: comment.timestamp
                        )
                        .padding(.top, 2)
                    }

                    // Stats row: likes and replies
                    HStack(spacing: 16) {
                        // Likes
                        HStack(spacing: 4) {
                            Image(systemName: "heart.fill")
                                .font(.caption)
                                .foregroundColor(MeeshyColors.error)
                            Text("\(comment.likes)")
                                .font(.caption.weight(.medium))
                                .foregroundColor(theme.textMuted)
                        }

                        // Replies
                        if comment.replies > 0 {
                            HStack(spacing: 4) {
                                Image(systemName: "arrowshape.turn.up.left.fill")
                                    .font(.caption2)
                                    .foregroundColor(theme.accentText(accentColor).opacity(0.7))
                                Text(String(localized: "feed.post.comment.replies_count", defaultValue: "\(comment.replies) réponses", bundle: .main))
                                    .font(.caption.weight(.medium))
                                    .foregroundColor(theme.textMuted)
                            }
                        }

                        Spacer()

                        // Timestamp
                        Text(timeAgo(from: comment.timestamp))
                            .font(.caption2)
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
        RelativeTimeFormatter.shortString(for: date)
    }
}

// MARK: - Equatable (enables .equatable() in ForEach to prevent unnecessary re-renders)
extension FeedPostCard: Equatable {
    nonisolated static func == (lhs: FeedPostCard, rhs: FeedPostCard) -> Bool {
        lhs.post.id == rhs.post.id
            && lhs.post.likes == rhs.post.likes
            && lhs.post.isLiked == rhs.post.isLiked
            && lhs.isLiked == rhs.isLiked
            && lhs.displayLikeCount == rhs.displayLikeCount
            && lhs.isHeartInFlight == rhs.isHeartInFlight
            && lhs.isBookmarked == rhs.isBookmarked
            && lhs.isBookmarkInFlight == rhs.isBookmarkInFlight
            && lhs.isReposted == rhs.isReposted
            && lhs.isRepostInFlight == rhs.isRepostInFlight
            && lhs.isShareInFlight == rhs.isShareInFlight
            && lhs.displayRepostCount == rhs.displayRepostCount
            && lhs.displayBookmarkCount == rhs.displayBookmarkCount
            && lhs.displayShareCount == rhs.displayShareCount
            && lhs.post.repostCount == rhs.post.repostCount
            && lhs.post.bookmarkCount == rhs.post.bookmarkCount
            && lhs.post.shareCount == rhs.post.shareCount
            && lhs.post.commentCount == rhs.post.commentCount
            && lhs.post.content == rhs.post.content
            && lhs.post.translatedContent == rhs.post.translatedContent
            && (lhs.post.translations?.count ?? 0) == (rhs.post.translations?.count ?? 0)
            && lhs.isCommentsExpanded == rhs.isCommentsExpanded
            && lhs.authorMoodEmoji == rhs.authorMoodEmoji
            && lhs.authorStoryRing == rhs.authorStoryRing
    }
}
