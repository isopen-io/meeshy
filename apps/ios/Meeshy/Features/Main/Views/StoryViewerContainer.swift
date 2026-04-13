import SwiftUI
import MeeshySDK

/// Reactive wrapper that shows a loading state until storyGroups are available,
/// then seamlessly transitions to StoryViewerView. Solves the race condition
/// where the fullScreenCover opens before async loadStories() completes.
struct StoryViewerContainer: View {
    @ObservedObject var viewModel: StoryViewModel
    let userId: String?
    @Binding var isPresented: Bool
    var onReplyToStory: ((ReplyContext) -> Void)? = nil
    var singleGroup: Bool = false
    var initialStoryIndex: Int = 0

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            let uid = userId ?? ""
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
            } else {
                loadingOverlay
            }
        }
        .task {
            if viewModel.storyGroups.isEmpty {
                await viewModel.loadStories()
            }
        }
    }

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
    }
}
