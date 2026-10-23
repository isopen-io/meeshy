package me.meeshy.app.stories

/** Une entrée du menu de l'anneau « Ma story ». */
enum class StoryTraySelfAction { ViewMyStory, AddStory }

/**
 * Ce que l'anneau « Ma story » propose à l'appui long — iOS `StoryTrayView` : voir sa story
 * quand elle existe, et TOUJOURS en ajouter une autre (le badge « + » mène au même endroit).
 */
object StoryTraySelfMenu {
    fun actions(self: StoryRing?): List<StoryTraySelfAction> = listOfNotNull(
        StoryTraySelfAction.ViewMyStory.takeIf { self != null && self.storyCount > 0 },
        StoryTraySelfAction.AddStory,
    )
}
