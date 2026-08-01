import SwiftUI
import Combine
import os
import MeeshySDK
import MeeshyUI

/// Session d'édition d'une story publiée (directive 2026-07-29) : porte
/// l'item ET le VM du composer pré-hydraté (`StoryComposerViewModel(editing:)`)
/// pour que le callback de publish relise les champs d'édition
/// (`editingHydratedBackgroundImage`, ids des médias originaux…) du MÊME VM
/// que celui monté dans le composer.
struct StoryEditSession: Identifiable {
    let story: StoryItem
    let composer: StoryComposerViewModel
    var id: String { story.id }
}

extension View {
    /// Cover du composer en mode ÉDITION — partagé par le tray et la mini
    /// trail épinglée (les deux surfaces « Mes stories »). Le publish route
    /// vers `StoryViewModel.updateStoryInBackground` (PUT + reset
    /// d'engagement serveur) au lieu de `publishStoryInBackground`.
    func storyEditComposerCover(
        session: Binding<StoryEditSession?>,
        viewModel: StoryViewModel
    ) -> some View {
        fullScreenCover(item: session) { current in
            StoryComposerView(
                viewModel: current.composer,
                onPublishAllInBackground: { slides, slideImages, loadedImages, loadedVideoURLs, loadedAudioURLs, originalLanguage, visibility, visibilityUserIds in
                    let edit = StoryViewModel.StoryEditContext(
                        postId: current.composer.editingPostId ?? current.story.id,
                        originalMediaIds: current.composer.editingOriginalMediaIds,
                        originalBackgroundMediaId: current.composer.editingOriginalBackgroundMediaId,
                        hydratedBackgroundImage: current.composer.editingHydratedBackgroundImage
                    )
                    let accepted = viewModel.updateStoryInBackground(
                        edit: edit,
                        slides: slides,
                        slideImages: slideImages,
                        loadedImages: loadedImages,
                        loadedVideoURLs: loadedVideoURLs,
                        loadedAudioURLs: loadedAudioURLs,
                        originalLanguage: originalLanguage,
                        visibility: visibility,
                        visibilityUserIds: visibilityUserIds
                    )
                    // Hors-ligne : le composer reste ouvert, rien n'est perdu —
                    // et le `false` remonté relâche son loquet de publication.
                    if accepted { session.wrappedValue = nil }
                    return accepted
                },
                onDismiss: { session.wrappedValue = nil }
            )
            .storyLocationPickerProvided()
            .storyCameraCaptureProvided()
            .storyRecentCameraRollProvided()
        }
    }
}

struct StoryTrayView: View {
    @ObservedObject var viewModel: StoryViewModel
    /// Optionnel : surcharge de présentation. `nil` (défaut) → chemin canonique
    /// unique via `StoryViewerCoordinator` (`.fullScreenCover(item:)` au niveau
    /// root). Avant, chaque hôte (feeds iPad/iPhone) câblait son propre
    /// `.fullScreenCover(isPresented:)` + variable `selectedStoryUserId` séparée :
    /// SwiftUI évaluait le cover avec l'uid encore `nil` (capture périmée) → écran
    /// noir « story introuvable ». Le coordinator capture la requête atomiquement.
    var onViewStory: ((String) -> Void)? = nil
    var onAddStatus: (() -> Void)? = nil

    private var theme: ThemeManager { ThemeManager.shared }
    @Environment(\.colorScheme) private var colorScheme
    /// U1 — namespace zoom injecté par RootView (nil hors de ce sous-arbre
    /// ou < iOS 18 : les helpers sont no-op, transition historique).
    @Environment(\.zoomTransitionNamespace) private var zoomNamespace
    private var isDark: Bool { colorScheme == .dark }
    // Lecture directe sans @ObservedObject — évite que chaque event presence force
    // un re-render complet du tray. La présence est rafraîchie lors des refreshs naturels.
    private var presenceManager: PresenceManager { PresenceManager.shared }
    @EnvironmentObject private var statusViewModel: StatusViewModel
    // Capturés uniquement pour être RÉINJECTÉS sur la sheet « Mes stories » :
    // une présentation crée une nouvelle hiérarchie, et la sheet interne
    // `SharePickerView` (« Transférer ») crasherait sur un environment object
    // manquant. (Le cover du composer, lui, est monté aux racines depuis S5 —
    // cf. `StoryComposerCover`.)
    @EnvironmentObject private var router: Router
    @EnvironmentObject private var conversationListViewModel: ConversationListViewModel
    @EnvironmentObject private var storyViewerCoordinator: StoryViewerCoordinator
    @State private var selectedProfileUser: ProfileSheetUser?
    /// Sheet « Mes stories envoyées » (gestion : ouvrir, vues, partager,
    /// republier, supprimer). Directive user 2026-07-14.
    @State private var showMyStories = false
    /// Intention posée pendant la fermeture de la sheet, exécutée par son
    /// `onDismiss` — remplace le pari des 350 ms (cf. `StoryTrayActions`).
    @State private var myStoriesFollowUp = DeferredSheetFollowUp<MyStoriesFollowUp>()
    /// Session d'édition d'une story publiée (composer en mode édition).
    @State private var editingStorySession: StoryEditSession?

