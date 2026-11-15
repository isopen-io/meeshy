package me.meeshy.sdk.model.composer.look

/**
 * L'auteur tel que les cadres l'écrivent — miroir de `ComposerPhotoLookPerson.author` (iOS) : son nom
 * d'affichage, sinon son pseudo, rognés ; aucun nom inventé.
 */
public data class ComposerLookPerson(val id: String, val name: String, val handle: String?) {
    public companion object {
        public const val SELF_ID: String = "self"

        public fun author(id: String?, displayName: String?, username: String?): ComposerLookPerson {
            val name = listOf(displayName, username).mapNotNull { it?.trim() }.firstOrNull { it.isNotEmpty() }.orEmpty()
            return ComposerLookPerson(id?.takeIf { it.isNotBlank() } ?: SELF_ID, name, username?.trim()?.takeIf { it.isNotEmpty() })
        }
    }
}
