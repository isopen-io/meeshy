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

// MARK: - Story Action Rail Plan

/// Plan du rail d'actions — CALCULÉ D'UN BLOC À L'ENTRÉE DU SLIDE puis FIGÉ
/// pendant toute sa lecture (directive user 2026-07-10 : « le calcul des
/// boutons à afficher doit se faire avant affichage, même contenant toutes
/// les informations de compteur — pas des apparitions en second temps »).
///
/// Toutes les entrées proviennent du payload feed déjà en main (compteurs
/// inclus) : aucune résolution réseau n'est nécessaire pour décider du set.
/// Les VALEURS de compteurs affichées sur les boutons restent vivantes
/// (realtime), mais l'APPARTENANCE d'un bouton au rail ne change jamais en
/// cours de slide — un compteur réconcilié après coup ne fait plus surgir
/// un bouton au milieu de la lecture.
///
/// `nonisolated` : rule engine pur sans état partagé (parité
/// StoryCanvasFraming / BandStateMachine) — le target app compile en
/// defaultIsolation MainActor, sans ce modificateur le bundle de tests
/// (nonisolated) ne peut ni appeler `resolve` ni lire les propriétés
/// (échec CI ios-tests 2026-07-10, exit 65 = échec de COMPILE).
nonisolated struct StoryActionRailPlan: Equatable {
    let showsReact: Bool
    let showsReply: Bool
    let showsForward: Bool
    let showsRepost: Bool
    let showsViews: Bool
    let showsExport: Bool
    let showsSound: Bool
    let showsComments: Bool
    let showsTranslations: Bool

    static func resolve(
        isOwnStory: Bool,
        canReply: Bool,
        isPublicStory: Bool,
        hasAudibleSound: Bool,
        commentCount: Int,
        hasTranslatableContent: Bool
    ) -> StoryActionRailPlan {
        StoryActionRailPlan(
            showsReact: !isOwnStory,
            showsReply: !isOwnStory && canReply,
            showsForward: true,
            showsRepost: !isOwnStory && isPublicStory,
            showsViews: isOwnStory,
            showsExport: isOwnStory,
            showsSound: hasAudibleSound,
            showsComments: commentCount > 0,
            showsTranslations: !isOwnStory && hasTranslatableContent
        )
    }
}

// MARK: - Story Action Sidebar

/// Right-side action sidebar of the story viewer. Hosts the heart / reply /
/// send / share / export / mute / comments / translate buttons. Extracted
/// from `StoryViewerView.storyActionSidebar` (formerly an `AnyView`) so its
/// ~9-button `VStack` becomes its own type-metadata unit.
struct StoryActionSidebarView: View {
    let isOwnStory: Bool
    let storyReactionCount: Int
    /// True only when the *current viewer* has personally reacted to this
    /// story — drives the heart's indigo active state. Decoupled from
    /// `storyReactionCount > 0`, which is the global count (anyone).
    let storyCurrentUserHasReacted: Bool
    /// Ticks on every reaction sent (any path). `.onChange` drives `bounceHeart()`.
    let heartBouncePulse: Int
    let quickEmojis: [String]
    let onReplyToStory: ((ReplyContext) -> Void)?
    let currentStory: StoryItem?
    let currentGroup: StoryGroup?
    let storyCommentCount: Int
    /// Forward / external-share count for the Envoyer button label (user spec
    /// 2026-05-28: non-author sees counts on Réact + Comments + Envoyer).
    let storyShareCount: Int
    /// Author-only viewers count for the Vues button label.
    let storyViewCount: Int
    /// Repost-of-this-story count for the Partager button label (non-author
    /// + public stories only).
    let storyRepostCount: Int
    let isStoryCommentsEmpty: Bool
    let storyHasAudibleSound: Bool
    let storyHasTranslatableContent: Bool
    let isGlobalMuted: Bool
    let availableTranslationLanguages: [TranslationLanguage]
    /// Prisme « Exploration » : affiche la story dans la langue choisie (override éphémère).
    let onSelectLanguageOverride: (String) -> Void

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

    /// Transient scale of the heart button — driven only by `bounceHeart()`.
    @State private var heartScale: CGFloat = 1.0

