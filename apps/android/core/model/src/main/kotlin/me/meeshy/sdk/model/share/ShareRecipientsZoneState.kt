package me.meeshy.sdk.model.share

/** Ce que la zone « À qui » montre : un squelette, l'état vide, ou la liste. */
sealed interface ShareRecipientsZoneContent {
    /** Premier lancement, cache vide : seul cas où un squelette est permis. */
    data class Skeleton(val rows: Int = SKELETON_ROWS) : ShareRecipientsZoneContent

    data object Empty : ShareRecipientsZoneContent

    data object Listing : ShareRecipientsZoneContent

    companion object {
        const val SKELETON_ROWS = 3
    }
}

/** Une communauté, dépliée ou non en ses canaux inscriptibles (liste vide = « aucun canal où écrire »). */
data class ShareCommunityEntry(val community: ShareCommunity, val channels: List<ShareRecipient>?) {
    val isExpanded: Boolean get() = channels != null
}

/**
 * **La zone « À qui », côté loi** — projection pure de l'annuaire, de la sélection et des canaux dépliés.
 * Cache d'abord : la liste s'affiche dès qu'il y a quelque chose ; squelette seulement si tout est vide
 * ET que le chargement court ; état vide sinon (sauf recherche serveur reçue).
 */
data class ShareRecipientsZoneState(
    val content: ShareRecipientsZoneContent,
    val recents: List<ShareRecipient>,
    val conversations: List<ShareRecipient>,
    val people: List<ShareRecipient>,
    val communities: List<ShareCommunityEntry>,
    /** « Créer un groupe avec… » : proposé dès deux personnes cochées. */
    val offersGroupCreation: Boolean,
    val groupCandidates: List<ShareRecipient>,
) {
    val groupCandidateNames: String get() = groupCandidates.joinToString(", ") { it.title }

    companion object {
        const val GROUP_MINIMUM = 2

        fun of(
            view: ShareDirectoryView,
            cacheEmpty: Boolean,
            loading: Boolean,
            found: ShareSearchResults?,
            selection: List<ShareRecipient>,
            groupCreationSupported: Boolean,
            channels: Map<String, List<ShareRecipient>>,
        ): ShareRecipientsZoneState {
            val candidates = selection.filter { !it.isGroup && it.userId != null }
            val content = when {
                cacheEmpty && loading -> ShareRecipientsZoneContent.Skeleton()
                cacheEmpty && found == null -> ShareRecipientsZoneContent.Empty
                else -> ShareRecipientsZoneContent.Listing
            }
            return ShareRecipientsZoneState(
                content = content,
                recents = view.recents,
                conversations = view.conversations,
                people = view.people,
                communities = view.communities.map { ShareCommunityEntry(it, channels[it.id]) },
                offersGroupCreation = groupCreationSupported && candidates.size >= GROUP_MINIMUM,
                groupCandidates = candidates,
            )
        }
    }
}
