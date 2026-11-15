package me.meeshy.app.stories

import me.meeshy.sdk.model.scene.export.StoryExportAuthorFacts

/**
 * L'auteur de la story ouverte, tel que l'export le peint en intro (#13509, #13997). La présence est celle que le serveur a
 * SERVIE avec le fil (`authorPresence`, déjà filtrée par la loi de visibilité) : rien de servi ⇒ aucun point. Le groupe ne
 * porte que le @pseudo — il tient lieu de nom, et l'intro ne le répète pas. `null` tant que l'auteur n'est pas connu.
 */
internal fun StoryViewerUiState.exportAuthor(accentHex: String): StoryExportAuthorFacts? {
    val userId = authorUserId ?: return null
    return StoryExportAuthorFacts(
        userId = userId,
        displayName = authorName,
        username = authorName,
        avatarUrl = authorAvatarUrl,
        bannerUrl = null,
        accentHex = accentHex,
        isOwn = isOwnStory,
        servedPresence = authorPresence,
    )
}
