package me.meeshy.app.chat.export

/** Une entrée d'un fil de commentaires : son texte (« Auteur : texte ») et son niveau, 0 pour la racine. */
data class CardThreadLine(val text: String, val level: Int)

/**
 * L'IMBRICATION D'UN FIL SUR LA CARTE — lois pures, miroir de `MessageCardThread.swift`.
 *
 * Une réponse se lit RETIRÉE sous sa racine : chaque niveau décale le texte de [INDENT], et une ligne de SÉPARATION
 * précède chaque entrée de niveau 1 ou plus. Cette séparation est la liaison du template, en version compacte, au retrait
 * du niveau, sur [separatorWidth] ; la ligne vide qui la porte donne aussi l'air entre deux entrées. Au-delà de
 * [MAX_LEVEL] niveaux on ne creuse plus, et le texte d'un niveau est coupé dans la largeur qui RESTE.
 */
object CardThread {

    const val INDENT = 44.0
    const val MAX_LEVEL = 3
    const val MINIMUM_WIDTH = 240.0
    const val SEPARATOR_LENGTH = 160.0

    /** Une ligne peinte : son texte, son niveau, et si elle porte la séparation (texte vide). */
    data class Row(val text: String, val level: Int, val separator: Boolean)

    fun rows(lines: List<CardThreadLine>, width: Double, font: CardFont, measure: CardMeasure): List<Row> =
        lines.flatMap { line ->
            val level = line.level.coerceIn(0, MAX_LEVEL)
            val body = CardText.wrap(line.text, roomAt(level, width), font, measure).map { Row(it, level, separator = false) }
            if (level > 0) listOf(Row("", level, separator = true)) + body else body
        }

    /** La largeur où se coupe le texte d'un niveau. */
    fun roomAt(level: Int, width: Double): Double = maxOf(MINIMUM_WIDTH, width - shift(level))

    fun shift(level: Int): Double = level.coerceIn(0, MAX_LEVEL) * INDENT

    fun separatorWidth(level: Int): Double = maxOf(INDENT, SEPARATOR_LENGTH - (maxOf(1, level) - 1) * INDENT)
}
