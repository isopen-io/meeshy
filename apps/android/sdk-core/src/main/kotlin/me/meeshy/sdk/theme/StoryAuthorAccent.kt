package me.meeshy.sdk.theme

import me.meeshy.sdk.model.ApiAuthor

/**
 * La couleur d'auteur d'une scène — celle que la barre des stories donne à l'auteur, d'après son nom affiché puis son pseudo.
 * Une scène qui ne déclare aucun fond se lit sur le dégradé de cette couleur : la story et le post publiés du même geste la
 * lisent ici, et un même document ne montre jamais deux fonds (#14223).
 */
public fun ApiAuthor?.storyAccentHex(): String =
    DynamicColorGenerator.colorForName((this?.displayName ?: this?.username)?.takeIf { it.isNotBlank() }.orEmpty())
