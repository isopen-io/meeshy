import SwiftUI
import AVKit
import MeeshySDK
import MeeshyUI

// `ReelsPresenter` lives in `ReelsPresenter.swift` (extracted: this file is
// over the size budget).

// MARK: - Reels Player

/// Full-screen, vertically-paged reel experience. Swipe up/down to move between
/// reels (`AdaptiveVerticalPager`); only the visible reel plays, driven through
/// the single shared video engine (`SharedAVPlayerManager`). A back button and a
/// left-edge drag both return to the previous screen.
struct ReelsPlayerView: View {
    let seedPosts: [FeedPost]
    let startId: String?
    /// Comment targeted by a notification — when set, the seed reel auto-opens
    /// its comments sheet and scrolls to / highlights this comment.
    var commentTargetId: String? = nil
    /// Parent comment when `commentTargetId` is a reply (expands the parent thread).
    var commentParentTargetId: String? = nil
    /// `true` once the liquid reveal disc has reached full screen. Gates the
    /// first reel's playback: the video stays on its poster (PAUSED) during the
    /// reveal and only starts when this flips true (driven by RootView).
    var revealCompleted: Bool
    /// Real safe-area insets (the media is full-bleed via `.ignoresSafeArea()`,
    /// so the chrome reads them explicitly to clear the Dynamic Island / home bar).
    var safeArea: EdgeInsets = EdgeInsets()
    var onClose: () -> Void
    /// Opens the author's profile (wired in RootView to the same
    /// `router.deepLinkProfileUser` sheet the feed uses). `nil` = no-op.
    var onOpenProfile: ((_ userId: String, _ username: String) -> Void)? = nil
    /// Opens the author's active story (wired in RootView to the same
    /// `StoryViewerCoordinator` the feed uses). `nil` = no-op.
    var onOpenStory: ((_ userId: String) -> Void)? = nil
    /// Menu « … » → « Ouvrir » : pousse la page détail du poste (wired in
    /// RootView to `router.push(.postDetail(_:))`, fermant d'abord le lecteur
    /// immersif). `nil` = item masqué.
    var onOpenDetail: ((_ postId: String) -> Void)? = nil
    /// Reports whether the given author currently has an active story, so the
    /// avatar tap can route to the story (else it falls back to the profile).
    /// Backed by `StoryViewModel.hasUnviewedStories` / `storyRingState` in
    /// RootView — the single source of truth the feed avatars read.
    var authorHasStory: ((_ userId: String) -> Bool)? = nil
    /// La porte de citation (#15869) : « Citer » du rail l'ouvre sur le réel
    /// affiché. `nil` = le choix Repost n'offre que « Repartager ».
    var quoteHost: QuoteComposerHost? = nil

    @Environment(\.layoutDirection) private var layoutDirection

    // `internal` (et non `private`) : `emptyState` vit dans
    // `ReelsPlayerView+EmptyState.swift`, et une propriété stockée `private`
    // est inaccessible depuis un fichier d'extension frère (même module).
    @StateObject var viewModel = ReelsViewModel()
    @State private var commentsReel: FeedPost?
    /// Réel en édition via le menu « … » du rail d'actions — parité avec le
    /// menu de `FeedPostCard`/`ReelFeedCard` (même `EditPostSheet`).
    @State private var editingReel: FeedPost?
    @State private var quotedReel: FeedPost?
    /// Comment target carried into the comments sheet when it auto-opens from a
    /// notification. Cleared when the user opens comments manually so a later tap
    /// never re-scrolls to the old target.
    @State private var pendingCommentTargetId: String?
    @State private var pendingCommentParentTargetId: String?
    @State private var edgeDrag: CGFloat = 0
    /// Immersive mode: when `true`, ALL chrome (back button, info overlay,
    /// action rail, scrub) is hidden for distraction-free viewing. Toggled on
    /// by a long-press; any tap restores it (mirrors the Story viewer).
    @State private var chromeHidden = false
    /// « Partager » (menu « … ») : la feuille du système, avec le lien suivi.
    @State private var shareableLink: ShareableLink?
    /// « Envoyer » du rail (#14310) : la carte remise à la feuille Meeshy.
    @State private var sentReel: SharedContentWrapper?
    /// Reel ids whose share request is currently in flight, so a double-tap of the
    /// share button can't fire two mints (mirrors the feed's `postShareInFlightIds`).
    @State private var shareInFlightIds: Set<String> = []
    /// Flux « Enregistrer en local » du menu « … » de la barre haute.
    @StateObject private var mediaSaveCoordinator = MediaSaveCoordinator(exitGate: .open)
    /// La fenêtre de préchargement (#9702) : l'horloge des visites traverse
    /// les `.task(id:)` du pager, la fenêtre courante gouverne quelles pages
    /// ont le droit de télécharger d'elles-mêmes.
    @State private var preloader = ReelPagerPreloader()
    @State private var preloadWindow = ReelPreloadWindow.Window(
        ahead: ReelPreloadWindow.minRadius, behind: ReelPreloadWindow.minRadius)
    /// Le réel qui JOUE (#9837) : élu dès qu'il passe la moitié de l'écran,
    /// pendant le geste — `currentId` ne bascule qu'une fois le paging posé.
    @State private var election = ReelPlaybackElection()

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            if viewModel.reels.isEmpty {
                emptyState
            } else {
                pager
            }