    var body: some View {
        VStack(spacing: 0) {
            // Cache-first: only show the skeleton row when the carousel
            // has no cached groups AND a load is in flight. Once any
            // story arrives (even from a stale cache) we drop straight
            // into the live scroll view so the row never jumps.
            if SkeletonVisibilityResolver.shouldShowSkeleton(
                isLoading: viewModel.isLoading,
                hasCachedData: !viewModel.storyGroups.isEmpty
            ) {
                SkeletonStoryTrayRow()
            } else {
                storyScrollView
            }
        }
        .frame(height: 120)
        .myStoriesSheet(
            isPresented: $showMyStories,
            followUp: $myStoriesFollowUp,
            viewModel: viewModel,
            userId: AuthManager.shared.currentUser?.id ?? "",
            statusViewModel: statusViewModel,
            router: router,
            conversationListViewModel: conversationListViewModel,
            perform: { action in
                // Aucun `Task`, aucun `sleep` : `onDismiss` s'exécute APRÈS la
                // fin réelle du dismiss, la présentation cible est libre.
                switch action {
                case .openViewer(let postId):
                    storyViewerCoordinator.present(StoryViewerRequest(
                        id: AuthManager.shared.currentUser?.id ?? "",
                        singleGroup: true, postId: postId))
                case .createStory:
                    viewModel.showStoryComposer = true
                case .editStory(let story):
                    editingStorySession = StoryEditSession(
                        story: story,
                        composer: StoryComposerViewModel(editing: story))
                }
            }
        )
        .storyEditComposerCover(session: $editingStorySession, viewModel: viewModel)
        .sheet(item: $selectedProfileUser) { user in
            UserProfileSheet(
                user: user,
                moodEmoji: statusViewModel.statusForUser(userId: user.userId ?? "")?.moodEmoji,
                onMoodTap: statusViewModel.moodTapHandler(for: user.userId ?? ""),
                presenceProvider: { PresenceManager.shared.knownPresenceState(for: $0) },
                postsContent: { uid in AnyView(ProfileUserPostsList(
                    userId: uid,
                    onOpenPost: { post in ProfilePostsOpener.openPost(post) { selectedProfileUser = nil } },
                    onOpenReel: { reel, reels in ProfilePostsOpener.openReel(reel, in: reels) { selectedProfileUser = nil } }
                )) }
            )
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
        }
    }

    // MARK: - Story Scroll View

