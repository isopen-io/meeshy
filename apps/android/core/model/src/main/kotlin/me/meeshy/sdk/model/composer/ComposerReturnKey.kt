package me.meeshy.sdk.model.composer

/**
 * La touche RETOUR envoie sans jamais envoyer par accident (miroir d'iOS `ComposerReturnKey`).
 *
 * Elle observe la MUTATION du texte, jamais la version du clavier : un saut de ligne n'est un envoi que
 * si le texte a grandi d'EXACTEMENT un caractère finissant par ce saut de ligne. Un collage
 * multi-lignes ne part donc jamais. Dans le doute, on NE PART PAS.
 */
public object ComposerReturnKey {

    /** L'action du clavier logiciel : Envoyer jusqu'à sept mots, Retour au-delà (libellé de la touche compris). */
    public fun imeSends(text: String): Boolean = ComposerToolbarLaw.returnSends(text)

    /** Ce changement de texte est-il un appui sur Retour ? */
    public fun submits(previous: String, current: String, literalNewline: Boolean = false): Boolean {
        if (literalNewline || !current.endsWith("\n")) return false
        return ComposerTextFormat.graphemeCount(current) == ComposerTextFormat.graphemeCount(previous) + 1
    }

    /** Clavier matériel : Maj+Entrée ou Alt+Entrée est un saut de ligne voulu, jamais un envoi. */
    public fun isLiteralNewline(shift: Boolean, alt: Boolean): Boolean = shift || alt

    /** Le texte débarrassé du saut de ligne que la touche vient d'insérer. */
    public fun stripped(text: String): String = if (text.endsWith("\n")) text.dropLast(1) else text
}
