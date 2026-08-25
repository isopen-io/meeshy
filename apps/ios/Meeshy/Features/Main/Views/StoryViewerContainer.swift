import SwiftUI
import os
import MeeshySDK

/// Reactive wrapper that shows a loading state until storyGroups are available,
/// then seamlessly transitions to StoryViewerView. Solves the race condition
/// where the fullScreenCover opens before async loadStories() completes.
///
/// Defensive behavior:
/// - Re-fetches if the requested userId is NOT present in storyGroups (not only when empty)
/// - Re-runs on userId change via .task(id:)
/// - After a short timeout, surfaces a Retry + Close fallback to avoid infinite loading
struct StoryViewerContainer: View {
    @ObservedObject var viewModel: StoryViewModel
    /// Threadée EXPLICITEMENT vers la `ConnectionBanner` interne (ligne
    /// ~117) depuis Task 3 (`ConnectionBanner` n'a plus d'`@EnvironmentObject`
    /// propre). Lue ici via `@EnvironmentObject` car ce container est TOUJOURS
    /// un descendant réel de l'injection : chacun de ses 4 points de montage
    /// (`RootView`, `iPadRootView+Sheets`, `ConversationView`, `BookmarksView`)
    /// ré-injecte explicitement `.environmentObject(conversationViewModel)`
    /// sur son `.fullScreenCover` — jamais un `.overlay` racine composé, donc
    /// hors du risque de crash documenté pour `ConnectionBanner`.
    @EnvironmentObject private var conversationListViewModel: ConversationListViewModel
    /// Idem : certains points de montage (`RootView`, `iPadRootView+Sheets`)
    /// ré-injectent `.environment(\.isStoryViewerPresenting, true)` sur ce
    /// même cover précisément pour que la pill interne se masque — threadée
    /// explicitement pour préserver ce comportement exact.
    @Environment(\.isStoryViewerPresenting) private var isStoryViewerPresenting
    let userId: String?
    @Binding var isPresented: Bool
    var onReplyToStory: ((ReplyContext) -> Void)? = nil
    var singleGroup: Bool = false
    /// R4 inc.2 — id exact du post story quand le point d'entrée le connaît
    /// (bookmark, notification, deep link) : permet un fetch unitaire léger
    /// si le tray ignore le groupe, au lieu du refetch full-tray bloquant.
    /// `nil` conserve le comportement historique.
    var postId: String? = nil
    var initialStoryIndex: Int = 0
    /// Forwarded to `StoryViewerView` : ouvre le viewer sur la première story
    /// non vue (points d'entrée « toucher le profil / avatar / tray »).
    var startAtFirstUnviewed: Bool = false
    var presentationSource: String = "unknown"
    /// Phase F: forwarded to `StoryViewerView` so a notification-launched
    /// viewer can auto-open the comments overlay or viewers sheet on appear.
    /// `nil` keeps every legacy entry point on the existing path.
    var initialAction: StoryViewerInitialAction? = nil
    /// Commentaire ciblé par la notification (scroll dans l'overlay) + parent
    /// (repli de scroll pour une réponse en thread). Forwardés au viewer.
    var targetCommentId: String? = nil
    var targetParentCommentId: String? = nil

    @State private var timedOut = false
    @State private var reloadAttempts = 0
    /// R4 inc.2b — bloque le rendu de `StoryViewerView` tant que le `postId`
    /// notifié n'a pas été confirmé frais (voir
    /// `StoryViewModel.refreshFromCachedPostIfAvailable` et
    /// `isGroupReadyToPresent` plus bas). Sans ce verrou, le premier rendu
    /// bascule sur `StoryViewerView` dès que `groupIndex(forUserId:)` existe
    /// — y compris à la TOUTE PREMIÈRE évaluation, AVANT que `.task(id:)`
    /// n'ait eu la moindre chance de tourner (une `Task` non structurée
    /// créée par `.task` ne s'exécute jamais de façon synchrone avec le
    /// rendu qui l'a déclenchée). `StoryActionSidebarView` gèle son rail
    /// d'actions à son PREMIER `.onAppear`, qui ne se redéclenche JAMAIS sur
    /// une simple mise à jour de données (identité de vue préservée) — donc
    /// un montage prématuré fige le bug pour toute la lecture du slide.
    /// `nil` tant que non vérifié pour ce `postId` précis.
    @State private var freshnessCheckedPostId: String?

    private var uid: String { userId ?? "" }