    private var storyScrollView: some View {
        let currentUserId = AuthManager.shared.currentUser?.id ?? ""
        // F5 — cap stagger to first 10 visible rings. Beyond that the
        // 0.05s × index delay becomes a multi-second "pop-in" parade
        // (50 rings = 2.5s) which feels like lag, not animation.
        // Late rings appear instantly when scrolled into view.
        let staggerCap = 10
        return ScrollView(.horizontal, showsIndicators: false) {
            // F5 — `LazyHStack` instead of `HStack` so off-screen rings
            // are not materialised. A heavy user with 50+ story groups
            // previously instantiated all 50 `MeeshyAvatar` instances at
            // tray load (~8-12MB) even when only 4-5 fit on screen.
            LazyHStack(spacing: 12) {
                myStoryButton
                    .bounceOnAppear(delay: 0)

                ForEach(Array(viewModel.storyGroups.filter { $0.id != currentUserId && !$0.isFullyExpired() }.enumerated()), id: \.element.id) { visibleIndex, group in
                    Group {
                        if visibleIndex < staggerCap {
                            storyRingCell(for: group)
                                .staggeredAppear(index: visibleIndex, baseDelay: 0.05)
                        } else {
                            storyRingCell(for: group)
                        }
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
        }
    }

    // MARK: - My Story Button (utilisateur connecté)

    private var myStoryButton: some View {
        MyStoryButton(
            viewModel: viewModel,
            onViewMyStory: {
                // Chemin de présentation unique : le coordinator (covers
                // RootView / iPadRootView) remplace l'ancien fullScreenCover
                // local — « ma story » est un contexte « personne précise ».
                storyViewerCoordinator.present(StoryViewerRequest(
                    id: AuthManager.shared.currentUser?.id ?? "",
                    singleGroup: true
                ))
            },
            onAddStatus: onAddStatus,
            onManageStories: { showMyStories = true }
        )
        // U1 inc.2 — « ma story » zoome aussi (id vide jamais matché → fallback).
        .zoomTransitionSource(id: AuthManager.shared.currentUser?.id ?? "", in: zoomNamespace)
    }

    // MARK: - Story Ring

    /// Full-size trail ring — thin wrapper over the shared `StoryRingCell` so
    /// the grande trail and the pinned mini-trail render an identical cell,
    /// only differing by `context` size.
    private func storyRingCell(for group: StoryGroup) -> some View {
        StoryRingCell(
            group: group,
            onViewStory: { presentStory(userId: group.id) },
            onShowProfile: { selectedProfileUser = .from(storyGroup: group) }
        )
        // U1 — source de la transition zoom : la bulle « devient » le viewer
        // (id = userId du groupe, apparié au sourceID du cover RootView).
        .zoomTransitionSource(id: group.id, in: zoomNamespace)
    }

    /// Chemin de présentation unique pour toute la trail (feeds + chats). Si un
    /// hôte fournit `onViewStory`, on le respecte ; sinon on passe par le
    /// coordinator — `.fullScreenCover(item:)` au root capture la requête sans
    /// race d'uid, éliminant l'écran noir « story introuvable » du chemin feeds.
    private func presentStory(userId: String) {
        if let onViewStory {
            onViewStory(userId)
        } else {
            storyViewerCoordinator.present(
                StoryViewerRequest(id: userId, startAtFirstUnviewed: true)
            )
        }
    }

}

// MARK: - Story Ring Cell (shared by grande + compact pinned trail)

/// One story group rendered as avatar ring + (optional) username, sharing the
/// exact same `MeeshyAvatar` atom across the full-size trail and the compact
/// pinned mini-trail. `context` drives the size (`.storyTray` 88pt vs
/// `.storyTrayCompact` 44pt); all proportional metrics derive from it.
struct StoryRingCell: View {
    let group: StoryGroup
    var context: AvatarContext = .storyTray
    var showsUsername: Bool = true
    let onViewStory: () -> Void
    let onShowProfile: () -> Void
    /// Entrées de menu SUPPLÉMENTAIRES, propres à un usage précis de la
    /// cellule. La mini-trail y injecte « Gérer mes stories » sur son PROPRE
    /// anneau : depuis que le tap y ouvre le viewer, c'est le seul chemin
    /// restant vers la gestion — et vers l'ÉDITION d'une story publiée — quand
    /// la grande trail est scrollée hors écran.
    var contextMenuExtras: [AvatarContextMenuItem] = []

    private var theme: ThemeManager { ThemeManager.shared }
    private var presenceManager: PresenceManager { PresenceManager.shared }
    @EnvironmentObject private var statusViewModel: StatusViewModel

    private var isCompact: Bool { context.size <= 44 }

    var body: some View {
        VStack(spacing: isCompact ? 4 : 5) {
            ZStack {
                MeeshyAvatar(
                    name: group.username,
                    context: context,
                    accentColor: group.avatarColor,
                    avatarURL: latestStoryThumbnailURL(group),
                    storyState: group.hasUnviewed ? .unread : .read,
                    moodEmoji: statusViewModel.statusForUser(userId: group.id)?.moodEmoji,
                    presenceState: presenceManager.presenceState(for: group.id),
                    onMoodTap: statusViewModel.moodTapHandler(for: group.id),
                    contextMenuItems: [
                        AvatarContextMenuItem(label: StoryTrayCopy.viewStories, icon: "play.circle.fill") {
                            onViewStory()
                        },
                        AvatarContextMenuItem(label: StoryTrayCopy.viewProfile, icon: "person.fill") {
                            onShowProfile()
                        }
                    ] + contextMenuExtras
                )

                // Story count dots (multiple stories indicator) — offset scales
                // with the avatar so it stays pinned to the bottom edge.
                if group.stories.count > 1 {
                    storyCountDots(count: group.stories.count, unviewed: group.hasUnviewed)
                        .offset(y: context.size * 0.318)
                }
            }

            if showsUsername {
                Text(group.username)
                    .font(MeeshyFont.relative(isCompact ? 9 : 10, weight: group.hasUnviewed ? .semibold : .medium))
                    .foregroundColor(group.hasUnviewed ? theme.textPrimary : theme.textMuted)
                    .lineLimit(1)
                    .frame(width: isCompact ? 56 : 96)
            }
        }
        .contentShape(Rectangle())
        .onTapGesture {
            HapticFeedback.medium()
            Logger.messages.info("[StoryRingCell] tap ring group.id=\(group.id, privacy: .public) username=\(group.username, privacy: .public)")
            onViewStory()
        }
    }
}

// MARK: - Story Count Dots (shared)

@ViewBuilder
fileprivate func storyCountDots(count: Int, unviewed: Bool) -> some View {
    HStack(spacing: 3) {
        ForEach(0..<min(count, 5), id: \.self) { _ in
            Circle()
                .fill(unviewed ? Color.white.opacity(0.85) : Color.white.opacity(0.25))
                .frame(width: 4, height: 4)
        }
        if count > 5 {
            Text("+")
                .font(MeeshyFont.relative(8, weight: .bold))
                .foregroundColor(.white.opacity(0.5))
        }
    }
    .accessibilityHidden(true)
}

// MARK: - Thumbnail Helper

/// URL de la miniature de la dernière story du groupe — user request
/// 2026-05-27 « dans la tray il faut mettre la vue miniature de la
/// dernière story du groupe ». `stories` est trié ascendant par
/// `createdAt` (cf. `FeedDataResponse.toStoryGroups`), donc `last` =
/// plus récente. Préfère `thumbnailUrl` (servi optimisé par le
/// gateway) au full `url` si dispo. Fallback sur l'avatar du profil
/// pour les stories text-only (pas de media). Helper fileprivate
/// pour pouvoir s'appeler depuis `MyStoryButton` aussi.
fileprivate func latestStoryThumbnailURL(_ group: StoryGroup) -> String? {
    guard let lastStory = group.stories.last else { return group.avatarURL }
    // Local-first: a composite cover rendered at publish (text + drawing + all
    // layers) wins over the server thumbnail (raw bg, no overlays). Synchronous
    // existence check — no actor hop, safe in the View body.
    let localCover = CacheCoordinator.thumbnailLocalFileURL(
        for: StoryCoverThumbnail.cacheKey(storyId: lastStory.id)
    )
    return StoryCoverThumbnail.preferredCoverURLString(
        localCover: localCover,
        serverThumbnailUrl: lastStory.media.first?.thumbnailUrl,
        mediaUrl: lastStory.media.first?.url,
        mediaIsImage: lastStory.media.first?.type == .image,
        avatarURL: group.avatarURL
    )
}

// MARK: - My Story Button (extracted struct to avoid PAC issues with @ViewBuilder + @EnvironmentObject)

private struct MyStoryButton: View {
    let viewModel: StoryViewModel
    let onViewMyStory: () -> Void
    var onAddStatus: (() -> Void)?
    var onManageStories: (() -> Void)?

    // Lecture directe sans @ObservedObject — leaf view rendue dans le tray,
    // évite que chaque changement de thème force un re-render du bouton.
    private var theme: ThemeManager { ThemeManager.shared }
    @EnvironmentObject private var statusViewModel: StatusViewModel

    var body: some View {
        let currentUser = AuthManager.shared.currentUser
        let userId = currentUser?.id ?? ""
        // Un groupe entièrement expiré est traité comme « pas de story » : on
        // affiche le bouton d'ajout, jamais un anneau dont le viewer se fermerait
        // aussitôt (`skipUnplayableStoriesIfNeeded`). Cohérent avec le filtre du tray.
        let myGroup = viewModel.storyGroupForUser(userId: userId).flatMap { $0.isFullyExpired() ? nil : $0 }
        let hasMyStory = myGroup != nil
        let userName = currentUser?.displayName ?? currentUser?.username ?? "Moi"
        let accentColor = DynamicColorGenerator.colorForName(currentUser?.username ?? "")
        let storyState: StoryRingState = myGroup.map { $0.hasUnviewed ? .unread : .read } ?? .none
        let myMoodEmoji = statusViewModel.statusForUser(userId: userId)?.moodEmoji

        VStack(spacing: 5) {
            ZStack {
                MeeshyAvatar(
                    name: userName,
                    context: .storyTray,
                    accentColor: accentColor,
                    avatarURL: myGroup.flatMap { latestStoryThumbnailURL($0) } ?? currentUser?.avatar,
                    storyState: storyState,
                    moodEmoji: myMoodEmoji,
                    onTap: {
                        // Une seule règle, testable, pour le routage ET pour
                        // l'annonce VoiceOver (cf. `StoryTrayActionResolver`).
                        switch StoryTrayActionResolver.avatarTap(hasMyStory: hasMyStory) {
                        case .viewMyStory:  onViewMyStory()
                        case .createStory:  viewModel.showStoryComposer = true
                        }
                        HapticFeedback.medium()
                    },
                    onMoodTap: { _ in
                        onAddStatus?()
                        HapticFeedback.medium()
                    },
                    contextMenuItems: {
                        // « Voir ma story » a disparu du menu : le TAP y mène
                        // désormais directement. La gestion, elle, n'a pas
                        // d'autre porte — elle reste ici.
                        var items: [AvatarContextMenuItem] = []
                        if hasMyStory {
                            items.append(AvatarContextMenuItem(label: StoryTrayCopy.manageStories, icon: "rectangle.stack.fill") {
                                onManageStories?()
                                HapticFeedback.medium()
                            })
                        }
                        items.append(AvatarContextMenuItem(label: StoryTrayCopy.addStory, icon: "plus.circle.fill") {
                            viewModel.showStoryComposer = true
                            HapticFeedback.medium()
                        })
                        items.append(AvatarContextMenuItem(label: StoryTrayCopy.changeMood, icon: "face.smiling.inverse") {
                            onAddStatus?()
                            HapticFeedback.medium()
                        })
                        return items
                    }()
                )
                // Le libellé porte sur la cible RÉELLEMENT tapée — l'avatar — et
                // sur elle seule. `MeeshyAvatar` s'annonce avec le nom de la
                // personne (« Moi »), ce qui ne dit rien de la destination ;
                // `.combine` refait ici un élément unique dont le libellé est
                // ensuite remplacé. Posé plus haut, sur le `VStack` racine, il
                // aurait avalé les trois autres cibles du sous-arbre (bouton
                // mood, badge « + », contrôles d'upload) : sous VoiceOver le
                // badge « + » aurait cessé d'être un bouton nommé, alors que
                // c'est justement l'affordance « composer TOUJOURS ».
                .accessibilityElement(children: .combine)
                .accessibilityLabel(StoryTrayActionResolver.avatarAccessibilityLabel(hasMyStory: hasMyStory))
                // Fusionné, l'élément héritait du type de ses enfants (une
                // image) : VoiceOver annonçait une destination sans dire que
                // c'était actionnable.
                .accessibilityAddTraits(.isButton)
                .overlay(alignment: .bottomTrailing) {
                    if myMoodEmoji == nil {
                        Button {
                            onAddStatus?()
                            HapticFeedback.medium()
                        } label: {
                            // user request 2026-05-28 — placeholder = x0.8 du
                            // bouton (+) (40pt) → 32pt frame, glyph à 0.65×
                            // pour garder la parité avec l'emoji mood animé
                            // (cf. MeeshyAvatar.badgeSize .storyTray).
                            // Emoji dans un cercle de dimension fixe 32×32 : figé (déborderait s'il scalait, doctrine 86i)
                            Text("\u{1F4AD}")
                                .font(.system(size: 20))
                                .frame(width: 32, height: 32)
                                .background(Circle().fill(theme.backgroundPrimary))
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(String(localized: "story.tray.a11y.changeMood", defaultValue: "Changer mon mood", bundle: .main))
                    }
                }
                .overlay {
                    if let surfaced = StoryUploadPresentation.surfaced(in: viewModel.activeUploads) {
                        StoryUploadOverlay(
                            upload: surfaced.upload,
                            stackedCount: surfaced.stackedCount,
                            onRetry: { viewModel.retryUpload(id: surfaced.upload.id) },
                            onCancel: { viewModel.cancelUpload(id: surfaced.upload.id) }
                        )
                    }
                }
                // C5 — le badge « + » est appliqué APRÈS l'anneau d'upload,
                // donc AU-DESSUS : composer une 2e story pendant qu'une monte
                // n'est plus interdit, et l'anneau en état `.failed`
                // (`allowsHitTesting(isFailed)`) ne doit pas lui voler le tap.
                .overlay(alignment: .topLeading) {
                    // Composer entry badge — discoverable affordance for adding
                    // a new story without going through long-press menu. Visible
                    // et tapable EN PERMANENCE, y compris pendant un upload. The
                    // plus sign uses brand gradient matching the published
                    // `MeeshyColors.brandGradient`.
                    Button {
                        viewModel.showStoryComposer = true
                        HapticFeedback.medium()
                    } label: {
                        // User request 2026-07-04 : le (+) était COUPÉ en
                        // haut du tray — l'offset négatif (-4,-4) le
                        // faisait déborder du cadre de la cellule, et le
                        // conteneur scrollable rognait tout dépassement.
                        // Le badge est désormais ENTIÈREMENT contenu dans
                        // les bounds de l'avatar (topLeading sans offset,
                        // 34pt au lieu de 40) : plus rien ne peut être
                        // rogné, quel que soit le clipping parent.
                        // Glyphe dans un cercle de dimension FIXE : figé
                        // (déborderait s'il scalait, doctrine 86i) ; le
                        // bouton porte le libellé.
                        Image(systemName: "plus")
                            .font(.system(size: 19, weight: .bold))
                            .foregroundStyle(Color.white)
                            .frame(width: 34, height: 34)
                            .background(
                                Circle()
                                    .fill(MeeshyColors.brandGradient)
                                    .overlay(Circle().stroke(theme.backgroundPrimary, lineWidth: 2.5))
                            )
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(String(localized: "story.tray.addStory",
                                               defaultValue: "Ajouter une story"))
                }

                // Story count dots (si plusieurs stories)
                if let group = myGroup, group.stories.count > 1 {
                    HStack(spacing: 3) {
                        ForEach(0..<min(group.stories.count, 5), id: \.self) { _ in
                            Circle()
                                .fill(group.hasUnviewed ? Color.white.opacity(0.85) : Color.white.opacity(0.25))
                                .frame(width: 4, height: 4)
                        }
                        if group.stories.count > 5 {
                            Text("+")
                                .font(MeeshyFont.relative(8, weight: .bold))
                                .foregroundColor(.white.opacity(0.5))
                        }
                    }
                    .offset(y: 28)
                    .accessibilityHidden(true)
                }
            }

            Text(String(localized: "story.tray.me", defaultValue: "Moi", bundle: .main))
                .font(MeeshyFont.relative(10, weight: .semibold))
                .foregroundColor(theme.textSecondary)
        }
    }
}

// MARK: - Story Upload Overlay

private struct StoryUploadOverlay: View {
    let upload: StoryViewModel.StoryUploadState
    /// Publications empilées derrière celle-ci (C5). > 0 → pastille « +N ».
    let stackedCount: Int
    let onRetry: () -> Void
    let onCancel: () -> Void

    private var isFailed: Bool { upload.phase.isFailed }

    /// L'anneau reste à 0 % tant qu'aucun octet n'est parti : la règle
    /// d'attente vit dans `UploadPhase.isWaiting`, partagée avec la ligne de
    /// « Mes stories ».
    private var displayedProgress: Double {
        upload.phase.isWaiting ? 0 : upload.progress
    }

    private var a11yLabel: String {
        StoryUploadPresentation.a11yLabel(
            for: upload.phase,
            progress: upload.progress,
            stackedCount: stackedCount
        )
    }

    var body: some View {
        ZStack {
            Image(uiImage: upload.thumbnailImage)
                .resizable()
                .scaledToFill()
                .frame(width: 44, height: 44)
                .clipShape(Circle())
                .opacity(0.2)

            Circle()
                .stroke(Color.white.opacity(0.1), lineWidth: 3)
                .frame(width: 50, height: 50)

            if isFailed {
                Circle()
                    .stroke(MeeshyColors.error, lineWidth: 3)
                    .frame(width: 50, height: 50)

                // Glyphe dans un cercle d'upload de dimension fixe 50×50 : figé (déborderait s'il scalait, doctrine 86i)
                Image(systemName: "exclamationmark.triangle")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundColor(.white)
            } else {
                Circle()
                    .trim(from: 0, to: displayedProgress)
                    .stroke(
                        MeeshyColors.brandGradient,
                        style: StrokeStyle(lineWidth: 3, lineCap: .round)
                    )
                    .frame(width: 50, height: 50)
                    .rotationEffect(.degrees(-90))
                    .animation(.linear(duration: 0.3), value: displayedProgress)

                // Texte dans un cercle d'upload de dimension fixe 50×50 : figé (déborderait s'il scalait, doctrine 86i)
                Text("\(Int(displayedProgress * 100))%")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(.white)
            }
        }
        .overlay(alignment: .bottomTrailing) {
            if stackedCount > 0 {
                // Glyphe dans un cercle de dimension FIXE 18×18 : police figée
                // (déborderait s'il scalait, doctrine 86i) ; le libellé
                // accessible complet vit sur l'overlay.
                Text("+\(stackedCount)")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundColor(.white)
                    .frame(width: 18, height: 18)
                    .background(
                        Circle()
                            .fill(MeeshyColors.indigo600)
                            .overlay(Circle().stroke(Color.black.opacity(0.35), lineWidth: 1))
                    )
                    .accessibilityHidden(true)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(a11yLabel)
        .onTapGesture {
            if isFailed { onRetry() }
        }
        .contextMenu {
            if isFailed {
                Button { onRetry() } label: {
                    Label(String(localized: "story.tray.retry", defaultValue: "Reessayer", bundle: .main), systemImage: "arrow.clockwise")
                }
                Button(role: .destructive) { onCancel() } label: {
                    Label(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .main), systemImage: "trash")
                }
            }
        }
        // While `.uploading`/`.publishing`, this overlay must NOT swallow the
        // tap/long-press meant for the `MeeshyAvatar` underneath (which opens
        // "Gérer mes stories" via `onManageStories`) — only `.failed` has a
        // real gesture to offer here (retry). `allowsHitTesting(false)` makes
        // the whole overlay click-through so both gestures fall to the avatar.
        .allowsHitTesting(isFailed)
    }
}

// MARK: - Pinned Mini Story Trail (revealed inside the collapsed header)

/// Compact story trail pinned *inside* the header, below the title + actions.
/// It fades/slides in as the full-size `StoryTrayView` scrolls up under the
/// header so the stories stay reachable without taking a full row. Per product
/// decision the connected user's avatar is replaced by a single leading "+"
/// (add a story); everyone else's rings render at half size
/// (`.storyTrayCompact`, 44pt) with the same design and horizontal scroll.
struct PinnedStoryTrailBand: View {
    /// U1 inc.2 — namespace zoom injecté par RootView (no-op < iOS 18/nil).
    @Environment(\.zoomTransitionNamespace) private var zoomNamespace
    @ObservedObject var viewModel: StoryViewModel
    /// Same negative scroll offset the `CollapsibleHeader` consumes (0 at rest,
    /// more negative as the content scrolls up).
    let scrollOffset: CGFloat
    /// Optionnel : surcharge de présentation. `nil` (défaut) → coordinator (cf.
    /// `StoryTrayView.onViewStory`), unifiant la mini-trail avec la grande trail.
    var onViewStory: ((String) -> Void)? = nil

    private var theme: ThemeManager { ThemeManager.shared }
    @EnvironmentObject private var statusViewModel: StatusViewModel
    @EnvironmentObject private var storyViewerCoordinator: StoryViewerCoordinator
    // Capturés pour réinjection sur la sheet MyStoriesView (sa sheet interne
    // SharePickerView « Transférer » crasherait sur un env object manquant).
    @EnvironmentObject private var router: Router
    @EnvironmentObject private var conversationListViewModel: ConversationListViewModel
    @State private var selectedProfileUser: ProfileSheetUser?
    /// S5 — le tap sur son propre anneau ouvre désormais le VIEWER (parité avec
    /// la grande trail). La gestion reste atteignable par appui long
    /// (`contextMenuExtras`), seul chemin restant vers `MyStoriesView` — et donc
    /// vers l'édition d'une story publiée — depuis le header replié.
    @State private var showMyStories = false
    /// Même chaînage déterministe que la grande trail : l'intention est posée
    /// pendant la fermeture, exécutée par `onDismiss` (cf. `StoryTrayActions`).
    @State private var myStoriesFollowUp = DeferredSheetFollowUp<MyStoriesFollowUp>()
    /// Session d'édition d'une story publiée (composer en mode édition).
    @State private var editingStorySession: StoryEditSession?

    // Layout-derived: the full trail (120pt + 8 top pad) sits under the 64pt
    // expanded header and is fully hidden behind the 44pt collapsed header after
    // ~148pt of scroll. Reveal the mini-trail over the last ~70pt of that travel.
    private static let revealStart: CGFloat = 78
    private static let revealEnd: CGFloat = 148
    private static let bandHeight: CGFloat = 80

    private var reveal: CGFloat {
        CollapsibleHeaderMetrics.pinnedAccessoryReveal(
            scrollOffset: scrollOffset,
            start: Self.revealStart,
            end: Self.revealEnd
        )
    }

    private var currentUserId: String {
        AuthManager.shared.currentUser?.id ?? ""
    }

    /// Le groupe de l'utilisateur courant (sa propre story), non expiré.
    /// Surfacé en tête du band replié pour un accès rapide « voir / revoir ma
    /// story » depuis le header une fois la grande trail scrollée hors écran.
    private var ownGroup: StoryGroup? {
        let uid = currentUserId
        guard !uid.isEmpty else { return nil }
        return viewModel.storyGroups.first { $0.id == uid && !$0.isFullyExpired() }
    }

    private var visibleGroups: [StoryGroup] {
        let uid = currentUserId
        return viewModel.storyGroups.filter { $0.id != uid && !$0.isFullyExpired() }
    }

    var body: some View {
        let groups = visibleGroups
        let own = ownGroup
        // Reveal the pinned band as soon as there is ANYTHING to reach from the
        // collapsed header: the user's own story ring (quick access to view /
        // re-view it once the big trail scrolled away) and/or peer stories.
        // Previously it required a peer story, so a user with only their own
        // story could never open it from the scrolled header.
        if reveal > 0.001 && (!groups.isEmpty || own != nil) {
            band(groups: groups, ownGroup: own)
                .frame(height: Self.bandHeight * reveal, alignment: .top)
                .opacity(Double(reveal))
                .clipped()
                .allowsHitTesting(reveal > 0.6)
                .sheet(item: $selectedProfileUser) { user in
                    UserProfileSheet(
                        user: user,
                        moodEmoji: statusViewModel.statusForUser(userId: user.userId ?? "")?.moodEmoji,
                        onMoodTap: statusViewModel.moodTapHandler(for: user.userId ?? ""),
                        presenceProvider: { PresenceManager.shared.knownPresenceState(for: $0) },
                        postsContent: { uid in AnyView(ProfileUserPostsList(
                    userId: uid,
                    onOpenPost: { post in ProfilePostsOpener.openPost(post) { selectedProfileUser = nil } },
                    onOpenReel: { reel, reels in ProfilePostsOpener.openReel(reel, in: reels) { selectedProfileUser = nil } }
                )) }
                    )
                    .presentationDetents([.medium, .large])
                    .presentationDragIndicator(.visible)
                }
                .myStoriesSheet(
                    isPresented: $showMyStories,
                    followUp: $myStoriesFollowUp,
                    viewModel: viewModel,
                    userId: currentUserId,
                    statusViewModel: statusViewModel,
                    router: router,
                    conversationListViewModel: conversationListViewModel,
                    perform: { action in
                        switch action {
                        case .openViewer(let postId):
                            storyViewerCoordinator.present(StoryViewerRequest(
                                id: currentUserId, singleGroup: true, postId: postId))
                        case .createStory:
                            viewModel.showStoryComposer = true
                        case .editStory(let story):
                            editingStorySession = StoryEditSession(
                                story: story,
                                composer: StoryComposerViewModel(editing: story))
                        }
                    }
                )
                .storyEditComposerCover(session: $editingStorySession, viewModel: viewModel)
        }
    }

    private func band(groups: [StoryGroup], ownGroup: StoryGroup?) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            // `LazyHStack` — même fix que F5 sur la grande trail : un `HStack`
            // montait TOUS les groupes (avatars `.storyTrayCompact` animés en
            // spring repeatForever) à CHAQUE traversée du seuil de reveal du
            // scroll, y compris hors écran. Lazy = seuls les ~8 anneaux
            // visibles vivent (et animent).
            LazyHStack(alignment: .top, spacing: 12) {
                addStoryButton
                // Sa propre story d'abord (après le "+"), pour un accès direct
                // « voir ma story » depuis le header replié — même anneau
                // compact que les pairs.
                if let ownGroup {
                    StoryRingCell(
                        group: ownGroup,
                        context: .storyTrayCompact,
                        onViewStory: {
                            // Parité avec la grande trail : le tap ouvre SA
                            // story, plus la liste de gestion.
                            storyViewerCoordinator.present(StoryViewerRequest(
                                id: ownGroup.id, singleGroup: true))
                        },
                        onShowProfile: { selectedProfileUser = .from(storyGroup: ownGroup) },
                        contextMenuExtras: [
                            AvatarContextMenuItem(
                                label: StoryTrayCopy.manageStories,
                                icon: "rectangle.stack.fill"
                            ) { showMyStories = true }
                        ]
                    )
                    .zoomTransitionSource(id: ownGroup.id, in: zoomNamespace)
                }
                ForEach(groups, id: \.id) { group in
                    StoryRingCell(
                        group: group,
                        context: .storyTrayCompact,
                        onViewStory: { presentStory(userId: group.id) },
                        onShowProfile: { selectedProfileUser = .from(storyGroup: group) }
                    )
                    // U1 inc.2 — la mini-trail épinglée zoome aussi.
                    .zoomTransitionSource(id: group.id, in: zoomNamespace)
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 6)
        }
        // No own background — this view is injected as the `CollapsibleHeader`
        // accessory slot, so the header surface masks the content underneath.
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// Même chemin de présentation que `StoryTrayView.presentStory` — unifie la
    /// mini-trail épinglée avec la grande trail via le coordinator par défaut.
    private func presentStory(userId: String) {
        if let onViewStory {
            onViewStory(userId)
        } else {
            storyViewerCoordinator.present(
                StoryViewerRequest(id: userId, startAtFirstUnviewed: true)
            )
        }
    }

    private var addStoryButton: some View {
        Button {
            viewModel.showStoryComposer = true
            HapticFeedback.medium()
        } label: {
            // Glyphe dans un cercle de dimension fixe 44×44 : figé (déborderait s'il scalait, doctrine 86i) ; le bouton porte le libellé
            Image(systemName: "plus")
                .font(.system(size: 20, weight: .bold))
                .foregroundStyle(Color.white)
                .frame(width: 44, height: 44)
                .background(
                    Circle()
                        .fill(MeeshyColors.brandGradient)
                        .overlay(Circle().stroke(theme.backgroundPrimary, lineWidth: 2))
                )
        }
        .buttonStyle(.plain)
        .accessibilityLabel(String(localized: "story.tray.addStory", defaultValue: "Ajouter une story"))
    }
}
