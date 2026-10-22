package me.meeshy.sdk.model

/**
 * La scène porte-t-elle du contenu que ce build ne sait pas peindre ? UN seul objet suffit :
 * peindre la scène amputée comme si c'était la composition de l'auteur serait pire que de dire la
 * rupture. Une mention (kind connu, non peint) n'y compte pas — c'est une métadonnée.
 */
val StoryEffects.carriesUnpaintableContent: Boolean get() = unpaintableKinds.isNotEmpty()
