import SwiftUI
import UIKit
import MeeshySDK
import MeeshyUI

// MARK: - StoryViewerView sidebar & header components
//
// Dedicated View structs extracted from StoryViewerView so the action sidebar
// and the story header no longer compose into StoryViewerView.body's opaque
// type. Real structs (vs AnyView) break the type while preserving SwiftUI
// structural identity.

// MARK: - Story Action Sidebar

/// Right-side action sidebar of the story viewer. Hosts the heart / reply /
/// send / share / export / mute / comments / translate buttons. Extracted
/// from `StoryViewerView.storyActionSidebar` (formerly an `AnyView`) so its
/// ~9-button `VStack` becomes its own type-metadata unit.
struct StoryActionSidebarView: View {
    let isOwnStory: Bool
    let storyReactionCount: Int
    let quickEmojis: [String]
    let onReplyToStory: ((ReplyContext) -> Void)?
    let currentStory: StoryItem?
    let currentGroup: StoryGroup?
    let storyCommentCount: Int
    let isStoryCommentsEmpty: Bool
    let currentStoryNeedsVideoExport: Bool
    let storyHasAudioOrVideo: Bool
    let storyHasTranslatableContent: Bool
    let isGlobalMuted: Bool
    let availableTranslationLanguages: [TranslationLanguage]

    @Binding var showEmojiStrip: Bool
    @Binding var showFullEmojiPicker: Bool
    @Binding var showCommentsOverlay: Bool
    @Binding var showLanguageOptions: Bool
    @Binding var showFullLanguagePicker: Bool
    @Binding var showViewersSheet: Bool
    @Binding var showExportShareSheet: Bool
    @Binding var isGlobalMutedBinding: Bool
    @Binding var sharedContentWrapper: SharedContentWrapper?
    @Binding var repostStoryComposerSource: RepostStorySourceWrapper?
    @Binding var isPresented: Bool

    let triggerStoryReaction: (String) -> Void
    let pauseTimer: () -> Void
    let loadStoryComments: () -> Void

    @State private var heartScale: CGFloat = 1.0