    /// Pur, testable sans hôte SwiftUI (parité `StoryViewerScope.resolve`) —
    /// `nonisolated` car le target app compile en `defaultIsolation
    /// MainActor` : sans ce modificateur le bundle de tests (nonisolated)
    /// ne peut ni appeler cette fonction ni en lire le résultat.
    nonisolated static func isGroupReadyToPresent(
        groupExists: Bool,
        postId: String?,
        freshnessCheckedPostId: String?
    ) -> Bool {
        guard groupExists else { return false }
        guard let postId else { return true }
        return freshnessCheckedPostId == postId
    }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            if Self.isGroupReadyToPresent(
                groupExists: viewModel.groupIndex(forUserId: uid) != nil,
                postId: postId,
                freshnessCheckedPostId: freshnessCheckedPostId
            ), let resolvedIndex = viewModel.groupIndex(forUserId: uid) {
                let resolvedStoryIndex = StoryIndexResolver.index(
                    forPostId: postId,
                    in: viewModel.storyGroups[resolvedIndex],
                    fallback: initialStoryIndex
                )
                // UN SEUL site de présentation. Les deux branches d'avant
                // (mono-auteur / inter-auteurs) répétaient dix arguments et
                // avaient fini par diverger : la mono-auteur avait perdu
                // `onReplyToStory`, si bien qu'ouvrir une story depuis une
                // conversation — qui passe pourtant le callback — n'affichait
                // aucun bouton « Répondre ». Seule la PORTÉE change désormais.
                let scope = StoryViewerScope.resolve(
                    all: viewModel.storyGroups,
                    resolvedIndex: resolvedIndex,
                    singleGroup: singleGroup
                )
                StoryViewerView(
                    viewModel: viewModel,
                    groups: scope.groups,
                    currentGroupIndex: scope.currentIndex,
                    isPresented: $isPresented,
                    onReplyToStory: onReplyToStory,
                    initialStoryIndex: resolvedStoryIndex,
                    startAtFirstUnviewed: startAtFirstUnviewed,
                    initialAction: initialAction,
                    targetCommentId: targetCommentId,
                    targetParentCommentId: targetParentCommentId
                )
                .transition(.identity)
            } else if timedOut {
                notFoundOverlay
            } else {
                loadingOverlay
            }

