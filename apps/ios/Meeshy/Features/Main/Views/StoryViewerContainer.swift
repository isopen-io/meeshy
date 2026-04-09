import SwiftUI
import MeeshySDK

/// Wrapper that guarantees StoryViewerView always has resolved data before rendering.
///
/// Solves the blank-screen bug where `fullScreenCover` presented an empty body when
/// `groupIndex(forUserId:)` returned nil (data not yet loaded or briefly unavailable).
///
/// - Always renders a black background (never an empty body)
/// - If data is already available, renders StoryViewerView instantly (zero delay)
/// - If not, shows a brief loading spinner, triggers loadStories(), and observes changes
/// - Auto-dismisses after a timeout if data never arrives
struct StoryViewerContainer: View {
    @ObservedObject var viewModel: StoryViewModel
    let userId: String
    @Binding var isPresented: Bool
    var singleGroup: Bool = false
    var initialStoryIndex: Int = 0
    var onReplyToStory: ((ReplyContext) -> Void)? = nil

    @State private var resolvedGroups: [StoryGroup]?
    @State private var resolvedIndex: Int = 0

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            if let groups = resolvedGroups {
                StoryViewerView(
                    viewModel: viewModel,
                    groups: groups,
                    currentGroupIndex: resolvedIndex,
                    isPresented: $isPresented,
                    onReplyToStory: onReplyToStory,
                    initialStoryIndex: initialStoryIndex
                )
            } else {
                VStack(spacing: 16) {
                    ProgressView()
                        .tint(.white)
                        .scaleEffect(1.2)
                    Text("Chargement...")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(.white.opacity(0.6))
                }
            }
        }
        .preferredColorScheme(.dark)
        .statusBarHidden()
        .onAppear { tryResolve() }
        .onReceive(viewModel.$storyGroups) { _ in
            if resolvedGroups == nil { tryResolve() }
        }
        .task {
            if viewModel.groupIndex(forUserId: userId) == nil {
                await viewModel.loadStories()
                tryResolve()
            }
            try? await Task.sleep(for: .seconds(4))
            if resolvedGroups == nil {
                isPresented = false
            }
        }
    }

    private func tryResolve() {
        guard resolvedGroups == nil else { return }
        guard let idx = viewModel.groupIndex(forUserId: userId) else { return }
        if singleGroup {
            resolvedGroups = [viewModel.storyGroups[idx]]
            resolvedIndex = 0
        } else {
            resolvedGroups = viewModel.storyGroups
            resolvedIndex = idx
        }
    }
}
