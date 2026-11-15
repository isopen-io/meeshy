import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Rail de stories de la liste

/// Tête de liste : le MÊME `StoryTrayView` que le fil (#11033). La liste
/// montait jusqu'ici une jumelle (`StoriesVivantsRail`) qui ne peignait ni le
/// contour équipé, ni la présence, ni les menus de l'avatar : un seul
/// composant aux deux emplacements, pour un seul comportement.
///
/// Les deux branchements propres à la liste : le tap story passe par
/// `onStoryViewRequest` (le chemin de l'hôte), et l'ajout de statut ouvre la
/// sheet que CETTE vue héberge déjà (`showStatusComposer`).
struct ConversationListStoryRail: View {
    let onStoryViewRequest: ((String, Bool) -> Void)?
    @Binding var showStatusComposer: Bool
    @EnvironmentObject private var storyViewModel: StoryViewModel

    var body: some View {
        StoryTrayView(viewModel: storyViewModel, onViewStory: { userId in
            onStoryViewRequest?(userId, true)
        }, onAddStatus: {
            showStatusComposer = true
        })
    }
}
