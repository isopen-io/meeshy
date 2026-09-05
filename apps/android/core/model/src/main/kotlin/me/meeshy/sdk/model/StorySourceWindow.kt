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
/**
 * Une fenêtre de lecture RÉSOLUE, en millisecondes, prête pour un lecteur (#5129).
 *
 * **Un type plutôt que deux `Long?` côte à côte** : il rend impossible d'écrire
 * une fenêtre sans début, qui n'a pas de sens.
 *
 * **`endMs` est nullable, et c'est une CORRECTION du 2026-09-04.** La première
 * rédaction exigeait les deux bornes, par analogie avec le recadrage
 * (`StoryMediaCrop.fromPayloadBounds`, #5085). L'analogie était fausse : quatre
 * fractions de cadre amputées n'ont aucun repli sensé, mais **une fin de lecture
 * manquante en a un, évident — la fin du fichier.** iOS le fait déjà
 * (`StoryMediaLayer.startLoadingTrimWindow`, qui charge `asset.duration` et
 * complète), et l'écrivain émet les deux bornes INDÉPENDAMMENT
 * (`CanvasV3Migration.swift:457-458`, deux `if let` séparés).
 *
 * Refuser la paire incomplète faisait donc jouer à 0 sur Android un clip qui
 * démarrait à 3 s sur iOS. `null` signifie « jusqu'à la fin de la source », ce
 * qu'ExoPlayer exprime nativement en omettant `setEndPositionMs`.
 */
data class StorySourceWindowMs(val startMs: Long, val endMs: Long?)

object StorySourceWindow {

    /**
     * Les deux bornes, ou `null` pour les deux.
     *
     * Refuse aussi une fenêtre VIDE ou inversée (`end <= start`) : elle ne
     * décrit aucun contenu jouable, et la laisser passer ferait taire un clip
     * sans que rien ne le dise.
     */
    fun fromPayloadBounds(start: Double?, end: Double?): Pair<Double, Double?>? {
        // Une fin SEULE se lit « du début du fichier jusqu'à `end` » : le début
        // implicite est zéro, et il n'a rien d'inventé.
        val debut = start ?: if (end != null) 0.0 else return null
        if (!debut.isFinite() || debut < 0.0) return null
        if (end == null) return debut to null
        if (!end.isFinite() || end <= debut) return null
        return debut to end
    }

    /**
     * Les mêmes bornes en **millisecondes**, pour un lecteur qui les attend ainsi
     * (`MediaItem.ClippingConfiguration`), ou `null` quand il n'y a pas de fenêtre.
     *
     * **La conversion vit ICI et non dans la surface de lecture**, parce que c'est
     * une DÉCISION — arrondir, refuser une fenêtre dégénérée — et qu'une décision
     * se teste. La surface, elle, reste opaque : elle reçoit deux nombres ou rien,
     * et n'a pas à savoir ce qu'est une borne de source.
     *
     * L'arrondi est fait à l'entier le plus proche : une milliseconde de dérive
     * est inaudible et invisible, là où tronquer systématiquement décalerait
     * chaque clip d'un demi-tour de roue vers le début.
     */
    fun clippingMs(start: Double?, end: Double?): StorySourceWindowMs? {
        val (s, e) = fromPayloadBounds(start, end) ?: return null
        val startMs = (s * 1000.0).toLong()
        if (e == null) {
            // Fenêtre ouverte à droite : jouer de `start` à la fin du fichier.
            // Un début nul n'est pas une fenêtre — c'est la source entière.
            return if (startMs <= 0L) null else StorySourceWindowMs(startMs, null)
        }
        val endMs = (e * 1000.0).toLong()
        // Deux bornes distinctes en secondes peuvent se confondre en
        // millisecondes (3,0000 et 3,0004) : la fenêtre serait vide, et un clip
        // se tairait. On refuse, comme `fromPayloadBounds` refuse `end <= start`.
        return if (endMs <= startMs) null else StorySourceWindowMs(startMs, endMs)
    }

    /** La même fenêtre depuis des bornes déjà décodées en `Float` (audio). */
    fun clippingMs(start: Float?, end: Float?): StorySourceWindowMs? =
        clippingMs(start?.toDouble(), end?.toDouble())
}