            backControls
        }
        // `edgeDrag` est désormais exprimé dans le sens de la LECTURE ; `.offset`,
        // lui, est en espace ÉCRAN et n'est PAS retourné par SwiftUI (contrairement
        // aux marges et aux alignements). Le helper est sa propre réciproque : on
        // repasse donc en espace écran ici, pour que le contenu suive le doigt.
        // Sans cette ligne, l'arabe aurait un contenu qui part à droite pendant que
        // le doigt va à gauche — l'incohérence qui a fait renoncer au même
        // retournement sur le cube des stories (#4297).
        .offset(x: ReadingDirection.readingDelta(max(0, edgeDrag), layoutDirection: layoutDirection))
        .task {
            viewModel.seed(posts: seedPosts, startId: startId)
            #if DEBUG
            // La vitrine (#9904) : le passage au réel suivant, par la même liaison que le pager — comme le pouce.
            VitrineRendu.shared.lecteurDeReelsAffiche { [viewModel] in
                guard let rang = viewModel.currentIndex, viewModel.reels.indices.contains(rang + 1) else { return }
                withAnimation(.easeInOut(duration: 0.45)) { viewModel.currentId = viewModel.reels[rang + 1].id }
            }
            #endif
            elect(trigger: "seed") { $0.settled(viewModel.currentId) }
            // Le réel affiché est CONSOMMÉ : ses notifications (nouveau réel,
            // commentaires, réactions) ne doivent plus apparaître non lues, et
            // `activePostId` fait naître consommées celles qui arrivent pendant
            // le visionnage. Le viewer de réels était la seule surface sans ce
            // marquage — `POST /posts/:id/view` étant borné à la première vue,
            // une notification arrivée après restait non lue pour toujours.
            if let id = viewModel.currentId ?? startId {
                NotificationToastManager.shared.onPostOpened(id)
            }
            // Reel comment notification: auto-open the comments sheet on the seed
            // reel and scroll to the targeted comment. Brief delay so the reel is
            // on screen first (the reveal disc settles), then present.
            guard let cid = commentTargetId, !cid.isEmpty else { return }
            _ = await cancellableSleep(for: .milliseconds(450))
            let reel = seedPosts.first(where: { $0.id == startId }) ?? seedPosts.first ?? viewModel.reels.first
            if let reel {
                pendingCommentTargetId = cid
                pendingCommentParentTargetId = commentParentTargetId
                commentsReel = reel
            }
        }
        // Cycle de vie de la post room du réel actif (real-time du like). Idempotent
        // côté serveur : rejoindre/quitter une room déjà (non) jointe est un no-op,
        // donc une disparition transitoire du reveal se ré-auto-corrige. Le `leave`
        // est fait dans le `.onDisappear` plus bas (combiné avec la finalisation
        // d'engagement).
        .onAppear {
            if let id = viewModel.currentId { SocialSocketManager.shared.joinPostRoom(postId: id) }
        }
        .adaptiveOnChange(of: viewModel.currentId) { old, newId in
            // Never carry immersive-hidden chrome into the next reel — the scrub
            // bar / action rail / info must reappear when you page.
            if chromeHidden { chromeHidden = false }
            elect(trigger: "settled") { $0.settled(newId) }
            if let newId { ReelSwitchSignpost.settled(newId) }
            if newId != nil { HapticFeedback.light() }
            // Consommation des notifications du réel affiché (voir .task) —
            // fermeture conditionnelle à l'identité puis ouverture du suivant.
            if let old { NotificationToastManager.shared.onPostClosed(old) }
            if let newId { NotificationToastManager.shared.onPostOpened(newId) }
            // Order matters: finalize the PREVIOUS reel's session (real watch-time +
            // heartbeat samples + completed) and `end` it BEFORE `begin` of the next —
            // both in the SAME Task so `begin` never races ahead of the deferred `end`
            // (which would drop the previous reel's qualified view).
            Task {
                if let old {
                    finalizeReelSession(for: old)
                    await EngagementTracker.shared.end(surface: .reels)
                }
                guard let newId else { return }
                EngagementTracker.shared.begin(postId: newId, contentType: .reel, surface: .reels)
                viewModel.recordView(newId)
            }
        }
        .sheet(item: $commentsReel, onDismiss: {
            // La feuille de commentaires relâche `activePostId` à sa fermeture
            // (elle porte le même id que le réel affiché) : re-déclarer le réel
            // encore à l'écran pour que les notifications qui arrivent pendant
            // le visionnage continuent de naître consommées. Le POST serveur
            // reste coalescé par la fenêtre du manager — pas de re-requête.
            if let id = viewModel.currentId {
                NotificationToastManager.shared.onPostOpened(id)
            }
        }) { reel in
            CommentsSheetView(
                post: reel,
                accentColor: reel.authorColor,
                targetCommentId: pendingCommentTargetId,
                targetParentCommentId: pendingCommentParentTargetId,
                onCommentSent: { viewModel.didSendComment(postId: $0) }, entity: .reel(reel.id)
            )
        }
        .modifier(ReelShareSheets(outgoing: $shareableLink, sent: $sentReel, onClose: onClose))
        .mediaSaveFlow(mediaSaveCoordinator)
        .postEditCover(item: $editingReel) { reel, draft in
            await viewModel.updatePost(reel.id, content: draft.content, language: draft.language, type: draft.type, removeMediaIds: draft.removeMediaIds.isEmpty ? nil : draft.removeMediaIds, location: draft.location, visibility: draft.visibility, visibilityUserIds: draft.visibilityUserIds, known: draft.known, storyEffects: draft.storyEffects, additions: draft.additions)
        }
        // Call-aware : un appel entrant pendant un réel ouvert doit le mettre en
        // pause (vidéo + audio) — la session audio appartient alors à l'appel. Le
        // viewer étant immobile, aucune `drive`-pass n'est rappelée ; on pause donc
        // ici dès la transition inactif→actif. La garde `!isCallActive` dans `drive`
        // empêche le redémarrage tant que l'appel dure.
        .onReceive(
            CallManagerHost.shared.callStatePublisher
                .map(\.isActive)
                .removeDuplicates()
                .receive(on: DispatchQueue.main)
        ) { callActive in
            guard callActive else { return }
            SharedAVPlayerManager.shared.pause()
            PlaybackCoordinator.shared.stopAllAudio()
        }
        .onDisappear {
            // Quitte la post room du réel actif (real-time like) + finalise la session
            // d'engagement (watch-time + vue qualifiée) du réel courant.
            viewModel.leaveActivePostRoom()
            preloader.releaseAll(reels: viewModel.reels, except: viewModel.currentId)
            finalizeReelSession(for: viewModel.currentId)
            NotificationToastManager.shared.onPostClosed(viewModel.currentId)
            Task { await EngagementTracker.shared.end(surface: .reels) }
            Task { await viewModel.flushImpressions() }
        }
        .statusBarHidden(true)
    }

    /// Finalizes `reelId`'s engagement session: pushes the real watch-time, the
    /// drained heartbeat samples (→ server's 30%/90% qualified-view rule), and
    /// whether playback reached the end (→ playCount). Does NOT call `end` — the
    /// caller orders `end` (and any subsequent `begin`) around it.
    ///
    /// Only reads the SHARED VIDEO engine when `reelId` is actually a video reel
    /// (`ReelWatchAttachmentPolicy.shouldAttachVideoWatch`) — audio/image reels
    /// don't drive `SharedAVPlayerManager` at all, so reading it unconditionally
    /// attached whatever video last played (possibly a DIFFERENT, since-closed
    /// reel) to this session: inflated playCount / qualified views on the wrong
    /// reel, and the audio reel's own watch-time never attached anywhere (a
    /// separate, still-open gap — the per-page `AudioPlaybackManager` instance
    /// lives inside `ReelPageView`, out of this parent's reach).
    private func finalizeReelSession(for reelId: String?) {
        guard let reelId,
              let reel = viewModel.reels.first(where: { $0.id == reelId }),
              ReelSceneRouting.attachesSharedVideoWatch(for: reel, loadedAttachmentId: SharedAVPlayerManager.shared.attachmentId)
        else { return }
        let m = SharedAVPlayerManager.shared
        let watchMs = m.currentTime.isNaN ? 0 : Int(m.currentTime * 1000)
        let durMs = m.duration > 0 ? Int(m.duration * 1000) : nil
        let drained = m.drainWatchSamples()
        let maxPos = max(watchMs, drained.samples.map(\.positionMs).max() ?? 0)
        let completed: Bool = {
            if drained.reachedEnd { return true }
            guard let d = durMs, d > 0 else { return false }
            return maxPos >= Int(Double(d) * 0.95)
        }()
        EngagementTracker.shared.attachWatch(surface: .reels, watchMs: watchMs,
            mediaDurationMs: durMs, completed: completed, samples: drained.samples)
    }

    // MARK: Share

    /// Reel share — mirrors the feed's `sharePostWithLink`. Guards against a
    /// double-tap, fires haptic immediately, then mints the deduplicated tracking
    /// link via the view-model and presents the system share sheet. On failure it
    /// still surfaces the raw post URL so the user always has something to share.
    @MainActor
    private func shareReel(_ reel: FeedPost) {
        guard !shareInFlightIds.contains(reel.id) else { return }
        shareInFlightIds.insert(reel.id)
        HapticFeedback.light()
        Task {
            defer { Task { @MainActor in shareInFlightIds.remove(reel.id) } }
            if let shortUrl = await viewModel.shareLink(for: reel),
               let url = URL(string: shortUrl) {
                shareableLink = ShareableLink(url: url, fileSource: .post(reel))
            } else if let raw = ShareableLink.fallback(forPostId: reel.id, fileSource: .post(reel)) {
                shareableLink = raw
            }
        }
    }

    // MARK: Save

    /// « Sauvegarder » un réel (#9681) : la règle UNIQUE `PostSaveRoute` décide —
    /// un réel composé ou sans média se REND comme une story (scène, textes, son
    /// de fond), un réel de médias simple garde son fichier. Distinct du favori.
    private func requestSaveMedia(_ reel: FeedPost) {
        PostSaveAction.perform(reel, coordinator: mediaSaveCoordinator)
    }

    // MARK: Pager

    private var pager: some View {
        let activeIndex = viewModel.reels.firstIndex { $0.id == viewModel.currentId }
        let playingId = election.activeId ?? viewModel.currentId
        let restingId = election.restingId ?? viewModel.currentId
        return AdaptiveVerticalPager(
            items: viewModel.reels,
            currentPageID: $viewModel.currentId,
            onMajorityPage: { id in elect(trigger: "majority") { $0.majority(id) } },
            onScrollingChange: { scrolling in elect(trigger: "rest") { $0.scrolling(scrolling) } }
        ) { index, reel in
            // Chaque page reçoit des PRIMITIVES (élue, posée, chrome masqué,
            // fenêtre) et se compare par `rendersSameReelPage` (#10354) : une
            // élection ne réévalue que les deux pages qu'elle touche.
            ReelPageView(
                reel: reel,
                isActive: playingId == reel.id,
                isSettled: restingId == reel.id,
                revealCompleted: revealCompleted,
                viewModel: viewModel,
                chromeHidden: chromeHidden,
                setChromeHidden: { chromeHidden = $0 },
                onComment: {
                    // Manual open: drop any notification target so we don't
                    // re-scroll to a stale comment.
                    pendingCommentTargetId = nil
                    pendingCommentParentTargetId = nil
                    commentsReel = reel
                },
                onSend: { sentReel = ReelSend.open(reel) },
                onQuote: quoteHost == nil ? nil : { quotedReel = reel },
                onImager: PostSaveAction.imagerAction(for: reel, coordinator: mediaSaveCoordinator),
                onTapAuthorName: { openProfile(for: reel) },
                onTapAvatar: { openAvatarDestination(for: reel) },
                isWithinPreloadWindow: isWithinPreloadWindow(index, activeIndex: activeIndex)
            )
            .equatable()
            .onAppear {
                Task { await viewModel.loadMoreIfNeeded(currentReel: reel) }
            }
        }
        .ignoresSafeArea()
        // Le swipe trouve ses voisins PRÊTS (#7625, #7009, #9702) : la fenêtre
        // va de N±2 à N±10 selon l'usage, chaque palier prépare ce qu'il
        // mérite (lecteur à N±1, fichier au-delà). Relancé à chaque réel
        // affiché ; un swipe rapide annule la préparation devenue inutile.
        // Relancé aussi quand la SUITE change sous le même réel (relecture au
        // démarrage, page de plus à portée) : la fenêtre raisonne sur la liste
        // que le pager parcourt, pas sur celle du balayage précédent.
        .task(id: ReelThreadOrder.preloadScope(ids: viewModel.reels.map(\.id), anchorId: viewModel.currentId)) {
            let reels = viewModel.reels
            guard let activeIndex = reels.firstIndex(where: { $0.id == viewModel.currentId }) else { return }
            let window = preloader.enter(index: activeIndex)
            if preloadWindow != window { preloadWindow = window }
            await preloader.prepare(reels: reels, activeIndex: activeIndex, window: window)
        }
        .modifier(QuoteComposerCover(quoted: $quotedReel, host: quoteHost))
    }

    /// Applique une élection et ouvre la mesure du passage quand le réel qui
    /// joue change (#9837).
    private func elect(trigger: String, _ apply: (inout ReelPlaybackElection) -> Void) {
        let before = election.activeId
        apply(&election)
        guard let id = election.activeId, id != before else { return }
        ReelSwitchSignpost.elected(id, trigger: trigger)
    }

    /// Une page hors de la fenêtre de préchargement ne télécharge pas d'elle-même (#9702).
    private func isWithinPreloadWindow(_ index: Int, activeIndex: Int?) -> Bool {
        guard let activeIndex else { return false }
        return ReelPreloadWindow.tier(offset: index - activeIndex, in: preloadWindow) != .idle
    }

    // MARK: Author navigation

    /// Author name tap → profile. Mirrors the feed's
    /// `router.deepLinkProfileUser = ProfileSheetUser(...)` path via the
    /// `onOpenProfile` callback wired in RootView.
    private func openProfile(for reel: FeedPost) {
        guard !reel.authorId.isEmpty else { return }
        HapticFeedback.light()
        onOpenProfile?(reel.authorId, reel.authorUsername ?? reel.author)
    }

    /// Avatar tap → the author's story if they have an active one (mirrors the
    /// feed avatar's story-ring behavior), otherwise opens the profile.
    private func openAvatarDestination(for reel: FeedPost) {
        guard !reel.authorId.isEmpty else { return }
        HapticFeedback.light()
        if authorHasStory?(reel.authorId) == true {
            onOpenStory?(reel.authorId)
        } else {
            onOpenProfile?(reel.authorId, reel.authorUsername ?? reel.author)
        }
    }

    // MARK: Top bar (close + menu) and left-edge gesture

    private var currentReel: FeedPost? {
        viewModel.reels.first { $0.id == viewModel.currentId }
    }

    private var backControls: some View {
        ZStack(alignment: .topLeading) {
            // Left-edge drag strip — "retour angle gauche". Confined to the
            // leading 18pt so it never competes with the vertical pager.
            Color.clear
                .frame(width: 18)
                .frame(maxHeight: .infinity)
                .contentShape(Rectangle())
                .gesture(
                    DragGesture(minimumDistance: 12)
                        .onChanged { value in
                            // `ZStack(alignment: .topLeading)` place la bande au
                            // bord de DÉBUT DE LECTURE : SwiftUI la déplace donc
                            // à droite en arabe. Le signe brut, lui, ne bougeait
                            // pas — il aurait fallu pousser vers la droite pour
                            // fermer, c'est-à-dire à l'OPPOSÉ du bord qui porte
                            // le geste. Identité en LTR (#4297).
                            edgeDrag = max(0, ReadingDirection.readingDelta(
                                value.translation.width,
                                layoutDirection: layoutDirection
                            ))
                        }
                        .onEnded { value in
                            if ReadingDirection.readingDelta(
                                value.translation.width,
                                layoutDirection: layoutDirection
                            ) > 70 {
                                onClose()
                            }
                            withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) { edgeDrag = 0 }
                        }
                )

            FullscreenTopBar(exit: .back, onClose: onClose) {
                if let reel = currentReel {
                    SceneSaveProgressButton(jobKey: reel.id)
                    ReelMoreOptionsMenu(
                        viewModel: viewModel,
                        reel: reel,
                        onShare: { shareReel(reel) },
                        onEdit: { editingReel = reel },
                        onOpenDetail: onOpenDetail.map { handler in { handler(reel.id) } },
                        canSaveMedia: PostSaveAction.route(for: reel, coordinator: mediaSaveCoordinator) != .unavailable,
                        onSaveMedia: { requestSaveMedia(reel) },
                        onImager: PostSaveAction.imagerAction(for: reel, coordinator: mediaSaveCoordinator)
                    )
                }
            }
            // Sit clearly below the Dynamic Island. `safeArea.top` fluctuates
            // once the status bar hides, so floor it to clear the island reliably.
            .padding(.top, max(safeArea.top, 50))
            // Part of the chrome — fades out in immersive mode (long-press).
            .fullscreenChromeVisibility(!chromeHidden)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}
