import Foundation
import MeeshySDK

/// **Fermer / rouvrir les commentaires d'une story** (#16541) — le geste du
/// menu ⋯ du lecteur, optimiste sur le plateau, retour arrière sur refus.
/// `story:updated` relaie ensuite l'état écrit aux autres lecteurs, et
/// `StoryTrayRules.applyUpdate` le remplace par la charge servie.
@MainActor
enum StoryCommentSettings {

    /// L'action du menu ⋯ pour la story affichée, `nil` quand le lecteur n'est
    /// ni son auteur ni la modération.
    static func action(for story: StoryItem?, of group: StoryGroup?, in stories: StoryViewModel) -> (() -> Void)? {
        guard let storyId = story?.id, let authorId = group?.id,
              CommentSettingsToggle.isOffered(authorId: authorId) else { return nil }
        return { Task { await toggle(storyId: storyId, in: stories) } }
    }

    static func toggle(storyId: String, in stories: StoryViewModel) async {
        guard let story = stories.storyGroups.lazy.flatMap(\.stories).first(where: { $0.id == storyId }) else { return }
        await CommentSettingsToggle.run(postId: storyId, current: story.commentsDisabled ?? false,
                                        service: stories.postService) { closed in
            write(closed, storyId: storyId, in: stories)
        }
    }

    /// Un envoi refusé par `COMMENTS_DISABLED` : la story est fermée, le
    /// composeur cède la place tout de suite.
    static func noteClosed(storyId: String, in stories: StoryViewModel) {
        write(true, storyId: storyId, in: stories)
    }

    private static func write(_ closed: Bool, storyId: String, in stories: StoryViewModel) {
        if StoryTrayRules.mutateStory(postId: storyId, in: &stories.storyGroups, { $0.commentsDisabled = closed }) {
            stories.persistStoryCache()
        }
    }
}
