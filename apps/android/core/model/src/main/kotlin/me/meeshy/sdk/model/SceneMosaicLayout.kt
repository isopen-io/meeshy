package me.meeshy.sdk.model

/**
 * **Qui joue dans la carte d'un post à scènes** (iOS `PostSceneMosaic.vignette` / `PostSceneCard`), règle pure.
 *
 * Trois conditions, et la troisième est celle que la directive porteur ajoute : « une scène cinématique doit être considérée
 * comme une vidéo ». Une scène joue si sa carte est ÉLUE par le fil, si c'est la PAGE courante du carrousel (les tuiles d'une
 * mosaïque sont des scènes arrêtées, jamais lues), et seulement si elle BOUGE : une scène fixe qui prendrait la lecture
 * n'en ferait rien et occuperait la seule place jouante du fil.
 */
public object SceneMosaicLayout {

    /** Le moteur de la scène [page] reçoit-il l'ordre de jouer ? */
    public fun plays(elected: Boolean, page: Int, currentPage: Int, moves: Boolean): Boolean =
        elected && page == currentPage && moves

    /** La page [page] est-elle celle que la carte élue lit (pour le signe « son coupé », qui ne dépend pas du mouvement) ? */
    public fun isReadPage(elected: Boolean, page: Int, currentPage: Int): Boolean = elected && page == currentPage

    /** Une tuile de mosaïque (hors carrousel) ne joue jamais : c'est une scène arrêtée. */
    public fun tilePlays(): Boolean = false

    /** « n / N » de la pilule du carrousel, `null` pour une scène seule. */
    public fun counterLabel(currentPage: Int, count: Int): String? =
        if (count > 1) "${currentPage.coerceIn(0, count - 1) + 1} / $count" else null

    /** La flèche « précédente » n'existe que s'il y a une page avant, la « suivante » que s'il y en a une après. */
    public fun hasPrevious(currentPage: Int): Boolean = currentPage > 0

    public fun hasNext(currentPage: Int, count: Int): Boolean = currentPage < count - 1
}
