package me.meeshy.sdk.theme

import me.meeshy.sdk.model.ApiAuthor

/**
 * La couleur d'auteur d'une scène — celle que la barre des stories donne à l'auteur, d'après son nom affiché puis son pseudo.
 * Une scène qui ne déclare aucun fond se lit sur le dégradé de cette couleur : la story et le post publiés du même geste la
 * lisent ici, et un même document ne montre jamais deux fonds (#14223).
 */
public fun ApiAuthor?.storyAccentHex(): String = storyAccentHexOf(this?.displayName ?: this?.username)

/**
 * La même couleur, lue depuis le libellé d'auteur « nom affiché puis pseudo » qu'une surface a déjà composé : une story reposté
 * incrustée dans le fil se lit sur le fond que le lecteur de stories lui donne (#14250).
 */
public fun storyAccentHexOf(authorLabel: String?): String =
    DynamicColorGenerator.colorForName(authorLabel?.takeIf { it.isNotBlank() }.orEmpty())
