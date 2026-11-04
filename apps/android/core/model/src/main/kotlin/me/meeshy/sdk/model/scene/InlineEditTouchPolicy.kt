package me.meeshy.sdk.model.scene

/**
 * À qui appartient une touche posée pendant la saisie en place — miroir de `StoryCanvasInlineEditTouchPolicy` (iOS).
 *
 * Un champ de saisie possède les touches qui tombent sur lui : le tap atteint le champ (curseur, sélection, clavier), le
 * canvas ne le lui dispute pas. Une exception, consentie par l'hôte (l'éditeur d'objet) : un geste qui TRANSFORME (glisser,
 * pincer, tourner) cède la saisie, ce qui rend le texte à sa position réelle et au doigt ; toucher ensuite le texte reprend la
 * saisie.
 */
public object InlineEditTouchPolicy {

    /** `true` si le canvas doit recevoir cette touche. */
    public fun canvasReceives(
        touchOnEditor: Boolean,
        editorMounted: Boolean,
        yieldsManipulation: Boolean,
        isManipulation: Boolean,
    ): Boolean = when {
        !editorMounted -> true
        yieldsManipulation && isManipulation -> true
        else -> !touchOnEditor
    }

    /** Un geste est une manipulation dès qu'un second doigt se pose ou que le doigt dépasse le seuil de glissement. */
    public fun isManipulation(travelPx: Float, slopPx: Float, pointerCount: Int): Boolean =
        pointerCount > 1 || travelPx > slopPx

    /** La saisie se suspend quand le clavier se range (l'hôte qui l'opte), jamais quand il se lève. */
    public fun suspendsOnKeyboardClosed(
        yieldsManipulation: Boolean,
        editing: Boolean,
        keyboardWasShown: Boolean,
        keyboardShown: Boolean,
    ): Boolean = yieldsManipulation && editing && keyboardWasShown && !keyboardShown
}