    var body: some View {
        VStack(spacing: 20) {
            // 1. Reaction (heart) — primary action, brand-colored when active
            if !isOwnStory {
                StoryActionButton(
                    icon: "heart.fill",
                    label: storyReactionCount > 0 ? "\(storyReactionCount)" : "React",
                    isActive: showEmojiStrip || storyReactionCount > 0,
                    activeColor: MeeshyColors.indigo500,
                    activeGlow: MeeshyColors.indigo500
                ) {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                        showEmojiStrip.toggle()
                    }
                }
                .scaleEffect(heartScale)
                .overlay(alignment: .trailing) {
                    if showEmojiStrip {
                        EmojiReactionPicker(
                            quickEmojis: quickEmojis,
                            style: .dark,
                            onReact: { emoji in
                                triggerStoryReaction(emoji)
                            },
                            onDismiss: {
                                withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                                    showEmojiStrip = false
                                }
                            },
                            onExpandFullPicker: {
                                withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                                    showEmojiStrip = false
                                    showFullEmojiPicker = true
                                }
                            }
                        )
                        .fixedSize()
                        .transition(.asymmetric(
                            insertion: .scale(scale: 0.8, anchor: .trailing).combined(with: .opacity),
                            removal: .opacity
                        ))
                        .offset(x: -56)
                    }
                }
                .zIndex(10)
            }

            // 2. Reply privately (opens DM with story context)
            if !isOwnStory, onReplyToStory != nil {
                StoryActionButton(
                    icon: "arrowshape.turn.up.left.fill",
                    label: "Répondre"
                ) {
                    HapticFeedback.light()
                    guard let story = currentStory, let group = currentGroup else { return }
                    let preview = story.content?.prefix(80).description ?? "Story"
                    let thumbUrl = story.media.first?.thumbnailUrl ?? story.media.first?.url
                    onReplyToStory?(.story(
                        storyId: story.id,
                        authorId: group.id,
                        authorName: group.username,
                        preview: preview,
                        publishedAt: story.createdAt,
                        reactionCount: storyReactionCount > 0 ? storyReactionCount : nil,
                        commentCount: storyCommentCount > 0 ? storyCommentCount : nil,
                        thumbnailUrl: thumbUrl
                    ))
                    isPresented = false
                }
            }

            // 3. Forward (send to someone)
            StoryActionButton(
                icon: "paperplane.fill",
                label: "Envoyer"
            ) {
                HapticFeedback.light()
                pauseTimer()
                if let story = currentStory, let group = currentGroup {
                    sharedContentWrapper = SharedContentWrapper(content: .story(item: story, authorName: group.username))
                }
            }

            // 4. Reshare (republish to own story) — hidden for own stories.
            // Visibility-gated on `currentStory?.isPublic` (B.2 helper) so we never
            // expose Partager for non-public visibility (FRIENDS / PRIVATE).
            if !isOwnStory, currentStory?.isPublic == true {
                StoryActionButton(
                    icon: "arrow.2.squarepath",
                    label: "Partager"
                ) {
                    HapticFeedback.light()
                    pauseTimer()
                    if let story = currentStory, let group = currentGroup {
                        repostStoryComposerSource = RepostStorySourceWrapper(
                            story: story,
                            authorHandle: group.username
                        )
                    }
                }
            } else if isOwnStory {
                StoryActionButton(
                    icon: "eye.fill",
                    label: "Vues"
                ) {
                    HapticFeedback.light()
                    pauseTimer()
                    showViewersSheet = true
                }
            }

            // Author-only export — bakes a fidèle-au-preview MP4 the user
            // can share to Photos / Messages / WhatsApp. NEVER uploads to
            // the Meeshy backend (stories publish RAW, see CLAUDE.md
            // "Story Architecture").
            if isOwnStory, currentStoryNeedsVideoExport {
                StoryActionButton(
                    icon: "square.and.arrow.up.fill",
                    label: "Exporter"
                ) {
                    HapticFeedback.light()
                    pauseTimer()
                    showExportShareSheet = true
                }
            }

            // 4. Mute/Unmute — only shown if story has audio or video content
            if storyHasAudioOrVideo {
                StoryActionButton(
                    icon: isGlobalMuted ? "speaker.slash.fill" : "speaker.wave.2.fill",
                    label: isGlobalMuted ? "Mute" : "Son",
                    isActive: !isGlobalMuted,
                    activeColor: MeeshyColors.indigo400,
                    activeGlow: isGlobalMuted ? nil : MeeshyColors.indigo400
                ) {
                    // Action handled by .highPriorityGesture below
                }
                .highPriorityGesture(
                    TapGesture().onEnded {
                        HapticFeedback.light()
                        isGlobalMutedBinding.toggle()
                        NotificationCenter.default.post(
                            name: isGlobalMutedBinding ? .storyComposerMuteCanvas : .storyComposerUnmuteCanvas,
                            object: nil
                        )
                    }
                )
            }

            // 5. Comments toggle
            if storyCommentCount > 0 {
                StoryActionButton(
                    icon: "bubble.left.fill",
                    label: "\(storyCommentCount)",
                    isActive: showCommentsOverlay,
                    activeColor: MeeshyColors.indigo400,
                    activeGlow: showCommentsOverlay ? MeeshyColors.indigo400 : nil
                ) {
                    HapticFeedback.light()
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                        showCommentsOverlay.toggle()
                    }
                    if showCommentsOverlay && isStoryCommentsEmpty {
                        loadStoryComments()
                    }
                }
            }

            // 6. Translate — brand cyan when active (only for stories with text/audio)
            if !isOwnStory && storyHasTranslatableContent {
                StoryActionButton(
                    icon: "textformat.abc",
                    label: "Traductions",
                    isActive: showLanguageOptions,
                    activeColor: MeeshyColors.indigo400,
                    activeGlow: MeeshyColors.indigo400
                ) {
                    HapticFeedback.light()
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                        showLanguageOptions.toggle()
                    }
                }
                .overlay(alignment: .trailing) {
                    if showLanguageOptions {
                        languageScrollStrip
                            .transition(.asymmetric(
                                insertion: .scale(scale: 0.8, anchor: .trailing).combined(with: .opacity),
                                removal: .opacity
                            ))
                            .offset(x: -56)
                    }
                }
                .zIndex(10)
            }
        }
    }

    // MARK: - Language Scroll Strip

    private var languageScrollStrip: some View {
        let available = availableTranslationLanguages

        return HStack(spacing: 0) {
            if !available.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(LanguageUsageTracker.sorted(available)) { lang in
                            Button {
                                HapticFeedback.light()
                                LanguageUsageTracker.recordUsage(languageId: lang.id)
                                withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                                    showLanguageOptions = false
                                }
                                guard let story = currentStory else { return }
                                Task {
                                    let body: [String: String] = ["targetLanguage": lang.id]
                                    let _: APIResponse<[String: AnyCodable]>? = try? await APIClient.shared.post(
                                        endpoint: "/posts/\(story.id)/translate",
                                        body: body
                                    )
                                }
                            } label: {
                                Text(lang.flag)
                                    .font(.system(size: 22))
                                    .frame(width: 38, height: 38)
                                    .background(Circle().fill(Color.white.opacity(0.1)))
                            }
                            .accessibilityLabel("Voir en \(lang.name)")
                        }
                    }
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                }
                .frame(width: min(CGFloat(available.count) * 46 + 20, 222), height: 50)
            }

            Button {
                HapticFeedback.light()
                withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                    showLanguageOptions = false
                }
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    showFullLanguagePicker = true
                }
            } label: {
                ZStack {
                    Circle()
                        .fill(Color.white.opacity(0.15))
                        .frame(width: 38, height: 38)
                    Image(systemName: "plus")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundColor(.white.opacity(0.85))
                }
            }
            .padding(.trailing, 10)
            .padding(.vertical, 6)
            .accessibilityLabel("Demander une traduction")
            .accessibilityHint("Ouvre la liste des langues pour demander une nouvelle traduction")
        }
        .background(
            Capsule()
                .fill(.ultraThinMaterial)
                .overlay(Capsule().fill(Color.black.opacity(0.4)))
                .overlay(Capsule().stroke(Color.white.opacity(0.1), lineWidth: 0.5))
        )
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Traductions disponibles")
    }
}

