import Foundation
import MeeshySDK

/// Ce que le lecteur de stories fait de la story d'un AUTRE ou de la sienne :
/// la supprimer / la retirer (motif optionnel), ou la rendre privée (motif).
struct StoryWithdrawalActions {
    let delete: (_ reason: String?) -> Void
    let makePrivate: (_ reason: String) -> Void
}

/// **La modération rend PRIVÉE la story d'un autre** (#11535), comme la console
/// web. Pour qui agit, elle quitte le lecteur et le plateau comme une story
/// supprimée ; refusée par la passerelle (rang de l'auteur, réseau), rien ne
/// bouge et le retour le dit.
@MainActor
enum StoryPrivatization {

    static func makePrivate(
        _ story: StoryItem?, of group: StoryGroup?, reason: String,
        viewModel: StoryViewModel, dismiss: @escaping () -> Void
    ) {
        guard let story, let authorId = group?.id else { return }
        Task {
            let applied = await run(storyId: story.id, authorId: authorId, reason: reason, viewModel: viewModel)
            guard applied else { return HapticFeedback.error() }
            HapticFeedback.success()
            dismiss()
        }
    }

    static func run(storyId: String, authorId: String, reason: String, viewModel: StoryViewModel) async -> Bool {
        do {
            try await makePrivateRemotely(storyId: storyId, authorId: authorId, reason: reason, with: viewModel.postService)
            viewModel.purgeDeadStories(deletedIds: [storyId], includingExpired: false)
            FeedbackToastManager.shared.showSuccess(PublicationWithdrawal.madePrivateText)
            return true
        } catch {
            FeedbackToastManager.shared.showError(PublicationWithdrawal.makePrivateFailedText)
            return false
        }
    }

    /// Même frontière `@concurrent` que `StoryViewModel.deleteRemotely` : la
    /// purge retombe sur le main quoi que fasse la chaîne réseau.
    @concurrent
    nonisolated static func makePrivateRemotely(
        storyId: String, authorId: String, reason: String,
        with service: any PostServiceProviding
    ) async throws {
        try await service.makePrivate(postId: storyId, authorId: authorId, reason: reason)
    }
}
