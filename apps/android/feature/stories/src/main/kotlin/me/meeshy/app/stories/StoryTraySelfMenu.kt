package me.meeshy.app.stories

/** Une entrée du menu de l'anneau « Ma story ». */
enum class StoryTraySelfAction { ViewMyStory, EditStory, ManageStories, AddStory, ChangeMood, ViewProfile }

/**
 * Ce que l'anneau « Ma story » propose à l'appui long — iOS `StoryTrayView` : voir sa story
 * quand elle existe, et TOUJOURS en ajouter une autre (le badge « + » mène au même endroit), puis changer d'humeur et voir son profil — l'ordre du menu
 * contextuel de l'avatar « Moi » d'iOS.
 */
object StoryTraySelfMenu {
    fun actions(
        self: StoryRing?,
        canEdit: Boolean = false,
        canChangeMood: Boolean = false,
        canViewProfile: Boolean = false,
    ): List<StoryTraySelfAction> = listOfNotNull(
        StoryTraySelfAction.ViewMyStory.takeIf { self != null && self.storyCount > 0 },
        StoryTraySelfAction.EditStory.takeIf { canEdit && (self?.storyCount ?: 0) > 0 && StoryEditEntry.offered(isOwnStory = true, storyId = self?.displayedStoryId) },
        StoryTraySelfAction.ManageStories,
        StoryTraySelfAction.AddStory,
        StoryTraySelfAction.ChangeMood.takeIf { canChangeMood },
        StoryTraySelfAction.ViewProfile.takeIf { canViewProfile },
    )
}
