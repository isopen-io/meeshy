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

    @State private var timedOut = false
    @State private var reloadAttempts = 0

    private var uid: String { userId ?? "" }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            if let resolvedIndex = viewModel.groupIndex(forUserId: uid) {
                if singleGroup {
                    StoryViewerView(
                        viewModel: viewModel,
                        groups: [viewModel.storyGroups[resolvedIndex]],
                        currentGroupIndex: 0,
                        isPresented: $isPresented,
                        initialStoryIndex: initialStoryIndex,
                        startAtFirstUnviewed: startAtFirstUnviewed,
                        initialAction: initialAction
                    )
                    .transition(.identity)
                } else {
                    StoryViewerView(
                        viewModel: viewModel,
                        groups: viewModel.storyGroups,
                        currentGroupIndex: resolvedIndex,
                        isPresented: $isPresented,
                        onReplyToStory: onReplyToStory,
                        initialStoryIndex: initialStoryIndex,
                        startAtFirstUnviewed: startAtFirstUnviewed,
                        initialAction: initialAction
                    )
                    .transition(.identity)
                }
            } else if timedOut {
                notFoundOverlay
            } else {
                loadingOverlay
            }

            // Connection status banner (banner manages its own socket observation)
            VStack {
                ConnectionBanner()
                    .padding(.top, 8)
                Spacer()
            }
            .allowsHitTesting(false)
        }
        .task(id: uid) {
            timedOut = false
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
                    .font(.system(size: 38, weight: .regular))
                    .foregroundColor(.white.opacity(0.8))

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
                        .font(.system(size: 16, weight: .bold))
                        .foregroundColor(.white)
                        .frame(width: 32, height: 32)
                        .background(Circle().fill(Color.white.opacity(0.2)))
                }
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