// MARK: - Story Header

/// Top header bar of the story viewer: author avatar + name + timestamp,
/// the kebab options menu, and the close button. Extracted from
/// `StoryViewerView.storyHeader` (formerly an `AnyView`).
struct StoryHeaderView: View {
    let currentGroup: StoryGroup?
    let currentStory: StoryItem?
    let isOwnStory: Bool

    @Binding var selectedProfileUser: ProfileSheetUser?
    @Binding var editAndRepostAsPostSource: RepostPostSourceWrapper?
    @Binding var showReportSheet: Bool

    let makeStoryExternalShareURL: (String) -> URL?
    let storyTimeRemaining: (Date) -> String
    let deleteCurrentStory: () -> Void
    let repostAsPostDirect: () -> Void
    let pauseTimer: () -> Void
    let dismissViewer: () -> Void
    let reportStory: (_ storyId: String, _ reportType: String, _ reason: String?) async throws -> Void

    @State private var avatarLongPressGlow = false

    var body: some View {
        HStack(spacing: 10) {
            if let group = currentGroup {
                Button {
                    HapticFeedback.light()
                    selectedProfileUser = .from(storyGroup: group)
                } label: {
                    HStack(spacing: 10) {
                        ZStack {
                            // Glow radial au long press
                            if avatarLongPressGlow {
                                Circle()
                                    .fill(
                                        RadialGradient(
                                            colors: [
                                                Color(hex: group.avatarColor).opacity(0.4),
                                                MeeshyColors.indigo500.opacity(0.2),
                                                .clear
                                            ],
                                            center: .center,
                                            startRadius: 15,
                                            endRadius: 35
                                        )
                                    )
                                    .frame(width: 70, height: 70)
                                    .blur(radius: 8)
                                    .transition(.scale(scale: 0.8).combined(with: .opacity))
                                    .allowsHitTesting(false)
                            }

                            MeeshyAvatar(
                                name: group.username,
                                context: .storyViewer,
                                accentColor: group.avatarColor,
                                onViewProfile: { selectedProfileUser = .from(storyGroup: group) },
                                contextMenuItems: [
                                    AvatarContextMenuItem(label: "Voir le profil", icon: "person.fill") {
                                        selectedProfileUser = .from(storyGroup: group)
                                    }
                                ]
                            )
                            .overlay(
                                Circle()
                                    .stroke(
                                        LinearGradient(
                                            colors: [MeeshyColors.indigo500, MeeshyColors.indigo400],
                                            startPoint: .topLeading,
                                            endPoint: .bottomTrailing
                                        ),
                                        lineWidth: avatarLongPressGlow ? 3 : 2
                                    )
                                    .frame(width: 44, height: 44)
                                    .shadow(
                                        color: avatarLongPressGlow ? MeeshyColors.indigo500.opacity(0.6) : .clear,
                                        radius: 12,
                                        y: 0
                                    )
                            )
                            .scaleEffect(avatarLongPressGlow ? 1.05 : 1.0)
                        }
                        .onLongPressGesture(minimumDuration: 0.4) {
                            HapticFeedback.medium()
                            withAnimation(.spring(response: 0.25, dampingFraction: 0.7)) {
                                avatarLongPressGlow = false
                            }
                            selectedProfileUser = .from(storyGroup: group)
                        } onPressingChanged: { pressing in
                            withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                                avatarLongPressGlow = pressing
                            }
                        }

                        VStack(alignment: .leading, spacing: 2) {
                            Text(group.username)
                                .font(.system(size: 15, weight: .bold))
                                .foregroundColor(.white)

                            if let story = currentStory {
                                HStack(spacing: 4) {
                                    Text(story.timeAgo)
                                        .font(.system(size: 12, weight: .medium))
                                        .foregroundColor(.white.opacity(0.75))

                                    if story.repostOfId != nil {
                                        Image(systemName: "arrow.2.squarepath")
                                            .font(.system(size: 10, weight: .semibold))
                                            .foregroundColor(.white.opacity(0.6))
                                        if let authorName = story.repostAuthorName {
                                            Text("via @\(authorName)")
                                                .font(.system(size: 11, weight: .medium))
                                                .foregroundColor(.white.opacity(0.55))
                                        }
                                    }

                                    if let expiresAt = story.expiresAt, expiresAt.timeIntervalSinceNow > 0 {
                                        Text("\u{00B7}")
                                            .foregroundColor(.white.opacity(0.4))
                                        Image(systemName: "clock")
                                            .font(.system(size: 9, weight: .semibold))
                                            .foregroundColor(.white.opacity(0.5))
                                        Text(storyTimeRemaining(expiresAt))
                                            .font(.system(size: 12, weight: .medium))
                                            .foregroundColor(.white.opacity(0.55))
                                    }
                                }
                            }
                        }
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .frame(minHeight: 44)
                .accessibilityLabel("Profil de \(group.username)")
                .accessibilityHint("Ouvre le profil de \(group.username)")
            }

            Spacer()

            // Options menu (three dots)
            Menu {
                if let story = currentStory, let group = currentGroup {
                    if isOwnStory {
                        // External share via system share sheet (Messages,
                        // Mail, other apps). Only for public stories.
                        if story.isPublic, let externalShareURL = makeStoryExternalShareURL(story.id) {
                            ShareLink(
                                item: externalShareURL,
                                subject: Text("Story de @\(group.username)"),
                                message: Text("Regardez cette story sur Meeshy")
                            ) {
                                Label("Partager hors Meeshy", systemImage: "square.and.arrow.up")
                            }
                            Divider()
                        }
                        Button(role: .destructive) {
                            deleteCurrentStory()
                        } label: {
                            Label("Supprimer", systemImage: "trash")
                        }
                    } else {
                        Button {
                            selectedProfileUser = .from(storyGroup: group)
                        } label: {
                            Label("Voir le profil", systemImage: "person.fill")
                        }

                        // C.2: repost-as-post entry points. Gated on
                        // `story.isPublic` (B.2 helper) so we never expose
                        // these for FRIENDS / PRIVATE visibilities.
                        if story.isPublic {
                            Button {
                                repostAsPostDirect()
                            } label: {
                                Label("Republier en post", systemImage: "arrow.2.squarepath")
                            }

                            Button {
                                HapticFeedback.light()
                                pauseTimer()
                                editAndRepostAsPostSource = RepostPostSourceWrapper(
                                    story: story,
                                    authorHandle: group.username
                                )
                            } label: {
                                Label("Éditer et republier en post", systemImage: "square.and.pencil")
                            }

                            // Pilier 18 SOTA — external share complement
                            // (Messages, Mail, other apps) alongside the
                            // internal SharePicker flow that lives elsewhere.
                            if let externalShareURL = makeStoryExternalShareURL(story.id) {
                                ShareLink(
                                    item: externalShareURL,
                                    subject: Text("Story de @\(group.username)"),
                                    message: Text("Regardez cette story sur Meeshy")
                                ) {
                                    Label("Partager hors Meeshy", systemImage: "square.and.arrow.up")
                                }
                            }
                        }

                        Divider()

                        Button(role: .destructive) {
                            showReportSheet = true
                        } label: {
                            Label("Signaler", systemImage: "exclamationmark.triangle")
                        }
                    }
                }
            } label: {
                Image(systemName: "ellipsis")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundColor(.white.opacity(0.9))
                    .frame(width: 36, height: 36)
                    .background(
                        Circle()
                            .fill(.ultraThinMaterial)
                            .overlay(Circle().fill(Color.black.opacity(0.15)))
                            .overlay(Circle().stroke(Color.white.opacity(0.12), lineWidth: 0.5))
                    )
                    .shadow(color: .black.opacity(0.15), radius: 4, y: 2)
            }
            .frame(minWidth: 44, minHeight: 44)
            .accessibilityLabel("Options de la story")

            // Close button
            Button {
                HapticFeedback.light()
                dismissViewer()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundColor(.white.opacity(0.9))
                    .frame(width: 36, height: 36)
                    .background(
                        Circle()
                            .fill(.ultraThinMaterial)
                            .overlay(Circle().fill(Color.black.opacity(0.2)))
                            .overlay(Circle().stroke(Color.white.opacity(0.12), lineWidth: 0.5))
                    )
                    .shadow(color: .black.opacity(0.15), radius: 4, y: 2)
            }
            .frame(minWidth: 44, minHeight: 44)
            .accessibilityLabel("Fermer")
            .accessibilityHint("Ferme le lecteur de stories")
        }
        .sheet(item: $selectedProfileUser) { user in
            UserProfileSheet(user: user)
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
        }
        .sheet(isPresented: $showReportSheet) {
            ReportMessageSheet(accentColor: currentGroup?.avatarColor ?? "FF2D55") { type, reason in
                guard let storyId = currentStory?.id else { return }
                Task {
                    do {
                        try await reportStory(storyId, type, reason)
                        DispatchQueue.main.async {
                            HapticFeedback.success()
                            showReportSheet = false
                        }
                    } catch {
                        DispatchQueue.main.async {
                            HapticFeedback.error()
                            showReportSheet = false
                        }
                    }
                }
            }
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
        }
    }
}
