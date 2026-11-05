import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Qui a vu une de mes stories, et leur profil (#16386)

/// La liste des vues d'une story de « Mes stories » — qui a vu (avatar →
/// profil), combien de vues, de réactions, de commentaires et d'impressions.
/// Le profil touché s'ouvre une fois la liste REFERMÉE : deux feuilles ne se
/// superposent pas.
struct MyStoriesViewersPresentation: ViewModifier {
    @Binding var story: StoryItem?
    let accentColor: Color
    @ObservedObject var statusViewModel: StatusViewModel

    @State private var pendingProfile: ProfileSheetUser?
    @State private var selectedProfile: ProfileSheetUser?

    func body(content: Content) -> some View {
        content
            .sheet(item: $story, onDismiss: {
                guard let pending = pendingProfile else { return }
                pendingProfile = nil
                selectedProfile = pending
            }) { shown in
                StoryViewersSheet(
                    story: shown,
                    accentColor: accentColor,
                    statusViewModel: statusViewModel,
                    onOpenProfile: { viewer in
                        pendingProfile = ProfileSheetUser(username: viewer.username)
                        story = nil
                    }
                )
            }
            .sheet(item: $selectedProfile) { user in
                profileSheet(for: user)
            }
    }

    private func profileSheet(for user: ProfileSheetUser) -> some View {
        UserProfileSheet(
            user: user,
            moodEmoji: statusViewModel.statusForUser(userId: user.userId ?? "")?.moodEmoji,
            onMoodTap: statusViewModel.moodTapHandler(for: user.userId ?? ""),
            presenceProvider: { PresenceManager.shared.knownPresenceState(for: $0) },
            postsContent: { uid in AnyView(ProfileUserPostsList(
                userId: uid,
                onOpenPost: { post in ProfilePostsOpener.openPost(post) { selectedProfile = nil } },
                onOpenReel: { reel, reels in ProfilePostsOpener.openReel(reel, in: reels) { selectedProfile = nil } }
            )) }, dependencies: .live
        )
        .presentationDetents([.large, .medium])
        .presentationDragIndicator(.visible)
    }
}