    /// Plan du rail FIGÉ à l'entrée du slide (voir `StoryActionRailPlan`).
    /// Re-résolu UNIQUEMENT au changement de story — jamais sur une mise à
    /// jour de compteur mid-slide, donc aucun bouton n'apparaît/disparaît
    /// pendant la lecture.
    @State private var frozenRailPlan: StoryActionRailPlan?

    /// Résolution depuis les entrées courantes (payload déjà seedé de manière
    /// synchrone par `startTimer()` avant le rendu du slide).
    private var liveRailPlan: StoryActionRailPlan {
        StoryActionRailPlan.resolve(
            isOwnStory: isOwnStory,
            canReply: onReplyToStory != nil,
            isPublicStory: currentStory?.isPublic == true,
            hasAudibleSound: storyHasAudibleSound,
            commentCount: storyCommentCount,
            hasTranslatableContent: storyHasTranslatableContent
        )
    }

    private var railPlan: StoryActionRailPlan { frozenRailPlan ?? liveRailPlan }

    /// Quick pop on the heart button that confirms the user just sent a
    /// reaction. Phased spring, matching the style of `triggerStoryReaction`'s
    /// own multi-phase animation.
    private func bounceHeart() {
        withAnimation(.spring(response: 0.22, dampingFraction: 0.45)) {
            heartScale = 1.35
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.16) {
            withAnimation(.spring(response: 0.34, dampingFraction: 0.55)) {
                heartScale = 1.0
            }
        }
    }

    var body: some View {
        // On small iPhones (SE/mini) the 6–7 stacked action buttons can
        // exceed the available canvas height between header and composer.
        // `ViewThatFits` picks the natural VStack when it fits; otherwise
        // it falls back to a vertically-scrollable strip so every action
        // controller stays reachable. The parent (StoryCardView) bounds
        // `maxHeight` to the safe canvas-content slot so ViewThatFits has
        // a real constraint to evaluate against.
        //
        // Densité resserrée (directive user 2026-07-10 « rapprocher les FABs,
        // on y voit trop d'espace ») : spacing 8/6 au lieu de 20/14 — le rail
        // retrouve la compacité TikTok/IG, chaque action reste ≥ 44pt de zone
        // tappable via le padding du bouton.
        ViewThatFits(in: .vertical) {
            sidebarContent(spacing: 8)
            sidebarContent(spacing: 6)
            ScrollView(.vertical, showsIndicators: false) {
                sidebarContent(spacing: 6)
                    .padding(.vertical, 4)
            }
        }
        // Plan figé posé à l'apparition puis re-résolu au CHANGEMENT de slide
        // uniquement — les mises à jour de compteurs mid-slide ne re-déclenchent
        // jamais la composition du rail (directive 2026-07-10).
        .onAppear {
            if frozenRailPlan == nil { frozenRailPlan = liveRailPlan }
        }
        .adaptiveOnChange(of: currentStory?.id) { _, _ in
            frozenRailPlan = liveRailPlan
        }
    }

