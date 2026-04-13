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
    var initialStoryIndex: Int = 0
    var presentationSource: String = "unknown"

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
                        initialStoryIndex: initialStoryIndex
                    )
                    .transition(.identity)
                } else {
                    StoryViewerView(
                        viewModel: viewModel,
                        groups: viewModel.storyGroups,
                        currentGroupIndex: resolvedIndex,
                        isPresented: $isPresented,
                        onReplyToStory: onReplyToStory,
                        initialStoryIndex: initialStoryIndex
                    )
                    .transition(.identity)
                }
            } else if timedOut {
                notFoundOverlay
            } else {
                loadingOverlay
            }
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
                Text("Loading...")
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

                Text("Story introuvable")
                    .foregroundColor(.white)
                    .font(.headline)

                Text("Impossible de charger cette story. Reessayez ou fermez.")
                    .multilineTextAlignment(.center)
                    .foregroundColor(.white.opacity(0.6))
                    .font(.footnote)
                    .padding(.horizontal, 32)

                HStack(spacing: 12) {
                    Button {
                        Task { await retryFetch(uid: uid) }
                    } label: {
                        Text("Reessayer")
                            .font(.subheadline.weight(.semibold))
                            .foregroundColor(.black)
                            .padding(.horizontal, 20)
                            .padding(.vertical, 10)
                            .background(Capsule().fill(Color.white))
                    }

                    Button {
                        isPresented = false
                    } label: {
                        Text("Fermer")
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
