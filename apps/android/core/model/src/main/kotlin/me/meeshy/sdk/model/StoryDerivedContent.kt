package me.meeshy.sdk.model

/**
 * Le `content` d'une story est-il l'index dérivé de ses objets texte ? Miroir de
 * `StoryDerivedContent.swift` (#4502) et du prédicat `isContentDerivedFromTextObjects` de la
 * passerelle (`storyContentComposition.ts`).
 *
 * Une story d'overlays n'a pas de légende : son `content` n'est qu'un index de recherche, la
 * concaténation des textes. Le rendre sous le canvas afficherait le même texte deux fois.
 *
 * On décide sur l'ORIGINAL, on rend le RÉSOLU (sinon le doublon reviendrait pour les seuls
 * lecteurs d'une autre langue), et le doute penche du côté de la LÉGENDE : montrer un doublon
 * est laid, taire la légende d'un auteur est une perte de contenu.
 */
object StoryDerivedContent {

    /** Le séparateur de la passerelle : fait partie du contrat de comparaison. */
    const val OVERLAY_SEPARATOR: String = " "

    /** L'index tel que la passerelle le compose : textes non vides rognés, joints par un espace. */
    fun composed(overlayTexts: List<String>): String =
        overlayTexts.map { it.trim() }.filter { it.isNotEmpty() }.joinToString(OVERLAY_SEPARATOR)

    /** Test d'ÉGALITÉ, jamais d'inclusion : un texte qui contient l'index reste une légende. */
    fun isDerivedIndex(content: String?, overlayTexts: List<String>): Boolean {
        val normalised = content?.trim().orEmpty()
        if (normalised.isEmpty()) return false
        val index = composed(overlayTexts)
        return index.isNotEmpty() && normalised == index
    }

    /** Ce que le lecteur rend sous le canvas ; `null` : rien, la scène le dit déjà. */
    fun caption(original: String?, resolved: String?, overlayTexts: List<String>): String? =
        resolved?.takeUnless {
            it.isBlank() || isDerivedIndex(original, overlayTexts)
        }
}