    @ViewBuilder
    private func sidebarContent(spacing: CGFloat) -> some View {
        VStack(spacing: spacing) {
            // 1. Reaction (heart) — primary action, brand-colored when active
            if railPlan.showsReact {
                StoryActionButton(
                    icon: "heart.fill",
                    label: storyReactionCount > 0 ? "\(storyReactionCount)" : "React",
                    isActive: showEmojiStrip || storyCurrentUserHasReacted,
                    activeColor: MeeshyColors.indigo500,
                    activeGlow: MeeshyColors.indigo500,
                    accentOutline: storyCurrentUserHasReacted ? "heart" : nil,
                    accentOutlineColor: Color(hex: currentGroup?.avatarColor ?? "FF2D55")
                ) {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                        showEmojiStrip.toggle()
                    }
                }
                .scaleEffect(heartScale)
                // Bounce on every reaction sent — via the quick strip below
                // OR the full-screen picker — since heartBouncePulse ticks
                // inside triggerStoryReaction, the single reaction-sent seam.
                .adaptiveOnChange(of: heartBouncePulse) { _, _ in
                    bounceHeart()
                }
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
            if railPlan.showsReply {
                StoryActionButton(
                    icon: "arrowshape.turn.up.left.fill",
                    label: "Répondre"
                ) {
                    HapticFeedback.light()
                    guard let story = currentStory, let group = currentGroup else { return }
                    EngagementTracker.shared.recordAction(.commented, surface: .storyViewer)
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

            // 3. Forward (send to someone) — label = count when > 0
            // (user spec 2026-05-28: « Compteur des react et des commentaires,
            // envoyer uniquement » pour le non-auteur).
            StoryActionButton(
                icon: "paperplane.fill",
                label: storyShareCount > 0 ? "\(storyShareCount)" : "Envoyer"
            ) {
                HapticFeedback.light()
                pauseTimer()
                if let story = currentStory, let group = currentGroup {
                    EngagementTracker.shared.recordAction(.shared, surface: .storyViewer)
                    sharedContentWrapper = SharedContentWrapper(content: .story(item: story, authorName: group.username))
                }
            }

            // 4. Reshare (republier la story) — non-auteur + story publique.
            // Réintroduit 2026-06-18 après finalisation du flux serveur : route
            // via le snapshot de repost (`PostService.repost` targetType .story).
            // Le gateway duplique le média + l'audio source et copie storyEffects
            // dans une STORY fraîche, self-contenue, liée via repostOfId. Remplace
            // l'ancien chemin composer qui produisait une story VIDE (il forçait
            // repostOfId: nil et ne dupliquait jamais le média source).
            if railPlan.showsRepost {
                StoryActionButton(
                    icon: "arrow.2.squarepath",
                    label: storyRepostCount > 0 ? "\(storyRepostCount)" : "Partager"
                ) {
                    guard let story = currentStory else { return }
                    HapticFeedback.light()
                    Task {
                        do {
                            _ = try await PostService.shared.repost(
                                postId: story.id,
                                targetType: .story,
                                content: nil,
                                isQuote: false
                            )
                            await MainActor.run {
                                HapticFeedback.success()
                                FeedbackToastManager.shared.show("Story republiée")
                            }
                        } catch APIError.serverError(404, _) {
                            await MainActor.run {
                                FeedbackToastManager.shared.showError("La story n'est plus disponible")
                            }
                        } catch APIError.serverError(403, _) {
                            await MainActor.run {
                                FeedbackToastManager.shared.showError("Cette story ne peut pas être repartagée")
                            }
                        } catch {
                            await MainActor.run {
                                FeedbackToastManager.shared.showError("Échec de la republication")
                            }
                        }
                    }
                }
            } else if railPlan.showsViews {
                StoryActionButton(
                    icon: "eye.fill",
                    label: storyViewCount > 0 ? "\(storyViewCount)" : "Vues"
                ) {
                    HapticFeedback.light()
                    pauseTimer()
                    showViewersSheet = true
                }
            }

            // Author-only export — bakes a fidèle-au-preview MP4 the user
            // can share to Photos / Messages / WhatsApp. Available pour
            // TOUTES les stories de l'auteur (static OU animée — le
            // compositor synthétise un substrat pour les statiques).
            // NEVER uploads to the Meeshy backend (stories publish RAW,
            // see CLAUDE.md "Story Architecture").
            if railPlan.showsExport {
                StoryActionButton(
                    icon: "square.and.arrow.up.fill",
                    label: "Exporter"
                ) {
                    HapticFeedback.light()
                    pauseTimer()
                    showExportShareSheet = true
                }
            }

            // 4. Mute/Unmute — only shown when the story has genuinely audible
            // sound (voice note, background audio, or a video carrying a real
            // audio track). Silent videos keep the button hidden.
            if railPlan.showsSound {
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

            // 5. Comments toggle — visible UNIQUEMENT quand au moins un
            // commentaire existe sur la story (pour TOUS, auteur inclus). Sous
            // la sidebar, la zone d'écriture en bas permet déjà de laisser le
            // premier commentaire, donc un bouton à 0 ne serait que du bruit
            // visuel (user spec 2026-05-28 + 2026-06-23 : ne pas afficher
            // l'icône commentaire si aucun commentaire n'est laissé).
            // MEMBERSHIP FIGÉE À L'ENTRÉE DU SLIDE (directive 2026-07-10) : la
            // réconciliation `loadStoryCommentCount()` (+Content) met toujours
            // le COMPTEUR à jour (label + prochains slides), mais ne fait plus
            // APPARAÎTRE ce bouton en cours de lecture — le set est décidé
            // avant affichage, depuis le payload feed.
            if railPlan.showsComments {
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
            if railPlan.showsTranslations {
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
                                // Prisme « Exploration » : bascule l'affichage dans la
                                // langue choisie (override) ; demande la traduction si absente.
                                onSelectLanguageOverride(lang.id)
                                guard let story = currentStory else { return }
                                Task {
                                    await StoryInteractionService().requestTranslation(
                                        storyId: story.id,
                                        targetLanguage: lang.id
                                    )
                                }
                            } label: {
                                // Drapeau dans un cercle de dimension fixe 38×38 : figé (déborderait s'il scalait, doctrine 86i) ; le bouton porte le libellé
                                Text(lang.flag)
                                    .font(.system(size: 22))
                                    .frame(width: 38, height: 38)
                                    .background(Circle().fill(Color.white.opacity(0.1)))
                            }
                            .accessibilityLabel(String(localized: "story.viewer.a11y.viewIn", defaultValue: "Voir en \(lang.name)", bundle: .main))
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
                    // Glyphe dans un cercle de dimension fixe 38×38 : figé (déborderait s'il scalait, doctrine 86i) ; le bouton porte le libellé
                    Image(systemName: "plus")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundColor(.white.opacity(0.85))
                }
            }
            .padding(.trailing, 10)
            .padding(.vertical, 6)
            .accessibilityLabel(String(localized: "story.viewer.a11y.requestTranslation", defaultValue: "Demander une traduction", bundle: .main))
            .accessibilityHint(String(localized: "story.viewer.a11y.requestTranslation.hint", defaultValue: "Ouvre la liste des langues pour demander une nouvelle traduction", bundle: .main))
        }
        .background(
            Capsule()
                .fill(.ultraThinMaterial)
                .overlay(Capsule().fill(Color.black.opacity(0.4)))
                .overlay(Capsule().stroke(Color.white.opacity(0.1), lineWidth: 0.5))
        )
        .accessibilityElement(children: .contain)
        .accessibilityLabel(String(localized: "story.viewer.a11y.availableTranslations", defaultValue: "Traductions disponibles", bundle: .main))
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

    /// Holds the freshly-minted `meeshy.me/l/<token>` URL for the current
    /// story share — the sheet at the end of `body` presents the system
    /// share UI as soon as it's non-nil and clears it on dismiss.
    @State private var shareableStoryLink: ShareableLink?

    /// Mints a TrackingLink for the given story (gateway route is shared
    /// with posts — a story IS a `PostType.STORY`), then surfaces the
    /// `meeshy.me/l/<token>` URL through `shareableStoryLink` so the
    /// system share sheet picks it up. Falls back to the raw URL when the
    /// mint fails so the user always has something to share.
    @MainActor
    private func mintAndShareStory(_ storyId: String) async {
        let fallback = makeStoryExternalShareURL(storyId)
        do {
            let result = try await PostService.shared.share(
                postId: storyId,
                platform: "system",
                generateLink: true
            )
            if let shortUrl = result.shortUrl, let url = URL(string: shortUrl) {
                shareableStoryLink = ShareableLink(url: url)
                HapticFeedback.light()
                return
            }
        } catch {
            // intentional fall-through: try raw URL fallback
        }
        if let fallback {
            shareableStoryLink = ShareableLink(url: fallback)
            HapticFeedback.light()
        } else {
            FeedbackToastManager.shared.showError("Lien indisponible")
        }
    }

    let makeStoryExternalShareURL: (String) -> URL?
    let storyTimeRemaining: (Date) -> String
    let deleteCurrentStory: () -> Void
    let repostAsPostDirect: () -> Void
    let pauseTimer: () -> Void
    let dismissViewer: () -> Void
    let reportStory: (_ storyId: String, _ reportType: String, _ reason: String?) async throws -> Void
    /// Toggle mode plein écran (session-scoped) exposé dans le menu hamburger.
    /// Quand `true`, le chrome est caché par défaut pour la session entière
    /// jusqu'au prochain toggle. Reseté par le parent quand le viewer se
    /// ferme — pas de persistance cross-session voulue.
    @Binding var isFullscreenStorySession: Bool
    /// Visibilité courante du chrome — utilisée pour synchroniser
    /// instantanément le glissement à l'activation du mode plein écran
    /// (`isFullscreenStorySession = true` ⇒ `chromeVisible = false`).
    @Binding var chromeVisible: Bool

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

                            // Pas de bordure gradient autour de l'avatar dans la
                            // slide : on est déjà dans la story de l'utilisateur,
                            // l'anneau « story dispo » serait redondant (cf. user
                            // request 2026-05-27). Le contexte `.storyViewer` suffit
                            // déjà à masquer l'anneau via `showsStoryRing == false`.
                            MeeshyAvatar(
                                name: group.username,
                                context: .storyViewer,
                                accentColor: group.avatarColor,
                                avatarURL: group.avatarURL,
                                onViewProfile: { selectedProfileUser = .from(storyGroup: group) },
                                contextMenuItems: [
                                    AvatarContextMenuItem(label: "Voir le profil", icon: "person.fill") {
                                        selectedProfileUser = .from(storyGroup: group)
                                    }
                                ]
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
                                .font(MeeshyFont.relative(15, weight: .bold))
                                .foregroundColor(.white)

                            if let story = currentStory {
                                HStack(spacing: 4) {
                                    Text(story.timeAgo)
                                        .font(MeeshyFont.relative(12, weight: .medium))
                                        .foregroundColor(.white.opacity(0.75))

                                    if story.repostOfId != nil {
                                        Image(systemName: "arrow.2.squarepath")
                                            .font(MeeshyFont.relative(10, weight: .semibold))
                                            .foregroundColor(.white.opacity(0.6))
                                        if let authorName = story.repostAuthorName {
                                            Text(String(localized: "story.viewer.via", defaultValue: "via @\(authorName)", bundle: .main))
                                                .font(MeeshyFont.relative(11, weight: .medium))
                                                .foregroundColor(.white.opacity(0.55))
                                        }
                                    }

                                    if let expiresAt = story.expiresAt, expiresAt.timeIntervalSinceNow > 0 {
                                        Text("\u{00B7}")
                                            .foregroundColor(.white.opacity(0.4))
                                        Image(systemName: "clock")
                                            .font(MeeshyFont.relative(9, weight: .semibold))
                                            .foregroundColor(.white.opacity(0.5))
                                        Text(storyTimeRemaining(expiresAt))
                                            .font(MeeshyFont.relative(12, weight: .medium))
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
                .accessibilityLabel(String(localized: "story.viewer.a11y.profileOf", defaultValue: "Profil de \(group.username)", bundle: .main))
                .accessibilityHint(String(localized: "story.viewer.a11y.profileOf.hint", defaultValue: "Ouvre le profil de \(group.username)", bundle: .main))
            }

            Spacer()

            // Options menu (three dots)
            Menu {
                // Toggle mode plein écran (session-scoped) — pertinent quelle
                // que soit la propriété de la story. Placé en tête du menu
                // pour être accessible immédiatement, avec un `Divider`
                // suivant qui le sépare visuellement des actions destructives
                // ou de partage propres à la story courante.
                Button {
                    HapticFeedback.light()
                    isFullscreenStorySession.toggle()
                    // Synchronise instantanément l'état au repos du chrome :
                    // mode actif ⇒ caché ; mode inactif ⇒ visible. Le
                    // touch-and-hold inversera ce repos pendant le hold.
                    withAnimation(.spring(response: 0.32, dampingFraction: 0.78)) {
                        chromeVisible = !isFullscreenStorySession
                    }
                } label: {
                    Label(
                        isFullscreenStorySession
                            ? String(localized: "story.viewer.fullscreen.exit", defaultValue: "Quitter le plein écran", bundle: .main)
                            : String(localized: "story.viewer.fullscreen.enter", defaultValue: "Plein écran", bundle: .main),
                        systemImage: isFullscreenStorySession
                            ? "arrow.down.right.and.arrow.up.left"
                            : "arrow.up.left.and.arrow.down.right"
                    )
                }

                Divider()

                if let story = currentStory, let group = currentGroup {
                    if isOwnStory {
                        // External share via system share sheet (Messages,
                        // Mail, other apps). Only for public stories.
                        // The link is minted on tap so the user always
                        // shares a trackable `meeshy.me/l/<token>` URL.
                        if story.isPublic {
                            Button {
                                Task { await mintAndShareStory(story.id) }
                            } label: {
                                Label(String(localized: "story.viewer.share.external", defaultValue: "Partager hors Meeshy", bundle: .main), systemImage: "square.and.arrow.up")
                            }
                            Divider()
                        }
                        Button(role: .destructive) {
                            deleteCurrentStory()
                        } label: {
                            Label(String(localized: "story.viewer.delete", defaultValue: "Supprimer", bundle: .main), systemImage: "trash")
                        }
                    } else {
                        Button {
                            selectedProfileUser = .from(storyGroup: group)
                        } label: {
                            Label(String(localized: "story.viewer.viewProfile", defaultValue: "Voir le profil", bundle: .main), systemImage: "person.fill")
                        }

                        // C.2: repost-as-post entry points. Gated on
                        // `story.isPublic` (B.2 helper) so we never expose
                        // these for FRIENDS / PRIVATE visibilities.
                        if story.isPublic {
                            Button {
                                repostAsPostDirect()
                            } label: {
                                Label(String(localized: "story.viewer.repostAsPost", defaultValue: "Republier en post", bundle: .main), systemImage: "arrow.2.squarepath")
                            }

                            Button {
                                HapticFeedback.light()
                                pauseTimer()
                                editAndRepostAsPostSource = RepostPostSourceWrapper(
                                    story: story,
                                    authorHandle: group.username
                                )
                            } label: {
                                Label(String(localized: "story.viewer.editAndRepostAsPost", defaultValue: "Éditer et republier en post", bundle: .main), systemImage: "square.and.pencil")
                            }

                            // Pilier 18 SOTA — external share complement
                            // (Messages, Mail, other apps) alongside the
                            // internal SharePicker flow that lives elsewhere.
                            // Mint the TrackingLink on tap so the shared
                            // URL is `meeshy.me/l/<token>` and the author
                            // can track external opens.
                            Button {
                                Task { await mintAndShareStory(story.id) }
                            } label: {
                                Label(String(localized: "story.viewer.share.external", defaultValue: "Partager hors Meeshy", bundle: .main), systemImage: "square.and.arrow.up")
                            }
                        }

                        Divider()

                        Button(role: .destructive) {
                            showReportSheet = true
                        } label: {
                            Label(String(localized: "story.viewer.report", defaultValue: "Signaler", bundle: .main), systemImage: "exclamationmark.triangle")
                        }
                    }
                }
            } label: {
                // Glyphe chrome dans un cadre de tap fixe 36×36 : figé (doctrine 82i) ; le bouton porte le libellé
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
            .accessibilityLabel(String(localized: "story.viewer.a11y.options", defaultValue: "Options de la story", bundle: .main))

            // Close button
            Button {
                HapticFeedback.light()
                dismissViewer()
            } label: {
                // Glyphe chrome dans un cadre de tap fixe 36×36 : figé (doctrine 82i) ; le bouton porte le libellé
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
            .accessibilityLabel(String(localized: "common.close", defaultValue: "Fermer", bundle: .main))
            .accessibilityHint(String(localized: "story.viewer.a11y.close.hint", defaultValue: "Ferme le lecteur de stories", bundle: .main))
        }
        .sheet(item: $selectedProfileUser) { user in
            UserProfileSheet(
                user: user,
                presenceProvider: { PresenceManager.shared.knownPresenceState(for: $0) },
                postsContent: { uid in AnyView(ProfileUserPostsList(
                    userId: uid,
                    onOpenPost: { post in ProfilePostsOpener.openPost(post) { selectedProfileUser = nil } },
                    onOpenReel: { reel, reels in ProfilePostsOpener.openReel(reel, in: reels) { selectedProfileUser = nil } }
                )) }
            )
            .presentationDetents([.large, .medium])
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
        .sheet(item: $shareableStoryLink) { link in
            // Trackable `meeshy.me/l/<token>` URL minted in
            // `mintAndShareStory` — the author owns the analytics.
            ShareSheet(activityItems: [link.url])
        }
    }
}