            // Connection status banner (banner manages its own socket observation)
            VStack {
                ConnectionBanner(conversationListViewModel: conversationListViewModel, isStoryViewerPresenting: isStoryViewerPresenting)
                    .padding(.top, ConnectionBanner.liftedTopPadding(base: 8))
                Spacer()
            }
            .allowsHitTesting(false)
        }
        .task(id: uid) {
            timedOut = false
            freshnessCheckedPostId = nil
            await ensureGroupAvailable(uid: uid)
        }
    }

    // MARK: - Loading / Fallback UI

    private var loadingOverlay: some View {
        ZStack {
            VStack(spacing: 16) {
                ProgressView()
                    .tint(.white)
                    .scaleEffect(1.3)
                Text(String(localized: "story.viewer.loading", defaultValue: "Loading...", bundle: .main))
                    .foregroundColor(.white.opacity(0.6))
                    .font(.subheadline)
            }

            closeButton
        }
    }

    private var notFoundOverlay: some View {
        ZStack {
            VStack(spacing: 16) {
                Image(systemName: "exclamationmark.circle")
                    // Doctrine 84i/86i : glyphe hero d'etat d'erreur (~38pt, decoratif) → fige ;
                    // le titre ci-dessous porte le sens. Masque de VoiceOver.
                    .font(.system(size: 38, weight: .regular))
                    .foregroundColor(.white.opacity(0.8))
                    .accessibilityHidden(true)

                Text(String(localized: "story.viewer.notFound.title", defaultValue: "Story introuvable", bundle: .main))
                    .foregroundColor(.white)
                    .font(.headline)

                Text(String(localized: "story.viewer.notFound.description", defaultValue: "Impossible de charger cette story. Reessayez ou fermez.", bundle: .main))
                    .multilineTextAlignment(.center)
                    .foregroundColor(.white.opacity(0.6))
                    .font(.footnote)
                    .padding(.horizontal, 32)

                HStack(spacing: 12) {
                    Button {
                        Task { await retryFetch(uid: uid) }
                    } label: {
                        Text(String(localized: "story.viewer.retry", defaultValue: "Reessayer", bundle: .main))
                            .font(.subheadline.weight(.semibold))
                            .foregroundColor(.black)
                            .padding(.horizontal, 20)
                            .padding(.vertical, 10)
                            .background(Capsule().fill(Color.white))
                    }

                    Button {
                        isPresented = false
                    } label: {
                        Text(String(localized: "common.close", defaultValue: "Fermer", bundle: .main))
                            .font(.subheadline.weight(.semibold))
                            .foregroundColor(.white)
                            .padding(.horizontal, 20)
                            .padding(.vertical, 10)
                            .background(Capsule().stroke(Color.white.opacity(0.4), lineWidth: 1))
                    }
                }
                .padding(.top, 8)
            }
            .padding(24)

            closeButton
        }
    }

    private var closeButton: some View {
        VStack {
            HStack {
                Spacer()
                Button { isPresented = false } label: {
                    Image(systemName: "xmark")
                        // Doctrine 82i : glyphe dans un cadre de tap fixe 32×32 → fige
                        // (le scaler deborderait du cercle). Bouton labellise ci-dessous.
                        .font(.system(size: 16, weight: .bold))
                        .foregroundColor(.white)
                        .frame(width: 32, height: 32)
                        .background(Circle().fill(Color.white.opacity(0.2)))
                }
                .accessibilityLabel(String(localized: "common.close", defaultValue: "Fermer", bundle: .main))
                .padding(.trailing, 16)
                .padding(.top, 8)
            }
            Spacer()
        }
    }

    // MARK: - Fetch logic

    /// Ensures the requested user's story group is available.
    /// Fetches if missing, waits briefly for it to appear, then surfaces a
    /// not-found fallback instead of looping forever.
    private func ensureGroupAvailable(uid: String) async {
        if uid.isEmpty {
            Logger.messages.error("[StoryViewerContainer] Opened with empty uid source=\(presentationSource, privacy: .public) — marking as not found")
            timedOut = true
            return
        }

        // R4 inc.2b — quand le point d'entrée connaît le postId exact
        // (notification), rafraîchit D'ABORD depuis le cache SDK déjà chaud
        // (fetch fait par `StoryNotificationTargetViewModel.load()` quelques
        // ms plus tôt) — AVANT le court-circuit « groupe déjà présent »
        // ci-dessous, qui sinon laisserait le premier rendu (voir
        // `isGroupReadyToPresent`) monter le viewer sur un compteur périmé.
        // Purement local (lecture de cache, aucun réseau) : n'ajoute aucune
        // latence au chemin normal, sans notification (`postId == nil`).
        if let postId {
            viewModel.refreshFromCachedPostIfAvailable(postId: postId)
            freshnessCheckedPostId = postId
        }

        if viewModel.groupIndex(forUserId: uid) != nil { return }

        Logger.messages.info("[StoryViewerContainer] Group missing uid=\(uid, privacy: .public) source=\(presentationSource, privacy: .public) groupCount=\(viewModel.storyGroups.count) availableIds=\(viewModel.storyGroups.map(\.id).joined(separator: ","), privacy: .public)")

        // R4 — Cache-first (mission produit n°2 : jamais de spinner si un rendu
        // partiel est possible) : un deep link / une notification à froid arrive
        // AVANT le `loadStories` du boot — le tray du cache 24 h contient très
        // probablement le groupe. `loadStories()` le sert immédiatement
        // (`.fresh` → zéro réseau ; `.stale` → servi + refetch silencieux) et
        // le body réactif monte le viewer sans spinner plein écran.
        await viewModel.loadStories()

        if viewModel.groupIndex(forUserId: uid) != nil { return }

        // R4 inc.2 — le cache ignore ce groupe mais le point d'entrée connaît
        // le post exact : fetch unitaire léger (GET /posts/:id) AVANT le
        // full-tray. Ne court-circuite que si le groupe du uid demandé est
        // bien monté (un postId d'un autre auteur retombe sur le full fetch).
        if let postId {
            _ = await viewModel.ensureStoryLoaded(postId: postId)
            if viewModel.groupIndex(forUserId: uid) != nil { return }
        }

        // Le cache ne connaît pas ce groupe (story récente d'un contact, tray
        // périmé) : refetch réseau complet — comportement historique conservé.
        await viewModel.loadStories(forceNetwork: true)

        if viewModel.groupIndex(forUserId: uid) != nil { return }

        // Give the view a moment for published updates to settle, then give up.
        try? await Task.sleep(nanoseconds: 2_500_000_000) // 2.5s
        if !Task.isCancelled, viewModel.groupIndex(forUserId: uid) == nil {
            Logger.messages.error("[StoryViewerContainer] Group still missing after reload uid=\(uid, privacy: .public) availableIds=\(viewModel.storyGroups.map(\.id).joined(separator: ","), privacy: .public)")
            timedOut = true
        }
    }

    private func retryFetch(uid: String) async {
        reloadAttempts += 1
        timedOut = false
        await ensureGroupAvailable(uid: uid)
    }
}
