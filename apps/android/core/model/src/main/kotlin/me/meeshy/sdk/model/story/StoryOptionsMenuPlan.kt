package me.meeshy.sdk.model.story

/** Une entrée du menu ⋮ du lecteur de story — miroir de `StoryOptionsMenuEntry` (iOS, `StoryViewerView+Header.swift`). */
enum class StoryOptionsMenuEntry {
    Fullscreen,
    Transcript,
    Share,
    Compose,
    ExportVideo,
    Imager,
    Report,
    MakePrivate,
    /** « Désactiver / Réactiver les commentaires » (#16541) : l'auteur, et la modération de la plateforme. */
    ToggleComments,
    Remove,
    Delete,
    Close,
}

/**
 * **La composition du menu ⋮ du lecteur** — miroir de `StoryOptionsMenuPlan` (iOS) : le même menu pour toute story,
 * en sections (lecture · fabrication · action sur la story · Fermer). Pas de bouton X dans l'en-tête : le glissé bas
 * ferme et « Fermer » est TOUJOURS la dernière entrée (accessibilité). La modération voit en plus « Rendre privée »
 * et « Retirer » sur la story d'un autre.
 *
 * [onlyWired] masque les entrées dont l'action n'est pas branchée (un autre lot la branche par callback) : une
 * section vidée disparaît, jamais de séparateur seul.
 */
data class StoryOptionsMenuPlan(val sections: List<List<StoryOptionsMenuEntry>>) {

    val entries: List<StoryOptionsMenuEntry> get() = sections.flatten()

    fun onlyWired(wired: Set<StoryOptionsMenuEntry>): StoryOptionsMenuPlan =
        StoryOptionsMenuPlan(
            sections
                .map { section -> section.filter { it == StoryOptionsMenuEntry.Close || it in wired } }
                .filter { it.isNotEmpty() },
        )

    companion object {
        fun resolve(
            hasStory: Boolean,
            isOwnStory: Boolean,
            hasAudioTranscript: Boolean,
            canCompose: Boolean,
            canRemove: Boolean = false,
            canToggleComments: Boolean = false,
        ): StoryOptionsMenuPlan {
            val reading = if (hasAudioTranscript) {
                listOf(StoryOptionsMenuEntry.Fullscreen, StoryOptionsMenuEntry.Transcript)
            } else {
                listOf(StoryOptionsMenuEntry.Fullscreen)
            }
            val close = listOf(StoryOptionsMenuEntry.Close)
            if (!hasStory) return StoryOptionsMenuPlan(listOf(reading, close))
            val making = buildList {
                add(StoryOptionsMenuEntry.Share)
                if (canCompose) add(StoryOptionsMenuEntry.Compose)
                add(StoryOptionsMenuEntry.ExportVideo)
                add(StoryOptionsMenuEntry.Imager)
            }
            val toggle = listOfNotNull(StoryOptionsMenuEntry.ToggleComments.takeIf { canToggleComments })
            val acting = when {
                isOwnStory -> toggle + StoryOptionsMenuEntry.Delete
                canRemove -> listOf(StoryOptionsMenuEntry.Report, StoryOptionsMenuEntry.MakePrivate) + toggle + StoryOptionsMenuEntry.Remove
                else -> toggle + StoryOptionsMenuEntry.Report
            }
            return StoryOptionsMenuPlan(listOf(reading, making, acting, close))
        }
    }
}
