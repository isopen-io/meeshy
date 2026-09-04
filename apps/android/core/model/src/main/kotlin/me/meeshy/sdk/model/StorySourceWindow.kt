package me.meeshy.sdk.model

/**
 * **La fenêtre de LECTURE dans une source** — `sourceStart` / `sourceEnd`, en
 * secondes (#5129).
 *
 * ## Deux axes, et les confondre est le piège
 *
 * | champs | gouvernent |
 * |---|---|
 * | `startTime` · `duration` | **QUAND** l'objet est à l'écran, sur la timeline de la slide |
 * | `sourceStart` · `sourceEnd` | **QUELLE PARTIE** de la source joue une fois qu'il y est |
 *
 * Les deux coexistent : un clip visible de 0 à 5 s de la slide peut jouer les
 * secondes 3 → 8 de son fichier. Android honorait le premier axe et ignorait le
 * second — la fenêtre de visibilité était juste, le contenu joué ne l'était pas.
 *
 * ## Les deux bornes ou aucune
 *
 * Même règle que le recadrage (`StoryMediaCrop.fromPayloadBounds`, #5085), et
 * pour la même raison : **un début sans fin n'a pas de repli sensé.** Le
 * compléter par la durée du fichier inventerait une coupe que personne n'a
 * posée ; jouer de 3 s à l'infini n'est pas ce que l'auteur a demandé. Un
 * document déjà stocké sous une forme amputée ne repasse par aucune validation,
 * donc le modèle refuse ce que le contrat refuse.
 *
 * ## Ce que la règle NE fait pas
 *
 * Elle ne borne pas à la durée du média : cette durée n'est pas connue au
 * décodage, et l'imposer ici fabriquerait une fenêtre. Le lecteur, qui connaît
 * la source, reste seul juge de ce qu'il peut atteindre.
 */
object StorySourceWindow {

    /**
     * Les deux bornes, ou `null` pour les deux.
     *
     * Refuse aussi une fenêtre VIDE ou inversée (`end <= start`) : elle ne
     * décrit aucun contenu jouable, et la laisser passer ferait taire un clip
     * sans que rien ne le dise.
     */
    fun fromPayloadBounds(start: Double?, end: Double?): Pair<Double, Double>? {
        if (start == null || end == null) return null
        if (!start.isFinite() || !end.isFinite()) return null
        if (start < 0.0 || end <= start) return null
        return start to end
    }
}
